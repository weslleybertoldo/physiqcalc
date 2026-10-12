import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACOES_DE_ANTES, ACOES_DE_LEITURA, ACOES_FOTO, ACOES_QUE_GRAVAM, COLUNAS_AVALIACOES_EVOLUCAO, COLUNAS_FOTOS_EVOLUCAO, COLUNAS_PERFIL_EVOLUCAO,
  FREIO_EVOLUCAO_POR_MINUTO, MAX_AVALIACOES_EVOLUCAO, MAX_FOTOS_EVOLUCAO, STATUS_FOTO, TIPOS_FOTO, VALIDADE_URL_EVOLUCAO_S, assinaturaRelativa,
  bucketDosRegistros, caminhoDaFotoMensal, caminhoDoAluno, caminhosDasFotos, criarFreio, ehAcaoDeLeitura, ehAcaoFoto, ehTipoFoto, erroDoBanco,
  erroDoStorage, foiTempo, lerExclusaoDeFoto, lerPedidoDeFoto, mesRef, mesValido, parteDaEvolucao, schemaDaFoto, statusDaFoto, urlsAssinadas,
} from "../../supabase/functions/admin-avaliacoes/regras";
import {
  assinaturaRelativa as assinaturaDoPrincipal, urlsAssinadas as urlsDoPrincipal,
} from "../../supabase-principal/functions/_shared/leitura-lote";
import { DOBRA_KEYS } from "./avaliacao";
import { MEDIDAS } from "@/evolucao/serie";
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

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// hml-20a (H-42 · jeito 2, etapa 2 · decisão 14) — a Evolução do PRÓPRIO aluno pela admin-avaliacoes (ação minha_evolucao, antes do
// requireAdmin): leitura (fora das que gravam), colunas fechadas iguais às da tela, as 200 mais novas, o dono = o sub do token (nada do
// corpo vira filtro), a URL assinada só dos caminhos lidos e relativa, e o freio por pessoa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ler = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf-8");

/** As colunas da tabela no tipo gerado do Treino (src/integrations/supabase/types.ts, o Row). */
function colunasDoTipo(tabela: string): string[] {
  const fonte = ler("src/integrations/supabase/types.ts");
  const inicio = fonte.indexOf(`      ${tabela}: {\n        Row: {`);
  expect(inicio, tabela).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n        }", inicio + 10);
  return [...fonte.slice(inicio, fim).matchAll(/^ {10}([a-z0-9_]+)\??:/gm)].map((m) => m[1]);
}

describe("hml-20a: minha_evolucao é LEITURA (antes do requireAdmin; fora das que gravam)", () => {
  it("ACOES_DE_LEITURA = minha_evolucao; não está em ACOES_QUE_GRAVAM; as de antes e as da foto não mudaram", () => {
    expect([...ACOES_DE_LEITURA]).toEqual(["minha_evolucao"]);
    expect(ACOES_QUE_GRAVAM.has("minha_evolucao")).toBe(false);
    expect([...ACOES_DE_ANTES]).toEqual(["list", "create", "update", "proxima", "delete"]);
    expect([...ACOES_QUE_GRAVAM].sort()).toEqual(["create", "delete", "foto_excluir", "foto_preparar", "foto_salvar", "proxima", "update"]);
    expect(ehAcaoDeLeitura("minha_evolucao")).toBe(true);
    for (const a of [...ACOES_DE_ANTES, ...ACOES_FOTO, "MINHA_EVOLUCAO", "minha_evolucao ", "", null, undefined, {}]) expect(ehAcaoDeLeitura(a), String(a)).toBe(false);
  });
});

