// Physiq W7 — exportar-meus-dados (banco principal). "Exportar meus dados" do Perfil do aluno (falha F4 — C88, R11; LGPD
// art. 18): um JSON com os dados do PRÓPRIO usuário nos 2 bancos — o principal (exportar_dados_aluno) e o Banco do Treino
// (delete-my-account em modo servidor, acao "exportar"). Vale para qualquer pessoa logada (aluno, paciente, profissional).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: {}.
// 200 → o arquivo: { formato, gerado_em, ambiente, explicacao, banco_principal, banco_do_treino }
// Erros: 401 missing_auth | invalid_token · 403 conta_real_no_staging · 429 rate_limited · 502 treino_indisponivel · 500
// Só age sobre o usuário do JWT (nenhum id vem do corpo). Nada é gravado.
// verify_jwt = true. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions exportar-meus-dados true
// Segredos: TREINO_URL, TREINO_ANON_KEY, SEGREDO_CONTA_TREINO (hml-16c, S3, pelo _shared/treino-servidor.ts) (+ os automáticos).
// hml-10 (H-24, H-26): log em JSON pelo _shared/log.ts (da resposta do Treino, só o código); o catch final avisa (log.excecao) e
// devolve o mesmo 500.
// hml-14 (H-32, D3): o app chama pelo supabase-js — um prazo por pedido (o de usuário); a ida ao Treino espera no máximo o que falta
// dele (e os 15 s da ação exportar): estourou → 502 treino_indisponivel, como o Treino fora.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { emailDeTeste, origemPermitida } from "../_shared/login-regras.ts";
import { montarExportacao } from "../_shared/conta-aluno-regras.ts";
import { chamarTreino } from "../_shared/treino-servidor.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS = ["public", "staging"];
const log = criarLog("exportar-meus-dados", { avisar: avisarErro });

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

// freio por pessoa no isolate: exportar lê os 2 bancos inteiros da pessoa (o Banco do Treino é uma VM Nano)
const janelas = new Map<string, number[]>();
function permitido(chave: string, max = 6, janelaMs = 60 * 60_000): boolean {
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

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const p = prazo(ORCAMENTO_MS.usuario); // hml-14 (H-32): o prazo do pedido inteiro
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return json({ ok: false, erro: "schema_invalido" }, 400, origin);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return json({ ok: false, erro: "missing_auth" }, 401, origin);
  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: ud, error: eu } = await authAdmin.auth.getUser(auth.slice(7).trim());
  if (eu || !ud?.user) return json({ ok: false, erro: "invalid_token" }, 401, origin);
  const user = ud.user;
  const email = String(user.email || "").trim().toLowerCase();
  if (schema === "staging" && !emailDeTeste(email)) return json({ ok: false, erro: "conta_real_no_staging" }, 403, origin);
  if (!permitido(`${schema}:${user.id}`)) return json({ ok: false, erro: "rate_limited" }, 429, origin);

  try {
    const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
    const { data: principal, error } = await db.rpc("exportar_dados_aluno", { p_uid: user.id });
    if (error) throw error;
    const treino = await chamarTreino(schema, "exportar", user.id, log, { prazo: p });
    if (treino.passo === "indisponivel") return json({ ok: false, erro: "treino_indisponivel" }, 502, origin);
    const arquivo = montarExportacao({
      ambiente: schema,
      geradoEm: new Date().toISOString(),
      principal,
      treino: treino.passo === "sem_vinculo" ? null : treino.corpo.dados ?? null,
    });
    return json(arquivo, 200, origin);
  } catch (e) {
    log.excecao(e, { schema });
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
