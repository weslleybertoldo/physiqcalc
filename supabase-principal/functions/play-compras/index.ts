// Physiq play-W6 (16/10/2026) — play-compras: a assinatura do aluno SEM profissional pela Google Play, do lado do app. verify_jwt TRUE,
// pela _shared/porta-pessoa.ts (quem chama = o user do token, conferido no Auth; o freio por pessoa; o catch final com log.excecao). A
// matrícula do app e a automática do MP são lidas COMO A PESSOA (o comoPessoa: o meu_plano_app e o RLS "aluno lê a própria" — o jeito 2,
// a revisão ⚪11); o service role SÓ para o que é do servidor: a play_assinaturas (RLS sem policy), a play_aplicar, a trava (app_config
// não pública), o e-mail de quem chama (o Auth admin) e o cancelamento da automática do MP.
//
//   { acao: "estado" } → 200 { ok, disponivel, matricula: { id, ativo } | null, assinatura: { estado, renova, expira_em, produto } | null,
//                              automatica_mp, ressincronizada? }
//       Antes de responder (a revisão, 🟡3): a viva desta matrícula cujo fim já passou (a renovação ou o EXPIRED que a conferência de hora
//       em hora — a play-conferir — ainda não trouxe) volta ao Google — o GET + a play_aplicar, sem reconhecer nem adiar
//       (_shared/play-assinaturas.ts › ressincronizarVencidas). A cancelada vencida não conta como viva.
//       disponivel = a trava play_billing ligada (app_config, só esta função lê) OU a conta de TESTE (a prova de produção com a trava
//       desligada) + o segredo PLAY_SERVICE_ACCOUNT (sem ele: false e o log play_sem_credencial). A tela mostra a oferta só com ele.
//   { acao: "registrar", token, produto } → o GET no Google (a fonte da verdade) → a conferência (o produto do app; o dono = a matrícula
//       do app de quem chama, pela matrícula opaca da compra ou pela compra anterior) → a play_aplicar → reconhecer → o defer da 1ª compra
//       coberta (o teste ou o mês pago pelo MP: o que falta, ≥ 1 dia) — _shared/play-assinaturas.ts › sincronizar.
//       200 { ok, estado, expira_em, produto, renova, reconhecida, adiada }
//       400 pedido_invalido (token ou produto fora do formato) · 400 compra_invalida (o Google não acha a compra; produto que não é do app)
//       404 sem_matricula_do_app · 409 compra_de_outra_conta (a compra é de outra matrícula) · 409 assinatura_duplicada (outra assinatura
//       viva sem ligação: NÃO reconhece — o Google devolve sozinho em 3 dias) · 502 google_indisponivel · 503 play_sem_credencial
//       A automática do MP ainda viva (a corrida — a tela não oferece a Play com ela): cancela a do MP SÓ depois da play_aplicar ok com a
//       assinatura ATIVA (a revisão, ⚪12: o registrar recusado não cancela nada); o defer guarda o que o MP já pagou (decisão 13). O
//       registrar NUNCA olha a trava (compra feita não se perde).
// Staging: só conta de TESTE (403 conta_real_no_staging). Freio: 20 pedidos por minuto por pessoa. Log: só códigos, nunca o token, o
// pedido nem o e-mail (ref = a matrícula).
// Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions play-compras true
// Segredos: PLAY_SERVICE_ACCOUNT (a conta play-api@physiq-br); MP_ACCESS_TOKEN_PROD / MP_ACCESS_TOKEN_TEST (a corrida com o MP).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { cancelarAssinaturasDasMatriculas } from "../_shared/app-sem-profissional.ts";
import { credencialDoSchema } from "../_shared/cobranca-mp.ts";
import { emailDeTeste } from "../_shared/login-regras.ts";
import { PlayIndisponivel, contaDaPlay } from "../_shared/play-api.ts";
import { assinaturaDoToken, assinaturaVivaDa, lerDoGoogle, ressincronizarVencidas, sincronizar, vistaDaPlay } from "../_shared/play-assinaturas.ts";
import { conferirCompra, ehProdutoPlay, tokenValido } from "../_shared/play-regras.ts";
import { json, servirComoPessoa } from "../_shared/porta-pessoa.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** A matrícula do app do login, lida COMO A PESSOA (o meu_plano_app: a ativa mais nova; sem ativa, a mais nova — encerrada). Erro lança. */
async function matriculaDoApp(comoPessoa: SupabaseClient): Promise<{ id: string; ativo: boolean } | null> {
  const { data, error } = await comoPessoa.rpc("meu_plano_app");
  if (error) throw error;
  const m = (data as { matricula?: { paciente_id?: unknown; ativo?: unknown } | null } | null)?.matricula;
  return m && typeof m.paciente_id === "string" ? { id: m.paciente_id, ativo: m.ativo === true } : null;
}

