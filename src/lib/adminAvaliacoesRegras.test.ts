import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACOES_DE_ANTES, ACOES_FOTO, ACOES_QUE_GRAVAM, STATUS_FOTO, TIPOS_FOTO, bucketDosRegistros, caminhoDaFotoMensal, caminhoDoAluno, ehAcaoFoto,
  ehTipoFoto, erroDoBanco, erroDoStorage, foiTempo, lerExclusaoDeFoto, lerPedidoDeFoto, mesRef, mesValido, schemaDaFoto, statusDaFoto,
} from "../../supabase/functions/admin-avaliacoes/regras";
import { TIPOS_FOTO as TIPOS_DA_TELA } from "./registrosFotos";

// hml-19c (H-41 · jeito 2 · decisão 15) — as regras puras da admin-avaliacoes (Banco do Treino): as ações que gravam (as de antes + as 3 da
// foto mensal), o mês e o tipo da foto, o caminho <aluno>/<aaaa-mm>/<tipo>.jpg montado no servidor (caminho de outro aluno é recusado),
// os códigos e o status de cada recusa e a tradução do erro do Storage/banco quando a função grava como a pessoa.
const ALUNO = "aaaaaaaa-0000-4000-8000-000000000001";
const OUTRO = "bbbbbbbb-0000-4000-8000-000000000002";
const FOTO = "cccccccc-0000-4000-8000-000000000003";

describe("as ações: as de antes seguem iguais; as 3 da foto gravam (sessão no GoTrue a cada pedido)", () => {
  it("ACOES_QUE_GRAVAM = create, update, proxima, delete (hml-14) + foto_preparar, foto_salvar, foto_excluir; a list segue lendo", () => {
    expect([...ACOES_QUE_GRAVAM].sort()).toEqual(["create", "delete", "foto_excluir", "foto_preparar", "foto_salvar", "proxima", "update"]);
    expect(ACOES_QUE_GRAVAM.has("list")).toBe(false);
    expect([...ACOES_FOTO]).toEqual(["foto_preparar", "foto_salvar", "foto_excluir"]);
    // as ações de antes não mudaram de lista (decisão E: o comportamento delas é o de hoje)
    expect([...ACOES_DE_ANTES]).toEqual(["list", "create", "update", "proxima", "delete"]);
  });

  it("ehAcaoFoto: só as 3 (as de antes, a desconhecida e o que não é texto ficam de fora)", () => {
    for (const a of ACOES_FOTO) expect(ehAcaoFoto(a), a).toBe(true);
    for (const a of [...ACOES_DE_ANTES, "foto_apagar_tudo", "FOTO_SALVAR", "", "__proto__", null, undefined, 1, {}]) {
      expect(ehAcaoFoto(a), String(a)).toBe(false);
    }
  });

  it("o index.ts usa a lista do regras.ts (sem cópia) e o bloco da foto não tem a chave secreta", () => {
    const fonte = readFileSync(resolve(__dirname, "../../supabase/functions/admin-avaliacoes/index.ts"), "utf-8");
    expect(fonte).toMatch(/from "\.\/regras\.ts"/);
    expect(fonte).not.toMatch(/const ACOES_QUE_GRAVAM\s*=/);
    const inicio = fonte.indexOf("hml-19c (H-41 · jeito 2 · decisão 15)");
    const fim = fonte.indexOf("Deno.serve(");
    expect(inicio).toBeGreaterThan(0);
    expect(fim).toBeGreaterThan(inicio);
    const bloco = fonte.slice(inicio, fim);
    expect(bloco).not.toMatch(/SERVICE_ROLE|service_role/);
    expect(bloco).toMatch(/SUPABASE_ANON_KEY/);
    expect(bloco).toMatch(/createSignedUploadUrl\(p\.caminho, \{ upsert: true \}\)/);
  });
});

