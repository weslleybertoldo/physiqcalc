// Physiq W3 — vincular-aluno (banco principal). O código do profissional (?prof=PROF-NOME-SOBRENOME ou "Tenho um código"
// das Boas-vindas) leva à conta certa: cria a matrícula do aluno (pacientes) na conta do profissional, com o responsável do
// módulo que ele tem lá (personal → Treino; nutricionista → Nutrição). Recusa como o Calc e o P7: código inválido,
// profissional inativo, o próprio código, aluno ativo em OUTRA conta e o limite da faixa (spec 4.1, 4.2, 9).
//
// POST, 2 jeitos:
//   app      → Authorization: Bearer <access_token do principal> · x-schema · corpo { codigo }
//   servidor → x-espelho-segredo · x-schema · corpo { principal_user_id, codigo }  (o vincular-professor do Treino repassa
//              os vínculos feitos pelo APK antigo)
// 200 → { ok: true, paciente_id, ja_era, conta_id, conta_nome, profissional, modulos }
// W7 — prévia (pedido dele, 29/09): app + corpo { codigo, previa: true } → NÃO vincula; devolve o que o popup "confirmar o
//   profissional" mostra: { ok, erro?, ja_era, conta_nome, modulos, profissional: { nome, foto_url, tipo_perfil, papeis } }
//   (a MESMA regra do vínculo, desfeita no banco — previa_vinculo_por_codigo). Código inexistente → 404 codigo_invalido.
//   Limite próprio (30/h por pessoa) contra tentativa em massa de códigos; nada de e-mail, telefone ou ids.
// 4xx → { ok: false, erro: codigo_invalido | profissional_inativo | proprio_codigo | outro_profissional | limite_plano | ... }
// W7b (aluno sem profissional — a "conta do app"): quem é aluno do app PODE entrar na lista de um profissional (P7 não conta a
//   conta do app); o banco encerra a matrícula do app e aqui a assinatura do app no Mercado Pago é cancelada (sem reembolso
//   automático do mês pago). A prévia devolve `app: { valor, plano, assinatura_ativa }` para o popup avisar que a mensalidade do
//   app para. Modo servidor novo — `{ acao: "desvincular", principal_user_id, profissional_principal_id }`: o painel antigo do
//   Calc (admin-delete-user do Treino) tirou o aluno da lista → a matrícula dele fica inativa e o gatilho do banco o leva para o
//   app com 7 dias grátis (desvincular_do_profissional).
// verify_jwt = false (o modo servidor não tem JWT; o app é validado aqui no GET /auth/v1/user). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions vincular-aluno false
// Segredos: ESPELHO_SEGREDO, MP_ACCESS_TOKEN_PROD / MP_ACCESS_TOKEN_TEST (cancelar a assinatura do app) (+ os automáticos). Depois do vínculo o app refaz a troca de token (o Treino recebe o professor
// pelo espelho) — e a fila espelho_pendencias leva a mudança para quem já tem vínculo.
// hml-10 (H-24, H-26): log em JSON pelo _shared/log.ts; os catches que devolvem 500 avisam (log.excecao) com a resposta de antes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { emailConfirmado, emailDeTeste, origemPermitida, segredoConfere } from "../_shared/login-regras.ts";
import { credencialDoSchema, type Schema } from "../_shared/cobranca-mp.ts";
import { appDaPessoa, cancelarAssinaturasDoAppEncerrado } from "../_shared/app-sem-profissional.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ESPELHO_SEGREDO = Deno.env.get("ESPELHO_SEGREDO") || "";
const SCHEMAS = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const log = criarLog("vincular-aluno", { avisar: avisarErro });

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

// freio por pessoa no isolate (o código não pode ser adivinhado na força)
const janelas = new Map<string, number[]>();
function permitido(chave: string, max = 20, janelaMs = 60 * 60_000): boolean {
  const agora = Date.now();
  const validos = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
  if (validos.length >= max) { janelas.set(chave, validos); return false; }
  validos.push(agora);
  janelas.set(chave, validos);
  if (janelas.size > 5000) janelas.clear();
  return true;
}

