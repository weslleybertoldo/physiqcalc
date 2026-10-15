import { describe, expect, it, vi } from "vitest";
import { camposMudados, criarFila, vigiarSaida, type Manejo } from "./filaDaLinha";

// hml-24 (H-127): a fila por linha do editor do treino — 1 pedido por vez por linha, o último valor de cada campo, as linhas em
// paralelo, o erro sem reenvio sozinho, o "Tentar de novo", o descartar e o aviso do navegador ao fechar a aba.

type P = { series: number; reps: string | null; descanso: number | null; carga: number | null };
const BASE: P = { series: 3, reps: null, descanso: null, carga: null };

/** Um servidor fingido: cada pedido fica esperando até o teste dizer ok ou erro. */
function servidor() {
  const pedidos: { valor: P; ok: (r?: unknown) => void; erro: (e: unknown) => void }[] = [];
  const enviar = vi.fn(
    (valor: P) =>
      new Promise<unknown>((ok, erro) => {
        pedidos.push({ valor, ok: (r = { ok: true }) => ok(r), erro });
      }),
  );
  return { pedidos, enviar };
}

const tique = () => new Promise((r) => setTimeout(r, 0));

function manejo(enviar: (v: P) => Promise<unknown>, extra: Partial<Manejo<P, unknown>> = {}): Manejo<P, unknown> {
  return { enviar, ...extra };
}

