// @vitest-environment node
// src/financeiro/mpConta.test.ts
// Physiq W2 — as regras PURAS do Mercado Pago da conta do personal (supabase-principal/functions/_shared/mp-conta-regras.ts): a ida do OAuth
// (state, PKCE S256, URL de autorização e o filtro da tela), a resposta do /oauth/token, a renovação, a volta para o site, o aviso por conta, a
// x-signature, qual credencial vale e a situação que o dono vê. Valores de teste feitos aqui; nenhum segredo de verdade, nada vai à rede.
import { describe, expect, it } from "vitest";
import {
  REDIRECT_TESTE_MP, TEXTO_DO_RETORNO, assinaturaMp, desafioPkce, destinoDoRetorno, ehEstado, ehUrlDeAutorizacaoMp, lerAvisoDaConta,
  lerAvisoDoMp, lerTokenDoMp, manifestoDaAssinatura, modoDaConexaoConfere, motivoDoOauth, novoSegredoUrl, precisaRenovar, proximaTentativa, qualCredencial,
  redirectDoSchema, situacaoDoMp, urlDeAutorizacao, erroPixSemChave,
} from "../../supabase-principal/functions/_shared/mp-conta-regras";
import { codigoDoOauth, ehResultadoDoRetorno, ehUuidMp, notificacaoDaConta, sha256Hex } from "../../supabase-principal/functions/_shared/mp-conta-regras";
import * as tela from "./mpConta";

const AGORA = Date.parse("2026-10-12T12:00:00Z");

