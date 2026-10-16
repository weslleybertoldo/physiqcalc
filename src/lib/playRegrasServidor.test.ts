import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AUDIENCIA_PADRAO, CANCELAMENTO_NO_VINCULO_E_NA_EXCLUSAO, CONTA_PUSH_PADRAO, ESTADOS_QUE_COBREM, ESTADOS_VIVOS, PACOTE, PRODUTOS,
  baseDaApi, cobre, codigoDoErroGoogle, conferirClaimsDoPush, conferirCompra, diasParaAdiar, duracaoDoAdiamento, entradaDoGoogle,
  estadoDoGoogle, googleTransitorio, idDoAviso, lerAssinaturaV2, lerAvisoRtdn, modoDaTroca, tokenValido, urlLocal, valorDoPreco,
} from "../../supabase-principal/functions/_shared/play-regras";
import { GoogleSemToken, claimsDoToken, esquecerToken, tokenDoGoogle } from "../../supabase-principal/functions/_shared/google-oauth";
import { PlayIndisponivel, adiar, cancelar, obter, reconhecer, revogar } from "../../supabase-principal/functions/_shared/play-api";
import { ressincronizarVencidas, sincronizar } from "../../supabase-principal/functions/_shared/play-assinaturas";
import { excluirContaProfissional, type DepsExclusao } from "../../supabase-principal/functions/_shared/exclusao-profissional-regras";
import { STATUS_DA_RECUSA } from "../../supabase-principal/functions/_shared/conta-aluno-regras";

// play-W6 — as regras PURAS da assinatura da Google Play no servidor (_shared/play-regras.ts) + o token do Google com o escopo por
// parâmetro (_shared/google-oauth.ts) + as idas à API (_shared/play-api.ts, com o fetch falso) + o passo da Play na exclusão do
// profissional (a ordem pura). Nada vai à rede.

const MATRICULA = "c1000000-0000-4000-8000-000000000011";
const OUTRA = "c1000000-0000-4000-8000-000000000099";
const TOKEN = "tok-compra-de-teste-0001";

function getV2(p: Partial<Record<string, unknown>> = {}, linha: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "androidpublisher#subscriptionPurchaseV2",
    startTime: "2026-10-16T10:00:00Z",
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    latestOrderId: "GPA.1111-2222-3333-44444",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    externalAccountIdentifiers: { obfuscatedExternalAccountId: MATRICULA },
    etag: "etag-1",
    lineItems: [{
      productId: "app_treino",
      expiryTime: "2026-11-16T10:00:00Z",
      autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: "BRL", units: "29", nanos: 900000000 } },
      offerDetails: { basePlanId: "mensal" },
      latestSuccessfulOrderId: "GPA.1111-2222-3333-44444",
      ...linha,
    }],
    ...p,
  };
}

