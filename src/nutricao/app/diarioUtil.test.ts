import { describe, expect, it } from "vitest";
import {
  FOTO_TAMANHO_MAX, REACOES, REFEICOES, agoraLocal, dataHoraLocalParaIso, diaSP, ehReacao, ehRefeicao, extensaoDoMime, isoParaDataHoraLocal, mimeDaFotoDiario,
  nomeObjeto, ordenarRegistros, refeicaoSugerida, registroDaRefeicao, rotuloReacao, rotuloRefeicao, textoErroRpc, textoItemPublico, textoReacao,
  tipoDaRefeicaoDoPlano, tomReacao, validarArquivoDiario, validarEnvio,
} from "./diarioUtil";

// Porta dos testes do src/lib/diarioUtil.test.ts do PhysiqNutri (a parte do paciente) + a foto da refeição (P29) e a reação sem emoji.
const iso = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m - 1, d, h, mi).toISOString();

describe("refeições do diário", () => {
  it("sugere pela hora do dia", () => {
    expect(refeicaoSugerida(7)).toBe("cafe_manha");
    expect(refeicaoSugerida(9)).toBe("lanche_manha");
    expect(refeicaoSugerida(12)).toBe("almoco");
    expect(refeicaoSugerida(16)).toBe("lanche_tarde");
    expect(refeicaoSugerida(19)).toBe("jantar");
    expect(refeicaoSugerida(22)).toBe("ceia");
    expect(refeicaoSugerida(3)).toBe("outro");
  });
  it("rótulos e validação", () => {
    expect(REFEICOES).toHaveLength(7);
    expect(rotuloRefeicao("cafe_manha")).toBe("Café da manhã");
    expect(rotuloRefeicao("x")).toBe("");
    expect(ehRefeicao("ceia")).toBe(true);
    expect(ehRefeicao("brunch")).toBe(false);
  });
  it("P29: a refeição do plano → o tipo do registro do diário (pelo nome; sem nome conhecido, pela hora)", () => {
    expect(tipoDaRefeicaoDoPlano("Café da manhã", "07:00:00")).toBe("cafe_manha");
    expect(tipoDaRefeicaoDoPlano("Lanche da manhã", "10:00")).toBe("lanche_manha");
    expect(tipoDaRefeicaoDoPlano("Almoço", "13:00")).toBe("almoco");
    expect(tipoDaRefeicaoDoPlano("Lanche da tarde", "16:00")).toBe("lanche_tarde");
    expect(tipoDaRefeicaoDoPlano("Lanche", "10:30")).toBe("lanche_manha");
    expect(tipoDaRefeicaoDoPlano("Lanche", "15:30")).toBe("lanche_tarde");
    expect(tipoDaRefeicaoDoPlano("Jantar", "19:00")).toBe("jantar");
    expect(tipoDaRefeicaoDoPlano("Ceia", "22:00")).toBe("ceia");
    expect(tipoDaRefeicaoDoPlano("Pré-treino", "17:30")).toBe("lanche_tarde");
    expect(tipoDaRefeicaoDoPlano("Refeição livre", null)).toBe("outro");
  });
});