describe("OAuth — a ida", () => {
  it("o state tem 43 caracteres base64url e não repete", () => {
    const a = novoSegredoUrl(), b = novoSegredoUrl();
    expect(ehEstado(a) && ehEstado(b) && a !== b).toBe(true);
    expect(ehEstado("curto")).toBe(false);
  });
  it("PKCE S256 = base64url(sha256) do verifier (vetor da RFC 7636, Apêndice B)", async () => {
    // MENOR 0 da revisão: o verifier certo da RFC (os octetos do Apêndice B) — o que estava aqui antes dava 3nniMPBp…, e o subagente do TDD
    // "corrigiria" um desafioPkce que está certo. Conferido com node e openssl em 11/10.
    expect(await desafioPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("a URL de autorização leva client, code, platform mp, state, o redirect certo e o desafio; o simulador só em 127.0.0.1", () => {
    const u = new URL(urlDeAutorizacao({ clientId: "123", redirect: redirectDoSchema("staging"), estado: "s".repeat(43), desafio: "d" }));
    expect(u.origin + u.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "123", response_type: "code", platform_id: "mp", state: "s".repeat(43),
      redirect_uri: "https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/staging", code_challenge: "d", code_challenge_method: "S256" });
    expect(urlDeAutorizacao({ base: "http://127.0.0.1:8798", clientId: "1", redirect: REDIRECT_TESTE_MP, estado: "e", desafio: null }))
      .toMatch(/^http:\/\/127\.0\.0\.1:8798\/authorization\?/);
    expect(urlDeAutorizacao({ base: "https://evil.example", clientId: "1", redirect: REDIRECT_TESTE_MP, estado: "e", desafio: null }))
      .toMatch(/^https:\/\/auth\.mercadopago\.com\/authorization\?/);
  });
  it("o filtro da tela (MENOR 9): só a autorização do MP, host EXATO (.com ou .com.br — I6), https", () => {
    expect(ehUrlDeAutorizacaoMp("https://auth.mercadopago.com/authorization?client_id=1")).toBe(true);
    expect(ehUrlDeAutorizacaoMp("https://auth.mercadopago.com.br/authorization?client_id=1")).toBe(true);
    expect(ehUrlDeAutorizacaoMp("https://auth.mercadopago.com.evil.example/authorization")).toBe(false);
    expect(ehUrlDeAutorizacaoMp("http://auth.mercadopago.com/authorization")).toBe(false);
    expect(ehUrlDeAutorizacaoMp("https://auth.mercadopago.com/logout")).toBe(false);
    expect(ehUrlDeAutorizacaoMp("javascript:alert(1)")).toBe(false);
  });
});

describe("OAuth — a resposta do /oauth/token", () => {
  const ok = { access_token: "APP_USR-4934588586838432-101212-abcdef-241983636", token_type: "bearer", expires_in: 15552000,
               scope: "read write offline_access", user_id: 241983636, refresh_token: "TG-abcdefgh-241983636",
               public_key: "APP_USR-d0a26210-1111-2222-3333-479f0400869e", live_mode: true };
  it("lê o exemplo da doc: 180 dias, renovável, com a chave pública", () => {
    expect(lerTokenDoMp(ok, AGORA)).toEqual({ access: ok.access_token, refresh: ok.refresh_token, userId: 241983636,
      expiraEm: new Date(AGORA + 15552000 * 1000).toISOString(), publicKey: ok.public_key, live: true, renovavel: true });
  });
  it("sem public_key → publicKey null (a P-C decide o cartão); sem offline_access → não renovável", () => {
    const { public_key: _p, ...sem } = ok;
    expect(lerTokenDoMp(sem, AGORA)?.publicKey).toBeNull();
    expect(lerTokenDoMp({ ...ok, scope: "read write" }, AGORA)?.renovavel).toBe(false);
  });
  it("recusa token fora do formato, user_id ruim e validade absurda", () => {
    expect(lerTokenDoMp({ ...ok, access_token: "x" })).toBeNull();
    expect(lerTokenDoMp({ ...ok, user_id: "abc" })).toBeNull();
    expect(lerTokenDoMp({ ...ok, expires_in: 10 })).toBeNull();
  });
  it("o motivo da falha: 4xx = recusado; 5xx, 429 e rede (599) = fora", () => {
    expect([400, 401, 403].map(motivoDoOauth)).toEqual(["recusado", "recusado", "recusado"]);
    expect([500, 503, 429, 599].map(motivoDoOauth)).toEqual(["fora", "fora", "fora", "fora"]);
  });
  it("MENOR 20: a conta conectada tem de ser do mundo do schema (produção no public, teste no staging); sem live_mode, não confere", () => {
    expect(modoDaConexaoConfere(true, "public")).toBe(true);
    expect(modoDaConexaoConfere(false, "public")).toBe(false);
    expect(modoDaConexaoConfere(false, "staging")).toBe(true);
    expect(modoDaConexaoConfere(true, "staging")).toBe(false);
    expect(modoDaConexaoConfere(null, "public")).toBe(true);
  });
});

describe("renovação", () => {
  it("o job renova com menos de 30 dias; o uso, com menos de 1 dia", () => {
    expect(precisaRenovar(new Date(AGORA + 31 * 86_400_000).toISOString(), AGORA)).toBe(false);
    expect(precisaRenovar(new Date(AGORA + 29 * 86_400_000).toISOString(), AGORA)).toBe(true);
    expect(precisaRenovar(new Date(AGORA + 2 * 86_400_000).toISOString(), AGORA, 86_400_000)).toBe(false);
    expect(precisaRenovar(null, AGORA)).toBe(false);
  });
  it("a espera do MP fora: 1 h, 2 h, 4 h… até 24 h", () => {
    expect([0, 1, 2, 5, 9].map((n) => (Date.parse(proximaTentativa(n, AGORA)) - AGORA) / 3_600_000)).toEqual([1, 2, 4, 24, 24]);
  });
});

describe("a volta (I8: sempre no site, e a conexão boa espera a confirmação de quem começou)", () => {
  it("destino fixo por schema (sem open redirect); o 'confirmar' leva o id da conexão; id fora do formato não entra", () => {
    expect(destinoDoRetorno("https://physiqcalc.com.br", "negado")).toBe("https://physiqcalc.com.br/painel/configuracoes/recebimento?mp=negado");
    expect(destinoDoRetorno("https://physiqcalc-staging.vercel.app", "confirmar", "0b6f6c66-1111-4222-8333-944455556666"))
      .toBe("https://physiqcalc-staging.vercel.app/painel/configuracoes/recebimento?mp=confirmar&c=0b6f6c66-1111-4222-8333-944455556666");
    expect(destinoDoRetorno("https://physiqcalc.com.br", "confirmar", "x&mp=ok")).toBe("https://physiqcalc.com.br/painel/configuracoes/recebimento?mp=invalido");
  });
  it("os textos novos existem e não têm termo técnico", () => {
    for (const r of ["confirmar", "conta_de_teste", "outra_pessoa", "outra_conta"] as const) {
      expect(TEXTO_DO_RETORNO[r]).toBeTruthy();
      expect(TEXTO_DO_RETORNO[r]).not.toMatch(/oauth|token|webhook|redirect/i);
    }
  });
});

describe("o aviso por conta e a assinatura", () => {
  it("lê ?conta=<uuid>, o tópico, o id e o user_id; conta fora do formato → null", () => {
    const u = new URL("https://x/f?schema=staging&conta=0b6f6c66-1111-4222-8333-944455556666&data.id=123&type=payment");
    expect(lerAvisoDaConta(u, { user_id: 777 })).toEqual({ conta: "0b6f6c66-1111-4222-8333-944455556666", topico: "payment", id: "123", userId: 777 });
    expect(lerAvisoDaConta(new URL("https://x/f?conta=1"), {})).toBeNull();
  });
  it("sem a conta (a URL do painel — I1): o tópico, o id e o user_id; user_id ruim → null", () => {
    expect(lerAvisoDoMp(new URL("https://x/f?schema=public&data.id=9&type=payment"), { user_id: 5 })).toEqual({ topico: "payment", id: "9", userId: 5 });
    expect(lerAvisoDoMp(new URL("https://x/f?schema=public"), { type: "mp-connect", user_id: "x" })).toEqual({ topico: "mp-connect", id: "", userId: null });
  });
  it("o manifesto da doc (id em minúsculas; o que falta sai) e o HMAC", async () => {
    expect(manifestoDaAssinatura("ABC123", "rid-1", "1704908010")).toBe("id:abc123;request-id:rid-1;ts:1704908010;");
    expect(manifestoDaAssinatura(null, null, "1")).toBe("ts:1;");
    const segredo = "segredo-de-teste";
    const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode("id:123;request-id:r;ts:9;")));
    const v1 = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(await assinaturaMp({ cabecalho: `ts=9,v1=${v1}`, requestId: "r", dataId: "123", segredo })).toBe("valida");
    expect(await assinaturaMp({ cabecalho: `ts=9,v1=${"0".repeat(64)}`, requestId: "r", dataId: "123", segredo })).toBe("invalida");
    expect(await assinaturaMp({ cabecalho: null, requestId: "r", dataId: "123", segredo })).toBe("ausente");
    expect(await assinaturaMp({ cabecalho: `ts=9,v1=${v1}`, requestId: "r", dataId: "123", segredo: "" })).toBe("ausente");
  });
});

