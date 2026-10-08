// Physiq W20c — push-enviar (banco principal): manda pelo FCM HTTP v1 o aviso do sino que acabou de nascer, para os aparelhos
// de quem recebe (push_aparelhos). Vale para TUDO que vai para o sino (consulta marcada/remarcada/desmarcada da W20 — inclusive
// a do site antigo —, "Salvar e enviar" da W16/W17, pagamento, avaliação…), porque quem chama é o GATILHO do insert em avisos
// ({schema}.avisos_push, pelo pg_net, assíncrono: o pedido sai depois do commit e nunca atrasa nem quebra quem gravou o aviso).
//
// Idempotente: o aviso é reservado em push_envios (1 linha por aviso) antes de enviar — chamar 2 vezes não manda 2 pushes.
// Token recusado pelo FCM (UNREGISTERED · INVALID_ARGUMENT do token · SENDER_ID_MISMATCH) → o aparelho sai da lista. A resposta
// do FCM de cada aparelho vai para o log da função (só o fim do token) e para push_envios.resultado.
//
// POST, headers: x-push-segredo: <PUSH_SEGREDO> · x-schema: public|staging.
//   { aviso: <id> }      → envia (resposta { ok, aparelhos, enviados, recusados, falhas } ou { ok, repetido | motivo })
//   { verificar: true }  → só prova a conta de serviço: validate_only com um token de verificação (400 "token inválido" =
//                          autenticou; nada é entregue a ninguém)
// verify_jwt = false (quem chama é o banco, com o segredo). Publicar SÓ assim (o deploy-function.yml liga o verify_jwt):
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions push-enviar false
// Segredos: FCM_SERVICE_ACCOUNT (JSON da chave da conta fcm-envio@physiq-br), PUSH_SEGREDO (o mesmo do Vault
// 'physiq_push_segredo', que o gatilho manda no cabeçalho) — gravados pela Management API (e2e/w20c/segredos_push.py).
// hml-10 (H-24, H-26): log em JSON pelo _shared/log.ts (do aparelho, só o fim do token; do FCM, o status e o código); o catch
// final avisa (log.excecao) e devolve o mesmo 500.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import {
  avisoVelho,
  base64url,
  claimsDoGoogle,
  contaAutenticou,
  fimDoToken,
  lerContaDeServico,
  lerRespostaFcm,
  limiteDoTokenVencido,
  MAX_APARELHOS,
  montarMensagem,
  pemParaDer,
  resumirEnvio,
  segredoConfere,
  TOKEN_DE_VERIFICACAO,
  type MensagemFcm,
  type ResultadoFcm,
  type Schema,
} from "../_shared/push-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUSH_SEGREDO = Deno.env.get("PUSH_SEGREDO") ?? "";
const CONTA = lerContaDeServico(Deno.env.get("FCM_SERVICE_ACCOUNT"));
const SCHEMAS: Schema[] = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const log = criarLog("push-enviar", { avisar: avisarErro });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// token de acesso do Google (1 hora), guardado enquanto a instância da função vive
let acesso: { token: string; expira: number } | null = null;

