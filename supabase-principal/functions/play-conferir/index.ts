// Physiq play-W6 (22/10/2026) — play-conferir: a conferência de hora em hora das assinaturas da Google Play, no lugar do aviso do Google
// pelo Pub/Sub (o RTDN): a play-rtdn saiu em 22/10/2026 — o physiq-br ficou sem faturamento no Google Cloud (o Google pede um pré-pagamento
// de R$ 150 e o dono decidiu não pagar) e sem faturamento não há Pub/Sub. Junto com o registrar ao abrir o app (a play-compras), esta rotina
// traz a renovação, o cancelamento, a carência, a suspensão, a pausa e a expiração (o GET de TODAS as vivas) e a devolução e o estorno (a
// Voided Purchases API) em até 1 hora. A regra mora na ./rodada.ts (o Vitest importa); aqui, só a porta.
// Quem chama: {schema}.play_conferir_disparar() pelo pg_net, de hora em hora (pg_cron play-conferir-<schema>, minuto 25), só quando o schema
// tem assinatura da Play. POST { schema, limite? } → 200 { ok, …contagens } (só números) · sem o PLAY_SERVICE_ACCOUNT: 200
// { ok, pulou: "play_sem_credencial" } + o log (nada quebra) · 400 schema_invalido / limite_invalido · 405 · 500 erro_interno.
// Segredo (S11 · o molde do S10 da mp-contas-renovar): RECEBE o do Vault physiq_play_conferir_segredo no x-espelho-segredo; aqui só o hash
// (SEGREDO_PLAY_CONFERIR_ACEITOS). Sem ou errado → o MESMO 401 segredo_invalido, sem detalhe (o log não leva o recebido). Trocar:
// scripts/segredos/servidor.py play_conferir.
// verify_jwt = false. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions play-conferir false
// Segredos: PLAY_SERVICE_ACCOUNT (a conta play-api@physiq-br) e SEGREDO_PLAY_CONFERIR_ACEITOS. Só no teste local: PLAY_API_BASE e
// PLAY_OAUTH_URL (o simulador; _shared/play-api.ts).
// Log: só códigos e contagens (ref = a matrícula); nunca o token, o pedido, o corpo do Google nem o segredo. O catch final avisa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { segredoAceito } from "../_shared/segredo-servidor.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";
import { conferir, lerPedido } from "./rodada.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const log = criarLog("play-conferir", { avisar: avisarErro });

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
  // ninguém espera a resposta (o pg_net só guarda o status): o orçamento do lote, como o da mp-contas-renovar
  const orcamento = prazo(ORCAMENTO_MS.loteEspelho);
  let schema: string | null = null;
  try {
    const via = await segredoAceito(req.headers.get("x-espelho-segredo"), "SEGREDO_PLAY_CONFERIR");
    if (!via) {
      log.aviso({ codigo: "segredo_recusado", acao: "play_conferir" });
      return json({ ok: false, erro: "segredo_invalido" }, 401);
    }
    log.info({ codigo: "segredo_aceito", acao: "play_conferir", resultado: via });
    let corpo: unknown = null;
    try {
      corpo = await req.json();
    } catch {
      corpo = null;
    }
    const pedido = lerPedido(corpo);
    if (!pedido.ok) return json({ ok: false, erro: pedido.erro }, 400);
    schema = pedido.schema;
    const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: pedido.schema as "public" }, auth: { persistSession: false } });
    const r = await conferir({ db, schema: pedido.schema, log, prazo: orcamento }, { limite: pedido.limite });
    return json({ ok: true, ...r });
  } catch (e) {
    log.excecao(e, { schema, acao: "conferir" });
    return json({ ok: false, erro: "erro_interno" }, 500);
  }
});