describe("credencial de quem já existe, situação e erros", () => {
  it("collector nulo = Physiq; igual ao da integração = conta; outro = outra conta", () => {
    expect(qualCredencial(null, { mp_user_id: 5 })).toBe("physiq");
    expect(qualCredencial("5", { mp_user_id: 5 })).toBe("conta");
    expect(qualCredencial(6, { mp_user_id: 5 })).toBe("outra_conta");
    expect(qualCredencial(6, null)).toBe("outra_conta");
  });
  it("a situação que o dono vê", () => {
    expect(situacaoDoMp(null).acao).toBe("conectar");
    expect(situacaoDoMp({ status: "erro", mp_erro: "acesso_recusado", mp_expira_em: null, mp_apelido: "TESTE1" }).acao).toBe("reconectar");
    expect(situacaoDoMp({ status: "ativa", mp_erro: "renovacao_recusada", mp_expira_em: "2026-12-01T12:00:00Z", mp_apelido: null }).texto).toMatch(/01\/12\/2026/);
    expect(situacaoDoMp({ status: "ativa", mp_erro: null, mp_expira_em: "2027-01-01T00:00:00Z", mp_apelido: "X" }).tom).toBe("verde");
  });
  it("o Pix sem chave na conta do personal", () => {
    expect(erroPixSemChave({ message: "Collector user without key enabled for QR render" })).toBe(true);
    expect(erroPixSemChave({ message: "outra coisa" })).toBe(false);
  });
});

