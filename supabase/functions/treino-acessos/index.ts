// Physiq W-A P2 (13/10/2026) — treino-acessos (Banco do Treino): a linha "Treino — séries" da aba Acessos do Painel › Aluno (P4) LÊ e MUDA o
// cadeado das séries do aluno (physiq_profiles.series_travadas — a verdade continua no Treino: o app lê pelo PowerSync e o APK velho do
// profissional segue mudando pela admin-semana-treinos › setConfig). Chamada com o token do PRINCIPAL: a nutricionista e o dono sem papel de
// personal não têm sessão no Treino (spec W-A §2.2-4; P4: qualquer profissional do aluno muda).
// POST, headers: Authorization: Bearer <access_token do PRINCIPAL> · x-schema: public|staging. Corpo: { acao: "ler", aluno } ·
// { acao: "salvar", aluno, valor: "ver" | "mexer" } (aluno = o id da rota: a matrícula ou o id do Treino; o campo é `acao`, como nas outras 2 da
// W-A — não o `action` da treino-leitura). 200 → { ok: true, series, pode_mudar } · { ok: true, series, registrado } · 4xx/5xx → { ok: false,
// erro }: 400 dados_invalidos/acao_invalida/schema_invalido · 401 sem_login · 403 sem_acesso · 404 aluno_inexistente/sem_treino · 405 metodo ·
// 409 sem_modulo · 413 corpo_grande · 429 muitas_acoes · 500 erro_interno · 502 principal_indisponivel.
// Os 6 passos (spec §5.2; revisão C4 — os passos 3 e 4 da treino-leitura):
//   1. quem chama: GET /auth/v1/user no principal (assinatura, validade e revogação conferidas lá);
//   2. o principal decide, COMO A PESSOA: acessos_ler (quem lê — w14_matricula_da_rota — e quem muda — w14_pode_editar; o login, a conta, o
//      treino_user_id guardado e os módulos da matrícula); sem o módulo Treino → 409 sem_modulo;
//   3. o usuário do Treino: o guardado na matrícula ou o vínculo physiq_identidades pelo login (sem os 2 → 404 sem_treino);
//   4. a trava por conta: treinoVisivelPelaConta(a conta da matrícula, a do physiq_profiles) — o mesmo login em 2 contas: a conta B NÃO lê nem
//      muda o Treino da conta A (403 sem_acesso);
//   5. lê ou grava SÓ series_travadas daquele treino_user_id, com a chave AUTOMÁTICA do projeto (a única escrita da função — a guarda de fonte do
//      src/lib/logsDasFuncoesTreino.test.ts confere);
//   6. o histórico no principal, como a pessoa: acessos_registrar_series (falhou → registrado: false + log.erro; a gravação vale).
// Prazo de 20 s no pedido inteiro (buscarComTempo em toda ida); freio no isolate por IP (antes do token) e por pessoa. Log em JSON
// (_shared/log.ts): só código, ação, schema, status e o código do Postgres — nunca o corpo do principal nem o nome do aluno.
// verify_jwt = false (o token é do outro banco). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions treino-acessos false
// Segredos: PRINCIPAL_URL, PRINCIPAL_ANON_KEY (os mesmos da treino-leitura e da trocar-token) + os automáticos do Supabase. Precisa no principal,
// no schema do pedido: a migration 20261012200000_wa1_acessos.sql (sem ela: 502 principal_indisponivel + log.erro).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { treinoVisivelPelaConta } from "../_shared/espelho/regras.ts";
import { criarLog } from "../_shared/log.ts";
import { ORCAMENTO_MS, TEMPO_MS, buscarComTempo, prazo, tempoEsgotado, type Prazo } from "../_shared/tempo.ts";
import {
  FREIO, LIMITE_CORPO, argsDoLer, argsDoRegistro, corsTreinoAcessos, lerPedidoTreinoAcessos, nivelDasSeries, pgDaResposta, registroDeu,
  respostaDoAcessosLer, schemaDoPedido, statusDoErroTreino, temTreino, travadasDoNivel,
} from "../_shared/treino-acessos-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRINCIPAL_URL = (Deno.env.get("PRINCIPAL_URL") || "").replace(/\/+$/, "");
const PRINCIPAL_ANON_KEY = Deno.env.get("PRINCIPAL_ANON_KEY") || "";
const log = criarLog("treino-acessos", { avisar: avisarErro });

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsTreinoAcessos(origin) } });
const erro = (codigo: string, origin: string | null) => json({ ok: false, erro: codigo }, statusDoErroTreino(codigo), origin);