describe("hml-24 — a fila por linha (filaDaLinha)", () => {
  it("camposMudados: só os campos em que o novo difere da base", () => {
    expect(camposMudados(BASE, { ...BASE, reps: "10" })).toEqual(["reps"]);
    expect(camposMudados(BASE, BASE)).toEqual([]);
    expect(camposMudados(BASE, { series: 4, reps: "8-12", descanso: 60, carga: 20 })).toEqual(["series", "reps", "descanso", "carga"]);
  });

  it("1 pedido por vez por linha: o 2º campo espera o 1º voltar e vai num pedido só com os 2", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    const p1 = f.mudar("u|A|ex1", BASE, { ...BASE, reps: "10" }, manejo(s.enviar));
    const p2 = f.mudar("u|A|ex1", { ...BASE, reps: "10" }, { ...BASE, reps: "10", carga: 60 }, manejo(s.enviar));
    expect(s.pedidos).toHaveLength(1);
    expect(s.pedidos[0].valor).toEqual({ ...BASE, reps: "10" });
    expect(f.algoPendente()).toBe(true);
    expect(f.pendente("u|A|ex1")).toEqual({ ...BASE, reps: "10", carga: 60 });
    s.pedidos[0].ok({ ok: 1 });
    await tique();
    expect(await p1).toEqual({ ok: 1 });
    expect(s.pedidos).toHaveLength(2);
    expect(s.pedidos[1].valor).toEqual({ ...BASE, reps: "10", carga: 60 });
    s.pedidos[1].ok({ ok: 2 });
    expect(await p2).toEqual({ ok: 2 });
    expect(f.algoPendente()).toBe(false);
    expect(f.pendente("u|A|ex1")).toBeNull();
  });

  it("a rajada (os 4 campos sem esperar): 2 pedidos no total, o 2º com o último valor de cada campo; nunca 2 da linha no ar", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    let noAr = 0;
    let maximo = 0;
    const enviar = (v: P) => {
      noAr++;
      maximo = Math.max(maximo, noAr);
      return s.enviar(v).finally(() => noAr--);
    };
    let tela: P = BASE;
    const promessas = (["series", "reps", "descanso", "carga"] as const).map((campo, i) => {
      const novo = { ...tela, [campo]: [4, "12", 45, 25][i] } as P;
      const p = f.mudar("u|A|ex1", tela, novo, manejo(enviar));
      tela = novo;
      return p;
    });
    // a carga digitada 2x (a última vence)
    promessas.push(f.mudar("u|A|ex1", tela, { ...tela, carga: 30 }, manejo(enviar)));
    expect(s.pedidos).toHaveLength(1);
    s.pedidos[0].ok();
    await tique();
    expect(s.pedidos).toHaveLength(2);
    expect(s.pedidos[1].valor).toEqual({ series: 4, reps: "12", descanso: 45, carga: 30 });
    s.pedidos[1].ok();
    await Promise.all(promessas);
    expect(maximo).toBe(1);
    expect(s.enviar).toHaveBeenCalledTimes(2);
  });

  it("o campo digitado com a tela velha não desfaz o outro campo da mesma linha (só o campo mudado entra no desejado)", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    void f.mudar("k", { ...BASE, reps: "10", carga: 20 }, { ...BASE, reps: "12", carga: 20 }, manejo(s.enviar));
    // a carga mudada a partir da tela de ANTES do reps (reps ainda 10)
    void f.mudar("k", { ...BASE, reps: "10", carga: 20 }, { ...BASE, reps: "10", carga: 25 }, manejo(s.enviar));
    s.pedidos[0].ok();
    await tique();
    expect(s.pedidos[1].valor).toEqual({ ...BASE, reps: "12", carga: 25 });
  });

  it("linhas diferentes vão em paralelo (cada uma com o seu pedido)", () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    void f.mudar("u|A|ex1", BASE, { ...BASE, reps: "10" }, manejo(s.enviar));
    void f.mudar("u|A|ex2", BASE, { ...BASE, reps: "12" }, manejo(s.enviar));
    void f.mudar("u|A|geral", BASE, { ...BASE, reps: "x" }, manejo(s.enviar));
    expect(s.pedidos.map((p) => p.valor.reps)).toEqual(["10", "12", "x"]);
    expect(f.pendentes().map(([k]) => k).sort()).toEqual(["u|A|ex1", "u|A|ex2", "u|A|geral"]);
  });

  it("o aoOk recebe o valor e os campos que o envio levou (a tela recarrega o volume só quando as séries mudaram)", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    const aoOk = vi.fn();
    void f.mudar("k", BASE, { ...BASE, series: 5 }, manejo(s.enviar, { aoOk }));
    void f.mudar("k", { ...BASE, series: 5 }, { ...BASE, series: 5, reps: "8" }, manejo(s.enviar, { aoOk }));
    s.pedidos[0].ok("r1");
    await tique();
    s.pedidos[1].ok("r2");
    await tique();
    expect(aoOk).toHaveBeenCalledTimes(2);
    expect([...aoOk.mock.calls[0][1].campos]).toEqual(["series"]);
    expect([...aoOk.mock.calls[1][1].campos]).toEqual(["reps"]);
    expect(aoOk.mock.calls[1][1].valor).toEqual({ ...BASE, series: 5, reps: "8" });
  });

  it("erro: as promessas da linha (a do envio e a que esperava) dão null; nada reenvia sozinho; o aoErro recebe o que a linha queria", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    const aoErro = vi.fn();
    const p1 = f.mudar("k", BASE, { ...BASE, reps: "10" }, manejo(s.enviar, { aoErro }));
    const p2 = f.mudar("k", { ...BASE, reps: "10" }, { ...BASE, reps: "10", carga: 5 }, manejo(s.enviar, { aoErro }));
    s.pedidos[0].erro(new Error("internal"));
    expect(await p1).toBeNull();
    expect(await p2).toBeNull();
    await tique();
    expect(s.enviar).toHaveBeenCalledTimes(1);
    expect(aoErro).toHaveBeenCalledTimes(1);
    expect(aoErro.mock.calls[0][1]).toEqual({ ...BASE, reps: "10", carga: 5 });
    expect(f.algoPendente()).toBe(false);
    expect(f.temErro("k")).toBe(true);
  });

  it('"Tentar de novo" reenvia o que a linha queria, inteiro, e resolve com o envio; uma mudança nova da linha vence o erro', async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    void f.mudar("k", BASE, { ...BASE, reps: "10", carga: 5 }, manejo(s.enviar));
    s.pedidos[0].erro(new Error("x"));
    await tique();
    const t = f.tentarDeNovo("k");
    expect(t).not.toBeNull();
    expect(s.pedidos[1].valor).toEqual({ ...BASE, reps: "10", carga: 5 });
    s.pedidos[1].ok("de novo");
    expect(await t).toBe("de novo");
    expect(f.temErro("k")).toBe(false);
    expect(f.tentarDeNovo("k")).toBeNull();
    // falhou de novo e a pessoa mexeu na linha: o "Tentar de novo" antigo não vale mais
    void f.mudar("k", BASE, { ...BASE, reps: "11" }, manejo(s.enviar));
    s.pedidos[2].erro(new Error("x"));
    await tique();
    void f.mudar("k", BASE, { ...BASE, descanso: 60 }, manejo(s.enviar));
    expect(f.tentarDeNovo("k")).toBeNull();
    expect(s.pedidos[3].valor).toEqual({ ...BASE, descanso: 60 });
  });

  it("descartar (o exercício saiu do treino): as promessas dão null, o pedido em voo é ignorado ao voltar e nada mais vai", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    const aoOk = vi.fn();
    const aoDescartar = vi.fn();
    const p1 = f.mudar("k", BASE, { ...BASE, reps: "10" }, manejo(s.enviar, { aoOk, aoDescartar }));
    const p2 = f.mudar("k", { ...BASE, reps: "10" }, { ...BASE, reps: "10", carga: 9 }, manejo(s.enviar, { aoOk, aoDescartar }));
    f.descartar("k");
    expect(await p1).toBeNull();
    expect(await p2).toBeNull();
    expect(f.algoPendente()).toBe(false);
    expect(aoDescartar).toHaveBeenCalledTimes(1);
    s.pedidos[0].ok();
    await tique();
    expect(aoOk).not.toHaveBeenCalled();
    expect(s.enviar).toHaveBeenCalledTimes(1);
  });

  it("sem campo novo: com a linha parada vai 1 pedido (o Salvar da folha, como hoje); com a linha no ar, vai junto com o que já vai", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    const p0 = f.mudar("k", BASE, BASE, manejo(s.enviar));
    expect(s.pedidos).toHaveLength(1);
    const p1 = f.mudar("k", BASE, BASE, manejo(s.enviar));
    s.pedidos[0].ok("um");
    expect(await p0).toBe("um");
    expect(await p1).toBe("um");
    await tique();
    expect(s.enviar).toHaveBeenCalledTimes(1);
  });

  it("assinar avisa a cada mudança e a versão muda; parar de assinar para os avisos", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    const aviso = vi.fn();
    const parar = f.assinar(aviso);
    const v0 = f.versao();
    void f.mudar("k", BASE, { ...BASE, reps: "1" }, manejo(s.enviar));
    expect(aviso).toHaveBeenCalled();
    expect(f.versao()).not.toBe(v0);
    parar();
    aviso.mockClear();
    s.pedidos[0].ok();
    await tique();
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe("hml-24 — o aviso do navegador ao fechar a aba com gravação pendente (vigiarSaida)", () => {
  it("o beforeunload só fica ligado com algo pendente e pede a confirmação do navegador", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    const janela = new EventTarget();
    const add = vi.spyOn(janela, "addEventListener");
    const rem = vi.spyOn(janela, "removeEventListener");
    const parar = vigiarSaida(f, janela as unknown as Window);
    expect(add).not.toHaveBeenCalled();
    void f.mudar("k", BASE, { ...BASE, reps: "10" }, manejo(s.enviar));
    expect(add).toHaveBeenCalledTimes(1);
    const ev = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    janela.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    s.pedidos[0].ok();
    await tique();
    expect(rem).toHaveBeenCalledTimes(1);
    const ev2 = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    janela.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
    parar();
  });

  it("o erro também solta o aviso (nada fica pendente: o 'Tentar de novo' é da pessoa)", async () => {
    const f = criarFila<P, unknown>();
    const s = servidor();
    const janela = new EventTarget();
    const rem = vi.spyOn(janela, "removeEventListener");
    vigiarSaida(f, janela as unknown as Window);
    void f.mudar("k", BASE, { ...BASE, reps: "10" }, manejo(s.enviar));
    s.pedidos[0].erro(new Error("x"));
    await tique();
    expect(rem).toHaveBeenCalledTimes(1);
  });
});
