// @vitest-environment node
// Physiq restaurar-login (30/10/2026) — as regras PURAS da chave de volta (supabase-principal/functions/_shared/restaurar-login-regras.ts),
// com um AUTENTICADOR VIRTUAL (src/test/autenticadorVirtual.ts: par ES256/RS256 de verdade, atestação "none", origem android:apk-key-hash:)
// e a biblioteca de verdade (@simplewebauthn/server 13.3.3, a mesma versão que a função pega pelo JSR). Prova: a origem, o RP ID, o desafio,
// a assinatura, o contador, o userHandle, o UP, a atestação e o algoritmo; as origens batem com o assetlinks.json; a trava falha fechada;
// a pessoa (staging só teste, so_teste, desativada, e-mail não confirmado); a sessão sai só com o id.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { decodeCredentialPublicKey } from "@simplewebauthn/server/helpers";
import { describe, expect, it } from "vitest";
import {
  ORIGEM_APK_SITE,
  ORIGEM_DEBUG_STAGING,
  ORIGEM_PLAY,
  ORIGEM_UPLOAD,
  RP_ID,
  STATUS_DA_RECUSA,
  TOLERANCIA,
  base64urlParaBytes,
  bytesParaBase64url,
  bytesParaHex,
  clientDataDe,
  conferirEntrada,
  contadorDaResposta,
  conferirRegistro,
  credencialValida,
  desafioDaResposta,
  hexParaBytes,
  lerPedidoApagar,
  lerPedidoRegistrar,
  lerRespostaEntrada,
  lerRespostaRegistro,
  lerTrava,
  motivoDoErro,
  opcoesDeEntrada,
  opcoesDeRegistro,
  origemDoCertificado,
  origensDoSchema,
  recusaDaPessoa,
  refDaChave,
  sessaoParaApp,
  textoDoAparelho,
  userHandleDe,
  versaoDoApp,
  type ChaveGuardada,
  type LibWebAuthn,
  type RespostaEntrada,
  type RespostaRegistro,
} from "../../supabase-principal/functions/_shared/restaurar-login-regras";
import { criarAutenticador, rsParaDer, type AutenticadorVirtual } from "../test/autenticadorVirtual";

const LIB = { verifyRegistrationResponse, verifyAuthenticationResponse, decodeCredentialPublicKey } as unknown as LibWebAuthn;
const EU = "f3513284-3e44-40cc-84bb-d7a39a929e8d";
const OUTRO = "f411a2c9-bf1d-42dd-9d19-00c6e08c0721";
const ORIGEM_FALSA = `android:apk-key-hash:${bytesParaBase64url(new Uint8Array(32).fill(7))}`;
const novoDesafio = () => bytesParaBase64url(crypto.getRandomValues(new Uint8Array(32)));

/** Registra no autenticador e confere como a função faria; devolve a chave guardada (o que a restauracao_usar devolveria). */
async function registrado(a: AutenticadorVirtual, schema: "public" | "staging" = "staging", userId = EU): Promise<ChaveGuardada> {
  const desafio = novoDesafio();
  const resp = lerRespostaRegistro(await a.registrar(opcoesDeRegistro(desafio, userId)))!;
  const c = await conferirRegistro(resp, { desafio, schema }, LIB);
  if (c.ok === false) throw new Error(`registro recusado: ${c.motivo}`);
  return { credencialId: c.chave.credencialId, userId, chavePublica: c.chave.chavePublica, contador: c.chave.contador };
}

const entrada = async (a: AutenticadorVirtual, desafio: string, o: Parameters<AutenticadorVirtual["entrar"]>[1] = {}) =>
  lerRespostaEntrada(await a.entrar(desafio, o))!;