async function tokenDoGoogle(): Promise<string> {
  if (acesso && acesso.expira > Date.now() + 60_000) return acesso.token;
  if (!CONTA) throw new Error("sem_conta_de_servico");
  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify(claimsDoGoogle(CONTA, Math.floor(Date.now() / 1000))));
  const chave = await crypto.subtle.importKey("pkcs8", pemParaDer(CONTA.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(`${cabecalho}.${claims}`)));
  const r = await fetch(CONTA.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cabecalho}.${claims}.${base64url(assinatura)}` }),
  });
  const corpo = await r.json().catch(() => ({})) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
  if (!r.ok || typeof corpo.access_token !== "string") throw new Error(`oauth_${r.status}_${String(corpo.error ?? "")}`.slice(0, 80));
  acesso = { token: corpo.access_token, expira: Date.now() + (Number(corpo.expires_in) || 3600) * 1000 };
  return acesso.token;
}

async function enviarFcm(mensagem: MensagemFcm, schema: Schema): Promise<ResultadoFcm> {
  let token: string;
  try {
    token = await tokenDoGoogle();
  } catch (e) {
    log.excecao(e, { codigo: "fcm_oauth_falhou", schema });
    return { desfecho: "falha", status: 0, codigo: "OAUTH" };
  }
  try {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${CONTA!.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(mensagem),
    });
    if (r.status === 401) acesso = null; // token do Google vencido/recusado: o próximo pede outro
    return lerRespostaFcm(r.status, await r.json().catch(() => ({})));
  } catch (e) {
    log.excecao(e, { codigo: "fcm_rede", schema });
    return { desfecho: "falha", status: 0, codigo: "REDE" };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
  if (!segredoConfere(req.headers.get("x-push-segredo"), PUSH_SEGREDO)) return json({ ok: false, erro: "sem_acesso" }, 401);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase() as Schema;
  if (!SCHEMAS.includes(schema)) return json({ ok: false, erro: "schema_invalido" }, 400);
  if (!CONTA) return json({ ok: false, erro: "nao_configurada" }, 500);

  let corpo: Record<string, unknown> = {};
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }

  if (corpo.verificar === true) {
    const r = await enviarFcm(montarMensagem({ id: "verificacao", tipo: "geral", titulo: "Verificação", link: "/" }, TOKEN_DE_VERIFICACAO, { validar: true }), schema);
    log.info({ codigo: "push_verificar", schema, status: r.status, externo: { fcm_codigo: r.codigo } });
    return json({ ok: true, autenticado: contaAutenticou(r), projeto: CONTA.project_id, fcm: { status: r.status, codigo: r.codigo, mensagem: r.mensagem ?? null } });
  }

  const avisoId = String(corpo.aviso ?? "");
  if (!UUID.test(avisoId)) return json({ ok: false, erro: "aviso_inexistente" }, 404);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema }, auth: { persistSession: false } });

  try {
    const { data: aviso, error: ea } = await db.from("avisos").select("id,destino_user_id,tipo,titulo,link,criado_em").eq("id", avisoId).maybeSingle();
    if (ea) throw ea;
    if (!aviso) return json({ ok: false, erro: "aviso_inexistente" }, 404);
    if (avisoVelho(aviso.criado_em)) return json({ ok: true, enviado: false, motivo: "antigo" });

    // reserva: 1 push por aviso (a 2ª chamada para o mesmo aviso só responde "repetido")
    const { error: er } = await db.from("push_envios").insert({ aviso_id: aviso.id, user_id: aviso.destino_user_id });
    if (er) {
      if (er.code === "23505") return json({ ok: true, repetido: true });
      throw er;
    }

    // aparelho que não abre o app há 270 dias: token vencido no FCM — sai antes
    await db.from("push_aparelhos").delete().eq("user_id", aviso.destino_user_id).lt("atualizado_em", limiteDoTokenVencido());
    const { data: aparelhos, error: el } = await db.from("push_aparelhos").select("id,token,plataforma")
      .eq("user_id", aviso.destino_user_id).order("atualizado_em", { ascending: false }).limit(MAX_APARELHOS);
    if (el) throw el;

    const resultados: ResultadoFcm[] = [];
    const registro: Array<Record<string, unknown>> = [];
    for (const a of aparelhos ?? []) {
      const r = await enviarFcm(montarMensagem(aviso, a.token), schema);
      resultados.push(r);
      registro.push({ aparelho: fimDoToken(a.token), status: r.status, desfecho: r.desfecho, codigo: r.codigo, ...(r.mensagem ? { mensagem: r.mensagem } : {}) });
      log.info({
        codigo: "push_enviado", schema, ref: aviso.id, acao: aviso.tipo, aparelho: fimDoToken(a.token), status: r.status,
        externo: { fcm_codigo: r.codigo }, resultado: r.desfecho,
      });
      if (r.desfecho === "token_invalido") {
        const { error: ed } = await db.from("push_aparelhos").delete().eq("id", a.id);
        if (ed) log.excecao(ed, { codigo: "apagar_aparelho_falhou", schema, ref: aviso.id });
      }
    }
    const resumo = resumirEnvio(resultados);
    const { error: eu } = await db.from("push_envios").update({ ...resumo, resultado: registro, concluido_em: new Date().toISOString() }).eq("aviso_id", aviso.id);
    if (eu) log.excecao(eu, { codigo: "registrar_envio_falhou", schema, ref: aviso.id });
    return json({ ok: true, ...resumo });
  } catch (err) {
    log.excecao(err, { schema });
    return json({ ok: false, erro: "erro_interno" }, 500);
  }
});