describe("hml-20a: as colunas em lista fechada (as mesmas que a tela usa hoje; nenhum '*')", () => {
  it("o perfil: as 37 colunas de hoje (a composição atual), todas no tipo do Treino", () => {
    expect([...COLUNAS_PERFIL_EVOLUCAO]).toEqual([
      "id", "sexo", "idade", "peso", "altura", "metodo_avaliacao", "percentual_gordura", "massa_gorda", "massa_magra",
      "massa_muscular", "agua_corporal", "gordura_visceral", "tmb_mifflin", "tmb_katch", "tmb_balanca", "tmb_metodo",
      "dobra_1", "dobra_2", "dobra_3", "dobra_4", "dobra_5", "dobra_6", "dobra_7",
      "medida_pescoco", "medida_ombro", "medida_peitoral", "medida_cintura", "medida_abdomen", "medida_quadril",
      "medida_braco_d", "medida_braco_e", "medida_antebraco_d", "medida_antebraco_e", "medida_coxa_d", "medida_coxa_e",
      "medida_panturrilha_d", "medida_panturrilha_e",
    ]);
    expect(COLUNAS_PERFIL_EVOLUCAO).toHaveLength(37);
    const tipo = colunasDoTipo("physiq_profiles");
    for (const c of COLUNAS_PERFIL_EVOLUCAO) expect(tipo, c).toContain(c);
  });

  it("as avaliações: tudo o que a série lê (medidas, dobras, TMBs, composição, data, criação, observação) — e nada além (sem user_id/created_by)", () => {
    const usadas = [
      "id", "data_avaliacao", "created_at", "metodo_avaliacao", "peso", "altura", "percentual_gordura", "massa_gorda", "massa_magra",
      "massa_muscular", "agua_corporal", "gordura_visceral", "tmb_mifflin", "tmb_katch", "tmb_balanca", "tmb_metodo", "observacao",
      ...DOBRA_KEYS, ...MEDIDAS.map((m) => m.chave),
    ];
    expect([...COLUNAS_AVALIACOES_EVOLUCAO].sort()).toEqual([...new Set(usadas)].sort());
    const tipo = colunasDoTipo("physiq_avaliacoes");
    for (const c of COLUNAS_AVALIACOES_EVOLUCAO) expect(tipo, c).toContain(c);
    for (const fora of ["user_id", "created_by", "*"]) expect(COLUNAS_AVALIACOES_EVOLUCAO as readonly string[]).not.toContain(fora);
  });

  it("as fotos mensais: as 5 de hoje; os tetos e a validade de hoje (200, 200, 1 h); o freio 60/min", () => {
    expect([...COLUNAS_FOTOS_EVOLUCAO]).toEqual(["id", "mes_ref", "tipo", "storage_path", "created_at"]);
    const tipo = colunasDoTipo("physiq_registros_fotos");
    for (const c of COLUNAS_FOTOS_EVOLUCAO) expect(tipo, c).toContain(c);
    expect([MAX_AVALIACOES_EVOLUCAO, MAX_FOTOS_EVOLUCAO, VALIDADE_URL_EVOLUCAO_S, FREIO_EVOLUCAO_POR_MINUTO]).toEqual([200, 200, 3600, 60]);
  });
});

describe("hml-20a: a resposta (a ParteTreino de hoje) e a URL só dos caminhos lidos", () => {
  const FOTOS = [
    { id: "f1", mes_ref: "2026-10-01", tipo: "frente", storage_path: `${ALUNO}/2026-10/frente.jpg`, created_at: "x" },
    { id: "f2", mes_ref: "2026-09-01", tipo: "costas", storage_path: `${ALUNO}/2026-09/costas.jpg`, created_at: "y" },
  ];
  const assinada = (bucket: string, p: string) => `https://uxwp.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=t`;

  it("as avaliações voltam em ordem CRESCENTE (a consulta traz as mais novas primeiro); o perfil ausente → null; a foto com a url relativa", () => {
    const urls = urlsAssinadas(caminhosDasFotos(FOTOS), [{ path: FOTOS[0].storage_path, error: null, signedUrl: assinada("registros-staging", FOTOS[0].storage_path) }], "registros-staging");
    const r = parteDaEvolucao(null, [{ id: "a3" }, { id: "a2" }, { id: "a1" }], FOTOS, urls);
    expect(r.perfil).toBeNull();
    expect(r.avaliacoes).toEqual([{ id: "a1" }, { id: "a2" }, { id: "a3" }]);
    expect(r.fotos).toEqual([
      { ...FOTOS[0], url: `/storage/v1/object/sign/registros-staging/${FOTOS[0].storage_path}?token=t` },
      { ...FOTOS[1], url: null },
    ]);
    expect(parteDaEvolucao({ id: "t1", peso: 80 }, null, null, new Map())).toEqual({ perfil: { id: "t1", peso: 80 }, avaliacoes: [], fotos: [] });
    expect(parteDaEvolucao([{ id: "t1" }], [], [], new Map()).perfil).toBeNull();
  });

  it("N8: só os caminhos que a consulta leu são assinados; o que o Storage devolver a mais é ignorado; outro bucket não vale", () => {
    expect(caminhosDasFotos([...FOTOS, FOTOS[0], { storage_path: "" }, { storage_path: 3 }, null])).toEqual([FOTOS[0].storage_path, FOTOS[1].storage_path]);
    const resposta = [
      { path: FOTOS[0].storage_path, error: null, signedUrl: assinada("registros", FOTOS[0].storage_path) },
      { path: `${OUTRO}/2026-10/frente.jpg`, error: null, signedUrl: assinada("registros", `${OUTRO}/2026-10/frente.jpg`) },
      { path: FOTOS[1].storage_path, error: "Object not found", signedUrl: null },
    ];
    const urls = urlsAssinadas([FOTOS[0].storage_path, FOTOS[1].storage_path], resposta, "registros");
    expect([...urls.keys()]).toEqual([FOTOS[0].storage_path]);
    expect(assinaturaRelativa(assinada("anexos", "a.jpg"), "registros")).toBeNull();
    // as mesmas regras do motor do principal (_shared/leitura-lote.ts — o Treino não importa o _shared de lá)
    expect(urlsDoPrincipal([FOTOS[0].storage_path, FOTOS[1].storage_path], resposta, "registros")).toEqual(urls);
    for (const u of [assinada("registros", "a/b.jpg"), "https://x/storage/v1/object/upload/sign/registros/a.jpg", null, 3]) {
      expect(assinaturaRelativa(u, "registros"), String(u)).toBe(assinaturaDoPrincipal(u, "registros"));
    }
  });

  it("o freio por pessoa: 60 no minuto passam, o 61º não; outra pessoa (ou outro schema) não divide a janela; depois de 1 min volta", () => {
    const freio = criarFreio(60, 60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 60; i++) expect(freio(`staging:${ALUNO}`, t0 + i)).toBe(true);
    expect(freio(`staging:${ALUNO}`, t0 + 100)).toBe(false);
    expect(freio(`staging:${OUTRO}`, t0 + 100)).toBe(true);
    expect(freio(`public:${ALUNO}`, t0 + 100)).toBe(true);
    expect(freio(`staging:${ALUNO}`, t0 + 60_000 + 60)).toBe(true);
  });
});