describe("restaurar-login — as origens do app e o RP ID", () => {
  it("cada origem é o base64url do SHA-256 de um certificado do assetlinks.json (produção: Play + site; staging: + upload)", () => {
    const assetlinks = JSON.parse(readFileSync(resolve(__dirname, "../../public/.well-known/assetlinks.json"), "utf-8")) as Array<{
      target: { sha256_cert_fingerprints: string[] };
    }>;
    const doArquivo = assetlinks[0].target.sha256_cert_fingerprints.map(origemDoCertificado);
    expect(doArquivo.sort()).toEqual([ORIGEM_APK_SITE, ORIGEM_PLAY, ORIGEM_UPLOAD].sort());
    // as impressões do Play Console (docs/loja-google-play.md): a da assinatura da Play é a do app instalado pela loja
    expect(origemDoCertificado("9D:E1:9B:D4:45:6C:33:A6:43:D9:10:F4:0D:99:13:6D:34:6C:9E:92:95:9F:F3:9A:6E:4C:07:F5:04:D9:2C:76")).toBe(ORIGEM_PLAY);
    expect(origensDoSchema("public")).toEqual([ORIGEM_PLAY, ORIGEM_APK_SITE]);
    expect(origensDoSchema("staging")).toEqual([ORIGEM_PLAY, ORIGEM_APK_SITE, ORIGEM_UPLOAD, ORIGEM_DEBUG_STAGING]);
    // a de debug do notebook (fase0.md M5) só no staging: nunca no public nem no assetlinks.json de produção
    expect(origemDoCertificado("D3:98:5A:56:97:12:F5:3A:F8:9F:96:64:68:9C:06:62:8C:2D:CC:48:47:21:0C:D0:C8:B5:87:BD:C6:18:9C:A8")).toBe(ORIGEM_DEBUG_STAGING);
    expect(origensDoSchema("public")).not.toContain(ORIGEM_UPLOAD);
    expect(origensDoSchema("public")).not.toContain(ORIGEM_DEBUG_STAGING);
    expect(doArquivo).not.toContain(ORIGEM_DEBUG_STAGING);
    expect(origemDoCertificado("não é impressão")).toBeNull();
    expect(RP_ID).toBe("physiqcalc.com.br");
  });

  it("base64url e hex vão e voltam; o que não é base64url vira null", () => {
    const b = crypto.getRandomValues(new Uint8Array(33));
    expect(base64urlParaBytes(bytesParaBase64url(b))).toEqual(b);
    expect(bytesParaBase64url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
    expect(base64urlParaBytes("a+b/")).toBeNull();
    expect(base64urlParaBytes("abcde")).toBeNull(); // tamanho impossível
    expect(base64urlParaBytes(42)).toBeNull();
    expect(hexParaBytes(bytesParaHex(b))).toEqual(b);
    expect(hexParaBytes("xyz")).toBeNull();
  });
});

describe("restaurar-login — as opções que vão ao Android", () => {
  it("registro: user.id = os 16 bytes do uuid, nomes neutros (sem e-mail), atestação none, ES256/RS256, chave residente", () => {
    const o = opcoesDeRegistro("d".repeat(43), EU);
    expect(base64urlParaBytes(o.user.id)).toEqual(hexParaBytes(EU.replace(/-/g, "")));
    expect(o.user.id).toBe(userHandleDe(EU));
    expect(o.user.id).toHaveLength(22);
    expect(o).toMatchObject({
      challenge: "d".repeat(43),
      rp: { id: "physiqcalc.com.br", name: "Physiq" },
      user: { name: "Physiq", displayName: "Physiq" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      attestation: "none",
      excludeCredentials: [],
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
    });
    expect(JSON.stringify(o)).not.toMatch(/@/);
    expect(() => userHandleDe("não-é-uuid")).toThrow();
  });

  it("entrada: o RP ID, o desafio, sem lista de chaves e o UV discouraged (o Android força)", () => {
    expect(opcoesDeEntrada("e".repeat(43))).toEqual({
      challenge: "e".repeat(43), rpId: "physiqcalc.com.br", timeout: 60000, userVerification: "discouraged", allowCredentials: [],
    });
  });
});

describe("restaurar-login — o que o app manda (leitura)", () => {
  it("registro: só os campos conhecidos passam; id ≠ rawId, tipo errado, campo grande ou não-base64url → null", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const bruto = await a.registrar(opcoesDeRegistro(novoDesafio(), EU));
    const lida = lerRespostaRegistro({ ...bruto, extra: "x", clientExtensionResults: { credProps: { rk: true } } })!;
    expect(Object.keys(lida).sort()).toEqual(["clientExtensionResults", "id", "rawId", "response", "type"]);
    expect(lida.clientExtensionResults).toEqual({});
    expect(lida.response.transports).toEqual(["internal"]);
    expect(lerRespostaRegistro({ ...bruto, rawId: "outro-id-de-chave-qualquer" })).toBeNull();
    expect(lerRespostaRegistro({ ...bruto, type: "password" })).toBeNull();
    const r = bruto.response as Record<string, unknown>;
    expect(lerRespostaRegistro({ ...bruto, response: { ...r, attestationObject: "A".repeat(16385) } })).toBeNull();
    expect(lerRespostaRegistro({ ...bruto, response: { ...r, clientDataJSON: "não base64url!" } })).toBeNull();
    expect(lerRespostaRegistro(null)).toBeNull();
  });

  it("entrada: authData de no mínimo 37 bytes, assinatura e userHandle em base64url; o userHandle é opcional", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await a.registrar(opcoesDeRegistro(novoDesafio(), EU));
    const bruto = await a.entrar(novoDesafio());
    const r = bruto.response as Record<string, unknown>;
    expect(lerRespostaEntrada(bruto)?.response.userHandle).toBe(userHandleDe(EU));
    expect(lerRespostaEntrada({ ...bruto, response: { ...r, userHandle: null } })?.response).not.toHaveProperty("userHandle");
    expect(lerRespostaEntrada({ ...bruto, response: { ...r, authenticatorData: "AAAA" } })).toBeNull();
    expect(lerRespostaEntrada({ ...bruto, response: { ...r, signature: "a/b" } })).toBeNull();
    expect(lerRespostaEntrada({ ...bruto, response: { ...r, userHandle: "x".repeat(129) } })).toBeNull();
  });

  it("o clientDataJSON é lido (tipo, desafio, origem) e o desafio só vale no formato (43 caracteres base64url)", async () => {
    const a = await criarAutenticador(ORIGEM_APK_SITE);
    await a.registrar(opcoesDeRegistro(novoDesafio(), EU));
    const d = novoDesafio();
    const e = await entrada(a, d);
    expect(clientDataDe(e.response.clientDataJSON)).toEqual({ type: "webauthn.get", challenge: d, origin: ORIGEM_APK_SITE });
    expect(desafioDaResposta(e)).toBe(d);
    expect(desafioDaResposta(await entrada(a, "curto"))).toBeNull();
    expect(clientDataDe(bytesParaBase64url(new TextEncoder().encode("não é json")))).toBeNull();
  });

  it("o pedido de registrar: substitui só no formato de id; aparelho e versão limpos; nuvem só booleano", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const resposta = await a.registrar(opcoesDeRegistro(novoDesafio(), EU));
    const p = lerPedidoRegistrar({ resposta, nuvem: false, substitui: a.id, aparelho: { modelo: "motorola moto g(7) <script>", android: 10 }, versao: "3.140" })!;
    expect(p).toMatchObject({ nuvem: false, substitui: a.id, aparelho: "motorola moto g(7) script · Android 10", versao: "3.140" });
    expect(lerPedidoRegistrar({ resposta, substitui: "curto" })).toBeNull();
    expect(lerPedidoRegistrar({ resposta, nuvem: "sim", versao: "x y" })).toMatchObject({ nuvem: null, versao: null, aparelho: null, substitui: null });
    expect(lerPedidoRegistrar({ resposta: { id: "x" } })).toBeNull();
    expect(textoDoAparelho({ modelo: "M".repeat(200), android: "14" })!.length).toBeLessThanOrEqual(80);
    expect(textoDoAparelho("Pixel 8")).toBeNull();
    expect(versaoDoApp("3.139-loja")).toBe("3.139-loja");
    expect(versaoDoApp("v".repeat(33))).toBeNull();
  });

  it("o pedido de apagar: todas (o Sair) ou a deste aparelho (o Sair local); nada mais", () => {
    expect(lerPedidoApagar({ todas: true })).toEqual({ todas: true });
    expect(lerPedidoApagar({ credencial: "A".repeat(43) })).toEqual({ credencial: "A".repeat(43) });
    expect(lerPedidoApagar({ todas: "true" })).toBeNull();
    expect(lerPedidoApagar({ credencial: "curta" })).toBeNull();
    expect(lerPedidoApagar({})).toBeNull();
    expect(credencialValida("A".repeat(1401))).toBe(false);
  });
});