describe("o estado do Google → o nosso, e se cobre", () => {
  const casos: [string, string, boolean][] = [
    ["SUBSCRIPTION_STATE_PENDING", "pendente", false],
    ["SUBSCRIPTION_STATE_ACTIVE", "ativa", true],
    ["SUBSCRIPTION_STATE_PAUSED", "pausada", false],
    ["SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "carencia", true],
    ["SUBSCRIPTION_STATE_ON_HOLD", "suspensa", false],
    ["SUBSCRIPTION_STATE_CANCELED", "cancelada", true],
    ["SUBSCRIPTION_STATE_EXPIRED", "expirada", false],
    ["SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED", "expirada", false],
  ];
  it.each(casos)("%s → %s (cobre: %s)", (google, nosso, cobreOuNao) => {
    expect(estadoDoGoogle(google)).toBe(nosso);
    expect(cobre(estadoDoGoogle(google))).toBe(cobreOuNao);
  });
  it("revogada só no EXPIRED com o aviso de revogação; desconhecido = null (não grava)", () => {
    expect(estadoDoGoogle("SUBSCRIPTION_STATE_EXPIRED", true)).toBe("revogada");
    expect(estadoDoGoogle("SUBSCRIPTION_STATE_ACTIVE", true)).toBe("ativa");
    expect(estadoDoGoogle("SUBSCRIPTION_STATE_UNSPECIFIED")).toBeNull();
    expect(estadoDoGoogle(undefined)).toBeNull();
    expect(cobre("revogada")).toBe(false);
    expect(cobre("substituida")).toBe(false);
  });
  it("as listas batem com a migration (as que cobrem e as vivas)", () => {
    expect([...ESTADOS_QUE_COBREM].sort()).toEqual(["ativa", "cancelada", "carencia"]);
    expect([...ESTADOS_VIVOS].sort()).toEqual(["ativa", "cancelada", "carencia", "pausada", "pendente", "suspensa"]);
    expect([...PRODUTOS]).toEqual(["app_treino", "app_treino_alimentacao"]);
    expect(PACOTE).toBe("com.bertoldo.physiqcalc");
  });
});

describe("a leitura do GET (purchases.subscriptionsv2)", () => {
  it("lê o produto vigente, o fim, a renovação, o preço, o dono, o reconhecimento, o pedido pago e o etag", () => {
    const a = lerAssinaturaV2(getV2())!;
    expect(a).toMatchObject({
      estadoGoogle: "SUBSCRIPTION_STATE_ACTIVE", produto: "app_treino", produtos: ["app_treino"], expiraEm: "2026-11-16T10:00:00.000Z",
      renova: true, planoBase: "mensal", valor: 29.9, inicio: "2026-10-16T10:00:00.000Z", reconhecida: false, teste: false, conta: MATRICULA,
      tokenAnterior: null, pedidoPago: "GPA.1111-2222-3333-44444", etag: "etag-1",
    });
  });
  it("a compra de TESTE, a reconhecida, a ligação (troca) e a de fora do app que venceu", () => {
    const a = lerAssinaturaV2(getV2({
      testPurchase: {}, acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED", linkedPurchaseToken: "tok-anterior-0001",
      outOfAppPurchaseContext: { expiredPurchaseToken: "tok-vencido-0001", expiredExternalAccountIdentifiers: { obfuscatedExternalAccountId: OUTRA } },
    }))!;
    expect(a.teste).toBe(true);
    expect(a.reconhecida).toBe(true);
    expect(a.tokenAnterior).toBe("tok-anterior-0001");
    expect(a.tokenExpirado).toBe("tok-vencido-0001");
    expect(a.contaExpirada).toBe(OUTRA);
  });
  it("a troca na renovação (DEFERRED): o vigente segue o atual e o de depois entra nos produtos", () => {
    const a = lerAssinaturaV2(getV2({}, { productId: "app_treino_alimentacao", deferredItemReplacement: { productId: "app_treino" } }))!;
    expect(a.produto).toBe("app_treino_alimentacao");
    expect(a.produtos.sort()).toEqual(["app_treino", "app_treino_alimentacao"]);
  });
  it("o DEFERRED da doc (o token novo com 2 linhas: a antiga COM expiryTime + deferredItemReplacement e a nova SEM): nas 2 ordens, o vigente é a antiga", () => {
    const antiga = {
      productId: "app_treino_alimentacao",
      expiryTime: "2026-11-16T10:00:00Z",
      autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: "BRL", units: "49", nanos: 900000000 } },
      offerDetails: { basePlanId: "mensal" },
      latestSuccessfulOrderId: "GPA.1111-2222-3333-44444",
      deferredItemReplacement: { productId: "app_treino" },
    };
    const nova = {
      productId: "app_treino",
      autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: "BRL", units: "29", nanos: 900000000 } },
      offerDetails: { basePlanId: "mensal-novo" },
    };
    for (const linhas of [[antiga, nova], [nova, antiga]]) {
      const a = lerAssinaturaV2(getV2({ lineItems: linhas }))!;
      expect(a.produto).toBe("app_treino_alimentacao");
      expect(a.planoBase).toBe("mensal");
      expect(a.valor).toBe(49.9);
      expect(a.expiraEm).toBe("2026-11-16T10:00:00.000Z");
      expect(a.pedidoPago).toBe("GPA.1111-2222-3333-44444");
      expect(a.produtos.sort()).toEqual(["app_treino", "app_treino_alimentacao"]);
    }
  });
  it("na carência sem pedido novo pago, o pedido do topo NÃO vale (pode ser o recusado)", () => {
    const a = lerAssinaturaV2(getV2({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", latestOrderId: "GPA.1111-2222-3333-44444..1" },
      { latestSuccessfulOrderId: undefined }))!;
    expect(a.pedidoPago).toBeNull();
    const b = lerAssinaturaV2(getV2({ latestOrderId: "GPA.1111-2222-3333-44444..1" }, { latestSuccessfulOrderId: undefined }))!;
    expect(b.pedidoPago).toBe("GPA.1111-2222-3333-44444..1");
  });
  it("o preço só em reais; sem estado ou sem linha = null", () => {
    expect(valorDoPreco({ currencyCode: "BRL", units: "49", nanos: 900000000 })).toBe(49.9);
    expect(valorDoPreco({ currencyCode: "USD", units: "5" })).toBeNull();
    expect(valorDoPreco(null)).toBeNull();
    expect(lerAssinaturaV2({ lineItems: [] })).toBeNull();
    expect(lerAssinaturaV2({ subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", lineItems: [] })).toBeNull();
    expect(lerAssinaturaV2("x")).toBeNull();
  });
});

describe("a conferência da compra: o produto, o dono, o estado", () => {
  it("a compra desta matrícula, do produto pedido, vale", () => {
    expect(conferirCompra(lerAssinaturaV2(getV2()), { matriculaId: MATRICULA, produtoPedido: "app_treino" })).toEqual({ ok: true, semConta: false });
  });
  it("de outra matrícula → compra_de_outra_conta; sem a matrícula opaca → semConta (quem chama confere pela anterior)", () => {
    expect(conferirCompra(lerAssinaturaV2(getV2()), { matriculaId: OUTRA })).toEqual({ ok: false, erro: "compra_de_outra_conta" });
    expect(conferirCompra(lerAssinaturaV2(getV2({ externalAccountIdentifiers: {} })), { matriculaId: OUTRA })).toEqual({ ok: true, semConta: true });
  });
  it("produto que não é do app, produto pedido que não é o da compra, estado desconhecido ou sem GET → compra_invalida", () => {
    const invalida = { ok: false, erro: "compra_invalida" };
    expect(conferirCompra(lerAssinaturaV2(getV2({}, { productId: "outro_app" })), { matriculaId: MATRICULA })).toEqual(invalida);
    expect(conferirCompra(lerAssinaturaV2(getV2()), { matriculaId: MATRICULA, produtoPedido: "app_treino_alimentacao" })).toEqual(invalida);
    expect(conferirCompra(lerAssinaturaV2(getV2({ subscriptionState: "SUBSCRIPTION_STATE_UNSPECIFIED" })), { matriculaId: MATRICULA })).toEqual(invalida);
    expect(conferirCompra(null, { matriculaId: MATRICULA })).toEqual(invalida);
  });
  it("o token do app: opaco, sem espaço, 10 a 4096", () => {
    expect(tokenValido("a".repeat(10))).toBe(true);
    expect(tokenValido("a".repeat(9))).toBe(false);
    expect(tokenValido("a b".repeat(5))).toBe(false);
    expect(tokenValido("a".repeat(4097))).toBe(false);
    expect(tokenValido(123)).toBe(false);
  });
  it("a entrada da play_aplicar: o pedido da compra pago no início; o da renovação ('..N'), agora", () => {
    const e = entradaDoGoogle(MATRICULA, TOKEN, lerAssinaturaV2(getV2())!)!;
    expect(e).toMatchObject({ estado: "ativa", produto: "app_treino", pedido: "GPA.1111-2222-3333-44444", pago_em: "2026-10-16T10:00:00.000Z", valor: 29.9 });
    const r = entradaDoGoogle(MATRICULA, TOKEN, lerAssinaturaV2(getV2({}, { latestSuccessfulOrderId: "GPA.1111-2222-3333-44444..0" }))!, { agora: "x" })!;
    expect(r.pago_em).toBe("x");
    expect(entradaDoGoogle(MATRICULA, TOKEN, lerAssinaturaV2(getV2({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" }))!, { revogada: true })!.estado).toBe("revogada");
  });
});

describe("o defer (≥ 1 dia e ≤ 1 ano) e o modo da troca", () => {
  const inicio = "2026-10-16T10:00:00.000Z";
  it("o que falta da cobertura de antes, arredondado para cima", () => {
    expect(diasParaAdiar("2026-10-21T23:59:59.000Z", inicio)).toBe(6);
    expect(diasParaAdiar("2026-10-17T10:00:00.000Z", inicio)).toBe(1);
  });
  it("menos de 1 dia (ou nada coberto) = não adia; mais de 1 ano = 1 ano", () => {
    expect(diasParaAdiar("2026-10-17T09:59:59.000Z", inicio)).toBeNull();
    expect(diasParaAdiar("2026-10-01T00:00:00.000Z", inicio)).toBeNull();
    expect(diasParaAdiar(null, inicio)).toBeNull();
    expect(diasParaAdiar("2028-10-16T10:00:00.000Z", inicio)).toBe(365);
  });
  it("sem o início, conta de agora; a duração vai em segundos", () => {
    expect(diasParaAdiar("2026-10-19T10:00:00.000Z", null, Date.parse(inicio))).toBe(3);
    expect(duracaoDoAdiamento(6)).toBe("518400s");
  });
  it("decisão 6: para o completo na hora; para o Treino na renovação; igual ou fora do app = null", () => {
    expect(modoDaTroca("app_treino", "app_treino_alimentacao")).toBe("na_hora");
    expect(modoDaTroca("app_treino_alimentacao", "app_treino")).toBe("na_renovacao");
    expect(modoDaTroca("app_treino", "app_treino")).toBeNull();
    expect(modoDaTroca("x", "app_treino")).toBeNull();
  });
  it("decisão 7: o vínculo e a exclusão cancelam sem devolver (vale até o fim)", () => {
    expect(CANCELAMENTO_NO_VINCULO_E_NA_EXCLUSAO).toBe("DEVELOPER_REQUESTED_STOP_PAYMENTS");
  });
});

describe("o aviso do Pub/Sub (RTDN)", () => {
  const envelope = (n: unknown, id = "123456789") => ({
    message: { data: Buffer.from(JSON.stringify(n)).toString("base64"), messageId: id, publishTime: "2026-10-16T10:00:00Z" },
    subscription: "projects/physiq-br/subscriptions/play-rtdn-push",
  });
  it("o de assinatura: o tipo, o nome e o token", () => {
    const a = lerAvisoRtdn(envelope({ version: "1.0", packageName: PACOTE, eventTimeMillis: "1", subscriptionNotification: { version: "1.0", notificationType: 2, purchaseToken: TOKEN } }));
    expect(a).toEqual({ tipo: "assinatura", pacote: PACOTE, notificacao: 2, nome: "renewed", token: TOKEN });
    expect(lerAvisoRtdn(envelope({ packageName: PACOTE, subscriptionNotification: { notificationType: 12, purchaseToken: TOKEN } }))).toMatchObject({ nome: "revoked" });
  });
  it("o de teste do Console e o de devolução (o pedido e o tipo)", () => {
    expect(lerAvisoRtdn(envelope({ packageName: PACOTE, testNotification: { version: "1.0" } }))).toEqual({ tipo: "teste", pacote: PACOTE });
    expect(lerAvisoRtdn(envelope({ packageName: PACOTE, voidedPurchaseNotification: { purchaseToken: TOKEN, orderId: "GPA.1", productType: 1, refundType: 1 } })))
      .toEqual({ tipo: "devolucao", pacote: PACOTE, token: TOKEN, pedido: "GPA.1", reembolso: 1, produtoTipo: 1 });
  });
  it("o envelope, o base64 e o JSON quebrados → invalido (com o motivo); o pacote vem para quem chama conferir", () => {
    expect(lerAvisoRtdn({})).toEqual({ tipo: "invalido", motivo: "envelope" });
    expect(lerAvisoRtdn({ message: { data: "%%%" } })).toEqual({ tipo: "invalido", motivo: "base64" });
    expect(lerAvisoRtdn({ message: { data: Buffer.from("não é json").toString("base64") } })).toEqual({ tipo: "invalido", motivo: "json" });
    expect(lerAvisoRtdn(envelope({ subscriptionNotification: { notificationType: 2, purchaseToken: TOKEN } }))).toEqual({ tipo: "invalido", motivo: "pacote" });
    expect(lerAvisoRtdn(envelope({ packageName: PACOTE, subscriptionNotification: { notificationType: 2 } }))).toEqual({ tipo: "invalido", motivo: "token" });
    expect(lerAvisoRtdn(envelope({ packageName: "outro.app", oneTimeProductNotification: {} }))).toEqual({ tipo: "outro", pacote: "outro.app" });
  });
  it("o id do aviso (o ref do log) só no formato", () => {
    expect(idDoAviso(envelope({}, "98765"))).toBe("98765");
    expect(idDoAviso({ message: { messageId: "a b" } })).toBeNull();
  });
});

describe("o token OIDC do push: emissor, aud, email, email_verified, exp", () => {
  const agoraSeg = 1_800_000_000;
  const base = { iss: "https://accounts.google.com", aud: AUDIENCIA_PADRAO, email: CONTA_PUSH_PADRAO, email_verified: true, exp: agoraSeg + 600 };
  const conferir = (p: Record<string, unknown>) => conferirClaimsDoPush(p, { audiencia: AUDIENCIA_PADRAO, conta: CONTA_PUSH_PADRAO, agoraSeg });
  it("o do Google, para a nossa audiência, da conta do push, verificado e no prazo, vale", () => {
    expect(conferir(base)).toEqual({ ok: true });
    expect(conferir({ ...base, iss: "accounts.google.com", aud: [AUDIENCIA_PADRAO, "x"], email: CONTA_PUSH_PADRAO.toUpperCase() })).toEqual({ ok: true });
  });
  it.each([
    [{ iss: "https://evil.example" }, "emissor"],
    [{ aud: "https://outra.url/fn" }, "aud"],
    [{ email: "outra@physiq-br.iam.gserviceaccount.com" }, "email"],
    [{ email_verified: false }, "email_verified"],
    [{ exp: agoraSeg - 1 }, "exp"],
  ] as [Record<string, unknown>, string][])("%o → %s", (troca, motivo) => {
    expect(conferir({ ...base, ...troca })).toEqual({ ok: false, motivo });
  });
});

describe("as bases do teste local: só http://127.0.0.1:<porta>", () => {
  it("a API e as URLs do simulador; o resto vale a do Google", () => {
    expect(baseDaApi("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
    for (const v of ["https://androidpublisher.evil.com", "http://localhost:54321", "http://127.0.0.1:54321/x", "", undefined, null]) {
      expect(baseDaApi(v as string)).toBe("https://androidpublisher.googleapis.com");
    }
    expect(urlLocal("http://127.0.0.1:54321/jwks")).toBe("http://127.0.0.1:54321/jwks");
    expect(urlLocal("https://127.0.0.1:54321/jwks")).toBeNull();
    expect(urlLocal("http://10.0.0.1:54321/jwks")).toBeNull();
  });
  it("o código curto do erro do Google (o status ou o reason; o do OAuth)", () => {
    expect(codigoDoErroGoogle({ error: { code: 404, status: "NOT_FOUND", errors: [{ reason: "purchaseTokenNotFound" }] } })).toBe("purchaseTokenNotFound");
    expect(codigoDoErroGoogle({ error: { code: 403, status: "PERMISSION_DENIED" } })).toBe("PERMISSION_DENIED");
    expect(codigoDoErroGoogle({ error: "invalid_grant", error_description: "x" })).toBe("invalid_grant");
    expect(codigoDoErroGoogle({ error: { message: "texto livre com espaço" } })).toBeNull();
    expect(googleTransitorio(503)).toBe(true);
    expect(googleTransitorio(403)).toBe(true);
    expect(googleTransitorio(404)).toBe(false);
  });
});

// ─────────────────────────────── o token do Google e as idas à API (o fetch falso) ───────────────────────────────

let PEM = "";
let CHAVE_PUBLICA: CryptoKey;
beforeAll(async () => {
  const par = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", par.privateKey));
  PEM = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString("base64")}\n-----END PRIVATE KEY-----\n`;
  CHAVE_PUBLICA = par.publicKey;
});
const conta = () => ({ project_id: "physiq-br", client_email: `teste-${Math.random().toString(36).slice(2)}@physiq-br.iam.gserviceaccount.com`, private_key: PEM, token_uri: "https://oauth2.googleapis.com/token" });
const resposta = (status: number, corpo: unknown) => new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

describe("google-oauth: o token com o escopo por parâmetro", () => {
  it("assina o JWT (RS256) com o escopo pedido e o aud do token_uri; guarda até perto de vencer", async () => {
    const c = conta();
    let assercao = "";
    const buscar = vi.fn(async (_url: unknown, init?: RequestInit) => {
      assercao = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
      return resposta(200, { access_token: "acesso-1", expires_in: 3600 });
    });
    expect(await tokenDoGoogle(c, "https://www.googleapis.com/auth/androidpublisher", { buscar: buscar as unknown as typeof fetch, url: "http://127.0.0.1:5999/token" })).toBe("acesso-1");
    expect(buscar.mock.calls[0][0]).toBe("http://127.0.0.1:5999/token");
    const [cab, claims, ass] = assercao.split(".");
    expect(JSON.parse(b64url(cab).toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const cl = JSON.parse(b64url(claims).toString());
    expect(cl).toMatchObject({ iss: c.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token" });
    expect(cl.exp - cl.iat).toBe(3600);
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", CHAVE_PUBLICA, b64url(ass), new TextEncoder().encode(`${cab}.${claims}`))).toBe(true);
    // o guardado vale: nenhuma ida nova; esquecido, pede de novo
    expect(await tokenDoGoogle(c, "https://www.googleapis.com/auth/androidpublisher", { buscar: buscar as unknown as typeof fetch })).toBe("acesso-1");
    expect(buscar).toHaveBeenCalledTimes(1);
    esquecerToken(c, "https://www.googleapis.com/auth/androidpublisher");
    await tokenDoGoogle(c, "https://www.googleapis.com/auth/androidpublisher", { buscar: buscar as unknown as typeof fetch });
    expect(buscar).toHaveBeenCalledTimes(2);
  });
  it("o escopo é parte da chave do guardado (o da Play não serve ao do FCM)", () => {
    expect(claimsDoToken({ client_email: "a@b", token_uri: "https://t" }, "escopo-x", 10)).toEqual({ iss: "a@b", scope: "escopo-x", aud: "https://t", iat: 10, exp: 3610 });
  });
  it("o OAuth que recusa ou a rede → GoogleSemToken com o status e o código curto (nunca o corpo)", async () => {
    const recusa = vi.fn(async () => resposta(400, { error: "invalid_grant", error_description: "Invalid JWT Signature com detalhe" }));
    await expect(tokenDoGoogle(conta(), "e", { buscar: recusa as unknown as typeof fetch })).rejects.toMatchObject({ name: "GoogleSemToken", status: 400, codigo: "invalid_grant" });
    const rede = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(tokenDoGoogle(conta(), "e", { buscar: rede as unknown as typeof fetch })).rejects.toBeInstanceOf(GoogleSemToken);
  });
});

describe("play-api: as idas ao Google", () => {
  afterEach(() => vi.unstubAllGlobals());
  function falso(respostas: Array<[number, unknown]>) {
    const fila = [...respostas];
    const chamadas: Array<{ url: string; metodo: string; corpo: unknown }> = [];
    const buscar = vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/token")) return resposta(200, { access_token: "acesso", expires_in: 3600 });
      chamadas.push({ url: u, metodo: String(init?.method ?? "GET"), corpo: init?.body ? JSON.parse(String(init.body)) : null });
      const [st, corpo] = fila.length > 1 ? fila.shift()! : fila[0];
      return resposta(st, corpo);
    });
    return { buscar: buscar as unknown as typeof fetch, chamadas };
  }
  it("o GET, o acknowledge (v1, pelo produto), o cancel, o defer (etag + duração) e o revoke (v2) — com o pacote do app", async () => {
    const f = falso([[200, getV2()]]);
    const o = { conta: conta(), buscar: f.buscar };
    expect((await obter(TOKEN, o)).status).toBe(200);
    await reconhecer("app_treino", TOKEN, o);
    await cancelar(TOKEN, "DEVELOPER_REQUESTED_STOP_PAYMENTS", o);
    await adiar(TOKEN, "etag-1", "518400s", o);
    await revogar(TOKEN, "proporcional", o);
    const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACOTE}/purchases`;
    expect(f.chamadas).toEqual([
      { url: `${base}/subscriptionsv2/tokens/${TOKEN}`, metodo: "GET", corpo: null },
      { url: `${base}/subscriptions/app_treino/tokens/${TOKEN}:acknowledge`, metodo: "POST", corpo: {} },
      { url: `${base}/subscriptionsv2/tokens/${TOKEN}:cancel`, metodo: "POST", corpo: { cancellationContext: { cancellationType: "DEVELOPER_REQUESTED_STOP_PAYMENTS" } } },
      { url: `${base}/subscriptionsv2/tokens/${TOKEN}:defer`, metodo: "POST", corpo: { deferralContext: { etag: "etag-1", deferDuration: "518400s" } } },
      { url: `${base}/subscriptionsv2/tokens/${TOKEN}:revoke`, metodo: "POST", corpo: { revocationContext: { proratedRefund: {} } } },
    ]);
  });
  it("o simulador local troca a base (só 127.0.0.1); a produção não", async () => {
    vi.stubGlobal("Deno", { env: { get: (n: string) => (n === "PLAY_API_BASE" ? "http://127.0.0.1:54399" : undefined) } });
    const f = falso([[200, getV2()]]);
    await obter(TOKEN, { conta: conta(), buscar: f.buscar });
    expect(f.chamadas[0].url.startsWith("http://127.0.0.1:54399/androidpublisher/v3/")).toBe(true);
    vi.stubGlobal("Deno", { env: { get: (n: string) => (n === "PLAY_API_BASE" ? "https://evil.example" : undefined) } });
    const g = falso([[200, getV2()]]);
    await obter(TOKEN, { conta: conta(), buscar: g.buscar });
    expect(g.chamadas[0].url.startsWith("https://androidpublisher.googleapis.com/")).toBe(true);
  });
  it("o erro do Google: o status + o código curto, sem o corpo; o 401 pede outro token e tenta 1 vez", async () => {
    const f = falso([[404, { error: { code: 404, status: "NOT_FOUND", errors: [{ reason: "purchaseTokenNotFound", message: "x" }] } }]]);
    expect(await obter(TOKEN, { conta: conta(), buscar: f.buscar })).toEqual({ status: 404, corpo: null, erro: "purchaseTokenNotFound" });
    const g = falso([[401, {}], [200, getV2()]]);
    expect((await obter(TOKEN, { conta: conta(), buscar: g.buscar })).status).toBe(200);
    expect(g.chamadas).toHaveLength(2);
  });
  it("sem a conta de serviço, a rede ou o OAuth fora → PlayIndisponivel (quem chama decide: 502/503, tenta de novo)", async () => {
    await expect(obter(TOKEN, { conta: null })).rejects.toBeInstanceOf(PlayIndisponivel);
    const rede = vi.fn(async (url: unknown) => {
      if (String(url).endsWith("/token")) return resposta(200, { access_token: "a", expires_in: 3600 });
      throw new TypeError("fetch failed");
    });
    await expect(obter(TOKEN, { conta: conta(), buscar: rede as unknown as typeof fetch })).rejects.toMatchObject({ name: "PlayIndisponivel", status: 599 });
    const oauth = vi.fn(async () => resposta(500, {}));
    await expect(obter(TOKEN, { conta: conta(), buscar: oauth as unknown as typeof fetch })).rejects.toMatchObject({ name: "PlayIndisponivel", status: 500 });
  });
});

describe("a exclusão: a da Play cancela antes de apagar (o profissional que também é aluno; o aluno)", () => {
  function deps(play: { canceladas: number; falhas: number } | "lanca"): { d: DepsExclusao; apagou: () => boolean } {
    let apagou = false;
    const d: DepsExclusao = {
      conferir: async () => ({ ok: true, perfil: "profissional", cobrancas: {} }),
      excluir: async () => {
        apagou = true;
        return { ok: true, contas_dono: [], arquivos: [] };
      },
      treino: async () => ({ passo: "sem_vinculo", corpo: {} }),
      cancelarPlano: async () => true,
      cancelarDosAlunos: async () => ({ canceladas: 0, falhas: 0 }),
      cancelarSolta: async () => true,
      cancelarPlay: async () => {
        if (play === "lanca") throw new Error("banco");
        return play;
      },
      dispararEspelho: async () => {},
      apagarArquivos: async () => 0,
      apagarLogin: async () => {},
    };
    return { d, apagou: () => apagou };
  }
  it("a Play que não cancelou → o 502 cobranca_nao_cancelada de sempre e nada apagado", async () => {
    const { d, apagou } = deps({ canceladas: 0, falhas: 1 });
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, d);
    expect(r.status).toBe(502);
    expect((r.corpo as Record<string, unknown>).erro).toBe("cobranca_nao_cancelada");
    expect(apagou()).toBe(false);
  });
  it("cancelou (ou sem Play) → segue e conta no resumo", async () => {
    const { d, apagou } = deps({ canceladas: 1, falhas: 0 });
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, d);
    expect(r.status).toBe(200);
    expect(apagou()).toBe(true);
    expect(((r.corpo as Record<string, unknown>).resultado as Record<string, unknown>).cobrancas_canceladas).toBe(1);
  });
  it("o aluno: a recusa play_nao_cancelada é 502 (nada foi apagado)", () => {
    expect(STATUS_DA_RECUSA.play_nao_cancelada).toBe(502);
  });
  it("a conferência das correções (DECISÃO 07:08): o erro que LANÇA depois de cancelar a Play → o 500 também conta que ela já foi cancelada", async () => {
    const { d, apagou } = deps({ canceladas: 1, falhas: 0 });
    d.excluir = async () => {
      throw new Error("o banco caiu");
    };
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, d);
    expect(r.status).toBe(500);
    expect(r.corpo as Record<string, unknown>).toMatchObject({ erro: "erro_interno", play_cancelada: true });
    expect(apagou()).toBe(false);
  });
  it("o aluno (excluir-minha-conta): o catch do 500 leva o play_cancelada quando a Play já foi cancelada no 1b", () => {
    const fonte = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase-principal/functions/excluir-minha-conta/index.ts"), "utf8");
    const pega = fonte.slice(fonte.lastIndexOf("} catch (e) {"));
    expect(pega).toMatch(/json\(\{ ok: false, erro: "erro_interno", \.\.\.\(playCancelada \? \{ play_cancelada: true \} : \{\}\) \}, 500, origin\)/);
    expect(fonte).toMatch(/playCancelada = play\.canceladas > 0;/);
  });
  it("a revisão ⚪14: a Play cancelada e o Treino que para depois → o 502 CONTA que a assinatura já foi cancelada (sem Play, não diz)", async () => {
    const { d, apagou } = deps({ canceladas: 1, falhas: 0 });
    d.treino = async (acao) => (acao === "excluir_profissional" ? { passo: "indisponivel", corpo: {} } : { passo: "sem_vinculo", corpo: {} });
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, d);
    expect(r.status).toBe(502);
    expect(r.corpo as Record<string, unknown>).toMatchObject({ erro: "treino_indisponivel", play_cancelada: true });
    expect(apagou()).toBe(false);
    const sem = deps({ canceladas: 0, falhas: 0 });
    sem.d.treino = d.treino;
    const r2 = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, sem.d);
    expect((r2.corpo as Record<string, unknown>).play_cancelada).toBeUndefined();
  });
});

describe("o defer na sincronia: a resposta 5xx é INCERTA (a conferência das correções, DECISÃO 07:08)", () => {
  afterEach(() => vi.unstubAllGlobals());
  // o banco de mentira: a play_aplicar devolve a 1ª compra ativa, coberta (adiar_ate) e ainda sem a marca; o update guarda o que gravou
  function bancoFalso() {
    const gravados: Array<Record<string, unknown>> = [];
    const db = {
      rpc: vi.fn(async () => ({ data: { ok: true, nova: true, estado: "ativa", matricula_ativa: true, expira_em: "2026-11-16T10:00:00Z",
        adiar_ate: "2026-10-20T10:00:00Z", adiada_em: null, reconhecida_em: "2026-10-16T10:00:01Z" }, error: null })),
      from: () => ({
        update: (valores: Record<string, unknown>) => {
          gravados.push(valores);
          const cadeia: Record<string, unknown> = {};
          cadeia.eq = () => cadeia;
          cadeia.is = () => cadeia;
          cadeia.select = async () => ({ data: [{ adiada_em: "2026-10-16T10:00:02Z" }], error: null });
          cadeia.then = (ok: (v: unknown) => unknown) => ok({ error: null });
          return cadeia;
        },
      }),
    };
    return { db, gravados };
  }
  function googleFalso(statusDoDefer: number) {
    const buscar = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith("/token")) return resposta(200, { access_token: "acesso", expires_in: 3600 });
      if (u.endsWith(":acknowledge")) return resposta(204, null);
      if (u.endsWith(":defer")) return resposta(statusDoDefer, statusDoDefer < 300 ? { itemExpiryTimeDetails: [{ productId: "app_treino", expiryTime: "2026-11-20T10:00:00Z" }] }
        : { error: { code: statusDoDefer, status: "X", errors: [{ reason: "backendError", message: "x" }] } });
      return resposta(200, getV2());
    });
    return buscar as unknown as typeof fetch;
  }
  const log = () => ({ info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() });

  it.each([500, 503])("o Google responde %i ao defer: a reserva FICA (nada de desfazer) e o log play_adiar_incerto (adiar de novo daria os dias 2 vezes)", async (st) => {
    vi.stubGlobal("Deno", { env: { get: (n: string) => (n === "PLAY_SERVICE_ACCOUNT" ? JSON.stringify(conta()) : undefined) } });
    const { db, gravados } = bancoFalso();
    const l = log();
    const r = await sincronizar({ db: db as never, schema: "staging", log: l as never, buscar: googleFalso(st) }, TOKEN,
      { pacienteId: MATRICULA, assinatura: lerAssinaturaV2(getV2()), reconhecer: true });
    expect(r.ok).toBe(true);
    expect(gravados.filter((g) => "adiada_em" in g && g.adiada_em === null)).toEqual([]);
    expect(gravados.filter((g) => typeof g.adiada_em === "string")).toHaveLength(1);
    expect(l.erro.mock.calls.map((c) => (c[0] as { codigo: string }).codigo)).toContain("play_adiar_incerto");
    expect(r.ok && r.resposta.adiada_em).toBeTruthy();
  });

  it("o Google RECUSA o defer (400, resposta que decide): a reserva sai e a próxima sincronia tenta de novo", async () => {
    vi.stubGlobal("Deno", { env: { get: (n: string) => (n === "PLAY_SERVICE_ACCOUNT" ? JSON.stringify(conta()) : undefined) } });
    const { db, gravados } = bancoFalso();
    const l = log();
    const r = await sincronizar({ db: db as never, schema: "staging", log: l as never, buscar: googleFalso(400) }, TOKEN,
      { pacienteId: MATRICULA, assinatura: lerAssinaturaV2(getV2()), reconhecer: true });
    expect(r.ok).toBe(true);
    expect(gravados.filter((g) => "adiada_em" in g && g.adiada_em === null)).toHaveLength(1);
    expect(l.erro.mock.calls.map((c) => (c[0] as { codigo: string }).codigo)).toContain("play_adiar_falhou");
  });
});