// freio no isolate: por IP antes de validar o token e por pessoa depois (a aba lê 1 vez e muda pouco)
const janelas = new Map<string, number[]>();
function freio(chave: string, max: number, janelaMs = 60_000): boolean {
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

/** O corpo JSON lido até o limite (acima → null: 413); JSON ruim → {} (a forma recusa com acao_invalida). */
async function lerCorpo(req: Request): Promise<unknown | null> {
  const declarado = Number(req.headers.get("content-length") || 0);
  if (declarado > LIMITE_CORPO) return null;
  const bruto = await req.text();
  if (bruto.length > LIMITE_CORPO) return null;
  try {
    return JSON.parse(bruto || "{}");
  } catch {
    return {};
  }
}

/** O tempo vale até ler o corpo: estourou no meio dele, lança (o catch responde 500) — nunca vira "sem corpo". */
function semCorpo(e: unknown): null {
  if (tempoEsgotado(e)) throw e;
  return null;
}

async function usuarioDoPrincipal(token: string, p: Prazo): Promise<{ id: string | null; status: number }> {
  const r = await buscarComTempo(`${PRINCIPAL_URL}/auth/v1/user`, { headers: { apikey: PRINCIPAL_ANON_KEY, Authorization: `Bearer ${token}` } },
    Math.min(TEMPO_MS.gotruePrincipal, p.restante()));
  if (r.status === 200) {
    const u = await r.json().catch(semCorpo);
    return { id: typeof u?.id === "string" ? u.id : null, status: 200 };
  }
  await r.body?.cancel();
  return { id: null, status: r.status };
}

/** Uma RPC do principal COMO A PESSOA (o token de quem chama, no schema do pedido): o status e o corpo (nunca vai ao log). */
async function rpcDoPrincipal(
  nome: "acessos_ler" | "acessos_registrar_series", token: string, schema: string, args: Record<string, unknown>, p: Prazo,
): Promise<{ status: number; corpo: unknown }> {
  const r = await buscarComTempo(`${PRINCIPAL_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: PRINCIPAL_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Profile": schema, "Accept-Profile": schema },
    body: JSON.stringify(args),
  }, Math.min(TEMPO_MS.principal, p.restante()));
  return { status: r.status, corpo: await r.json().catch(semCorpo) };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsTreinoAcessos(origin) });
  if (req.method !== "POST") return erro("metodo", origin);
  const schema = schemaDoPedido(req.headers.get("x-schema"));
  let acao: string | null = null;
  try {
    if (!PRINCIPAL_URL || !PRINCIPAL_ANON_KEY) {
      log.erro({ codigo: "sem_configuracao", schema });
      return erro("erro_interno", origin);
    }
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";
    if (!freio(`ip:${ip}`, FREIO.porIp)) return erro("muitas_acoes", origin);
    if (!schema) return erro("schema_invalido", origin);
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ") || auth.length < 20) return erro("sem_login", origin);
    const token = auth.slice(7).trim();
    const corpo = await lerCorpo(req);
    if (corpo === null) return erro("corpo_grande", origin);
    const lido = lerPedidoTreinoAcessos(corpo);
    if (!lido.ok) {
      log.aviso({ codigo: lido.erro, schema, resultado: lido.campo ?? null });
      return erro(lido.erro, origin);
    }
    const pedido = lido.pedido;
    acao = pedido.acao;
    const p = prazo(ORCAMENTO_MS.usuario);

    // 1. quem chama: o login do principal
    const u = await usuarioDoPrincipal(token, p);
    if (!u.id) {
      if (u.status >= 500) log.aviso({ codigo: "principal_indisponivel", schema, acao, status: u.status });
      return erro(u.status >= 500 ? "principal_indisponivel" : "sem_login", origin);
    }
    if (!freio(`u:${u.id}`, FREIO.porPessoa)) {
      log.aviso({ codigo: "muitas_acoes", schema, acao, ref: u.id });
      return erro("muitas_acoes", origin);
    }

    // 2. o principal decide, como a pessoa (quem lê, quem muda, o login, a conta, o id do Treino guardado e os módulos)
    const lidoNoPrincipal = await rpcDoPrincipal("acessos_ler", token, schema, argsDoLer(pedido.aluno), p);
    const a = respostaDoAcessosLer(lidoNoPrincipal.status, lidoNoPrincipal.corpo);
    if (a.ok === false) {
      const campos = { codigo: a.erro, schema, acao, status: lidoNoPrincipal.status, pg: pgDaResposta(lidoNoPrincipal.corpo) };
      if (a.inesperado) log.erro(campos);
      else log.aviso(campos);
      return erro(a.erro, origin);
    }
    if (!temTreino(a.modulos)) {
      log.aviso({ codigo: "sem_modulo", schema, acao });
      return erro("sem_modulo", origin);
    }
    if (pedido.acao === "salvar" && !a.podeMudar) {
      log.aviso({ codigo: "sem_acesso", schema, acao, resultado: "nao_pode_mudar" });
      return erro("sem_acesso", origin);
    }

    // 3. o usuário do Treino: o guardado na matrícula ou o vínculo de identidade (a chave automática, no schema do pedido)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      db: { schema: schema as "public" },
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (entrada: string | URL | Request, init?: RequestInit) =>
          buscarComTempo(entrada, init ?? {}, Math.max(1, Math.min(TEMPO_MS.treino, p.restante()))),
      },
    });
    let treinoUserId = a.treinoUserId;
    if (!treinoUserId && a.userId) {
      const { data: v, error: ev } = await admin.from("physiq_identidades").select("treino_user_id").eq("principal_user_id", a.userId).maybeSingle();
      if (ev) throw ev;
      treinoUserId = (v as { treino_user_id?: string | null } | null)?.treino_user_id ?? null;
    }
    if (!treinoUserId) {
      log.aviso({ codigo: "sem_treino", schema, acao });
      return erro("sem_treino", origin);
    }

    // 4. a trava por conta (o mesmo login em 2 contas — revisão C4): perfil do Treino sem conta = o treino do próprio aluno (mostra)
    const { data: pf, error: epf } = await admin.from("physiq_profiles").select("conta_id, series_travadas").eq("id", treinoUserId).maybeSingle();
    if (epf) throw epf;
    const perfil = pf as { conta_id?: string | null; series_travadas?: boolean | null } | null;
    if (!perfil) {
      log.aviso({ codigo: "sem_treino", schema, acao, resultado: "sem_perfil" });
      return erro("sem_treino", origin);
    }
    if (!treinoVisivelPelaConta(a.contaId, perfil.conta_id ?? null)) {
      log.aviso({ codigo: "sem_acesso", schema, acao, resultado: "outra_conta" });
      return erro("sem_acesso", origin);
    }
    const atual = nivelDasSeries(perfil.series_travadas);
    if (pedido.acao === "ler") return json({ ok: true, series: atual, pode_mudar: a.podeMudar }, 200, origin);

    // 5. a ÚNICA gravação: series_travadas daquele treino_user_id (sem mudança, nada grava nem registra)
    if (pedido.valor === atual) return json({ ok: true, series: atual, registrado: false }, 200, origin);
    const { data: gravado, error: eg } = await admin.from("physiq_profiles").update({ series_travadas: travadasDoNivel(pedido.valor) }).eq("id", treinoUserId)
      .select("series_travadas").maybeSingle();
    if (eg) throw eg;
    if (!gravado) {
      log.aviso({ codigo: "sem_treino", schema, acao, resultado: "sem_perfil" });
      return erro("sem_treino", origin);
    }
    const series = nivelDasSeries((gravado as { series_travadas?: boolean | null }).series_travadas);

    // 6. o histórico no principal, como a pessoa (falhou → registrado: false + log.erro; a gravação vale)
    const reg = await rpcDoPrincipal("acessos_registrar_series", token, schema, argsDoRegistro(pedido.aluno, atual, series), p).catch(() => null);
    const registrado = reg !== null && registroDeu(reg.status, reg.corpo);
    if (!registrado) log.erro({ codigo: "registro_series_falhou", schema, acao, status: reg?.status ?? 0, pg: reg ? pgDaResposta(reg.corpo) : null });
    log.info({ codigo: "series_mudadas", schema, acao, resultado: series });
    return json({ ok: true, series, registrado }, 200, origin);
  } catch (e) {
    log.excecao(e, { acao, schema });
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
