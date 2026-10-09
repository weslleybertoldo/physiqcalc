// Physiq W2 — espelho-resumo (banco principal). Devolve o resumo do núcleo de uma pessoa (master?, contas em que é
// membro e com quais papéis, matrículas de aluno e, se é personal, os alunos de treino dela) pra trocar-token aplicar
// no Banco do Treino (spec §7.4). Só o servidor chama: autenticação pelo segredo compartilhado ESPELHO_SEGREDO.
//
// POST, headers: x-espelho-segredo · x-schema: public|staging. Corpo: { principal_user_id }.
// 200 → ResumoNucleo · 404 usuario_nao_encontrado · 401 segredo_invalido · 500 erro_interno.
// hml-14 (H-76): o 404 é só o login que não existe de verdade (o 404 do GoTrue); erro do GoTrue (rede, 5xx, tempo) vai para o
// catch → 500 e avisa. A trocar-token trata os 2 do mesmo jeito de antes (espelho_indisponivel, que o app tenta de novo).
// verify_jwt = false. Publicar (a partir do physiqcalc):
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions espelho-resumo false
// hml-10 (H-26): o catch final avisa (log.excecao, _shared/log.ts) e devolve o mesmo 500.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { resumoDaPessoa } from "../_shared/resumo.ts";
import { segredoConfere } from "../_shared/resumo-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ESPELHO_SEGREDO = Deno.env.get("ESPELHO_SEGREDO") || "";
const SCHEMAS = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const log = criarLog("espelho-resumo", { avisar: avisarErro });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "metodo" }, 405);
  if (!segredoConfere(req.headers.get("x-espelho-segredo"), ESPELHO_SEGREDO)) return json({ error: "segredo_invalido" }, 401);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return json({ error: "schema_invalido" }, 400);
  let corpo: { principal_user_id?: unknown } = {};
  try { corpo = await req.json(); } catch { corpo = {}; }
  const id = typeof corpo.principal_user_id === "string" ? corpo.principal_user_id : "";
  if (!UUID.test(id)) return json({ error: "principal_user_id_invalido" }, 400);
  try {
    const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
    const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const resumo = await resumoDaPessoa(db, authAdmin, id);
    if (!resumo) return json({ error: "usuario_nao_encontrado" }, 404);
    return json(resumo);
  } catch (e) {
    log.excecao(e, { schema });
    return json({ error: "erro_interno" }, 500);
  }
});
