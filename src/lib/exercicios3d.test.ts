import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { entrada3d, fotoDoExercicio, fundoGuardado, guardarFundo, type Manifesto3D } from "./exercicios3d";
import { dadosDaTabela } from "./visualizador3d/cores";
import { modoDeRepeticao } from "./visualizador3d/exercicio";
import { criarMedidorDeQualidade } from "./visualizador3d/qualidade";

const COM_3D = "11111111-2222-3333-4444-555555555555";
const MANIFESTO: Manifesto3D = {
  boneco: { v: "1", glb: "/exercicios3d/boneco-1.glb", mapa: "/exercicios3d/musculos-1.png" },
  exercicios: {
    [COM_3D]: {
      v: "7",
      movimento: `/exercicios3d/${COM_3D}-7.glb`,
      foto: `/exercicios3d/${COM_3D}-7.webp`,
      bytes: 10,
      alvos: [15],
      auxiliares: [2],
      camera: { az: 54, el: 8 },
      ida_s: 1.5,
    },
  },
};

describe("exercícios 3D", () => {
  it("exercício com 3D usa a foto parada do 3D", () => {
    expect(entrada3d(COM_3D, MANIFESTO)?.v).toBe("7");
    expect(fotoDoExercicio(COM_3D, "https://x/gif.webp", MANIFESTO)).toBe(`/exercicios3d/${COM_3D}-7.webp`);
  });

  it("exercício sem 3D continua com a imagem de hoje ou nada", () => {
    expect(entrada3d("outro", MANIFESTO)).toBeNull();
    expect(entrada3d(undefined, MANIFESTO)).toBeNull();
    expect(fotoDoExercicio("outro", "https://x/gif.webp", MANIFESTO)).toBe("https://x/gif.webp");
    expect(fotoDoExercicio("outro", null, MANIFESTO)).toBeNull();
  });
});

describe("fundo do visualizador", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("abre escuro e lembra o claro", () => {
    expect(fundoGuardado()).toBe("escuro");
    guardarFundo("claro");
    expect(fundoGuardado()).toBe("claro");
  });

  it("sem acesso ao armazenamento fica escuro e não quebra", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => guardarFundo("claro")).not.toThrow();
    expect(fundoGuardado()).toBe("escuro");
  });
});

describe("cores dos músculos", () => {
  it("alvo ganha do auxiliar e id fora de 1–255 é ignorado", () => {
    const d = dadosDaTabela([15], [15, 2, 0, 300]);
    expect(d[15 * 4 + 3]).toBe(255); // alvo
    expect(d[2 * 4 + 3]).toBe(128); // auxiliar
    expect(d[3]).toBe(0); // pele (id 0) sem cor
  });
});

describe("qualidade adaptativa", () => {
  it("abaixo de 30 qps baixa um degrau por janela de 2 s e para no 2º", () => {
    const baixar = vi.fn();
    const medir = criarMedidorDeQualidade(baixar);
    let t = 0;
    medir(t);
    for (let i = 0; i < 40; i++) medir((t += 50)); // 20 qps por 2 s
    expect(baixar).toHaveBeenLastCalledWith(1);
    for (let i = 0; i < 40; i++) medir((t += 50));
    expect(baixar).toHaveBeenLastCalledWith(2);
    for (let i = 0; i < 40; i++) medir((t += 50));
    expect(baixar).toHaveBeenCalledTimes(2);
  });

  it("acima de 30 qps não mexe", () => {
    const baixar = vi.fn();
    const medir = criarMedidorDeQualidade(baixar);
    let t = 0;
    medir(t);
    for (let i = 0; i < 200; i++) medir((t += 16));
    expect(baixar).not.toHaveBeenCalled();
  });
});

describe("repetição do movimento", () => {
  it("vai e volta por padrão; o cíclico (corrida) repete o ciclo", () => {
    expect(modoDeRepeticao({})).toBe(THREE.LoopPingPong);
    expect(modoDeRepeticao({ ciclo: true })).toBe(THREE.LoopRepeat);
  });
});