describe("a ressincronia do estado conta só a viva que MUDOU (a conferência das correções, DECISÃO 07:08)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const PASSADO = "2026-10-10T10:00:00.000Z";
  // o banco de mentira: 1 linha viva com o fim já passado; a play_aplicar devolve o que o Google disse (o `depois`)
  function bancoFalso(estadoAntes: string, depois: { estado: string; expira_em: string }) {
    const linha = { token: TOKEN, paciente_id: MATRICULA, estado: estadoAntes, renova: true, expira_em: PASSADO, produto: "app_treino", teste: false };
    const cadeia: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "lt", "order"]) cadeia[m] = () => cadeia;
    cadeia.limit = async () => ({ data: [linha], error: null });
    return {
      rpc: vi.fn(async () => ({ data: { ok: true, nova: false, matricula_ativa: true, reconhecida_em: "x", adiar_ate: null, adiada_em: null, ...depois }, error: null })),
      from: () => cadeia,
    };
  }
  const google = (estado: string, expiryTime: string) => vi.fn(async (url: unknown) => {
    if (String(url).endsWith("/token")) return resposta(200, { access_token: "acesso", expires_in: 3600 });
    return resposta(200, getV2({ subscriptionState: estado, acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" }, { expiryTime }));
  }) as unknown as typeof fetch;
  const log = () => ({ info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() });

  it("a SUSPENSA (o fim sempre no passado) que o Google devolve igual NÃO conta — o app não invalida o resumo a cada estado", async () => {
    vi.stubGlobal("Deno", { env: { get: (n: string) => (n === "PLAY_SERVICE_ACCOUNT" ? JSON.stringify(conta()) : undefined) } });
    const db = bancoFalso("suspensa", { estado: "suspensa", expira_em: PASSADO });
    const n = await ressincronizarVencidas({ db: db as never, schema: "staging", log: log() as never, buscar: google("SUBSCRIPTION_STATE_ON_HOLD", PASSADO) }, MATRICULA);
    expect(n).toBe(0);
  });
  it("a ativa vencida que o Google devolve RENOVADA (o fim andou) conta", async () => {
    vi.stubGlobal("Deno", { env: { get: (n: string) => (n === "PLAY_SERVICE_ACCOUNT" ? JSON.stringify(conta()) : undefined) } });
    const db = bancoFalso("ativa", { estado: "ativa", expira_em: "2026-11-16T10:00:00.000Z" });
    const n = await ressincronizarVencidas({ db: db as never, schema: "staging", log: log() as never, buscar: google("SUBSCRIPTION_STATE_ACTIVE", "2026-11-16T10:00:00Z") }, MATRICULA);
    expect(n).toBe(1);
  });
});