const STATUS_DO_ERRO: Record<string, number> = {
  codigo_invalido: 404, profissional_inativo: 409, proprio_codigo: 409, outro_profissional: 409, limite_plano: 409,
  conta_inexistente: 404, usuario_inexistente: 404,
};

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return json({ ok: false, erro: "schema_invalido" }, 400, origin);
  let corpo: { codigo?: unknown; principal_user_id?: unknown; previa?: unknown; acao?: unknown; profissional_principal_id?: unknown } = {};
  try { corpo = await req.json(); } catch { corpo = {}; }
  const codigo = typeof corpo.codigo === "string" ? corpo.codigo.trim().toUpperCase().slice(0, 60) : "";

  // W7b — modo servidor: o profissional tirou o aluno da lista no painel antigo (admin-delete-user do Treino)
  if (corpo.acao === "desvincular") {
    if (!segredoConfere(req.headers.get("x-espelho-segredo"), ESPELHO_SEGREDO)) return json({ ok: false, erro: "segredo_invalido" }, 401, origin);
    const aluno = typeof corpo.principal_user_id === "string" ? corpo.principal_user_id : "";
    const prof = typeof corpo.profissional_principal_id === "string" ? corpo.profissional_principal_id : "";
    if (!UUID.test(aluno) || !UUID.test(prof)) return json({ ok: false, erro: "parametros_invalidos" }, 400, origin);
    try {
      const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
      const { data, error } = await db.rpc("desvincular_do_profissional", { p_aluno: aluno, p_profissional: prof });
      if (error) throw error;
      return json(data ?? { ok: true }, 200, origin);
    } catch (e) {
      log.excecao(e, { acao: "desvincular", schema });
      return json({ ok: false, erro: "erro_interno" }, 500, origin);
    }
  }
  if (!codigo) return json({ ok: false, erro: "codigo_invalido" }, 400, origin);

  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let userId: string;
  const segredo = req.headers.get("x-espelho-segredo");
  if (segredo) {
    if (!segredoConfere(segredo, ESPELHO_SEGREDO)) return json({ ok: false, erro: "segredo_invalido" }, 401, origin);
    const id = typeof corpo.principal_user_id === "string" ? corpo.principal_user_id : "";
    if (!UUID.test(id)) return json({ ok: false, erro: "principal_user_id_invalido" }, 400, origin);
    userId = id;
  } else {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ") || auth.length < 20) return json({ ok: false, erro: "missing_auth" }, 401, origin);
    const { data, error } = await authAdmin.auth.getUser(auth.slice(7).trim());
    if (error || !data?.user) return json({ ok: false, erro: "invalid_token" }, 401, origin);
    if (!emailConfirmado(data.user)) return json({ ok: false, erro: "email_nao_confirmado" }, 403, origin);
    if (schema === "staging" && !emailDeTeste(data.user.email)) return json({ ok: false, erro: "conta_real_no_staging" }, 403, origin);
    userId = data.user.id;
  }
  // W7: a prévia do popup (só no modo app; o servidor não pede prévia) — não vincula nada
  if (corpo.previa === true && !segredo) {
    if (!permitido(`previa:${schema}:${userId}`, 30)) return json({ ok: false, erro: "rate_limited" }, 429, origin);
    try {
      const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
      const { data, error } = await db.rpc("previa_vinculo_por_codigo", { p_user: userId, p_codigo: codigo });
      if (error) throw error;
      const r = (data ?? {}) as Record<string, unknown>;
      if (!r.profissional) return json({ ok: false, erro: String(r.erro || "codigo_invalido") }, 404, origin);
      // W7b: é aluno do app? o popup avisa que a mensalidade do app para (e a cobrança automática, se tiver, é cancelada)
      const app = r.ok === true && r.ja_era !== true ? await appDaPessoa(db, userId) : null;
      return json({ ok: r.ok === true, erro: r.erro ?? null, ja_era: r.ja_era === true, conta_nome: r.conta_nome ?? null,
        modulos: Array.isArray(r.modulos) ? r.modulos : [], profissional: r.profissional, previa: true,
        app: app ? { valor: app.valor, plano: app.plano, assinatura_ativa: app.assinatura_ativa } : null }, 200, origin);
    } catch (e) {
      log.excecao(e, { acao: "previa", schema });
      return json({ ok: false, erro: "erro_interno" }, 500, origin);
    }
  }

  if (!permitido(`${schema}:${userId}`)) return json({ ok: false, erro: "rate_limited" }, 429, origin);

  try {
    const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
    const { data, error } = await db.rpc("vincular_aluno_por_codigo", { p_user: userId, p_codigo: codigo });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    if (r.ok !== true) {
      const erro = String(r.erro || "erro_interno");
      return json({ ok: false, erro, limite: r.limite ?? null }, STATUS_DO_ERRO[erro] ?? 400, origin);
    }
    // W7b: saiu do app (a matrícula do app encerrou) → a assinatura do app no Mercado Pago é cancelada (não trava o vínculo)
    let assinaturaApp = { canceladas: 0, falhas: 0 };
    try {
      assinaturaApp = await cancelarAssinaturasDoAppEncerrado(db, credencialDoSchema(schema as Schema), userId, "vinculou_profissional", log);
    } catch (e) {
      log.excecao(e, { codigo: "cancelar_assinatura_do_app", schema, acao: "vincular" });
      assinaturaApp = { canceladas: 0, falhas: 1 };
    }
    return json({ ...r, assinatura_app: assinaturaApp }, 200, origin);
  } catch (e) {
    log.excecao(e, { acao: "vincular", schema });
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
