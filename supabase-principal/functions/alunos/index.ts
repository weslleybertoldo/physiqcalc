// Physiq W13 — alunos (banco principal). A porta das ações da página Alunos do painel (spec §4.4, C27 C28 C31 C87 C96 C102 N-10
// N-57, F5/R10): criar, convidar (e-mail pelo Resend), bloquear/desbloquear, desativar/reativar, remover, atribuir em lote e
// aprovar/recusar o auto-cadastro do link /c/. A REGRA mora no banco (funções aluno_* / alunos_* da migração
// 20260930140000_w13_alunos.sql, pelo auth.uid() de quem chama: dono da conta, responsável pelo aluno ou master; limite da faixa;
// P7); aqui sai o e-mail, confere o captcha do /c/ e, ao reativar quem estava no app, cancela a assinatura do app no Mercado Pago.
// O espelho no Banco do Treino (status='bloqueado', responsável, conta) sai do próprio banco: gatilho da W5 + espelho_disparar().
//
// POST, headers: x-schema: public|staging. 3 jeitos:
//   app      → Authorization: Bearer <access_token do principal> · { acao, ... }  (acao em ACOES_APP)
//   público  → sem login (a /c/:codigo): { acao: "cadastro_info", codigo } · { acao: "cadastro_enviar", codigo, dados, captcha }
//   servidor → x-espelho-segredo (professor-convites do Treino, APK ≤ 3.15): { acao: "repasse", principal_user_id, repasse, ... }
// 200 → { ok: true, ... } · 4xx → { ok: false, erro, ... } (limite_plano leva limite, em_uso, sou_dono e dono_nome)
// verify_jwt = false (público e servidor não têm JWT de pessoa; o app é validado aqui no GET /auth/v1/user). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions alunos false
// Segredos: RESEND_API_KEY, RESEND_FROM, SITE_URL, SEGREDO_REPASSE_CONVITES_ACEITOS, TURNSTILE_SECRET, MP_ACCESS_TOKEN_PROD/_TEST
// (+ os automáticos).
// hml-16c (S6): o repasse aceita o segredo da finalidade — a professor-convites do Treino manda SEGREDO_REPASSE_CONVITES; aqui fica
// só o hash, em SEGREDO_REPASSE_CONVITES_ACEITOS (_shared/segredo-servidor.ts). Aceitou → log segredo_aceito (acao
// repasse_convites, resultado lista).
// hml-10 (H-24, H-25, H-26): log em JSON pelo _shared/log.ts (do Resend e do captcha, só o status e os códigos — nunca o corpo);
// sem reserva com valor de produção (sem RESEND_FROM ou, na produção, sem SITE_URL o e-mail do convite não sai: o mesmo
// "sem_resend" de sempre, + log.erro); o catch final avisa (log.excecao) e devolve o mesmo 500.
// hml-14 (H-32): o Resend espera no máximo TEMPO_MS.email (estourou → o resend_rede de sempre) e as idas ao MP têm o prazo do pedido.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { origemPermitida } from "../_shared/login-regras.ts";
import { segredoAceito } from "../_shared/segredo-servidor.ts";
import { type Schema } from "../_shared/convites-regras.ts";
import { destinoDoEnvio, faltaNoEmail } from "../_shared/enviar-aluno-regras.ts";
import { captchaAceito, hashDoToken, ipDoPedido, motivoDoCaptcha } from "../_shared/entrar-senha-regras.ts";
import { credencialDoSchema } from "../_shared/cobranca-mp.ts";
import { cancelarAssinaturasDoAppEncerrado } from "../_shared/app-sem-profissional.ts";
import { ORCAMENTO_MS, TEMPO_MS, buscarComTempo, prazo, type Prazo } from "../_shared/tempo.ts";
import {
  acaoApp,
  acaoPublica,
  acaoRepasse,
  assuntoConviteAluno,
  htmlConviteAluno,
  linkConviteAluno,
  statusDoErro,
  textoConviteAluno,
  type DadosEmailAluno,
} from "../_shared/alunos-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "";
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") || "";
const PROXY_SEGREDO = Deno.env.get("PROXY_SEGREDO") || "";
const SCHEMAS: Schema[] = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const log = criarLog("alunos", { avisar: avisarErro });

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin! : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

// freio por chave nesta instância (o banco tem os dele: convites 20/h por conta, cadastros 30/h por profissional)
const janelas = new Map<string, number[]>();
function permitido(chave: string, max: number, janelaMs: number): boolean {
  const agora = Date.now();
  const validos = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
  if (validos.length >= max) {
    janelas.set(chave, validos);
    return false;
  }
  validos.push(agora);
  janelas.set(chave, validos);
  if (janelas.size > 5000) janelas.clear();
  return true;
}

