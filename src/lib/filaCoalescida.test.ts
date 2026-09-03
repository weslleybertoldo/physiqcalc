import { describe, it, expect, vi } from "vitest";
import { criarFilaCoalescida } from "./filaCoalescida";

/** promessa controlada: resolve/rejeita quando o teste quiser */
function controlada() {
  let resolver!: () => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<void>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("criarFilaCoalescida", () => {
  it("executa na hora quando ociosa e avisa ao esvaziar", async () => {
    const executados: string[] = [];
    const aoEsvaziar = vi.fn();
    const estados: boolean[] = [];
    const fila = criarFilaCoalescida<string>({
      executar: async (v) => { executados.push(v); },
      aoEsvaziar,
      aoMudarEstado: (e) => estados.push(e),
    });
    fila.enfileirar("a", "a=1");
    expect(fila.emVoo()).toBe(true);
    await tick();
    expect(executados).toEqual(["a=1"]);
    expect(fila.ociosa()).toBe(true);
    expect(aoEsvaziar).toHaveBeenCalledTimes(1);
    expect(estados).toEqual([true, false]);
  });

  it("só uma em voo por vez; cliques rápidos no mesmo alvo viram UMA gravação com o último valor", async () => {
    const executados: string[] = [];
    const c1 = controlada();
    let vez = 0;
    const fila = criarFilaCoalescida<string>({
      executar: async (v) => {
        executados.push(v);
        if (vez++ === 0) await c1.promessa; // a 1ª fica em voo
      },
    });
    fila.enfileirar("testa", "testa=4");
    fila.enfileirar("testa", "testa=5");
    fila.enfileirar("testa", "testa=6");
    fila.enfileirar("testa", "testa=7");
    expect(executados).toEqual(["testa=4"]);
    expect(fila.pendentes()).toBe(1);
    c1.resolver();
    await tick();
    await tick();
    expect(executados).toEqual(["testa=4", "testa=7"]);
    expect(fila.ociosa()).toBe(true);
  });

  it("re-enfileirar um alvo move-o pro fim: '+' → 'aplicar' → '+' grava aplicar ANTES do último '+'", async () => {
    const executados: string[] = [];
    const c1 = controlada();
    let vez = 0;
    const fila = criarFilaCoalescida<string>({
      executar: async (v) => {
        executados.push(v);
        if (vez++ === 0) await c1.promessa;
      },
    });
    fila.enfileirar("geral", "geral=3"); // em voo
    fila.enfileirar("testa", "testa=8");
    fila.enfileirar("aplicar", "aplicar=4");
    fila.enfileirar("testa", "testa=5"); // substitui testa=8 e vai pro fim
    c1.resolver();
    for (let i = 0; i < 6; i++) await tick();
    expect(executados).toEqual(["geral=3", "aplicar=4", "testa=5"]);
  });

  it("erro descarta a fila, chama aoErro e depois volta a aceitar gravações", async () => {
    const executados: string[] = [];
    const aoErro = vi.fn();
    const aoEsvaziar = vi.fn();
    const fila = criarFilaCoalescida<string>({
      executar: async (v) => {
        executados.push(v);
        if (v === "falha") throw new Error("boom");
      },
      aoErro,
      aoEsvaziar,
    });
    fila.enfileirar("x", "falha");
    fila.enfileirar("y", "descartada");
    for (let i = 0; i < 4; i++) await tick();
    expect(executados).toEqual(["falha"]);
    expect(aoErro).toHaveBeenCalledWith("falha", expect.any(Error));
    expect(fila.ociosa()).toBe(true);
    fila.enfileirar("z", "depois");
    await tick();
    expect(executados).toEqual(["falha", "depois"]);
    expect(aoEsvaziar).toHaveBeenCalled();
  });

  it("aoEsvaziar só dispara quando a fila esvazia (uma vez por lote)", async () => {
    const aoEsvaziar = vi.fn();
    const c1 = controlada();
    let vez = 0;
    const fila = criarFilaCoalescida<string>({
      executar: async () => { if (vez++ === 0) await c1.promessa; },
      aoEsvaziar,
    });
    fila.enfileirar("a", "1");
    fila.enfileirar("b", "2");
    fila.enfileirar("c", "3");
    await tick();
    expect(aoEsvaziar).not.toHaveBeenCalled();
    c1.resolver();
    for (let i = 0; i < 6; i++) await tick();
    expect(aoEsvaziar).toHaveBeenCalledTimes(1);
    expect(fila.ociosa()).toBe(true);
  });
});
