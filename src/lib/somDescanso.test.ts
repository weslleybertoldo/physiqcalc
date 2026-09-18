import { beforeEach, describe, expect, it } from "vitest";
import {
  SOM_CHAVE, SOM_OPCOES, SOM_PADRAO, deveVibrar, ehSomDescanso, gravarSomDescanso, lerSomDescanso, nomeDoSom,
  temSom, tocarSom, tonsDoSom,
} from "./somDescanso";

/** AudioContext falso que registra os osciladores tocados */
function ctxFake() {
  const starts: number[] = [];
  const freqs: number[] = [];
  const ctx = {
    currentTime: 10,
    destination: {},
    createOscillator: () => {
      const osc = {
        frequency: { value: 0 },
        connect: () => {},
        start: (t: number) => { starts.push(t); freqs.push(osc.frequency.value); },
        stop: () => {},
      };
      return osc;
    },
    createGain: () => ({ connect: () => {}, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }),
  };
  return { ctx: ctx as unknown as AudioContext, starts, freqs };
}

beforeEach(() => localStorage.clear());

describe("somDescanso — opções e tons", () => {
  it("tem 5 opções distintas e o padrão é Bip", () => {
    expect(SOM_OPCOES).toHaveLength(5);
    expect(new Set(SOM_OPCOES.map((o) => o.valor)).size).toBe(5);
    expect(SOM_PADRAO).toBe("bip");
    expect(nomeDoSom("vibrar")).toBe("Só vibrar");
  });

  it("cada som tem seus tons, em ordem de início; vibrar/silencio não têm", () => {
    expect(tonsDoSom("bip")).toHaveLength(3);
    expect(tonsDoSom("sino")).toHaveLength(2);
    expect(tonsDoSom("alarme")).toHaveLength(5);
    expect(tonsDoSom("vibrar")).toHaveLength(0);
    expect(tonsDoSom("silencio")).toHaveLength(0);
    for (const som of ["bip", "sino", "alarme"] as const) {
      const inicios = tonsDoSom(som).map((t) => t[1]);
      expect([...inicios].sort((a, b) => a - b)).toEqual(inicios);
    }
    // Bip = os 3 toques que o app sempre tocou (880/880/1100)
    expect(tonsDoSom("bip").map((t) => t[0])).toEqual([880, 880, 1100]);
  });

  it("deveVibrar só é falso no Silencioso; temSom só nos sons", () => {
    expect(deveVibrar("silencio")).toBe(false);
    expect(deveVibrar("vibrar")).toBe(true);
    expect(deveVibrar("bip")).toBe(true);
    expect(temSom("bip")).toBe(true);
    expect(temSom("sino")).toBe(true);
    expect(temSom("alarme")).toBe(true);
    expect(temSom("vibrar")).toBe(false);
    expect(temSom("silencio")).toBe(false);
  });
});

describe("somDescanso — preferência do aparelho", () => {
  it("sem nada gravado → Bip; valor inválido → Bip", () => {
    expect(lerSomDescanso()).toBe("bip");
    localStorage.setItem(SOM_CHAVE, "xpto");
    expect(lerSomDescanso()).toBe("bip");
    expect(ehSomDescanso("xpto")).toBe(false);
    expect(ehSomDescanso("sino")).toBe(true);
  });

  it("gravar e ler de volta", () => {
    gravarSomDescanso("alarme");
    expect(localStorage.getItem(SOM_CHAVE)).toBe("alarme");
    expect(lerSomDescanso()).toBe("alarme");
  });
});

describe("somDescanso — tocarSom", () => {
  it("Alarme toca 5 osciladores de 1000 Hz a partir do currentTime", () => {
    const { ctx, starts, freqs } = ctxFake();
    tocarSom(ctx, "alarme");
    expect(starts).toEqual([10, 10.35, 10.7, 11.05, 11.4]);
    expect(freqs).toEqual([1000, 1000, 1000, 1000, 1000]);
  });

  it("Só vibrar e Silencioso não tocam nada", () => {
    const { ctx, starts } = ctxFake();
    tocarSom(ctx, "vibrar");
    tocarSom(ctx, "silencio");
    expect(starts).toEqual([]);
  });
});