describe("a foto mensal: o mês, o tipo e o caminho do servidor", () => {
  it("o tipo é a lista fechada da tela (TipoFoto de src/lib/registrosFotos.ts = o check da tabela)", () => {
    expect([...TIPOS_FOTO]).toEqual(TIPOS_DA_TELA.map((t) => t.key));
    for (const t of TIPOS_FOTO) expect(ehTipoFoto(t), t).toBe(true);
    for (const t of ["lateral", "Frente", "frente.jpg", "", null, 3]) expect(ehTipoFoto(t), String(t)).toBe(false);
  });

  it("mês: aaaa-mm com o mês de 01 a 12 (o mês sentinela 2000-01 dos E2E passa)", () => {
    for (const m of ["2026-10", "2026-01", "2026-12", "2000-01"]) expect(mesValido(m), m).toBe(true);
    for (const m of ["2026-13", "2026-00", "2026-1", "26-10", "2026-10-01", "2026/10", " 2026-10", "2026-10 ", "", null, 202610, undefined]) {
      expect(mesValido(m), String(m)).toBe(false);
    }
    expect(mesRef("2026-10")).toBe("2026-10-01");
  });

  it("o caminho <aluno>/<aaaa-mm>/<tipo>.jpg é o MESMO formato que a tela montava (o aluno em minúsculas)", () => {
    // o de antes: `${treinoUserId}/${mes}/${tipo}.jpg` (avaliacaoApi.ts)
    expect(caminhoDaFotoMensal(ALUNO, "2026-10", "frente")).toBe(`${ALUNO}/2026-10/frente.jpg`);
    expect(caminhoDaFotoMensal(ALUNO.toUpperCase(), "2026-10", "lateral_esquerda")).toBe(`${ALUNO}/2026-10/lateral_esquerda.jpg`);
  });

  it("caminhoDoAluno: só o caminho DESTE aluno, no formato (outro aluno, outra pasta, fora do formato → não)", () => {
    expect(caminhoDoAluno(`${ALUNO}/2026-10/costas.jpg`, ALUNO)).toBe(true);
    expect(caminhoDoAluno(`${ALUNO}/2026-10/costas.jpg`, ALUNO.toUpperCase())).toBe(true);
    for (const c of [
      `${OUTRO}/2026-10/costas.jpg`, `${ALUNO}/2026-13/costas.jpg`, `${ALUNO}/2026-10/costas.png`, `${ALUNO}/2026-10/lateral.jpg`,
      `${ALUNO}/../${OUTRO}/2026-10/costas.jpg`, `${ALUNO}/2026-10/costas.jpg/extra`, `/${ALUNO}/2026-10/costas.jpg`, `${ALUNO}/costas.jpg`, "", null, 7,
    ]) {
      expect(caminhoDoAluno(c, ALUNO), String(c)).toBe(false);
    }
    expect(caminhoDoAluno(`${ALUNO}/2026-10/costas.jpg`, "nao-e-uuid")).toBe(false);
  });

  it("bucket do ambiente: o mesmo da tela (registros-staging no staging; registros na produção)", () => {
    expect(bucketDosRegistros("staging")).toBe("registros-staging");
    expect(bucketDosRegistros("public")).toBe("registros");
  });

  it("x-schema da foto: só public/staging (fora da lista → null → 400, nunca cai na produção)", () => {
    expect(schemaDaFoto("staging")).toBe("staging");
    expect(schemaDaFoto("PUBLIC")).toBe("public");
    for (const s of ["", "prod", "staging2", " staging", "public ", null, undefined, 1]) expect(schemaDaFoto(s), String(s)).toBeNull();
  });
});

