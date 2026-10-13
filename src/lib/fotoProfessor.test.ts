import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: vi.fn() } }, DB_SCHEMA: "public" }));
import { BUCKET_FOTOS_PROFESSORES, validarFoto } from "./fotoProfessor";
import { TIPOS_DE_FOTO, FOTO_MAX_BYTES, caminhoDaFoto } from "../../supabase-principal/functions/_shared/conta-regras";

describe("fotoProfessor", () => {
  it("bucket do public", () => expect(BUCKET_FOTOS_PROFESSORES).toBe("fotos-professores"));
  it("aceita jpg/png/webp até 5 MB", () => {
    expect(validarFoto({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validarFoto({ type: "image/webp", size: 5 * 1024 * 1024 })).toBeNull();
  });
  it("rejeita outros tipos e tamanho acima de 5 MB", () => {
    expect(validarFoto({ type: "application/pdf", size: 10 })).toMatch(/JPG, PNG ou WebP/);
    expect(validarFoto({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
  });
  // hml-21a: o caminho nasce no servidor (a função conta) — o MESMO formato de antes, e os limites do servidor = os desta validação
  it("caminho na pasta de quem chama com a extensão certa (agora no servidor: caminhoDaFoto)", () => {
    expect(caminhoDaFoto("u1", "image/png", 123)).toBe("u1/foto-123.png");
    expect(caminhoDaFoto("u1", "image/jpeg", 5)).toBe("u1/foto-5.jpg");
  });
  it("o servidor aceita exatamente os tipos e o tamanho desta validação", () => {
    expect(Object.keys(TIPOS_DE_FOTO).sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(validarFoto({ type: "image/png", size: FOTO_MAX_BYTES })).toBeNull();
    expect(validarFoto({ type: "image/png", size: FOTO_MAX_BYTES + 1 })).not.toBeNull();
  });
});