describe("restaurar-login — registrar (a conferência com o autenticador virtual)", () => {
  it.each([[-7 as const, "ES256"], [-257 as const, "RS256"]])("alg %s (%s): aceita e devolve a chave COSE, o id, o contador, o AAGUID e as flags", async (alg: -7 | -257, _nome: string) => {
    const a = await criarAutenticador(ORIGEM_PLAY, alg);
    const desafio = novoDesafio();
    const resp = lerRespostaRegistro(await a.registrar(opcoesDeRegistro(desafio, EU), { be: true, bs: true, up: false }))!;
    const c = await conferirRegistro(resp, { desafio, schema: "public" }, LIB);
    expect(c.ok).toBe(true);
    if (c.ok === false) return;
    expect(c.chave).toMatchObject({
      credencialId: a.id, contador: 0, algoritmo: alg, aaguid: "00000000-0000-0000-0000-000000000000",
      backupElegivel: true, backupEstado: true, origem: ORIGEM_PLAY,
    });
    expect(c.chave.chavePublica.length).toBeGreaterThan(60);
    // UP e UV não são exigidos na criação (silenciosa): o registro acima veio com UP = 0
  });

  it("recusa: desafio de outro pedido, origem fora da lista, RP de outro site, tipo errado", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const desafio = novoDesafio();
    const conferir = async (o: Parameters<AutenticadorVirtual["registrar"]>[1], d = desafio, schema: "public" | "staging" = "public") =>
      conferirRegistro(lerRespostaRegistro(await a.registrar(opcoesDeRegistro(desafio, EU), o))!, { desafio: d, schema }, LIB);
    expect(await conferir({}, novoDesafio())).toEqual({ ok: false, motivo: "desafio_invalido" });
    expect(await conferir({ origem: ORIGEM_FALSA })).toEqual({ ok: false, motivo: "origem_invalida" });
    expect(await conferir({ origem: "https://physiqcalc.com.br" })).toEqual({ ok: false, motivo: "origem_invalida" });
    expect(await conferir({ rpId: "physiqcalc.com.br.evil.example" })).toEqual({ ok: false, motivo: "rp_invalido" });
    expect(await conferir({ tipo: "webauthn.get" })).toEqual({ ok: false, motivo: "tipo_invalido" });
    // a chave de upload só vale no staging
    expect(await conferir({ origem: ORIGEM_UPLOAD })).toEqual({ ok: false, motivo: "origem_invalida" });
    expect((await conferir({ origem: ORIGEM_UPLOAD }, desafio, "staging")).ok).toBe(true);
  });

  it("recusa: atestação que não é none, algoritmo fora da lista, id do JSON diferente do id do authData, BS sem BE", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const desafio = novoDesafio();
    const conferir = async (o: Parameters<AutenticadorVirtual["registrar"]>[1]) =>
      conferirRegistro(lerRespostaRegistro(await a.registrar(opcoesDeRegistro(desafio, EU), o))!, { desafio, schema: "public" }, LIB);
    expect(await conferir({ fmt: "packed" })).toEqual({ ok: false, motivo: "atestacao_invalida" });
    // a auto-atestação "packed" de verdade a biblioteca aceita — quem recusa é a regra (só "none", o que as opções pedem)
    const packed = lerRespostaRegistro(await a.registrar(opcoesDeRegistro(desafio, EU), { fmt: "packed", autoAtestacao: true }))!;
    type RespostaDaLib = Parameters<typeof verifyRegistrationResponse>[0]["response"];
    expect((await verifyRegistrationResponse({ response: packed as unknown as RespostaDaLib, expectedChallenge: desafio, expectedOrigin: ORIGEM_PLAY, expectedRPID: RP_ID,
      requireUserVerification: false })).verified).toBe(true);
    expect(await conferir({ fmt: "packed", autoAtestacao: true })).toEqual({ ok: false, motivo: "atestacao_invalida" });
    expect(await conferir({ algNaChave: -8 })).toEqual({ ok: false, motivo: "algoritmo_invalido" });
    expect(await conferir({ idNoJson: bytesParaBase64url(new Uint8Array(32).fill(9)) })).toEqual({ ok: false, motivo: "id_divergente" });
    expect((await conferir({ bs: true, be: false })).ok).toBe(false);
  });
});

