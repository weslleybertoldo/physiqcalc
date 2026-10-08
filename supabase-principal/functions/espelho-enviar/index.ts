// Physiq W2 — espelho-enviar (banco principal). Esvazia a fila espelho_pendencias do schema: pra cada mudança monta o
// resumo do núcleo de quem foi afetado e manda pra espelho-nucleo do Banco do Treino (spec §8.3). Tenta de novo até 5 vezes
// (espera 1, 2, 4, 8 min); a trocar-token também corrige tudo no próximo login de cada pessoa.
//   tipo 'pessoa' → payload { principal_user_id }       tipo 'conta' → payload { conta_id } (todos os membros da conta)
//
// POST, headers: x-espelho-segredo · x-schema: public|staging. Corpo: { limite?: 1..50 } (padrão 20).
// Quem chama: os gatilhos/tarefas das próximas worktrees (W4 tarefa das 03:40, W5 membros) ou à mão.
// verify_jwt = false. Publicar (a partir do physiqcalc):
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions espelho-enviar false
// Segredos: ESPELHO_SEGREDO, TREINO_URL.
// hml-10 (H-24, H-26, H-48): log em JSON pelo _shared/log.ts; a espelho-nucleo que recusa vira o código espelho_nucleo_<status>
// (sem o corpo dela — o mesmo texto vai para espelho_pendencias.erro); a resposta de erro leva só o código (sem a mensagem do
// banco); cada pendência que falha avisa (log.excecao).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { resumoDaPessoa, type Resumo } from "../_shared/resumo.ts";
import { MAX_TENTATIVAS_ESPELHO, proximaTentativaMs, segredoConfere } from "../_shared/resumo-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ESPELHO_SEGREDO = Deno.env.get("ESPELHO_SEGREDO") || "";
const TREINO_URL = (Deno.env.get("TREINO_URL") || "").replace(/\/+$/, "");
const SCHEMAS = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const log = criarLog("espelho-enviar", { avisar: avisarErro });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Pendencia { id: number; tipo: "pessoa" | "conta"; payload: Record<string, unknown>; tentativas: number }

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "metodo" }, 405);
  if (!segredoConfere(req.headers.get("x-espelho-segredo"), ESPELHO_SEGREDO)) return json({ error: "segredo_invalido" }, 401);
  if (!TREINO_URL) return json({ error: "nao_configurada" }, 500);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return json({ error: "schema_invalido" }, 400);
  let corpo: { limite?: unknown } = {};
  try { corpo = await req.json(); } catch { corpo = {}; }
  const limite = Math.min(50, Math.max(1, Number(corpo.limite) || 20));

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: fila, error: ef } = await db.from("espelho_pendencias")
    .select("id, tipo, payload, tentativas")
    .is("feito_em", null).lt("tentativas", MAX_TENTATIVAS_ESPELHO).lte("proxima_em", new Date().toISOString())
    .order("id", { ascending: true }).limit(limite);
  if (ef) {
    log.excecao(ef, { codigo: "fila_falhou", schema });
    return json({ error: "erro_interno" }, 500);
  }

  const saida: Array<Record<string, unknown>> = [];
  for (const p of (fila ?? []) as Pendencia[]) {
    try {
      const pessoas: string[] = [];
      if (p.tipo === "pessoa" && typeof p.payload?.principal_user_id === "string" && UUID.test(p.payload.principal_user_id)) {
        pessoas.push(p.payload.principal_user_id);
      } else if (p.tipo === "conta" && typeof p.payload?.conta_id === "string" && UUID.test(p.payload.conta_id)) {
        const { data, error } = await db.from("conta_membros").select("user_id").eq("conta_id", p.payload.conta_id).not("user_id", "is", null);
        if (error) throw error;
        for (const m of (data ?? []) as Array<{ user_id: string }>) pessoas.push(m.user_id);
      } else {
        throw new Error("payload inválido");
      }
      const resumos: Resumo[] = [];
      for (const id of [...new Set(pessoas)]) {
        const r = await resumoDaPessoa(db, authAdmin, id);
        if (r) resumos.push(r);
      }
      if (resumos.length) {
        const resp = await fetch(`${TREINO_URL}/functions/v1/espelho-nucleo`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-espelho-segredo": ESPELHO_SEGREDO, "x-schema": schema },
          body: JSON.stringify({ resumos }),
        });
        await resp.text(); // lê até o fim (a conexão fica livre); o corpo não vai para o log nem para a fila
        if (resp.status !== 200) throw new Error(`espelho_nucleo_${resp.status}`);
      }
      await db.from("espelho_pendencias").update({ feito_em: new Date().toISOString(), erro: null }).eq("id", p.id);
      saida.push({ id: p.id, resultado: "feito", pessoas: resumos.length });
    } catch (e) {
      const tentativas = (p.tentativas ?? 0) + 1;
      const msg = String((e as { message?: string })?.message || e).slice(0, 500);
      await db.from("espelho_pendencias").update({
        tentativas, erro: msg, proxima_em: new Date(Date.now() + proximaTentativaMs(tentativas)).toISOString(),
      }).eq("id", p.id);
      log.excecao(e, { codigo: "pendencia_falhou", schema, ref: p.id, n: tentativas });
      saida.push({ id: p.id, resultado: "falhou", tentativas, erro: msg });
    }
  }
  return json({ processadas: saida.length, resultados: saida });
});
