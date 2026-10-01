// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/evolucaoUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  ACCEPT_FOTO, FOTO_TAMANHO_MAX, OBSERVACAO_FOTO_MAX, POSICOES, agruparPorData, datasDisponiveis, diasEntre, ehDataISO, ehPosicao, formDaFoto, formInicialFoto,
  formatarDataFoto, fotosDaData, fotosOrdenadasDaData, inserirFoto, lerPosicao, nomeArquivoFoto, normalizarObservacao, ordenarFotos, paresComparacao, podeComparar,
  rotuloPosicao, slotsVazios, sugerirDatasComparacao, textoContagemDatas, textoContagemFotos, textoDias, textoFoto, validarFoto, validarImagem,
} from "./evolucaoUtil";

const foto = (id: string, posicao: string, data: string, created_at: string) => ({ id, posicao, data, created_at });
// 3 fotos em 20/08 (frente repetida: a `d` é mais nova que a `a`) e 1 em 19/09
const LISTA = [
  foto("a", "frente", "2026-08-20", "2026-08-20T10:00:00+00:00"),
  foto("b", "costas", "2026-08-20", "2026-08-20T10:05:00+00:00"),
  foto("c", "frente", "2026-09-19", "2026-09-19T09:00:00+00:00"),
  foto("d", "frente", "2026-08-20", "2026-08-20T11:00:00+00:00"),
];
const HOJE = "2026-09-19";

describe("posições", () => {
  it("POSICOES na ordem frente, costas, lado direito, lado esquerdo", () => {
    expect(POSICOES.map((p) => p.valor)).toEqual(["frente", "costas", "lado_d", "lado_e"]);
    expect(POSICOES.map((p) => p.rotulo)).toEqual(["Frente", "Costas", "Lado direito", "Lado esquerdo"]);
  });
  it("ehPosicao / lerPosicao / rotuloPosicao", () => {
    expect(ehPosicao("lado_d")).toBe(true);
    expect(ehPosicao("lado")).toBe(false);
    expect(ehPosicao(null)).toBe(false);
    expect(lerPosicao("costas")).toBe("costas");
    expect(lerPosicao("x")).toBe("frente");
    expect(lerPosicao(undefined, "lado_e")).toBe("lado_e");
    expect(rotuloPosicao("lado_e")).toBe("Lado esquerdo");
    expect(rotuloPosicao("nada")).toBe("");
  });
});

describe("validação da imagem", () => {
  it("aceita JPG/PNG/WebP até 10 MB (sem type usa a extensão)", () => {
    expect(validarImagem({ name: "frente.jpg", size: 1000, type: "image/jpeg" })).toBeNull();
    expect(validarImagem({ name: "frente.PNG", size: 1000, type: "" })).toBeNull();
    expect(validarImagem({ name: "frente.webp", size: FOTO_TAMANHO_MAX, type: "image/webp" })).toBeNull();
    expect(ACCEPT_FOTO).toContain("image/jpeg");
    expect(ACCEPT_FOTO).toContain(".webp");
  });
  it("recusa GIF/HEIC/PDF, acima de 10 MB, vazio e sem nome", () => {
    expect(validarImagem({ name: "anim.gif", size: 10, type: "image/gif" })).toBe("Use uma imagem JPG, PNG ou WebP");
    expect(validarImagem({ name: "foto.heic", size: 10, type: "image/heic" })).toBe("Use uma imagem JPG, PNG ou WebP");
    expect(validarImagem({ name: "laudo.pdf", size: 10, type: "application/pdf" })).toBe("Use uma imagem JPG, PNG ou WebP");
    expect(validarImagem({ name: "grande.jpg", size: FOTO_TAMANHO_MAX + 1, type: "image/jpeg" })).toBe("Imagem acima de 10 MB");
    expect(validarImagem({ name: "vazia.jpg", size: 0, type: "image/jpeg" })).toBe("Arquivo vazio");
    expect(validarImagem({ name: "  ", size: 10, type: "image/jpeg" })).toBe("Arquivo sem nome");
  });
});

