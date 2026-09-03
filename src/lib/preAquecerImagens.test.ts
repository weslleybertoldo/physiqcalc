import { beforeEach, describe, expect, it } from "vitest";
import { limparAquecidas, preAquecerImagens } from "./preAquecerImagens";

function fabrica() {
  const criadas: { src: string; decoding: string; crossOrigin: string | null }[] = [];
  return {
    criadas,
    criarImagem: () => {
      const img = { src: "", decoding: "", crossOrigin: null as string | null };
      criadas.push(img);
      return img;
    },
  };
}

beforeEach(() => limparAquecidas());

describe("preAquecerImagens", () => {
  it("dispara 1 Image por URL válida, com decoding async e CORS anônimo", () => {
    const f = fabrica();
    const novas = preAquecerImagens(["https://x/a.gif", null, undefined, "", "https://x/b.gif"], f);
    expect(novas).toEqual(["https://x/a.gif", "https://x/b.gif"]);
    expect(f.criadas.map((i) => i.src)).toEqual(novas);
    expect(f.criadas.every((i) => i.decoding === "async" && i.crossOrigin === "anonymous")).toBe(true);
  });

  it("não repete URL já aquecida na sessão", () => {
    const f = fabrica();
    preAquecerImagens(["https://x/a.gif"], f);
    expect(preAquecerImagens(["https://x/a.gif", "https://x/a.gif"], f)).toEqual([]);
    expect(f.criadas).toHaveLength(1);
  });

  it("respeita o teto por chamada e continua de onde parou na próxima", () => {
    const f = fabrica();
    const urls = Array.from({ length: 12 }, (_, i) => `https://x/${i}.gif`);
    expect(preAquecerImagens(urls, f)).toHaveLength(10);
    expect(preAquecerImagens(urls, f)).toEqual(["https://x/10.gif", "https://x/11.gif"]);
    expect(f.criadas).toHaveLength(12);
  });

  it("com Image real (jsdom) não explode", () => {
    expect(preAquecerImagens(["https://x/c.gif"])).toEqual(["https://x/c.gif"]);
  });
});
