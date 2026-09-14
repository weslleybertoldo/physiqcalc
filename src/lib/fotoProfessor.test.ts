import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: vi.fn() } }, DB_SCHEMA: "public" }));
import { BUCKET_FOTOS_PROFESSORES, caminhoFoto, validarFoto } from "./fotoProfessor";

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
  it("caminho na pasta do professor com a extensão certa", () => {
    expect(caminhoFoto("u1", { type: "image/png" }, 123)).toBe("u1/foto-123.png");
    expect(caminhoFoto("u1", { type: "image/jpeg" }, 5)).toBe("u1/foto-5.jpg");
  });
});
