// Physiq play-W6 (16/10/2026) — play-rtdn: o aviso da Google Play (Real-time developer notifications) pelo Pub/Sub, numa assinatura PUSH
// com OIDC. verify_jwt FALSE (quem assina o pedido é o Google, não o Supabase): a porta é o token OIDC no Authorization — a assinatura pelo
// JWKS do Google (jose), o emissor (accounts.google.com), a audiência (PLAY_RTDN_AUDIENCIA, sem ela a URL da função no domínio próprio), o
// e-mail da conta do push (PLAY_RTDN_CONTA, sem ela play-rtdn-push@physiq-br) verificado e o prazo → sem ou inválido: 401 (o JWKS fora: 503).
//   corpo até 16 KB (413) · o aviso em base64 (message.data) · o packageName do app (outro: 204 + log) ·
//   testNotification ("Enviar notificação de teste" do Console) → log play_rtdn_teste + 204 ·
//   subscriptionNotification → o GET no Google (a fonte da verdade, a cada aviso) → o dono: a linha do token (no public, depois no
//     staging), senão a matrícula opaca da compra, a compra anterior (linkedPurchaseToken) ou a que venceu (outOfAppPurchaseContext) →
//     a mesma ordem do registrar (_shared/play-assinaturas.ts › sincronizar: a play_aplicar, reconhecer se faltar, o defer da 1ª compra)
//     → a rede: renovou numa matrícula encerrada pelo vínculo (ou apagada) → cancela (vale até o fim, sem devolver) ·
//     sem dono → log play_sem_dono + 204 (a compra já reconhecida e que renova = a exclusão que falhou → cancela) ·
//   voidedPurchaseNotification → o GET + a cobrança do pedido devolvida (cancelada + reembolsado_em); o acesso cortado = revogada.
// Erro do banco ou do Google sem resposta → 500/503 (o Pub/Sub repete; tudo é idempotente — o aviso repetido não muda nada). Sem o segredo
// PLAY_SERVICE_ACCOUNT → 503 + log play_sem_credencial. Log: só códigos (ref = o id do aviso no Pub/Sub); nunca o token, o pedido, o corpo
// do Google nem o e-mail do push.
// Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions play-rtdn false
// Segredos: PLAY_SERVICE_ACCOUNT; PLAY_RTDN_AUDIENCIA e PLAY_RTDN_CONTA (opcionais). Só no teste local: PLAY_OIDC_JWKS (o JWKS do simulador,
// só http://127.0.0.1:<porta>/…), PLAY_API_BASE e PLAY_OAUTH_URL (_shared/play-api.ts).
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { PlayIndisponivel, cancelar, contaDaPlay } from "../_shared/play-api.ts";
import { acharDono, cancelarPlayDasMatriculas, lerDoGoogle, situacaoDaMatricula, sincronizar } from "../_shared/play-assinaturas.ts";
import {
  AUDIENCIA_PADRAO, CANCELAMENTO_NO_VINCULO_E_NA_EXCLUSAO, CONTA_PUSH_PADRAO, EMISSORES_GOOGLE, JWKS_GOOGLE, LIMITE_CORPO_RTDN, PACOTE,
  RTDN_REVOGADA, conferirClaimsDoPush, idDoAviso, lerAvisoRtdn, urlLocal, type AvisoRtdn, type Schema,
} from "../_shared/play-regras.ts";
import { ORCAMENTO_MS, prazo, type Prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AUDIENCIA = Deno.env.get("PLAY_RTDN_AUDIENCIA") || AUDIENCIA_PADRAO;
const CONTA_PUSH = Deno.env.get("PLAY_RTDN_CONTA") || CONTA_PUSH_PADRAO;
/** O JWKS do Google; SÓ o simulador local troca (PLAY_OIDC_JWKS = http://127.0.0.1:<porta>/…). */
const URL_JWKS = urlLocal(Deno.env.get("PLAY_OIDC_JWKS")) ?? JWKS_GOOGLE;
/** A 1ª busca do JWKS de cada instância (depois fica na memória — o cacheMaxAge do jose). */
const JWKS_TEMPO_MS = 3000;
/** Os códigos do jose em que o JWKS (não o token) falhou: 503 (o Pub/Sub repete), não 401. */
const JWKS_FORA = new Set(["ERR_JWKS_TIMEOUT", "ERR_JWKS_INVALID"]);
const log = criarLog("play-rtdn", { avisar: avisarErro });

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const responder = (status: number, corpo?: Record<string, unknown>) =>
  new Response(corpo ? JSON.stringify(corpo) : null, { status, headers: corpo ? { "Content-Type": "application/json" } : {} });

const dbDe = (schema: Schema): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });

/** O token OIDC do push: a assinatura (JWKS do Google) + as claims (emissor, aud, email, email_verified, exp). */
async function conferirOidc(token: string): Promise<{ ok: true } | { ok: false; motivo: string; fora: boolean }> {
  try {
    jwks ??= createRemoteJWKSet(new URL(URL_JWKS), { timeoutDuration: JWKS_TEMPO_MS });
    const { payload } = await jwtVerify(token, jwks, {
      issuer: [...EMISSORES_GOOGLE],
      audience: AUDIENCIA,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "email"],
    });
    const c = conferirClaimsDoPush(payload as Record<string, unknown>, { audiencia: AUDIENCIA, conta: CONTA_PUSH, agoraSeg: Math.floor(Date.now() / 1000) });
    return c.ok ? { ok: true } : { ok: false, motivo: c.motivo, fora: false };
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (typeof code === "string" && /^ERR_[A-Z_]{1,40}$/.test(code)) return { ok: false, motivo: code.toLowerCase(), fora: JWKS_FORA.has(code) };
    return { ok: false, motivo: "rede", fora: true };
  }
}

/** O corpo (até 16 KB); acima, null (413). JSON inválido = {} (o aviso sai "invalido"). */
async function lerCorpo(req: Request): Promise<unknown | null> {
  if (Number(req.headers.get("content-length") || 0) > LIMITE_CORPO_RTDN) return null;
  const bruto = await req.text();
  if (bruto.length > LIMITE_CORPO_RTDN) return null;
  try {
    return JSON.parse(bruto || "{}");
  } catch {
    return {};
  }
}

