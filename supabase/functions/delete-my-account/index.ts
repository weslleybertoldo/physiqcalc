// delete-my-account (Banco do Treino) — só o modo servidor:
//
//   · modo app (JWT do Treino, sem o segredo): DESLIGADO na hml-09 (H-23) → 410 { ok: false, error: "migrado" }, com CORS (o
//     OPTIONS segue 200). Era o "Excluir minha conta" da TreinosPage antiga (APK ≤ 3.7; a tela saiu na W8): apagava DE VEZ (hard
//     delete) o login do Treino de qualquer papel e deixava o banco principal intacto. A exclusão é pelo app novo (Perfil › Excluir
//     minha conta → excluir-minha-conta do principal, que chama o modo servidor abaixo) ou pela página /excluir-conta.
//
//   · modo servidor (Physiq W7, falha F4 — C88, R11, P19): chamado SÓ pelas funções exportar-meus-dados e excluir-minha-conta
//     do banco principal, servidor → servidor. Cabeçalhos: x-espelho-segredo (ESPELHO_SEGREDO, o mesmo da W2) · x-schema ·
//     Authorization: Bearer <anon do Treino> (o verify_jwt continua TRUE: a borda do Supabase exige um JWT do projeto e o
//     anon serve; quem autoriza é o segredo). Corpo: { modo: "servidor", acao: "exportar" | "conferir" | "excluir",
//     principal_user_id }. O id do Treino sai do vínculo physiq_identidades (nunca de um id mandado por alguém).
//       exportar → { ok, dados }                               (physiq_exportar_aluno)
//       conferir → { ok, simulacao: true, apaga, mantem }        (nada muda)
//       excluir  → { ok, apaga, mantem, login: "removido" }      (physiq_excluir_aluno + "soft delete" do login + vínculo)
//       sem vínculo (só Nutrição, nunca usou o Treino) → { ok: true, sem_vinculo: true }
//       professor / master / membro de equipe → 403 { ok: false, erro: "profissional" }
//     W2 da loja (Google Play) — a exclusão do PROFISSIONAL, SÓ pela excluir-minha-conta no pedido do app novo:
//       conferir_profissional → { ok, simulacao: true, apaga, mantem, cobrancas }  (physiq_excluir_profissional — nada muda)
//       excluir_profissional  → { ok, apaga, mantem, cobrancas, login: "removido" } (o que ele montou fica com os alunos; o professor
//                               suspenso e sem Pix; o que é dele como usuário apagado; "soft delete" do login + vínculo)
//       master → 403 { ok: false, erro: "profissional" }
//     hml-09 (H-23) — o Auth é o mesmo nos 2 ambientes: pelo staging, quem também tem dado em produção (staging.
//       physiq_pegada_em_producao: o vínculo de public ou uma linha em public) → 403 { ok: false, erro: "conta_real_no_staging",
//       motivo: "dados_em_producao" } em todas as ações menos o exportar, antes do sem_vinculo (o soft delete tiraria o login da
//       produção). Erro ao conferir = 500 (falha fechada).
//     Idempotente: pedir de novo depois de um erro no meio refaz só o que faltou.
//
// Publicar: gh workflow run deploy-function.yml -f function=delete-my-account (verify_jwt true) ou
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions delete-my-account true
// Segredos: ESPELHO_SEGREDO (W2) + os automáticos.
// hml-10 (H-24 e H-26): log em JSON sem dado pessoal (_shared/log.ts); log.erro e log.excecao avisam o Weslley pelo principal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { AsyncLocalStorage } from "node:async_hooks";
import { criarLog } from "../_shared/log.ts";
import { avisarErro } from "../_shared/avisar-erro.ts";

const log = criarLog("delete-my-account", { avisar: avisarErro });
// Ambiente: schema "public" (prod) ou "staging", resolvido por request via header x-schema.
const _ALLOWED_SCHEMAS = ["public", "staging"];
function resolveSchema(req: Request): string {
  const h = (req.headers.get("x-schema") || "public").toLowerCase();
  return _ALLOWED_SCHEMAS.includes(h) ? h : "public";
}
const schemaCtx = new AsyncLocalStorage<string>();
function currentSchema(): "public" { return (schemaCtx.getStore() || "public") as "public"; }

const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.vercel.app",
  "https://physiqcalc.com.br",
  "https://www.physiqcalc.com.br",
  "https://physiqcalc-staging.vercel.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:8080",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://physiqcalc.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function jsonErr(msg: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ESPELHO_SEGREDO = Deno.env.get("ESPELHO_SEGREDO") || "";

// ───────────────────────── modo servidor (W7) ─────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACOES = ["exportar", "conferir", "excluir", "conferir_profissional", "excluir_profissional"];

