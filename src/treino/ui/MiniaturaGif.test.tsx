import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entrada3d } from "@/lib/exercicios3d";
import { MiniaturaGif } from "./MiniaturaGif";

// A miniatura carrega a imagem num Image() fora da tela (pra desenhar o 1º quadro): guarda o endereço pedido.
const pedidos: string[] = [];
class ImagemFalsa {
  decoding = "";
  crossOrigin: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(v: string) {
    pedidos.push(v);
  }
}

beforeEach(() => {
  pedidos.length = 0;
  vi.stubGlobal("Image", ImagemFalsa);
});
afterEach(() => vi.unstubAllGlobals());

const AGACHAMENTO = "f06e45bc-a6c7-4939-92d1-3d6fafa4a534"; // 1º exercício do manifesto do 3D

describe("MiniaturaGif", () => {
  it("exercício com 3D mostra a foto parada do boneco", () => {
    render(<MiniaturaGif url="https://exemplo.com/agachamento.gif" exercicioId={AGACHAMENTO} nome="Agachamento" />);
    expect(pedidos).toEqual([entrada3d(AGACHAMENTO)?.foto]);
  });

  it("exercício sem 3D continua com o GIF de hoje", () => {
    render(<MiniaturaGif url="https://exemplo.com/supino.gif" exercicioId="sem-3d" nome="Supino" />);
    expect(pedidos).toEqual(["https://exemplo.com/supino.gif"]);
  });
});