async function enviarEmail(schema: Schema, para: string, assunto: string, html: string, texto: string): Promise<{ id: string | null; erro: string | null }> {
  const falta = faltaNoEmail(schema, { resendApiKey: RESEND_API_KEY, resendFrom: RESEND_FROM, siteUrl: SITE_URL });
  if (falta.length) {
    log.erro({ codigo: "sem_configuracao", schema, msg: `falta ${falta.join(", ")}` });
    return { id: null, erro: "sem_resend" };
  }
  try {
    const r = await buscarComTempo("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ from: RESEND_FROM, to: [para], subject: assunto, html, text: texto }),
    }, TEMPO_MS.email);
    const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      log.erro({ codigo: "resend_falhou", schema, status: r.status, externo: { resend_erro: corpo.name } });
      return { id: null, erro: `resend_${r.status}` };
    }
    return { id: typeof corpo.id === "string" ? corpo.id : null, erro: null };
  } catch (e) {
    log.excecao(e, { codigo: "resend_rede", schema });
    return { id: null, erro: "resend_rede" };
  }
}

/** Manda o e-mail do convite (o convite já está gravado: se o e-mail falhar, a tela avisa e o link segue valendo). */
async function emailDoConvite(schema: Schema, r: Record<string, unknown>) {
  // hml-02 (H-05): no staging o e-mail vai SEMPRE para a caixa de teste (o cadastro pode ter um endereço real)
  const destino = destinoDoEnvio(schema, String(r.email));
  const dados: DadosEmailAluno = {
    email: String(r.email),
    modulos: (r.modulos as string[]) ?? ["treino"],
    conta: String(r.conta_nome ?? ""),
    quem: String(r.quem_convidou ?? ""),
    responsavel: (r.responsavel_nome as string) ?? null,
    link: linkConviteAluno(schema, SITE_URL),
    paraTeste: destino.teste ? String(r.email) : null,
  };
  const envio = await enviarEmail(schema, destino.para, assuntoConviteAluno(dados), htmlConviteAluno(dados), textoConviteAluno(dados));
  return { email_enviado: envio.erro === null, email_teste: destino.teste, email_id: envio.id, erro_email: envio.erro, link: dados.link };
}

/** "aceito" | "recusado" | "indisponivel" (o Cloudflare não respondeu — quem chama RECUSA: falha fechada, homologação H-17). */
async function conferirCaptcha(token: string, ip: string | null, schema: Schema): Promise<"aceito" | "recusado" | "indisponivel"> {
  if (!token) return "recusado";
  const corpo = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
  if (ip) corpo.set("remoteip", ip);
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 8000);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: corpo, signal: controle.signal });
    if (r.status >= 500) return "indisponivel";
    const d = await r.json().catch(() => null);
    if (!d) return "indisponivel";
    // o widget do /c/ usa a ação "cadastro"; o do "Entrar com e-mail" (W8b), "entrar"
    if (!captchaAceito(d, "cadastro")) {
      const acaoDoWidget = (d as Record<string, unknown>).action;
      log.aviso({ codigo: "captcha_recusado", schema, acao: typeof acaoDoWidget === "string" ? acaoDoWidget : null, resultado: motivoDoCaptcha(d) });
      return "recusado";
    }
    return "aceito";
  } catch (e) {
    log.excecao(e, { codigo: "siteverify_fora", schema });
    return "indisponivel";
  } finally {
    clearTimeout(timer);
  }
}