/** Comparação em tempo constante (o mesmo segredoConfere da vincular-professor/trocar-token). */
function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  const a = recebido || "";
  const b = esperado || "";
  if (b.length < 32 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function jsonServidor(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * hml-09 (H-23): a resposta de staging.physiq_pegada_em_producao ({ em_producao, colunas }) bloqueia a ação? SÓ em_producao = false
 * deixa seguir; qualquer outra forma bloqueia (falha fechada). É a MESMA regra do pegadaBloqueia do principal
 * (supabase-principal/functions/_shared/conta-aluno-regras.ts) — cada banco publica as suas funções; o vitest confere as 2 cópias.
 */
function pegadaBloqueia(resposta: unknown): boolean {
  if (!resposta || typeof resposta !== "object" || Array.isArray(resposta)) return true;
  const r = resposta as Record<string, unknown>;
  if (r.em_producao !== false) return true;
  return r.colunas != null && !(Array.isArray(r.colunas) && r.colunas.length === 0);
}

async function modoServidor(req: Request): Promise<Response> {
  if (!segredoConfere(req.headers.get("x-espelho-segredo"), ESPELHO_SEGREDO)) return jsonServidor({ ok: false, erro: "segredo_invalido" }, 401);
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonServidor({ ok: false, erro: "invalid_body" }, 400);
  }
  const acao = String(body.acao || "");
  const principalId = typeof body.principal_user_id === "string" ? body.principal_user_id : "";
  if (!ACOES.includes(acao)) return jsonServidor({ ok: false, erro: "acao_invalida" }, 400);
  if (!UUID.test(principalId)) return jsonServidor({ ok: false, erro: "principal_invalido" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() }, auth: { persistSession: false } });
  try {
    const { data: v, error: ev } = await admin.from("physiq_identidades").select("treino_user_id").eq("principal_user_id", principalId).maybeSingle();
    if (ev) throw ev;
    const treinoId = (v as { treino_user_id?: string } | null)?.treino_user_id ?? null;
    // hml-09 (H-23): pelo staging, quem também tem dado em produção não é conferido nem excluído (todas as ações menos o
    // exportar). Antes do sem_vinculo: sem o vínculo do staging, a pessoa ainda pode ter o de produção.
    if ((currentSchema() as string) === "staging" && acao !== "exportar") {
      const { data: pg, error: epg } = await admin.rpc("physiq_pegada_em_producao", { p_principal: principalId, p_treino: treinoId });
      if (epg) throw epg;
      if (pegadaBloqueia(pg)) return jsonServidor({ ok: false, erro: "conta_real_no_staging", motivo: "dados_em_producao" }, 403);
    }
    if (!treinoId) return jsonServidor({ ok: true, sem_vinculo: true, dados: null });

    if (acao === "exportar") {
      const { data, error } = await admin.rpc("physiq_exportar_aluno", { p_user: treinoId });
      if (error) throw error;
      return jsonServidor({ ok: true, dados: data });
    }

    // W2 da loja: a exclusão do profissional (as ações de cima e de baixo, do aluno, não mudam)
    if (acao === "conferir_profissional" || acao === "excluir_profissional") {
      const simularProf = acao === "conferir_profissional";
      const { data: rp, error: erp } = await admin.rpc("physiq_excluir_profissional", { p_user: treinoId, p_simular: simularProf });
      if (erp) throw erp;
      const resp = (rp ?? {}) as Record<string, unknown>;
      if (resp.ok !== true) return jsonServidor(resp, resp.erro === "profissional" ? 403 : 409);
      if (simularProf) return jsonServidor(resp);
      // o login: "soft delete" do Auth, como o do aluno — a linha fica só como âncora do que ele montou para os alunos
      if (resp.login_removido !== true) {
        const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
        const { error: edp } = await authAdmin.auth.admin.deleteUser(treinoId, true);
        if (edp) throw edp;
      }
      // o vínculo sai por último (se algo acima falhou, o pedido de novo ainda acha o profissional)
      const { error: eip } = await admin.from("physiq_identidades").delete().eq("principal_user_id", principalId);
      if (eip) throw eip;
      await admin.from("physiq_identidade_conflitos").delete().eq("principal_user_id", principalId);
      return jsonServidor({ ...resp, login: "removido" });
    }

    const simular = acao === "conferir";
    const { data: r, error: er } = await admin.rpc("physiq_excluir_aluno", { p_user: treinoId, p_simular: simular });
    if (er) throw er;
    const res = (r ?? {}) as Record<string, unknown>;
    if (res.ok !== true) return jsonServidor(res, res.erro === "profissional" ? 403 : 409);
    if (simular) return jsonServidor(res);

    // o login: "soft delete" do Auth — a linha fica só como âncora do que é do profissional (avaliações, fotos, prescrição,
    // pagamentos), com e-mail e identidades embaralhados, sem senha e sem sessão (não entra de novo nem é achado pelo e-mail)
    if (res.login_removido !== true) {
      const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
      const { error: ed } = await authAdmin.auth.admin.deleteUser(treinoId, true);
      if (ed) throw ed;
    }
    // o vínculo sai por último (se algo acima falhou, o pedido de novo ainda acha o aluno)
    const { error: ei } = await admin.from("physiq_identidades").delete().eq("principal_user_id", principalId);
    if (ei) throw ei;
    await admin.from("physiq_identidade_conflitos").delete().eq("principal_user_id", principalId);
    return jsonServidor({ ...res, login: "removido" });
  } catch (e) {
    log.excecao(e, { acao, schema: currentSchema() });
    return jsonServidor({ ok: false, erro: "interno" }, 500);
  }
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

  // W7: servidor → servidor (o principal); nunca pelo navegador
  if (req.headers.get("x-espelho-segredo")) {
    if (req.method !== "POST") return jsonServidor({ ok: false, erro: "metodo" }, 405);
    return await modoServidor(req);
  }

  // hml-09 (H-23): o modo app saiu (o cabeçalho explica) — o APK antigo lê o 410 e mostra o erro dele; nada é lido nem apagado
  return jsonErr("migrado", 410, origin);
});
