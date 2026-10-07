// Physiq W2 — espelho-nucleo (Banco do Treino). Recebe do banco principal (função espelho-enviar) os resumos do núcleo
// de quem mudou (membro entrou/saiu/mudou de papel, aluno trocou de responsável ou foi bloqueado, conta pagou/venceu/
// foi isenta ou suspensa) e aplica no espelho do Treino — a mesma regra da trocar-token (spec §8.3).
//
// POST, headers: x-espelho-segredo: <ESPELHO_SEGREDO> · x-schema: public|staging. Corpo: { resumos: ResumoNucleo[] } (até 50).
// Quem ainda não tem vínculo (nunca entrou no Physiq) é pulado: a trocar-token aplica tudo no 1º login.
// verify_jwt = false (autenticação pelo segredo compartilhado). Publicar:
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions espelho-nucleo false
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { aplicarResumo } from "../_shared/espelho/aplicar.ts";
import { segredoConfere, type ResumoNucleo } from "../_shared/espelho/regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ESPELHO_SEGREDO = Deno.env.get("ESPELHO_SEGREDO") || "";
const SCHEMAS = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "metodo" }, 405);
  if (!segredoConfere(req.headers.get("x-espelho-segredo"), ESPELHO_SEGREDO)) return json({ error: "segredo_invalido" }, 401);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return json({ error: "schema_invalido" }, 400);
  let corpo: { resumos?: unknown } = {};
  try { corpo = await req.json(); } catch { corpo = {}; }
  const resumos = Array.isArray(corpo.resumos) ? (corpo.resumos as ResumoNucleo[]) : [];
  if (!resumos.length || resumos.length > 50) return json({ error: "resumos_invalidos" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const resultados: Array<Record<string, unknown>> = [];
  let falhas = 0;
  for (const r of resumos) {
    const pid = r?.principal_user_id;
    if (typeof pid !== "string" || !UUID.test(pid)) { resultados.push({ principal_user_id: pid ?? null, resultado: "resumo_invalido" }); falhas++; continue; }
    try {
      const { data: v, error: ev } = await db.from("physiq_identidades").select("treino_user_id").eq("principal_user_id", pid).maybeSingle();
      if (ev) throw ev;
      if (!v) { resultados.push({ principal_user_id: pid, resultado: "sem_vinculo" }); continue; }
      const { data: tu, error: eu } = await authAdmin.auth.admin.getUserById((v as { treino_user_id: string }).treino_user_id);
      if (eu || !tu?.user) throw eu ?? new Error("usuário do Treino sumiu");
      const espelho = await aplicarResumo(db, authAdmin, tu.user, r, schema === "staging" ? "staging" : "public");
      resultados.push({ principal_user_id: pid, resultado: "aplicado", espelho });
    } catch (e) {
      falhas++;
      console.error("espelho-nucleo", pid, String((e as { message?: string })?.message || e));
      resultados.push({ principal_user_id: pid, resultado: "erro", erro: String((e as { message?: string })?.message || e).slice(0, 200) });
    }
  }
  return json({ ok: falhas === 0, resultados }, falhas ? 207 : 200);
});
