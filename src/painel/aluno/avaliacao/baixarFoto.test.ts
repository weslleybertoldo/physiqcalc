import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
import { extensaoDoCaminho, nomeArquivoFoto, textoDaFoto, urlDeDownload } from "./baixarFoto";

describe("H5 — N-34: Ver e Baixar a foto de progresso no painel", () => {
  it("o nome do arquivo do Nutri (aluno-posição-data.ext), sem acento", () => {
    expect(nomeArquivoFoto("Rafael Moura", "Frente", "2026-09-30", "a/b/c-fisico1.jpg")).toBe("rafael-moura-frente-2026-09-30.jpg");
    expect(nomeArquivoFoto("Ana Lúcia Ávila", "Lado D", "2026-09", "x.PNG")).toBe("ana-lucia-avila-lado-d-2026-09.png");
    expect(nomeArquivoFoto("", "Costas", "2026-10-01", null)).toBe("aluno-costas-2026-10-01.jpg");
  });
  it("a extensão pelo caminho do Storage", () => {
    expect(extensaoDoCaminho("u/p/1-x.webp")).toBe("webp");
    expect(extensaoDoCaminho("u/p/1-x.jpeg?token=1")).toBe("jpg");
    expect(extensaoDoCaminho("u/p/sem-ext")).toBe("jpg");
  });
  it("a URL assinada ganha o pedido de download (o Storage manda baixar)", () => {
    const u = urlDeDownload("https://api-principal.physiqcalc.com.br/storage/v1/object/sign/evolucao/a.jpg?token=abc", "rafael-moura-frente-2026-09-30.jpg");
    expect(u).toContain("token=abc");
    expect(new URL(u).searchParams.get("download")).toBe("rafael-moura-frente-2026-09-30.jpg");
  });
  it("o título da foto: a data (a do personal é do mês)", () => {
    expect(textoDaFoto({ posicao: "frente", data: "2026-09-30", mensal: false })).toBe("Frente · 30/09/2026");
    expect(textoDaFoto({ posicao: "costas", data: "2026-09-01", mensal: true })).toBe("Costas · 09/2026");
  });
});