describe("reação da nutricionista (sem emoji — spec 4.9)", () => {
  it("rótulo, tom do chip e texto", () => {
    expect(REACOES.map((r) => r.valor)).toEqual(["otimo", "bom", "atencao", "evitar"]);
    expect(ehReacao("bom")).toBe(true);
    expect(rotuloReacao("atencao")).toBe("Atenção");
    expect(tomReacao("otimo")).toBe("n");
    expect(tomReacao("evitar")).toBe("r");
    expect(tomReacao("x")).toBe("g");
    expect(textoReacao({ reacao_nutri: "otimo", comentario_nutri: "Boa!" })).toBe("Ótimo — Boa!");
    expect(textoReacao({ reacao_nutri: "bom", comentario_nutri: "" })).toBe("Bom");
    expect(textoReacao({ reacao_nutri: null, comentario_nutri: "" })).toBe("aguardando a nutricionista");
    for (const r of REACOES) expect(textoReacao({ reacao_nutri: r.valor, comentario_nutri: "" })).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("arquivo e envio", () => {
  const foto = { name: "prato.jpg", size: 200_000, type: "image/jpeg" };
  it("MIME pelo tipo ou pela extensão (HEIC do Android sem tipo)", () => {
    expect(mimeDaFotoDiario(foto)).toBe("image/jpeg");
    expect(mimeDaFotoDiario({ name: "IMG_1.HEIC", size: 1, type: "" })).toBe("image/heic");
    expect(mimeDaFotoDiario({ name: "doc.pdf", size: 1, type: "application/pdf" })).toBe("");
    expect(extensaoDoMime("image/webp")).toBe("webp");
    expect(extensaoDoMime("x")).toBe("jpg");
  });
  it("caminho no bucket: <nutricionista>/<paciente>/<uuid>.<ext>", () => {
    expect(nomeObjeto("n1", "p1", "image/png", "11111111-2222-3333-4444-555555555555")).toBe("n1/p1/11111111-2222-3333-4444-555555555555.png");
  });
  it("validarEnvio: refeição, foto, tamanho, formato, comentário e data", () => {
    const agora = new Date(2026, 8, 30, 12, 0);
    const ok = { refeicao: "almoco", arquivo: foto, comentario: "", dataHoraIso: iso(2026, 9, 30, 11, 50) };
    expect(validarEnvio(ok, agora)).toBeNull();
    expect(validarEnvio({ ...ok, refeicao: "x" }, agora)).toMatch(/refeição/);
    expect(validarEnvio({ ...ok, arquivo: null }, agora)).toMatch(/foto/);
    expect(validarEnvio({ ...ok, arquivo: { ...foto, size: 0 } }, agora)).toMatch(/vazia/);
    expect(validarEnvio({ ...ok, arquivo: { ...foto, size: FOTO_TAMANHO_MAX + 1 } }, agora)).toMatch(/10 MB/);
    expect(validarEnvio({ ...ok, arquivo: { name: "a.gif", size: 10, type: "image/gif" } }, agora)).toMatch(/Formato/);
    expect(validarEnvio({ ...ok, comentario: "x".repeat(501) }, agora)).toMatch(/500/);
    expect(validarEnvio({ ...ok, dataHoraIso: "" }, agora)).toMatch(/inválidas/);
    expect(validarEnvio({ ...ok, dataHoraIso: iso(2026, 9, 30, 13, 0) }, agora)).toMatch(/futuro/);
    expect(validarArquivoDiario(foto)).toBeNull();
  });
  it("erros da função em texto para o aluno", () => {
    expect(textoErroRpc(new Error("codigo_invalido"))).toMatch(/não está liberado/);
    expect(textoErroRpc(new Error("muitos_envios"))).toMatch(/Muitos envios/);
    expect(textoErroRpc(new Error("path_invalido"))).toMatch(/não subiu/);
    expect(textoErroRpc(new Error("new row violates row-level security policy"))).toMatch(/não está liberado/);
    expect(textoErroRpc(new Error("Failed to fetch"))).toMatch(/Sem conexão/);
    expect(textoErroRpc(new Error("?"))).toBe("Não foi possível enviar a foto. Tente de novo.");
  });
  it("datetime-local ⇄ ISO", () => {
    const d = new Date(2026, 8, 20, 12, 40);
    expect(isoParaDataHoraLocal(d)).toBe("2026-09-20T12:40");
    expect(dataHoraLocalParaIso("2026-09-20T12:40")).toBe(d.toISOString());
    expect(dataHoraLocalParaIso("x")).toBe("");
    expect(agoraLocal(d)).toBe("2026-09-20T12:40");
  });
});

describe("lista e a foto da refeição (P29)", () => {
  const r = (id: string, data_hora: string, refeicao = "almoco") => ({ id, data_hora, refeicao });
  it("mais recente primeiro; texto do item", () => {
    const l = [r("a", "2026-09-29T15:00:00Z"), r("b", "2026-09-30T15:00:00Z"), r("c", "2026-09-30T15:00:00Z")];
    expect(ordenarRegistros(l).map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(textoItemPublico(r("x", iso(2026, 9, 20, 12, 40)))).toBe("dom 20/09 · 12:40 · Almoço");
  });
  it("o dia do registro é o de São Paulo (23:30 de SP = 02:30 UTC do dia seguinte)", () => {
    expect(diaSP("2026-10-01T02:30:00Z")).toBe("2026-09-30");
    expect(diaSP("2026-10-01T03:30:00Z")).toBe("2026-10-01");
  });
  it("a foto do dia com o mesmo tipo da refeição, a mais recente; outro dia ou outro tipo não", () => {
    const diario = [
      r("almoco-ontem", "2026-09-29T15:00:00Z"),
      r("almoco-cedo", "2026-09-30T14:00:00Z"),
      r("almoco-depois", "2026-09-30T15:30:00Z"),
      r("jantar", "2026-09-30T22:00:00Z", "jantar"),
    ];
    expect(registroDaRefeicao(diario, { nome: "Almoço", horario: "13:00" }, "2026-09-30")?.id).toBe("almoco-depois");
    expect(registroDaRefeicao(diario, { nome: "Jantar", horario: "19:00" }, "2026-09-30")?.id).toBe("jantar");
    expect(registroDaRefeicao(diario, { nome: "Café da manhã", horario: "07:00" }, "2026-09-30")).toBeNull();
    expect(registroDaRefeicao(diario, { nome: "Almoço", horario: "13:00" }, "2026-10-01")).toBeNull();
  });
});