describe("hml-20a: o bloco da minha_evolucao no index.ts (como a pessoa, o dono = sub, antes do requireAdmin)", () => {
  const fonte = ler("supabase/functions/admin-avaliacoes/index.ts");
  const inicio = fonte.indexOf("hml-20a (H-42 · jeito 2, etapa 2 · decisão 14)");
  const fim = fonte.indexOf("Deno.serve(");
  const bloco = fonte.slice(inicio, fim);

  it("sem chave secreta; JWKS; o cliente da pessoa; as 3 consultas com o dono = sub e as colunas fechadas; nada do corpo", () => {
    expect(inicio).toBeGreaterThan(0);
    expect(fim).toBeGreaterThan(inicio);
    expect(bloco).not.toMatch(/SERVICE_ROLE|service_role|checkRateLimit|requireAdmin\(/);
    expect(bloco).toMatch(/schemaDaFoto\(req\.headers\.get\("x-schema"\)\)/);
    expect(bloco).toMatch(/usuarioDoToken\(/);
    expect(bloco).toMatch(/clienteDaPessoa\(auth, prazo\(ORCAMENTO_MS\.usuario\)\)/);
    expect(bloco).toMatch(/from\("physiq_profiles"\)\.select\(COLUNAS_PERFIL_EVOLUCAO\.join\(", "\)\)\.eq\("id", sub\)/);
    expect(bloco).toMatch(/from\("physiq_avaliacoes"\)\.select\(COLUNAS_AVALIACOES_EVOLUCAO\.join\(", "\)\)\.eq\("user_id", sub\)/);
    expect(bloco).toMatch(/from\("physiq_registros_fotos"\)\.select\(COLUNAS_FOTOS_EVOLUCAO\.join\(", "\)\)\.eq\("user_id", sub\)/);
    expect(bloco).toMatch(/\.limit\(MAX_AVALIACOES_EVOLUCAO\)/);
    expect(bloco).toMatch(/\.limit\(MAX_FOTOS_EVOLUCAO\)/);
    expect(bloco).toMatch(/createSignedUrls\(caminhos, VALIDADE_URL_EVOLUCAO_S\)/);
    expect(bloco).not.toMatch(/select\(\s*["'`]\*/);
    // a função da ação nem recebe o corpo: nenhum id do corpo vira filtro
    expect(bloco).toMatch(/async function atenderMinhaEvolucao\(req: Request, origin: string \| null\)/);
    const codigo = bloco.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(codigo).not.toMatch(/\bbody\b|\bcorpo\b/);
  });

  it("no Deno.serve, a minha_evolucao é despachada ANTES do requireAdmin (e as de antes seguem pelo caminho de antes)", () => {
    const serve = fonte.slice(fim);
    const gancho = serve.indexOf("if (corpoOk && ehAcaoDeLeitura(body?.action)) return await atenderMinhaEvolucao(req, origin);");
    expect(gancho).toBeGreaterThan(0);
    expect(gancho).toBeLessThan(serve.indexOf("requireAdmin(req,"));
    expect(gancho).toBeLessThan(serve.indexOf("const foto = corpoOk && ehAcaoFoto(body?.action);"));
  });
});
