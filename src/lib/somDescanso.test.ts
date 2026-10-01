import { beforeEach, describe, expect, it } from "vitest";
import {
  FRACAO_VIBRANDO, SOM_CHAVE, SOM_OPCOES, SOM_PADRAO, deveVibrar, ehSomDescanso, gravarSomDescanso, lerSomDescanso,
  nomeDoSom, padraoVibracao, padraoVibracaoAndroid, ritmoDoSom, temSom, tocarSom, tonsDoSom, vibrarNoNavegador, type SomDescanso,
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

/** Início (ms) de cada vibração de um padrão [vibra, pausa, vibra, …]. */
function iniciosDasVibracoes(padrao: number[]): number[] {
  const inicios: number[] = [];
  let t = 0;
  padrao.forEach((ms, i) => {
    if (i % 2 === 0) inicios.push(t);
    t += ms;
  });
  return inicios;
}

describe("somDescanso — vibração no ritmo do som (pedido dele 30/09/2026)", () => {
  it('"Só vibrar" = 5 vibrações curtas, uma por segundo (meio segundo vibrando)', () => {
    const p = padraoVibracao("vibrar");
    expect(p).toEqual([500, 500, 500, 500, 500, 500, 500, 500, 500]);
    expect(p.filter((_, i) => i % 2 === 0)).toHaveLength(5);
    expect(iniciosDasVibracoes(p)).toEqual([0, 1000, 2000, 3000, 4000]);
    // acaba em 4,5 s (antes: 11 s)
    expect(p.reduce((a, b) => a + b, 0)).toBe(4500);
  });

  it("com som, cada vibração começa junto com um toque e dura a 1ª metade dele", () => {
    for (const som of ["bip", "sino", "alarme"] as const) {
      const tons = tonsDoSom(som);
      const p = padraoVibracao(som);
      // uma vibração por toque
      expect(p.filter((_, i) => i % 2 === 0)).toHaveLength(tons.length);
      // começa no toque
      expect(iniciosDasVibracoes(p)).toEqual(tons.map((t) => Math.round(t[1] * 1000)));
      // dura a metade do toque
      expect(p.filter((_, i) => i % 2 === 0)).toEqual(tons.map((t) => Math.round(t[2] * FRACAO_VIBRANDO * 1000)));
      // nunca passa do fim do som
      const fimSom = Math.max(...tons.map((t) => (t[1] + t[2]) * 1000));
      expect(p.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(fimSom);
      // toda pausa existe (vibrações separadas, como os toques)
      expect(p.filter((_, i) => i % 2 === 1).every((x) => x > 0)).toBe(true);
    }
    expect(padraoVibracao("bip")).toEqual([400, 500, 400, 500, 400]);
    expect(padraoVibracao("sino")).toEqual([800, 1000, 800]);
    expect(padraoVibracao("alarme")).toEqual([125, 225, 125, 225, 125, 225, 125, 225, 125]);
  });

  it("Silencioso não vibra; o formato do Android leva o 0 inicial", () => {
    expect(padraoVibracao("silencio")).toEqual([]);
    expect(padraoVibracaoAndroid("silencio")).toEqual([]);
    expect(padraoVibracaoAndroid("bip")).toEqual([0, 400, 500, 400, 500, 400]);
    expect(ritmoDoSom("silencio")).toEqual([]);
    expect(ritmoDoSom("vibrar")).toHaveLength(5);
  });

  it("vibrarNoNavegador manda o padrão do som pro navigator.vibrate (e nada no Silencioso)", () => {
    const chamadas: unknown[] = [];
    const original = Object.getOwnPropertyDescriptor(navigator, "vibrate");
    Object.defineProperty(navigator, "vibrate", { value: (p: unknown) => { chamadas.push(p); return true; }, configurable: true });
    try {
      for (const som of ["vibrar", "bip", "silencio"] as SomDescanso[]) vibrarNoNavegador(som);
      expect(chamadas).toEqual([padraoVibracao("vibrar"), padraoVibracao("bip")]);
    } finally {
      if (original) Object.defineProperty(navigator, "vibrate", original);
      else delete (navigator as unknown as Record<string, unknown>).vibrate;
    }
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