/** O aviso de assinatura ou de devolução: o GET, o dono, a ordem do registrar e a rede da matrícula que saiu. */
async function processar(aviso: Extract<AvisoRtdn, { tipo: "assinatura" | "devolucao" }>, ref: string | null, p: Prazo): Promise<Response> {
  const nome = aviso.tipo === "assinatura" ? aviso.nome : "voided";
  const dbs: Record<Schema, SupabaseClient> = { public: dbDe("public"), staging: dbDe("staging") };
  // o GET não depende do schema: lê uma vez (a fonte da verdade, a cada aviso)
  const a = await lerDoGoogle({ db: dbs.public, schema: "public", log, prazo: p }, aviso.token);
  const dono = await acharDono(dbs, aviso.token, a);
  if (!dono) {
    if (a && a.reconhecida && a.renova) {
      // já reconhecida e sem dono = a matrícula saiu (a exclusão que não cancelou): cancela (vale até o fim, sem devolver)
      const r = await cancelar(aviso.token, CANCELAMENTO_NO_VINCULO_E_NA_EXCLUSAO, { prazo: p });
      if (r.status >= 300 && r.status !== 400 && r.status !== 404 && r.status !== 410) throw new PlayIndisponivel(r.status, r.erro);
      log.aviso({ codigo: "play_sem_dono", acao: nome, ref, status: r.status, resultado: "cancelada" });
    } else {
      log.aviso({ codigo: "play_sem_dono", acao: nome, ref, resultado: a ? "sem_matricula" : "sem_compra" });
    }
    return responder(204);
  }
  const c = { db: dbs[dono.schema], schema: dono.schema, log, prazo: p };
  const situacao = await situacaoDaMatricula(c.db, dono.pacienteId);
  const revogada = aviso.tipo === "assinatura" ? aviso.notificacao === RTDN_REVOGADA : a?.estadoGoogle === "SUBSCRIPTION_STATE_EXPIRED";
  const r = await sincronizar(c, aviso.token, {
    pacienteId: dono.pacienteId,
    assinatura: a,
    revogada,
    devolvidoPedido: aviso.tipo === "devolucao" ? aviso.pedido : null,
    reconhecer: true,
  });
  if (!r.ok) {
    // recusa que o aviso repetido não muda (a compra que não existe, a matrícula que não é do app, outra viva): registra e confirma
    log.aviso({ codigo: "play_rtdn_nao_gravou", schema: c.schema, acao: nome, ref, resultado: r.erro });
    return responder(204);
  }
  // a rede: a matrícula saiu do app (o vínculo) ou foi apagada e a assinatura ainda renova → cancela (vale até o fim, sem devolver)
  if (situacao && !situacao.ativa && (situacao.encerrada || situacao.apagada) && r.assinatura.renova) {
    const cc = await cancelarPlayDasMatriculas(c, [dono.pacienteId], situacao.apagada ? "exclusao" : "vinculo");
    log.info({ codigo: "play_rtdn_rede", schema: c.schema, acao: nome, ref, n: cc.canceladas });
  }
  log.info({ codigo: "play_rtdn", schema: c.schema, acao: nome, ref, resultado: r.resposta.estado ?? null });
  return responder(204);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return responder(405, { ok: false, erro: "metodo" });
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ") || auth.length < 20) {
      log.aviso({ codigo: "play_rtdn_sem_oidc", status: 401 });
      return responder(401, { ok: false, erro: "sem_oidc" });
    }
    const oidc = await conferirOidc(auth.slice(7).trim());
    if (!oidc.ok) {
      log.aviso({ codigo: oidc.fora ? "play_rtdn_jwks_fora" : "play_rtdn_oidc_recusado", resultado: oidc.motivo, status: oidc.fora ? 503 : 401 });
      return oidc.fora ? responder(503, { ok: false, erro: "jwks_indisponivel" }) : responder(401, { ok: false, erro: "oidc_invalido" });
    }
    const corpo = await lerCorpo(req);
    if (corpo === null) return responder(413, { ok: false, erro: "corpo_grande" });
    const ref = idDoAviso(corpo);
    const aviso = lerAvisoRtdn(corpo);
    if (aviso.tipo === "invalido") {
      log.aviso({ codigo: "play_rtdn_invalido", ref, resultado: aviso.motivo });
      return responder(204);
    }
    if (aviso.pacote !== PACOTE) {
      log.aviso({ codigo: "play_rtdn_outro_pacote", ref });
      return responder(204);
    }
    if (aviso.tipo === "teste") {
      log.info({ codigo: "play_rtdn_teste", ref });
      return responder(204);
    }
    if (aviso.tipo === "outro") {
      log.info({ codigo: "play_rtdn_ignorado", ref });
      return responder(204);
    }
    if (!contaDaPlay()) {
      log.erro({ codigo: "play_sem_credencial", acao: "rtdn", ref });
      return responder(503, { ok: false, erro: "play_sem_credencial" });
    }
    try {
      return await processar(aviso, ref, prazo(ORCAMENTO_MS.servidor));
    } catch (e) {
      if (!(e instanceof PlayIndisponivel)) throw e;
      log.erro({ codigo: "play_google_falhou", acao: "rtdn", ref, status: e.status, externo: { google_erro: e.codigo } });
      return responder(503, { ok: false, erro: "google_indisponivel" });
    }
  } catch (e) {
    log.excecao(e, { acao: "rtdn" });
    return responder(500, { ok: false, erro: "erro_interno" });
  }
});
