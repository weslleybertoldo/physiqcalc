import { describe, expect, it } from "vitest";
import { imagemLocal, resolverImagem, type EntradaManifest } from "./imagemExercicio";

const UUID = "17e52ced-abc2-41a1-8776-c6162309e306";
const SB = "https://uxwpwdbbnlticxgtzcsb.supabase.co/storage/v1/object/public";
const manifest: Record<string, EntradaManifest> = { [UUID]: { v: "1788470000", bytes: 61234 } };

describe("resolverImagem (local-primeiro)", () => {
  it("mesma versão embutida → caminho local do WebP", () => {
    expect(resolverImagem(`${SB}/exercicios/${UUID}.webp?v=1788470000`, manifest)).toBe(`/exercicios/${UUID}-1788470000.webp`);
  });

  it("vale pro bucket de staging também", () => {
    expect(resolverImagem(`${SB}/exercicios-staging/${UUID}.webp?v=1788470000`, manifest)).toBe(`/exercicios/${UUID}-1788470000.webp`);
  });

  it("versão diferente (GIF trocado depois do build) → URL original", () => {
    const url = `${SB}/exercicios/${UUID}.gif?v=1799999999`;
    expect(resolverImagem(url, manifest)).toBe(url);
    expect(imagemLocal(url, manifest)).toBeNull();
  });

  it("uuid desconhecido (exercício novo) → URL original", () => {
    const url = `${SB}/exercicios/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp?v=1788470000`;
    expect(resolverImagem(url, manifest)).toBe(url);
  });

  it("sem ?v= → URL original (não dá pra provar que é a mesma versão)", () => {
    const url = `${SB}/exercicios/${UUID}.gif`;
    expect(resolverImagem(url, manifest)).toBe(url);
  });

  it("URL que não é do Storage de exercícios → passa direto; vazio → null", () => {
    expect(resolverImagem("https://exemplo.com/x.png", manifest)).toBe("https://exemplo.com/x.png");
    expect(resolverImagem(null, manifest)).toBeNull();
    expect(resolverImagem(undefined, manifest)).toBeNull();
    expect(resolverImagem("", manifest)).toBeNull();
  });

  it("uuid em maiúsculas casa com o manifest (minúsculas)", () => {
    expect(resolverImagem(`${SB}/exercicios/${UUID.toUpperCase()}.webp?v=1788470000`, manifest)).toBe(`/exercicios/${UUID}-1788470000.webp`);
  });
});