describe("formulário", () => {
  it("ehDataISO só aceita yyyy-MM-dd que existe", () => {
    expect(ehDataISO("2026-09-19")).toBe(true);
    expect(ehDataISO("2026-02-30")).toBe(false);
    expect(ehDataISO("19/09/2026")).toBe(false);
    expect(ehDataISO("")).toBe(false);
    expect(ehDataISO(null)).toBe(false);
  });
  it("formInicialFoto: sugestão do slot quando válida; senão frente + hoje", () => {
    expect(formInicialFoto(HOJE)).toEqual({ posicao: "frente", data: HOJE, observacao: "" });
    expect(formInicialFoto(HOJE, "costas", "2026-08-20")).toEqual({ posicao: "costas", data: "2026-08-20", observacao: "" });
    expect(formInicialFoto(HOJE, null, "2026-13-01")).toEqual({ posicao: "frente", data: HOJE, observacao: "" });
  });
  it("formDaFoto e normalizarObservacao", () => {
    expect(formDaFoto({ posicao: "lado_d", data: "2026-08-20", observacao: null })).toEqual({ posicao: "lado_d", data: "2026-08-20", observacao: "" });
    expect(formDaFoto({ posicao: "x", data: "2026-08-20", observacao: " Início " })).toEqual({ posicao: "frente", data: "2026-08-20", observacao: " Início " });
    expect(normalizarObservacao("  Início   do  acompanhamento ")).toBe("Início do acompanhamento");
    expect(normalizarObservacao(null)).toBe("");
  });
  it("validarFoto: posição, data válida não futura, observação até 300", () => {
    expect(validarFoto({ posicao: "frente", data: HOJE, observacao: "" }, HOJE)).toBeNull();
    expect(validarFoto({ posicao: "frente", data: "2026-08-20", observacao: "x".repeat(OBSERVACAO_FOTO_MAX) }, HOJE)).toBeNull();
    expect(validarFoto({ posicao: "lado" as never, data: HOJE, observacao: "" }, HOJE)).toBe("Escolha a posição da foto");
    expect(validarFoto({ posicao: "frente", data: "2026-02-30", observacao: "" }, HOJE)).toBe("Data inválida");
    expect(validarFoto({ posicao: "frente", data: "", observacao: "" }, HOJE)).toBe("Data inválida");
    expect(validarFoto({ posicao: "frente", data: "2026-09-20", observacao: "" }, HOJE)).toBe("A data não pode ser futura");
    expect(validarFoto({ posicao: "frente", data: HOJE, observacao: "x".repeat(OBSERVACAO_FOTO_MAX + 1) }, HOJE)).toBe("Observação acima de 300 caracteres");
  });
});

describe("lista e grade", () => {
  it("ordenarFotos: data desc, depois created_at desc; inserirFoto substitui pelo id", () => {
    expect(ordenarFotos(LISTA).map((f) => f.id)).toEqual(["c", "d", "b", "a"]);
    const nova = foto("a", "frente", "2026-09-19", "2026-09-19T10:00:00+00:00");
    expect(inserirFoto(LISTA, nova).map((f) => f.id)).toEqual(["a", "c", "d", "b"]);
    expect(inserirFoto([], nova)).toEqual([nova]);
  });
  it("agruparPorData: 1 grupo por data, mais recente primeiro; a mais nova ocupa o slot e a repetida vai pra extras", () => {
    const grupos = agruparPorData(LISTA);
    expect(grupos.map((g) => g.data)).toEqual(["2026-09-19", "2026-08-20"]);
    expect(grupos[0].n).toBe(1);
    expect(grupos[0].porPosicao.frente?.id).toBe("c");
    expect(grupos[0].porPosicao.costas).toBeNull();
    expect(grupos[1].n).toBe(3);
    expect(grupos[1].porPosicao.frente?.id).toBe("d");
    expect(grupos[1].porPosicao.costas?.id).toBe("b");
    expect(grupos[1].porPosicao.lado_d).toBeNull();
    expect(grupos[1].porPosicao.lado_e).toBeNull();
    expect(grupos[1].extras.map((f) => f.id)).toEqual(["a"]);
    expect(agruparPorData([])).toEqual([]);
  });
  it("datasDisponiveis / fotosDaData / fotosOrdenadasDaData / slotsVazios", () => {
    expect(datasDisponiveis(LISTA)).toEqual(["2026-09-19", "2026-08-20"]);
    expect(datasDisponiveis([])).toEqual([]);
    const ago = fotosDaData(LISTA, "2026-08-20");
    expect(ago.frente?.id).toBe("d");
    expect(ago.costas?.id).toBe("b");
    expect(slotsVazios(ago)).toEqual(["lado_d", "lado_e"]);
    expect(slotsVazios(fotosDaData(LISTA, "2030-01-01"))).toEqual(["frente", "costas", "lado_d", "lado_e"]);
    expect(fotosOrdenadasDaData(LISTA, "2026-08-20").map((f) => f.id)).toEqual(["d", "b", "a"]);
    expect(fotosOrdenadasDaData(LISTA, "2030-01-01")).toEqual([]);
  });
});