describe("os pedidos: positivo e negativo", () => {
  it("preparar/salvar: o aluno, o mês e o tipo conferidos e o caminho montado aqui (o que o navegador manda a mais não entra)", () => {
    expect(lerPedidoDeFoto({ userId: ALUNO.toUpperCase(), mes: "2026-10", tipo: "frente", bucket: "outro", storage_path: "x" })).toEqual({
      ok: true, alunoId: ALUNO, mes: "2026-10", tipo: "frente", caminho: `${ALUNO}/2026-10/frente.jpg`,
    });
    // o salvar devolve o caminho que o preparar deu: o mesmo → ok
    expect(lerPedidoDeFoto({ userId: ALUNO, mes: "2026-10", tipo: "frente", caminho: `${ALUNO}/2026-10/frente.jpg` })).toMatchObject({ ok: true });
  });

  it("N: aluno ruim → missing_userId; mês ruim → mes_invalido; tipo ruim → tipo_invalido", () => {
    for (const userId of [undefined, null, "", "abc", 42, `${ALUNO}/..`]) {
      expect(lerPedidoDeFoto({ userId, mes: "2026-10", tipo: "frente" }), String(userId)).toEqual({ ok: false, erro: "missing_userId" });
    }
    expect(lerPedidoDeFoto({ userId: ALUNO, mes: "2026-13", tipo: "frente" })).toEqual({ ok: false, erro: "mes_invalido" });
    expect(lerPedidoDeFoto({ userId: ALUNO, mes: "../2026-10", tipo: "frente" })).toEqual({ ok: false, erro: "mes_invalido" });
    expect(lerPedidoDeFoto({ userId: ALUNO, mes: "2026-10", tipo: "../../x" })).toEqual({ ok: false, erro: "tipo_invalido" });
    expect(lerPedidoDeFoto({ userId: ALUNO, mes: "2026-10" })).toEqual({ ok: false, erro: "tipo_invalido" });
    for (const corpo of [null, undefined, [], "x"]) expect(lerPedidoDeFoto(corpo), String(corpo)).toEqual({ ok: false, erro: "missing_userId" });
  });

  it("N9: o salvar com o caminho de OUTRO aluno, outro mês, outro tipo ou outra pasta → forbidden", () => {
    const base = { userId: ALUNO, mes: "2026-10", tipo: "frente" };
    for (const caminho of [
      `${OUTRO}/2026-10/frente.jpg`, `${ALUNO}/2026-09/frente.jpg`, `${ALUNO}/2026-10/costas.jpg`, `${ALUNO}/2026-10/frente.png`,
      `${ALUNO}/../${OUTRO}/2026-10/frente.jpg`, `outra-pasta/${ALUNO}/2026-10/frente.jpg`, "", 42,
    ]) {
      expect(lerPedidoDeFoto({ ...base, caminho }), String(caminho)).toEqual({ ok: false, erro: "forbidden" });
    }
  });

  it("excluir: o id da linha (uuid); o caminho NUNCA vem do corpo", () => {
    expect(lerExclusaoDeFoto({ fotoId: FOTO.toUpperCase(), caminho: `${OUTRO}/2026-10/frente.jpg` })).toEqual({ ok: true, fotoId: FOTO });
    for (const fotoId of [undefined, null, "", "x", 1]) expect(lerExclusaoDeFoto({ fotoId }), String(fotoId)).toEqual({ ok: false, erro: "missing_fotoId" });
    expect(lerExclusaoDeFoto(null)).toEqual({ ok: false, erro: "missing_fotoId" });
  });
});

describe("os erros: o código que a tela entende e o status", () => {
  it("STATUS: forbidden 403, arquivo_ausente 404, os de forma 400, internal e o desconhecido 500", () => {
    expect(statusDaFoto("forbidden")).toBe(403);
    expect(statusDaFoto("arquivo_ausente")).toBe(404);
    for (const c of ["missing_userId", "missing_fotoId", "mes_invalido", "tipo_invalido", "schema_invalido", "invalid_action"]) expect(statusDaFoto(c), c).toBe(400);
    expect(statusDaFoto("internal")).toBe(500);
    expect(statusDaFoto("qualquer_coisa")).toBe(500);
    expect(Object.keys(STATUS_FOTO).length).toBe(9);
  });

  it("Storage como a pessoa: a policy recusou (403 / statusCode 403 / RLS) → forbidden; o resto → internal", () => {
    expect(erroDoStorage({ status: 400, statusCode: "403", message: "new row violates row-level security policy" })).toBe("forbidden");
    expect(erroDoStorage({ status: 403, message: "Unauthorized" })).toBe("forbidden");
    expect(erroDoStorage({ message: "new row violates row-level security policy for table \"objects\"" })).toBe("forbidden");
    for (const e of [{ status: 500, statusCode: "500", message: "internal" }, { status: 404, message: "Bucket not found" }, { name: "TimeoutError" }, null, "x"]) {
      expect(erroDoStorage(e), JSON.stringify(e)).toBe("internal");
    }
  });

  it("banco como a pessoa: 42501 (RLS) → forbidden; o resto → internal; o tempo esgotado é reconhecido (para o log)", () => {
    expect(erroDoBanco({ code: "42501", message: "new row violates row-level security policy" })).toBe("forbidden");
    for (const e of [{ code: "23505" }, { code: "22008" }, { code: "" , message: "TimeoutError: signal timed out" }, null]) expect(erroDoBanco(e), JSON.stringify(e)).toBe("internal");
    expect(foiTempo({ code: "", message: "TimeoutError: signal timed out" })).toBe(true);
    expect(foiTempo({ name: "AbortError" })).toBe(true);
    expect(foiTempo({ code: "42501", message: "new row violates" })).toBe(false);
    expect(foiTempo(null)).toBe(false);
  });
});