describe("restaurar-login — entrar (a conferência com o autenticador virtual)", () => {
  it.each([[-7 as const], [-257 as const]])("alg %s: a assinatura certa, a origem e o RP certos → aceita; contador 0 (a cópia) segue 0", async (alg) => {
    const a = await criarAutenticador(ORIGEM_PLAY, alg);
    const chave = await registrado(a, "public");
    const d = novoDesafio();
    expect(await conferirEntrada(await entrada(a, d), { desafio: d, schema: "public", chave }, LIB)).toEqual({ ok: true, novoContador: 0, origem: ORIGEM_PLAY });
  });

  it("o desafio é o do pedido: a mesma resposta não serve para outro desafio (a repetição cai no desafio)", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const chave = await registrado(a);
    const d1 = novoDesafio();
    const r = await entrada(a, d1);
    expect((await conferirEntrada(r, { desafio: d1, schema: "staging", chave }, LIB)).ok).toBe(true);
    expect(await conferirEntrada(r, { desafio: novoDesafio(), schema: "staging", chave }, LIB)).toEqual({ ok: false, motivo: "desafio_invalido" });
  });

  it("recusa: origem fora da lista, RP de outro site, tipo de registro, assinatura de outra chave, authData mexido depois de assinar", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const b = await criarAutenticador(ORIGEM_PLAY);
    const chave = await registrado(a);
    await registrado(b);
    const d = novoDesafio();
    const conferir = (r: RespostaEntrada) => conferirEntrada(r, { desafio: d, schema: "staging", chave }, LIB);
    expect(await conferir(await entrada(a, d, { origem: ORIGEM_FALSA }))).toEqual({ ok: false, motivo: "origem_invalida" });
    expect(await conferir(await entrada(a, d, { rpId: "outro.com.br" }))).toEqual({ ok: false, motivo: "rp_invalido" });
    expect(await conferir(await entrada(a, d, { tipo: "webauthn.create" }))).toEqual({ ok: false, motivo: "tipo_invalido" });
    const certa = await entrada(a, d);
    const daOutra = await entrada(b, d, { userHandle: certa.response.userHandle });
    expect(await conferir({ ...certa, response: { ...certa.response, signature: daOutra.response.signature } })).toEqual({ ok: false, motivo: "assinatura_invalida" });
    const auth = base64urlParaBytes(certa.response.authenticatorData)!;
    auth[36] = 5; // o contador mexido depois de assinar
    expect(await conferir({ ...certa, response: { ...certa.response, authenticatorData: bytesParaBase64url(auth) } })).toEqual({ ok: false, motivo: "assinatura_invalida" });
    expect(await conferir(certa)).toMatchObject({ ok: true });
  });

  it("recusa: id de outra chave, userHandle de outra pessoa; sem userHandle passa (é opcional)", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const chave = await registrado(a);
    const d = novoDesafio();
    const conferir = (r: RespostaEntrada, c: ChaveGuardada = chave) => conferirEntrada(r, { desafio: d, schema: "staging", chave: c }, LIB);
    expect(await conferir(await entrada(a, d), { ...chave, credencialId: "B".repeat(43) })).toEqual({ ok: false, motivo: "chave_divergente" });
    expect(await conferir(await entrada(a, d, { userHandle: userHandleDe(OUTRO) }))).toEqual({ ok: false, motivo: "usuario_divergente" });
    expect(await conferir(await entrada(a, d, { userHandle: null }))).toMatchObject({ ok: true });
  });

  it("o contador só sobe (se algum dos 2 passar de 0): 5 → 6 aceita; 5 → 3 e 5 → 5 recusam; 0 → 0 aceita", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const chave = await registrado(a);
    const conferir = async (guardado: number, novo: number) => {
      const d = novoDesafio();
      return conferirEntrada(await entrada(a, d, { contador: novo }), { desafio: d, schema: "staging", chave: { ...chave, contador: guardado } }, LIB);
    };
    expect(await conferir(5, 6)).toMatchObject({ ok: true, novoContador: 6 });
    expect(await conferir(5, 3)).toEqual({ ok: false, motivo: "contador_voltou" });
    expect(await conferir(5, 5)).toEqual({ ok: false, motivo: "contador_voltou" });
    expect(await conferir(0, 0)).toMatchObject({ ok: true, novoContador: 0 });
  });

  it("a TOLERANCIA de hoje (até a fase 0 medir): UP e UV não exigidos, contador 0 aceito, qualquer AAGUID — mudar aqui = apertar", () => {
    expect(TOLERANCIA).toEqual({ exigirPresenca: false, exigirVerificacao: false, aceitarContadorZero: true, aaguidsAceitos: null });
  });

  it("UP e UV: tolerados por padrão; apertando (exigirPresenca / exigirVerificacao) a falta de cada um recusa", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const chave = await registrado(a);
    const d = novoDesafio();
    const conferir = (r: RespostaEntrada, tolerancia = {}) => conferirEntrada(r, { desafio: d, schema: "staging", chave, tolerancia }, LIB);
    const semToque = await entrada(a, d, { up: false });
    expect(await conferir(semToque)).toMatchObject({ ok: true });
    expect(await conferir(semToque, { exigirPresenca: true })).toEqual({ ok: false, motivo: "presenca_ausente" });
    const comToque = await entrada(a, d, { up: true, uv: false });
    expect(await conferir(comToque, { exigirPresenca: true })).toMatchObject({ ok: true });
    expect(await conferir(comToque, { exigirVerificacao: true })).toEqual({ ok: false, motivo: "verificacao_ausente" });
    expect(await conferir(await entrada(a, d, { up: true, uv: true }), { exigirVerificacao: true })).toMatchObject({ ok: true });
    // o registro nunca exige UP; o UV só se apertar
    const desafio = novoDesafio();
    const resp = lerRespostaRegistro(await a.registrar(opcoesDeRegistro(desafio, EU), { up: false, uv: false }))!;
    expect((await conferirRegistro(resp, { desafio, schema: "staging" }, LIB)).ok).toBe(true);
    expect(await conferirRegistro(resp, { desafio, schema: "staging", tolerancia: { exigirVerificacao: true } }, LIB))
      .toEqual({ ok: false, motivo: "verificacao_ausente" });
  });

  it("o contador 0 com o guardado > 0 (a cópia da chave): tolerado por padrão; apertando, recusa; contador > 0 que não sobe recusa sempre", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const chave = await registrado(a);
    const conferir = async (guardado: number, novo: number, tolerancia = {}) => {
      const d = novoDesafio();
      return conferirEntrada(await entrada(a, d, { contador: novo }), { desafio: d, schema: "staging", chave: { ...chave, contador: guardado }, tolerancia }, LIB);
    };
    expect(await conferir(5, 0)).toMatchObject({ ok: true, novoContador: 0 });
    expect(await conferir(5, 0, { aceitarContadorZero: false })).toEqual({ ok: false, motivo: "contador_voltou" });
    expect(await conferir(5, 3)).toEqual({ ok: false, motivo: "contador_voltou" });
    expect(await conferir(5, 3, { aceitarContadorZero: false })).toEqual({ ok: false, motivo: "contador_voltou" });
    expect(contadorDaResposta((await entrada(a, novoDesafio(), { contador: 258 })).response.authenticatorData)).toBe(258);
    expect(contadorDaResposta("AAAA")).toBeNull();
  });

  it("o AAGUID: qualquer um por padrão (zerado ou não); apertando com a lista, o de fora recusa", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const desafio = novoDesafio();
    const aaguid = new Uint8Array(16).fill(0xab);
    const resp = lerRespostaRegistro(await a.registrar(opcoesDeRegistro(desafio, EU), { aaguid }))!;
    const c = await conferirRegistro(resp, { desafio, schema: "staging" }, LIB);
    expect(c).toMatchObject({ ok: true, chave: { aaguid: "abababab-abab-abab-abab-abababababab" } });
    expect(await conferirRegistro(resp, { desafio, schema: "staging", tolerancia: { aaguidsAceitos: ["00000000-0000-0000-0000-000000000000"] } }, LIB))
      .toEqual({ ok: false, motivo: "aaguid_recusado" });
    expect((await conferirRegistro(resp, { desafio, schema: "staging", tolerancia: { aaguidsAceitos: ["abababab-abab-abab-abab-abababababab"] } }, LIB)).ok)
      .toBe(true);
  });

  it("BE/BS só guardados (nenhum recusa); o androidPackageName no clientDataJSON não muda nada (vindo ou não)", async () => {
    for (const flags of [{ be: false, bs: false }, { be: true, bs: false }, { be: true, bs: true }]) {
      const a = await criarAutenticador(ORIGEM_PLAY);
      const desafio = novoDesafio();
      const c = await conferirRegistro(lerRespostaRegistro(await a.registrar(opcoesDeRegistro(desafio, EU), flags))!, { desafio, schema: "staging" }, LIB);
      expect(c).toMatchObject({ ok: true, chave: { backupElegivel: flags.be, backupEstado: flags.bs } });
    }
    const a = await criarAutenticador(ORIGEM_DEBUG_STAGING);
    const desafio = novoDesafio();
    const reg = lerRespostaRegistro(await a.registrar(opcoesDeRegistro(desafio, EU), { androidPackageName: "com.bertoldo.physiqcalc" }))!;
    const c = await conferirRegistro(reg, { desafio, schema: "staging" }, LIB);
    expect(c.ok).toBe(true);
    if (c.ok === false) return;
    const chave = { credencialId: c.chave.credencialId, userId: EU, chavePublica: c.chave.chavePublica, contador: 0 };
    for (const pacote of ["com.bertoldo.physiqcalc", "com.outro.app", undefined]) {
      const d = novoDesafio();
      expect(await conferirEntrada(await entrada(a, d, { androidPackageName: pacote }), { desafio: d, schema: "staging", chave }, LIB)).toMatchObject({ ok: true });
    }
    // a de debug do notebook só vale no staging
    const d = novoDesafio();
    expect(await conferirEntrada(await entrada(a, d), { desafio: d, schema: "public", chave }, LIB)).toEqual({ ok: false, motivo: "origem_invalida" });
  });

  it("a origem de upload entra só no staging; a chave registrada no staging não serve com outra origem no public", async () => {
    const a = await criarAutenticador(ORIGEM_UPLOAD);
    const chave = await registrado(a, "staging");
    const d = novoDesafio();
    const r = await entrada(a, d);
    expect((await conferirEntrada(r, { desafio: d, schema: "staging", chave }, LIB)).ok).toBe(true);
    expect(await conferirEntrada(r, { desafio: d, schema: "public", chave }, LIB)).toEqual({ ok: false, motivo: "origem_invalida" });
  });

  it("o motivo de cada erro da biblioteca (para o log)", () => {
    expect(motivoDoErro(Object.assign(new Error("Unexpected RP ID hash"), { name: "UnexpectedRPIDHash" }))).toBe("rp_invalido");
    expect(motivoDoErro(new Error("Response counter value 3 was lower than expected 5"))).toBe("contador_voltou");
    expect(motivoDoErro(new Error("User not present during authentication"))).toBe("presenca_ausente");
    expect(motivoDoErro(new Error('Unexpected public key alg "-8", expected one of "-7, -257"'))).toBe("algoritmo_invalido");
    expect(motivoDoErro(new Error("Unsupported Attestation Format: xyz"))).toBe("atestacao_invalida");
    expect(motivoDoErro(new Error("qualquer outra coisa"))).toBe("formato_invalido");
    expect(motivoDoErro("texto")).toBe("formato_invalido");
  });

  it("a DER da assinatura ECDSA (o formato do WebAuthn) — o r e o s com o bit alto ganham o zero na frente", () => {
    const rs = new Uint8Array(64);
    rs[0] = 0x80;
    rs[63] = 1;
    const der = rsParaDer(rs);
    expect(Array.from(der.slice(0, 4))).toEqual([0x30, der.length - 2, 0x02, 33]);
    expect(der[4]).toBe(0);
    expect(Array.from(der.slice(-3))).toEqual([0x02, 1, 1]);
  });
});

