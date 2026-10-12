// Physiq W2 — mp-contas-renovar (banco principal): renova o acesso do Mercado Pago das contas (o OAuth vale 180 dias; o refresh GIRA a cada
// renovação) e, 1×/dia por integração ativa, CONFERE a conta (mp_conferido_em): GET /users/me (o acesso tirado no MP é descoberto sem esperar
// um aluno pagar — MENOR 27) e a busca das cobranças das automáticas da conta (a rede do I1: a cobrança do mês que o aviso não trouxe).
// Quem chama: {schema}.mp_contas_renovar_disparar() pelo pg_net, de hora em hora (pg_cron mp-renovar-<schema>, minuto 41), só quando há o que
// fazer. POST { schema, forcar_conta? } — forcar_conta SÓ no staging (o E2E da renovação de verdade: renova AGORA aquela conta e nada mais).
// Por rodada (./rodada.ts): até 50 integrações oauth ativas que vencem em < 30 dias (e com a próxima tentativa na hora), 5 por vez, cada uma
// pela renovarConta (_shared/mp-conta.ts: a trava de 2 min, a gravação condicional, recusada → aviso "reconecte até dd/mm" ou erro, MP fora →
// espera crescente; sem refresh → aviso "conecte de novo até dd/mm" e a tentativa amanhã); as que JÁ venceram ainda "ativas" (sem refresh ou
// há mais de 1 dia) → marcarErro("vencido") + aviso; depois, até 50 ativas com mp_conferido_em nulo ou de > 1 dia, 5 por vez, pela
// conferirConta. Sobrou (ou faltou tempo) → a próxima hora pega; o diário vem DEPOIS da renovação.
// Segredo (S10 · contrato hml-16c): RECEBE o do Vault physiq_mp_renovar_segredo no x-espelho-segredo; aqui só o hash
// (SEGREDO_MP_RENOVAR_ACEITOS). Sem ou errado → 401 (o log não leva o recebido). Trocar: scripts/segredos/servidor.py mp_renovar.
// + MP_CLIENT_ID, MP_CLIENT_SECRET (no staging, os _STAGING se existirem), MP_TOKENS_CHAVE (sem algum → 500 nao_configurada, antes de mexer
// em qualquer conta). O schema ainda sem a migration da W2 → 409 schema_sem_w2 (só a tabela nova é lida).
// verify_jwt = false. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-contas-renovar false
// Log: só ids de conta e resultados (_shared/log.ts; o catch final avisa — log.excecao — e devolve 500); a resposta, só contagens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { chaveDoAmbiente } from "../_shared/cifra-mp.ts";
import { criarLog } from "../_shared/log.ts";
import { oauthDoAmbiente, schemaTemW2 } from "../_shared/mp-conta.ts";
import { segredoAceito } from "../_shared/segredo-servidor.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";
import { forcarRenovacao, lerPedido, rodada, type Rodada } from "./rodada.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const log = criarLog("mp-contas-renovar", { avisar: avisarErro });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "metodo" }, 405);
  // a rodada inteira em segundo plano (ninguém espera): o mesmo orçamento do lote da espelho-enviar e da automaticas-fila
  const orcamento = prazo(ORCAMENTO_MS.loteEspelho);
  const via = await segredoAceito(req.headers.get("x-espelho-segredo"), "SEGREDO_MP_RENOVAR");
  if (!via) {
    log.aviso({ codigo: "segredo_recusado", acao: "mp_renovar" });
    return json({ error: "segredo_invalido" }, 401);
  }
  log.info({ codigo: "segredo_aceito", acao: "mp_renovar", resultado: via });
  let corpo: unknown = null;
  try {
    corpo = await req.json();
  } catch {
    corpo = null;
  }
  const pedido = lerPedido(corpo);
  if (!pedido.ok) return json({ error: pedido.erro }, 400);
  const chave = await chaveDoAmbiente();
  const oauth = oauthDoAmbiente(pedido.schema);                            // no staging, o client de teste se houver (plano B do I6)
  if (!chave || !oauth) {
    log.erro({ codigo: "sem_configuracao", schema: pedido.schema, acao: "mp_renovar" });
    return json({ error: "nao_configurada" }, 500);
  }
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: pedido.schema as "public" }, auth: { persistSession: false } });

  try {
    if (!(await schemaTemW2(db, pedido.schema))) {
      log.aviso({ codigo: "schema_sem_w2", schema: pedido.schema, acao: "mp_renovar" });
      return json({ error: "schema_sem_w2" }, 409);
    }
    const r: Rodada = { db, schema: pedido.schema, log, prazo: orcamento, chave, oauth };
    if (pedido.forcarConta) {
      const forcada = await forcarRenovacao(r, pedido.forcarConta);
      if (!forcada) return json({ error: "conta_sem_mp" }, 404);
      return json(forcada);
    }
    return json(await rodada(r));
  } catch (e) {
    log.excecao(e, { schema: pedido.schema, acao: "mp_renovar" });
    return json({ error: "erro_interno" }, 500);
  }
});