/** A trava de liberação (app_config play_billing — publica = false: só o servidor lê). */
async function travaLigada(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.from("app_config").select("valor").eq("chave", "play_billing").maybeSingle();
  if (error) throw error;
  return ((data as { valor?: { liberada?: unknown } } | null)?.valor?.liberada) === true;
}

/** A automática do MP do app ainda viva nesta matrícula, lida COMO A PESSOA (o RLS "aluno lê a própria"; a corrida cancela). */
async function automaticaMpViva(db: SupabaseClient, pacienteId: string): Promise<boolean> {
  const { data, error } = await db.from("aluno_assinaturas").select("id").eq("paciente_id", pacienteId).in("status", ["authorized", "pending"]).limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

servirComoPessoa("play-compras", { freio: 20 }, async (c) => {
  const acao = c.corpo.acao;
  if (acao !== "estado" && acao !== "registrar") return json({ ok: false, erro: "acao_invalida" }, 400, c.origin);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: c.schema as "public" }, auth: { persistSession: false } });
  // o e-mail de quem chama: a conta de TESTE (o staging inteiro e a prova de produção com a trava desligada) — nunca vai para o log
  const { data: u, error: eu } = await db.auth.admin.getUserById(c.userId);
  if (eu) throw eu;
  const deTeste = emailDeTeste(u?.user?.email ?? "");
  if (c.schema === "staging" && !deTeste) return json({ ok: false, erro: "conta_real_no_staging" }, 403, c.origin);
  const matricula = await matriculaDoApp(c.comoPessoa);

  if (acao === "estado") {
    const liberada = deTeste || (await travaLigada(db));
    const credencial = contaDaPlay() !== null;
    if (liberada && !credencial) c.log.aviso({ codigo: "play_sem_credencial", schema: c.schema, acao: "estado" });
    // a viva cujo fim já passou (a renovação ou o EXPIRED que a conferência ainda não trouxe) volta ao Google antes de responder (sem
    // reconhecer nem adiar)
    const ressincronizadas = matricula && credencial ? await ressincronizarVencidas({ db, schema: c.schema, log: c.log, prazo: c.prazo }, matricula.id) : 0;
    const viva = matricula ? await assinaturaVivaDa(db, matricula.id) : null;
    return json({
      ok: true,
      disponivel: liberada && credencial,
      matricula,
      assinatura: vistaDaPlay(viva),
      automatica_mp: matricula ? await automaticaMpViva(c.comoPessoa, matricula.id) : false,
      // a viva vencida que voltou ao Google e mudou o banco: o app invalida o resumo guardado (a trava e a faixa leem de novo)
      ...(ressincronizadas > 0 ? { ressincronizada: true } : {}),
    }, 200, c.origin);
  }

  // ─── registrar ───
  const token = c.corpo.token;
  const produto = c.corpo.produto;
  if (!tokenValido(token) || !ehProdutoPlay(produto)) return json({ ok: false, erro: "pedido_invalido" }, 400, c.origin);
  if (!matricula || !matricula.ativo) return json({ ok: false, erro: "sem_matricula_do_app" }, 404, c.origin);
  if (!contaDaPlay()) {
    c.log.aviso({ codigo: "play_sem_credencial", schema: c.schema, acao: "registrar", ref: matricula.id });
    return json({ ok: false, erro: "play_sem_credencial" }, 503, c.origin);
  }
  const ctx = { db, schema: c.schema, log: c.log, prazo: c.prazo };
  try {
    const a = await lerDoGoogle(ctx, token);
    const conf = conferirCompra(a, { matriculaId: matricula.id, produtoPedido: produto });
    if (!conf.ok) {
      c.log.aviso({ codigo: conf.erro === "compra_de_outra_conta" ? "play_compra_de_outra_conta" : "play_compra_invalida", schema: c.schema,
        acao: "registrar", ref: matricula.id });
      return json({ ok: false, erro: conf.erro }, conf.erro === "compra_de_outra_conta" ? 409 : 400, c.origin);
    }
    if (conf.semConta) {
      // a compra sem a matrícula opaca: vale só se ela (ou a anterior que ela substitui) já é desta matrícula
      const desta = await assinaturaDoToken(db, token);
      const anterior = a?.tokenAnterior ? await assinaturaDoToken(db, a.tokenAnterior) : null;
      if (desta?.paciente_id !== matricula.id && anterior?.paciente_id !== matricula.id) {
        c.log.aviso({ codigo: "play_compra_de_outra_conta", schema: c.schema, acao: "registrar", ref: matricula.id, resultado: "sem_conta" });
        return json({ ok: false, erro: "compra_de_outra_conta" }, 409, c.origin);
      }
    }
    const r = await sincronizar(ctx, token, { pacienteId: matricula.id, assinatura: a, reconhecer: true });
    if (!r.ok) {
      c.log.aviso({ codigo: "play_registrar_recusado", schema: c.schema, acao: "registrar", ref: matricula.id, resultado: r.erro });
      if (r.erro === "outra_viva") return json({ ok: false, erro: "assinatura_duplicada" }, 409, c.origin);
      if (r.erro === "token_de_outra_matricula") return json({ ok: false, erro: "compra_de_outra_conta" }, 409, c.origin);
      if (r.erro === "sem_matricula" || r.erro === "nao_e_do_app") return json({ ok: false, erro: "sem_matricula_do_app" }, 404, c.origin);
      return json({ ok: false, erro: "compra_invalida" }, 400, c.origin);
    }
    // a corrida (decisão 13): a automática do MP ainda viva → cancela a do MP SÓ agora, com a Play gravada e ATIVA (a revisão, ⚪12); o defer
    // já guardou o que o MP pagou (a cobertura de antes)
    if (r.resposta.estado === "ativa" && (await automaticaMpViva(c.comoPessoa, matricula.id))) {
      try {
        const cm = await cancelarAssinaturasDasMatriculas(db, credencialDoSchema(c.schema), [matricula.id], "assinou_pela_google_play", c.log,
          { prazo: c.prazo });
        c.log.info({ codigo: "play_mp_cancelado", schema: c.schema, acao: "registrar", ref: matricula.id, n: cm.canceladas });
      } catch (e) {
        c.log.excecao(e, { codigo: "play_mp_cancelar_falhou", schema: c.schema, acao: "registrar", ref: matricula.id });
      }
    }
    c.log.info({ codigo: "play_registrada", schema: c.schema, acao: "registrar", ref: matricula.id, resultado: r.resposta.estado ?? null });
    return json({
      ok: true,
      estado: r.resposta.estado ?? null,
      expira_em: r.resposta.expira_em ?? null,
      produto: r.assinatura.produto,
      renova: r.assinatura.renova,
      reconhecida: !!r.resposta.reconhecida_em,
      adiada: !!r.resposta.adiada_em,
    }, 200, c.origin);
  } catch (e) {
    if (!(e instanceof PlayIndisponivel)) throw e;
    c.log.erro({ codigo: "play_google_falhou", schema: c.schema, acao: "registrar", ref: matricula.id, status: e.status, externo: { google_erro: e.codigo } });
    return json({ ok: false, erro: "google_indisponivel" }, 502, c.origin);
  }
});