describe("comparação", () => {
  it("paresComparacao: 4 posições com A e B (vazio → null)", () => {
    const pares = paresComparacao(LISTA, "2026-08-20", "2026-09-19");
    expect(pares.map((p) => p.posicao)).toEqual(["frente", "costas", "lado_d", "lado_e"]);
    expect(pares[0].a?.id).toBe("d");
    expect(pares[0].b?.id).toBe("c");
    expect(pares[1].a?.id).toBe("b");
    expect(pares[1].b).toBeNull();
    expect(pares[2].a).toBeNull();
    expect(pares[3].b).toBeNull();
  });
  it("diasEntre: dias de calendário, simétrico, inválida → 0", () => {
    expect(diasEntre("2026-08-20", "2026-09-19")).toBe(30);
    expect(diasEntre("2026-09-19", "2026-08-20")).toBe(30);
    expect(diasEntre("2026-09-19", "2026-09-19")).toBe(0);
    expect(diasEntre("2026-09-19", "2026-09-20")).toBe(1);
    expect(diasEntre("", "2026-09-19")).toBe(0);
  });
  it("sugerirDatasComparacao: A = mais antiga, B = mais recente; 1 data → A = B; vazio → null; podeComparar", () => {
    expect(sugerirDatasComparacao(LISTA)).toEqual({ a: "2026-08-20", b: "2026-09-19" });
    expect(sugerirDatasComparacao([LISTA[2]])).toEqual({ a: "2026-09-19", b: "2026-09-19" });
    expect(sugerirDatasComparacao([])).toBeNull();
    expect(podeComparar(LISTA)).toBe(true);
    expect(podeComparar([LISTA[0], LISTA[1]])).toBe(false);
    expect(podeComparar([])).toBe(false);
  });
});

describe("textos e nome do download", () => {
  it("formatarDataFoto (data-só, sem deslocar o dia) e textos", () => {
    expect(formatarDataFoto("2026-09-19")).toBe("19/09/2026");
    expect(formatarDataFoto("2026-01-01")).toBe("01/01/2026");
    expect(formatarDataFoto("x")).toBe("x");
    expect(formatarDataFoto(null)).toBe("");
    expect(textoContagemFotos(0)).toBe("Nenhuma foto");
    expect(textoContagemFotos(1)).toBe("1 foto");
    expect(textoContagemFotos(3)).toBe("3 fotos");
    expect(textoContagemDatas(1)).toBe("1 data");
    expect(textoContagemDatas(2)).toBe("2 datas");
    expect(textoDias(0)).toBe("0 dias entre as datas");
    expect(textoDias(1)).toBe("1 dia entre as datas");
    expect(textoDias(30)).toBe("30 dias entre as datas");
    expect(textoFoto({ posicao: "lado_d", data: "2026-09-19" })).toBe("Lado direito · 19/09/2026");
  });
  it("nomeArquivoFoto: paciente seguro + posição + data + extensão pelo MIME", () => {
    expect(nomeArquivoFoto("Maria Silva", "frente", "2026-09-19", "image/jpeg")).toBe("maria-silva-frente-2026-09-19.jpg");
    expect(nomeArquivoFoto("João", "costas", "2026-08-20", "image/png")).toBe("joao-costas-2026-08-20.png");
    expect(nomeArquivoFoto("Ana", "lado_e", "2026-08-20", "image/webp")).toBe("ana-lado_e-2026-08-20.webp");
    expect(nomeArquivoFoto("", "lado_d", "2026-08-20", null)).toBe("paciente-lado_d-2026-08-20.jpg");
  });
});