type Cliente = ReturnType<typeof createClient>;
async function rpcObjeto(db: Cliente, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

// ───────────────────────── público: /c/:codigo ─────────────────────────
async function publico(req: Request, schema: Schema, corpo: Record<string, unknown>, origin: string | null): Promise<Response> {
  const acao = acaoPublica(corpo.acao)!;
  const codigo = String(corpo.codigo ?? "").trim().slice(0, 60);
  const ip = ipDoPedido(req.headers, PROXY_SEGREDO);
  if (!permitido(`pub:${schema}:${ip ?? "sem-ip"}`, 30, 60_000)) return json({ ok: false, erro: "muitos_cadastros" }, 429, origin);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema }, auth: { persistSession: false } });
  if (acao === "cadastro_info") {
    const r = await rpcObjeto(db, "cadastro_link_info", { p_codigo: codigo });
    return json(r, r.ok === true ? 200 : statusDoErro(r.erro), origin);
  }
  // cadastro_enviar: o captcha (Turnstile, o mesmo da W8b) vale UMA vez; o master desliga em app_config.login_limite
  const { data: regras } = await db.rpc("login_regras");
  const captchaLigado = !(regras && typeof regras === "object" && (regras as Record<string, unknown>).captcha === false);
  if (captchaLigado) {
    // falha FECHADA (homologação, H-17): sem o segredo ou com o Cloudflare fora do ar, nenhum cadastro passa sem captcha
    const token = String(corpo.captcha ?? "");
    const v = TURNSTILE_SECRET ? await conferirCaptcha(token, ip, schema) : "indisponivel";
    if (v !== "aceito") {
      if (v === "indisponivel") {
        log.erro({ codigo: "captcha_indisponivel", schema, acao: "cadastro", resultado: TURNSTILE_SECRET ? "siteverify" : "sem_turnstile_secret" });
      }
      return json({ ok: false, erro: "captcha_invalido" }, 400, origin);
    }
    const { data: primeiro, error: eu } = await db.rpc("login_captcha_usar", { p_hash: await hashDoToken(token) });
    if (eu) throw eu;
    if (primeiro !== true) return json({ ok: false, erro: "captcha_invalido" }, 400, origin);
  }
  const dados = corpo.dados && typeof corpo.dados === "object" ? corpo.dados : {};
  const r = await rpcObjeto(db, "cadastro_link_enviar", { p_codigo: codigo, p_dados: dados });
  return json(r, r.ok === true ? 200 : statusDoErro(r.erro), origin);
}

// ───────────────────────── servidor: repasse do APK antigo (professor-convites do Treino) ─────────────────────────
async function repasse(schema: Schema, corpo: Record<string, unknown>, origin: string | null): Promise<Response> {
  const quem = String(corpo.principal_user_id ?? "");
  const acao = acaoRepasse(corpo.repasse);
  if (!UUID.test(quem) || !acao) return json({ ok: false, erro: "dados_invalidos" }, 400, origin);
  if (!permitido(`rep:${schema}:${quem}`, 60, 60_000)) return json({ ok: false, erro: "muitos_convites" }, 429, origin);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema }, auth: { persistSession: false } });
  const args: Record<string, unknown> = {};
  if (acao === "convidar") args.email = String(corpo.email ?? "").trim().toLowerCase();
  if (acao === "cancelar" || acao === "reenviar") args.convite_id = String(corpo.convite_id ?? "");
  const r = await rpcObjeto(db, "alunos_como", { p_user: quem, p_acao: acao, p_args: args });
  if (r.ok !== true) return json(r, statusDoErro(r.erro), origin);
  if (acao === "convidar" || acao === "reenviar") return json({ ...r, ...(await emailDoConvite(schema, r)) }, 200, origin);
  return json(r, 200, origin);
}

