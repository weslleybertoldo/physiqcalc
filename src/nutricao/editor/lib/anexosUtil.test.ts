// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/anexosUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  ACCEPT_INPUT, TAMANHO_MAX, ehImagem, ehPdf, extensao, formatarTamanho, inserirAnexo, mimeDoArquivo, montarPath, nomeSeguro, normalizarDescricao,
  ordenarAnexos, podeVisualizar, rotuloTipo, textoContagemAnexos, tipoPorMime, totalBytes, validarArquivo,
} from "./anexosUtil";

describe("tamanho legível", () => {
  it("bytes, KB, MB, GB com vírgula", () => {
    expect(formatarTamanho(0)).toBe("0 B");
    expect(formatarTamanho(512)).toBe("512 B");
    expect(formatarTamanho(1023)).toBe("1023 B");
    expect(formatarTamanho(1024)).toBe("1,0 KB");
    expect(formatarTamanho(1536)).toBe("1,5 KB");
    expect(formatarTamanho(2411724)).toBe("2,3 MB");
    expect(formatarTamanho(1073741824)).toBe("1,0 GB");
  });
  it("valores inválidos viram 0 B", () => {
    expect(formatarTamanho(-5)).toBe("0 B");
    expect(formatarTamanho(null)).toBe("0 B");
    expect(formatarTamanho(Number.NaN)).toBe("0 B");
  });
});

describe("tipo, mime e extensão", () => {
  it("extensao", () => {
    expect(extensao("laudo.PDF")).toBe("pdf");
    expect(extensao("a.tar.gz")).toBe("gz");
    expect(extensao("semext")).toBe("");
    expect(extensao("")).toBe("");
  });
  it("mimeDoArquivo usa o do navegador e cai pra extensão", () => {
    expect(mimeDoArquivo("a.png", "image/png")).toBe("image/png");
    expect(mimeDoArquivo("Exame.PDF", "")).toBe("application/pdf");
    expect(mimeDoArquivo("planilha.xlsx", null)).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(mimeDoArquivo("coisa.bin", "")).toBe("");
  });
  it("tipoPorMime e rótulo", () => {
    expect(tipoPorMime("application/pdf")).toBe("pdf");
    expect(tipoPorMime("image/png")).toBe("imagem");
    expect(tipoPorMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("documento");
    expect(tipoPorMime("application/vnd.ms-excel")).toBe("planilha");
    expect(tipoPorMime("text/plain")).toBe("texto");
    expect(tipoPorMime("application/zip")).toBe("outro");
    expect(tipoPorMime("image/svg+xml")).toBe("imagem");
    expect(tipoPorMime(null)).toBe("outro");
    expect(rotuloTipo("application/pdf")).toBe("PDF");
    expect(rotuloTipo("image/jpeg")).toBe("Imagem");
    expect(rotuloTipo("application/zip")).toBe("Arquivo");
  });
  it("ehImagem / ehPdf / podeVisualizar", () => {
    expect(ehImagem("image/png")).toBe(true);
    expect(ehImagem("image/heic")).toBe(false);
    expect(ehImagem("application/pdf")).toBe(false);
    expect(ehPdf("application/pdf")).toBe(true);
    expect(podeVisualizar("application/pdf")).toBe(true);
    expect(podeVisualizar("image/webp")).toBe(true);
    expect(podeVisualizar("text/plain")).toBe(false);
  });
  it("ACCEPT_INPUT tem mimes e extensões", () => {
    expect(ACCEPT_INPUT).toContain("application/pdf");
    expect(ACCEPT_INPUT).toContain(".xlsx");
  });
});

describe("validarArquivo", () => {
  it("aceita os tipos permitidos até 20 MB", () => {
    expect(validarArquivo({ name: "laudo.pdf", size: 1500, type: "application/pdf" })).toBeNull();
    expect(validarArquivo({ name: "foto.png", size: 120, type: "image/png" })).toBeNull();
    expect(validarArquivo({ name: "texto.docx", size: 10, type: "" })).toBeNull(); // sem type → pela extensão
    expect(validarArquivo({ name: "grande.pdf", size: TAMANHO_MAX, type: "application/pdf" })).toBeNull();
  });
  it("recusa vazio, acima do limite e tipo proibido", () => {
    expect(validarArquivo({ name: "vazio.pdf", size: 0, type: "application/pdf" })).toBe("Arquivo vazio");
    expect(validarArquivo({ name: "grande.pdf", size: TAMANHO_MAX + 1, type: "application/pdf" })).toBe("Arquivo acima de 20 MB");
    expect(validarArquivo({ name: "programa.exe", size: 100, type: "application/x-msdownload" })).toMatch(/não permitido/);
    expect(validarArquivo({ name: "coisa.bin", size: 100, type: "" })).toMatch(/não permitido/);
    expect(validarArquivo({ name: "  ", size: 100, type: "application/pdf" })).toBe("Arquivo sem nome");
  });
});

describe("nome seguro e path", () => {
  it("nomeSeguro tira acento/espaço, minúsculo, mantém a extensão", () => {
    expect(nomeSeguro("Exame de Sangue (Setembro).PDF")).toBe("exame-de-sangue-setembro.pdf");
    expect(nomeSeguro("avaliação nutrição.png")).toBe("avaliacao-nutricao.png");
    expect(nomeSeguro("   ")).toBe("arquivo");
    expect(nomeSeguro("semext")).toBe("semext");
    expect(nomeSeguro("a".repeat(100) + ".pdf")).toBe("a".repeat(60) + ".pdf");
  });
  it("montarPath = nutri/paciente/uuid-nome", () => {
    expect(montarPath("nutri-1", "pac-2", "Foto.JPG", "uuid-3")).toBe("nutri-1/pac-2/uuid-3-foto.jpg");
    expect(montarPath("n", "p", "x.pdf")).toMatch(/^n\/p\/[0-9a-f-]{36}-x\.pdf$/);
  });
});

describe("lista, contagem e descrição", () => {
  const a = { id: "a", created_at: "2026-09-19T10:00:00Z", tamanho: 100 };
  const b = { id: "b", created_at: "2026-09-19T11:00:00Z", tamanho: 250 };
  it("ordenarAnexos mais recente primeiro; inserirAnexo substitui pelo id", () => {
    expect(ordenarAnexos([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
    expect(inserirAnexo([a], b).map((x) => x.id)).toEqual(["b", "a"]);
    expect(inserirAnexo([a, b], { ...a, tamanho: 999 }).find((x) => x.id === "a")?.tamanho).toBe(999);
    expect(inserirAnexo([a, b], { ...a, tamanho: 999 })).toHaveLength(2);
  });
  it("textoContagemAnexos e totalBytes", () => {
    expect(textoContagemAnexos(0)).toBe("Nenhum anexo");
    expect(textoContagemAnexos(1)).toBe("1 anexo");
    expect(textoContagemAnexos(3)).toBe("3 anexos");
    expect(totalBytes([a, b])).toBe(350);
    expect(totalBytes([])).toBe(0);
  });
  it("normalizarDescricao", () => {
    expect(normalizarDescricao("  exame   de   sangue  ")).toBe("exame de sangue");
    expect(normalizarDescricao(null)).toBe("");
    expect(normalizarDescricao("x".repeat(250))).toHaveLength(200);
  });
});