describe("restaurar-login — a trava, a pessoa e a sessão", () => {
  it("a trava falha fechada: só liga com ligado = true; o so_teste só sai com false explícito", () => {
    expect(lerTrava({ ligado: true, so_teste: false })).toEqual({ ligado: true, soTeste: false });
    expect(lerTrava({ ligado: true })).toEqual({ ligado: true, soTeste: true });
    expect(lerTrava({ ligado: "true", so_teste: "false" })).toEqual({ ligado: false, soTeste: true });
    expect(lerTrava(null)).toEqual({ ligado: false, soTeste: true });
    expect(lerTrava([true])).toEqual({ ligado: false, soTeste: true });
  });

  it("a pessoa: staging só conta de teste; so_teste barra a conta real (desligado); desativada; e-mail não confirmado; sem pessoa", () => {
    const agora = Date.parse("2026-10-30T12:00:00Z");
    const teste = { id: EU, email: "w26.lia.teste.claude@physiqnutri.app", email_confirmed_at: "2026-10-01T00:00:00Z" };
    const real = { ...teste, email: "alguem@gmail.com" };
    expect(recusaDaPessoa(teste, { schema: "staging", soTeste: true, agora })).toBeNull();
    expect(recusaDaPessoa(real, { schema: "staging", soTeste: false, agora })).toBe("conta_real_no_staging");
    expect(recusaDaPessoa(real, { schema: "public", soTeste: true, agora })).toBe("desligado");
    expect(recusaDaPessoa(real, { schema: "public", soTeste: false, agora })).toBeNull();
    expect(recusaDaPessoa({ ...real, banned_until: "2027-01-01T00:00:00Z" }, { schema: "public", soTeste: false, agora })).toBe("acesso_desativado");
    expect(recusaDaPessoa({ ...real, banned_until: "2026-01-01T00:00:00Z" }, { schema: "public", soTeste: false, agora })).toBeNull();
    expect(recusaDaPessoa({ ...real, email_confirmed_at: null }, { schema: "public", soTeste: false, agora })).toBe("email_nao_confirmado");
    expect(recusaDaPessoa(null, { schema: "public", soTeste: false, agora })).toBe("chave_invalida");
    expect(STATUS_DA_RECUSA).toMatchObject({ chave_invalida: 401, conta_real_no_staging: 403, acesso_desativado: 403, email_nao_confirmado: 403, desligado: 200 });
  });

  it("a sessão para o app: os tokens e SÓ o id (nada do e-mail); de outra pessoa ou sem token → null", () => {
    const doAuth = {
      access_token: "eyJ.a.b", refresh_token: "r1", expires_in: 3600, expires_at: 1793333333, token_type: "bearer",
      user: { id: EU, email: "w26.lia.teste.claude@physiqnutri.app", app_metadata: { provider: "email" } },
    };
    expect(sessaoParaApp(doAuth, EU)).toEqual({
      access_token: "eyJ.a.b", refresh_token: "r1", expires_in: 3600, expires_at: 1793333333, token_type: "bearer", user: { id: EU },
    });
    expect(JSON.stringify(sessaoParaApp(doAuth, EU))).not.toContain("@");
    expect(sessaoParaApp(doAuth, OUTRO)).toBeNull();
    expect(sessaoParaApp({ ...doAuth, refresh_token: "" }, EU)).toBeNull();
    expect(sessaoParaApp({ access_token: "a", refresh_token: "r", user: { id: EU } }, EU, 1000)).toMatchObject({ expires_in: 3600, expires_at: 4600 });
  });

  it("o log leva só o começo do id da chave", () => {
    expect(refDaChave("ABCDEFGHIJKLMNOPQRSTUVWXYZ")).toBe("ABCDEFGHIJKL");
    expect(refDaChave("x@y")).toBe("?");
  });
});