// ───────────────────────── app: o painel do profissional ─────────────────────────
async function app(schema: Schema, token: string, corpo: Record<string, unknown>, origin: string | null, p: Prazo): Promise<Response> {
  const comoPessoa = createClient(SUPABASE_URL, ANON, {
    db: { schema },
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: ud, error: eu } = await comoPessoa.auth.getUser(token);
  if (eu || !ud?.user) return json({ ok: false, erro: "sem_login" }, 401, origin);
  const acao = acaoApp(corpo.acao);
  if (!acao) return json({ ok: false, erro: "acao_invalida" }, 400, origin);
  if (!permitido(`app:${schema}:${ud.user.id}`, 120, 60_000)) return json({ ok: false, erro: "muitas_acoes" }, 429, origin);

  const conta = String(corpo.conta_id ?? "");
  const aluno = String(corpo.aluno_id ?? "");
  const precisaConta = ["criar", "convidar", "atribuir", "aprovar", "recusar"].includes(acao);
  const precisaAluno = ["bloquear", "desbloquear", "desativar", "reativar", "remover"].includes(acao);
  if (precisaConta && !UUID.test(conta)) return json({ ok: false, erro: "conta_inexistente" }, 404, origin);
  if (precisaAluno && !UUID.test(aluno)) return json({ ok: false, erro: "aluno_inexistente" }, 404, origin);

  let r: Record<string, unknown>;
  switch (acao) {
    case "criar":
      r = await rpcObjeto(comoPessoa, "aluno_criar", { p_conta: conta, p_dados: corpo.dados && typeof corpo.dados === "object" ? corpo.dados : {} });
      break;
    case "convidar": {
      const modulos = Array.isArray(corpo.modulos) ? (corpo.modulos as unknown[]).map(String) : [];
      const resp = typeof corpo.responsavel_id === "string" && UUID.test(corpo.responsavel_id) ? corpo.responsavel_id : null;
      r = await rpcObjeto(comoPessoa, "aluno_convidar", { p_conta: conta, p_email: String(corpo.email ?? ""), p_modulos: modulos, p_responsavel: resp });
      if (r.ok === true) r = { ...r, ...(await emailDoConvite(schema, r)) };
      break;
    }
    case "cancelar_convite":
    case "reenviar_convite": {
      const id = String(corpo.convite_id ?? "");
      if (!UUID.test(id)) return json({ ok: false, erro: "convite_inexistente" }, 404, origin);
      r = await rpcObjeto(comoPessoa, "aluno_convite_acao", { p_convite: id, p_acao: acao === "cancelar_convite" ? "cancelar" : "reenviar" });
      if (r.ok === true && acao === "reenviar_convite") r = { ...r, ...(await emailDoConvite(schema, r)) };
      break;
    }
    case "bloquear":
    case "desbloquear":
      r = await rpcObjeto(comoPessoa, "aluno_bloquear", {
        p_paciente: aluno, p_bloquear: acao === "bloquear", p_msg: typeof corpo.mensagem === "string" ? corpo.mensagem : null,
      });
      break;
    case "desativar":
    case "reativar":
      r = await rpcObjeto(comoPessoa, "aluno_ativar", { p_paciente: aluno, p_ativo: acao === "reativar" });
      // voltou para a lista de um profissional: a matrícula do app encerrou → a assinatura do app no Mercado Pago é cancelada (W7b)
      if (r.ok === true && r.app_encerrado === true && typeof r.user_id === "string") {
        try {
          const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema }, auth: { persistSession: false } });
          r.assinatura_app = await cancelarAssinaturasDoAppEncerrado(
            db, credencialDoSchema(schema), r.user_id, "vinculou_profissional", log, { prazo: p },
          );
        } catch (e) {
          log.excecao(e, { codigo: "cancelar_assinatura_do_app", schema, acao });
          r.assinatura_app = { canceladas: 0, falhas: 1 };
        }
      }
      delete r.user_id;
      break;
    case "remover":
      r = await rpcObjeto(comoPessoa, "aluno_remover", { p_paciente: aluno });
      break;
    case "atribuir": {
      const ids = Array.isArray(corpo.alunos) ? (corpo.alunos as unknown[]).map(String).filter((x) => UUID.test(x)) : [];
      r = await rpcObjeto(comoPessoa, "alunos_atribuir", {
        p_conta: conta, p_pacientes: ids, p_modulo: String(corpo.modulo ?? ""), p_responsavel: String(corpo.responsavel_id ?? "") || null,
      });
      break;
    }
    case "aprovar":
    case "recusar": {
      const id = String(corpo.pendente_id ?? "");
      if (!UUID.test(id)) return json({ ok: false, erro: "cadastro_nao_encontrado" }, 404, origin);
      r = await rpcObjeto(comoPessoa, "aluno_pendente_decidir", { p_conta: conta, p_pendente: id, p_aprovar: acao === "aprovar" });
      break;
    }
  }
  return json(r, r.ok === true ? 200 : statusDoErro(r.erro), origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const p = prazo(ORCAMENTO_MS.usuario); // hml-14 (H-32): o prazo do pedido inteiro (todas as idas ao MP)
  const schema = (req.headers.get("x-schema") || "public").toLowerCase() as Schema;
  if (!SCHEMAS.includes(schema)) return json({ ok: false, erro: "schema_invalido" }, 400, origin);
  let corpo: Record<string, unknown> = {};
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  try {
    if (corpo.acao === "repasse") {
      const via = await segredoAceito(req.headers.get("x-espelho-segredo"), "SEGREDO_REPASSE_CONVITES");
      if (!via) return json({ ok: false, erro: "segredo_invalido" }, 401, origin);
      log.info({ codigo: "segredo_aceito", schema, acao: "repasse_convites", resultado: via });
      return await repasse(schema, corpo, origin);
    }
    if (acaoPublica(corpo.acao)) return await publico(req, schema, corpo, origin);
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ") || auth.length < 20) return json({ ok: false, erro: "sem_login" }, 401, origin);
    return await app(schema, auth.slice(7).trim(), corpo, origin, p);
  } catch (e) {
    log.excecao(e, { acao: typeof corpo.acao === "string" ? corpo.acao : null, schema });
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