// Acréscimo ao Step 1 do plano (Task 2): o contrato que as Tasks 4, 7, 8, 9, 10 e 15 importam deste módulo e que os casos acima não medem.
describe("o que as outras tasks usam deste módulo", () => {
  const hmacHex = async (segredo: string, manifesto: string) => {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(manifesto))), (b) => b.toString(16).padStart(2, "0")).join("");
  };
  it("a tela reexporta só o que é de tela, os mesmos objetos do servidor", () => {
    expect(Object.keys(tela).sort()).toEqual(["TEXTO_DO_RETORNO", "ehResultadoDoRetorno", "ehUrlDeAutorizacaoMp", "ehUuidMp", "situacaoDoMp"]);
    expect(tela.TEXTO_DO_RETORNO).toBe(TEXTO_DO_RETORNO);
    expect(tela.situacaoDoMp).toBe(situacaoDoMp);
    expect(tela.ehUrlDeAutorizacaoMp).toBe(ehUrlDeAutorizacaoMp);
  });
  it("a notification_url da conta (Task 9) e o redirect do public", () => {
    expect(notificacaoDaConta("staging", "0b6f6c66-1111-4222-8333-944455556666"))
      .toBe("https://api-principal.physiqcalc.com.br/functions/v1/mp-webhook-aluno?schema=staging&conta=0b6f6c66-1111-4222-8333-944455556666");
    expect(redirectDoSchema("public")).toBe("https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/public");
  });
  it("o state vai ao banco só como sha256 (vetor do FIPS 180-2); o verifier do PKCE tem 64 caracteres", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(novoSegredoUrl(48)).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });
  it("o log do OAuth leva só o código do erro, nunca a mensagem", () => {
    expect(codigoDoOauth({ error: "invalid_grant", message: "o refresh já foi usado" })).toBe("invalid_grant");
    expect(codigoDoOauth({ error: "Bearer APP_USR-123 recusado" })).toBeNull();
    expect(codigoDoOauth(null)).toBeNull();
  });
  it("os filtros da volta: uuid em minúsculas e só os resultados conhecidos (nada do protótipo); nenhum texto com termo técnico", () => {
    expect(ehUuidMp("0b6f6c66-1111-4222-8333-944455556666")).toBe(true);
    expect(ehUuidMp("0B6F6C66-1111-4222-8333-944455556666")).toBe(false);
    expect(["ok", "confirmar", "mp_em_outra_conta"].every((r) => ehResultadoDoRetorno(r))).toBe(true);
    expect(["toString", "__proto__", "constructor", "", null].some((r) => ehResultadoDoRetorno(r))).toBe(false);
    for (const t of Object.values(TEXTO_DO_RETORNO)) expect(t).not.toMatch(/oauth|token|webhook|redirect/i);
  });
  it("a x-signature: ts ou v1 fora do formato = inválida; o v1 em maiúsculas vale; o id entra em minúsculas; outro id não vale", async () => {
    const segredo = "segredo-de-teste";
    const v1 = await hmacHex(segredo, "id:abc;ts:9;");
    expect(await assinaturaMp({ cabecalho: `ts=9,v1=${v1.toUpperCase()}`, requestId: null, dataId: "ABC", segredo })).toBe("valida");
    expect(await assinaturaMp({ cabecalho: `ts=9,v1=${v1}`, requestId: null, dataId: "abd", segredo })).toBe("invalida");
    expect(await assinaturaMp({ cabecalho: `ts=abc,v1=${v1}`, requestId: null, dataId: "abc", segredo })).toBe("invalida");
    expect(await assinaturaMp({ cabecalho: `v1=${v1}`, requestId: null, dataId: "abc", segredo })).toBe("invalida");
  });
  it("a situação: desconectada pede Conectar; sem renovação e sem data fala do vencimento", () => {
    expect(situacaoDoMp({ status: "desconectada", mp_erro: null, mp_expira_em: null, mp_apelido: "X" })).toMatchObject({ tom: "cinza", acao: "conectar" });
    const s = situacaoDoMp({ status: "ativa", mp_erro: "sem_renovacao", mp_expira_em: null, mp_apelido: "LOJA" });
    expect(s).toMatchObject({ tom: "ambar", acao: "reconectar" });
    expect(s.texto).toMatch(/\(conta LOJA\).*até o vencimento/);
  });
  it("o /oauth/token que não é objeto → null; chave pública fora do formato → null; sem refresh → não renovável", () => {
    const ok = { access_token: "TEST-4934588586838432-101212-abcdef-241983636", expires_in: 15552000, scope: "read write offline_access",
                 user_id: 241983636, refresh_token: "TG-abcdefgh-241983636", public_key: "TEST-d0a26210-1111-2222-3333-479f0400869e", live_mode: false };
    for (const ruim of [null, [ok], "TEST-4934588586838432"]) expect(lerTokenDoMp(ruim, AGORA)).toBeNull();
    expect(lerTokenDoMp({ ...ok, public_key: "chave qualquer" }, AGORA)?.publicKey).toBeNull();
    const { refresh_token: _r, ...semRefresh } = ok;
    expect(lerTokenDoMp(semRefresh, AGORA)).toMatchObject({ refresh: null, renovavel: false, live: false, publicKey: ok.public_key });
  });
});
