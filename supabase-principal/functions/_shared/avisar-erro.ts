// Physiq hml-10 (H-26, D4 e D6) — o aviso de erro do banco principal: liga o caminho do aviso (_shared/erro-avisar-regras.ts:
// trava na memória → registrar_aviso_erro → Telegram → log) às peças de verdade — as variáveis, o banco com a service_role e o
// sendMessage do Telegram (grupo Validação › tópico Physiq, pelo bot da ponte).
//
// Quem usa:
//   - toda função do principal, pelo log (log.erro e log.excecao avisam em segundo plano):
//       import { criarLog } from "../_shared/log.ts";
//       import { avisarErro } from "../_shared/avisar-erro.ts";
//       const log = criarLog("cobranca-conta", { avisar: avisarErro });
//   - a função erro-avisar (o que o app e o Banco do Treino mandam): enviarAviso.
// Segredos (só os nomes): TELEGRAM_BOT_TOKEN (o bot da ponte; cofre "Telegram Bot Bertoldo"), ERROS_TELEGRAM_CHAT (o grupo
// Validação), ERROS_TELEGRAM_TOPICO (o tópico Physiq; opcional), ERROS_AVISO_DESLIGADO=1 (a chave de desligar: loga e não
// manda) + os automáticos SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Sem o token ou o chat: loga aviso_sem_configuracao e
// não manda. Tabela e função: supabase-principal/migrations/20261008110000_hml10_avisos_erro.sql.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import type { ErroParaAviso, SchemaAviso } from "./erros.ts";
import {
  criarAvisador,
  type ConfigAviso,
  type CorpoTelegram,
  type RegistroAviso,
  type RespostaTelegram,
  type ResultadoAviso,
} from "./erro-avisar-regras.ts";
import { criarLog } from "./log.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const clientes = new Map<SchemaAviso, SupabaseClient>();

/** O cliente service_role do schema (o mesmo jeito das outras funções: db.schema = o x-schema). */
function banco(schema: SchemaAviso): SupabaseClient {
  let c = clientes.get(schema);
  if (!c) {
    c = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
    clientes.set(schema, c);
  }
  return c;
}

function config(): ConfigAviso {
  return {
    token: (Deno.env.get("TELEGRAM_BOT_TOKEN") || "").trim(),
    chat: (Deno.env.get("ERROS_TELEGRAM_CHAT") || "").trim(),
    topico: (Deno.env.get("ERROS_TELEGRAM_TOPICO") || "").trim(),
    desligado: /^(1|true|sim)$/i.test((Deno.env.get("ERROS_AVISO_DESLIGADO") || "").trim()),
  };
}

/** {schema}.registrar_aviso_erro (5 s): -1 = segura; N ≥ 0 = manda. Erro do banco lança (o caminho do aviso manda assim mesmo). */
async function registrar(schema: SchemaAviso, r: RegistroAviso): Promise<number> {
  const { data, error } = await banco(schema)
    .rpc("registrar_aviso_erro", { p_assinatura: r.assinatura, p_origem: r.origem, p_lugar: r.lugar, p_exemplo: r.exemplo })
    .abortSignal(AbortSignal.timeout(5000));
  if (error) throw error;
  const n = Number(data);
  if (!Number.isInteger(n)) throw new Error("registrar_aviso_erro: resposta fora do formato");
  return n;
}

/** sendMessage (8 s). A URL leva o token: ela nunca vai para log nem para erro (o caminho do aviso tira o token do texto). */
async function mandar(token: string, corpo: CorpoTelegram): Promise<RespostaTelegram> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(8000),
  });
  const j = (await r.json().catch(() => null)) as { ok?: unknown; result?: { message_id?: unknown }; description?: unknown } | null;
  const id = j?.result?.message_id;
  return {
    ok: r.ok && j?.ok === true,
    status: r.status,
    messageId: typeof id === "number" ? id : null,
    descricao: typeof j?.description === "string" ? j.description : "",
  };
}

const avisador = criarAvisador({ config, registrar, mandar, log: criarLog("avisar-erro", { avisar: null }) });

/** O caminho do aviso para um erro já montado (a erro-avisar usa: o que o app e o Treino mandam). Nunca lança. */
export function enviarAviso(erro: ErroParaAviso, schema: SchemaAviso): Promise<ResultadoAviso> {
  return avisador.enviarAviso(erro, schema);
}

/**
 * O aviso das funções do principal — o que se passa ao log: criarLog("<slug>", { avisar: avisarErro }). Sem schema (não
 * informado no log), o aviso sai como produção. Nunca lança.
 */
export function avisarErro(erro: ErroParaAviso, schema: SchemaAviso | null): Promise<ResultadoAviso> {
  return avisador.enviarAviso({ ...erro, banco: "principal" }, schema ?? "public");
}
