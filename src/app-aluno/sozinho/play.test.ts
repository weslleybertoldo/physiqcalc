import { beforeEach, describe, expect, it, vi } from "vitest";

// play-W6 — a ordem da compra no app: a folha da Play (o plugin) → o registrar (a play-compras). O servidor reconhece; o app nunca.
const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  comprar: vi.fn(),
  compras: vi.fn(),
  gerenciar: vi.fn(),
  invalidar: vi.fn(),
}));
vi.mock("@/integrations/principal/client", () => ({ principal: { functions: { invoke: h.invoke } } }));
vi.mock("@/lib/playBilling", () => ({ comprarNaPlay: h.comprar, comprasDaPlay: h.compras, gerenciarNaPlay: h.gerenciar }));
vi.mock("@/financeiro/api", () => ({ invalidarResumo: h.invalidar }));

import type { CompraPlay } from "@/lib/playBilling";
import { ErroPlay, assinarPelaPlay, buscarEstadoPlay, recuperarComprasDaPlay, registrarCompraPlay } from "./play";

const OFERTA = { produto: "app_treino" as const, token: "tok-oferta", preco: "R$ 29,90", micros: 29_900_000, moeda: "BRL" };
const compra = (p: Partial<CompraPlay> = {}): CompraPlay => ({ token: "tok-compra-1", produtos: ["app_treino"], estado: "comprada", reconhecida: false, renova: true, conta: "m1", ...p });
const ok = (data: Record<string, unknown>) => ({ data: { ok: true, ...data }, error: null });

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
});

describe("a play-compras", () => {
  it("estado: a vista normalizada (o token nunca vem); a matrícula e a automática do MP", async () => {
    h.invoke.mockResolvedValue(ok({ disponivel: true, matricula: { id: "m1", ativo: true }, assinatura: { estado: "ativa", renova: true, expira_em: "x", produto: "app_treino" }, automatica_mp: false }));
    expect(await buscarEstadoPlay()).toEqual({
      disponivel: true, matricula: { id: "m1", ativo: true }, assinatura: { estado: "ativa", renova: true, expira_em: "x", produto: "app_treino" }, automatica_mp: false,
    });
    expect(h.invoke).toHaveBeenCalledWith("play-compras", { body: { acao: "estado" } });
  });
  it("a revisão 🟡3: o estado que ressincronizou a viva vencida (a renovação ou o EXPIRED sem o RTDN) invalida o resumo guardado", async () => {
    h.invoke.mockResolvedValue(ok({ disponivel: true, matricula: { id: "m1", ativo: true }, assinatura: null, automatica_mp: false, ressincronizada: true }));
    await buscarEstadoPlay();
    expect(h.invalidar).toHaveBeenCalledTimes(1);
    h.invoke.mockResolvedValue(ok({ disponivel: true, matricula: { id: "m1", ativo: true }, assinatura: null, automatica_mp: false }));
    await buscarEstadoPlay();
    expect(h.invalidar).toHaveBeenCalledTimes(1);
  });
  it("registrar: o token e o produto; o erro da função vira ErroPlay com o código", async () => {
    h.invoke.mockResolvedValueOnce(ok({ estado: "ativa", expira_em: "x", produto: "app_treino", renova: true, reconhecida: true, adiada: true }));
    expect(await registrarCompraPlay("tok-compra-1", "app_treino")).toMatchObject({ estado: "ativa", reconhecida: true, adiada: true });
    expect(h.invoke).toHaveBeenCalledWith("play-compras", { body: { acao: "registrar", token: "tok-compra-1", produto: "app_treino" } });
    expect(h.invalidar).toHaveBeenCalled();
    const resposta = new Response(JSON.stringify({ ok: false, erro: "compra_de_outra_conta" }), { status: 409 });
    h.invoke.mockResolvedValueOnce({ data: null, error: { context: resposta } });
    await expect(registrarCompraPlay("tok-compra-1", "app_treino")).rejects.toMatchObject({ codigo: "compra_de_outra_conta" });
    h.invoke.mockResolvedValueOnce({ data: null, error: new Error("rede") });
    await expect(registrarCompraPlay("t", "app_treino")).rejects.toMatchObject({ name: "Error", codigo: "erro_interno" });
    h.invoke.mockResolvedValueOnce({ data: null, error: new Error("rede") });
    await expect(registrarCompraPlay("t", "app_treino")).rejects.toBeInstanceOf(ErroPlay);
  });
});

describe("assinar pela Play", () => {
  it("comprado → o registrar com o token da compra (a matrícula opaca vai na folha)", async () => {
    h.comprar.mockResolvedValue({ resultado: "comprado", compras: [compra()] });
    h.invoke.mockResolvedValue(ok({ estado: "ativa", reconhecida: true }));
    const d = await assinarPelaPlay({ matriculaId: "m1", oferta: OFERTA });
    expect(h.comprar).toHaveBeenCalledWith({ produto: "app_treino", oferta: "tok-oferta", conta: "m1" });
    expect(h.invoke).toHaveBeenCalledWith("play-compras", { body: { acao: "registrar", token: "tok-compra-1", produto: "app_treino" } });
    expect(d).toMatchObject({ tipo: "assinada", registro: { estado: "ativa" } });
  });
  it("a troca: o token antigo vem das compras do aparelho + o modo", async () => {
    h.compras.mockResolvedValue([compra({ token: "tok-antigo", produtos: ["app_treino"] })]);
    h.comprar.mockResolvedValue({ resultado: "comprado", compras: [compra({ token: "tok-novo", produtos: ["app_treino_alimentacao"] })] });
    h.invoke.mockResolvedValue(ok({ estado: "ativa" }));
    const d = await assinarPelaPlay({ matriculaId: "m1", oferta: { ...OFERTA, produto: "app_treino_alimentacao", token: "tok-ta" },
      troca: { produtoAntigo: "app_treino", modo: "na_hora" } });
    expect(h.comprar).toHaveBeenCalledWith({ produto: "app_treino_alimentacao", oferta: "tok-ta", conta: "m1",
      troca: { tokenAntigo: "tok-antigo", produtoAntigo: "app_treino", modo: "na_hora" } });
    expect(h.invoke).toHaveBeenCalledWith("play-compras", { body: { acao: "registrar", token: "tok-novo", produto: "app_treino_alimentacao" } });
    expect(d.tipo).toBe("assinada");
  });
  it("cancelado, indisponível, erro e a compra pendente — sem registrar", async () => {
    for (const [r, esperado] of [
      [{ resultado: "cancelado" }, { tipo: "cancelada" }],
      [{ resultado: "indisponivel" }, { tipo: "erro", codigo: "indisponivel" }],
      [{ resultado: "erro", codigo: 6 }, { tipo: "erro", codigo: "erro_play" }],
      [{ resultado: "comprado", compras: [compra({ estado: "pendente" })] }, { tipo: "pendente" }],
    ] as const) {
      h.comprar.mockResolvedValueOnce(r);
      expect(await assinarPelaPlay({ matriculaId: "m1", oferta: OFERTA })).toEqual(esperado);
    }
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it("já tem (o registrar não chegou da outra vez): as compras não reconhecidas voltam ao servidor", async () => {
    h.comprar.mockResolvedValue({ resultado: "ja_tem" });
    h.compras.mockResolvedValue([compra()]);
    h.invoke.mockResolvedValue(ok({ estado: "ativa" }));
    expect(await assinarPelaPlay({ matriculaId: "m1", oferta: OFERTA })).toEqual({ tipo: "assinada", registro: null });
    h.compras.mockResolvedValue([]);
    expect(await assinarPelaPlay({ matriculaId: "m1", oferta: OFERTA })).toEqual({ tipo: "erro", codigo: "ja_tem" });
  });
  it("a revisão 🟡6: a troca só com a compra DESTA matrícula — a do aparelho de outra pessoa (outra conta) não vira o token antigo", async () => {
    h.compras.mockResolvedValue([compra({ token: "tok-de-outra-pessoa", produtos: ["app_treino"], conta: "outra-matricula" })]);
    const d = await assinarPelaPlay({ matriculaId: "m1", oferta: { ...OFERTA, produto: "app_treino_alimentacao", token: "tok-ta" },
      troca: { produtoAntigo: "app_treino", modo: "na_hora" } });
    expect(d).toEqual({ tipo: "erro", codigo: "erro_play" });
    expect(h.comprar).not.toHaveBeenCalled();
  });
  it("a revisão 🟡2: na troca, o OK com a lista vazia (o DEFERRED pode voltar assim) = sucesso + a recuperação pelas compras do aparelho", async () => {
    h.compras.mockResolvedValueOnce([compra({ token: "tok-antigo", produtos: ["app_treino_alimentacao"] })])
      .mockResolvedValueOnce([compra({ token: "tok-novo", produtos: ["app_treino_alimentacao", "app_treino"] })]);
    h.comprar.mockResolvedValue({ resultado: "comprado", compras: [] });
    h.invoke.mockResolvedValue(ok({ estado: "ativa" }));
    const d = await assinarPelaPlay({ matriculaId: "m1", oferta: { ...OFERTA, produto: "app_treino" },
      troca: { produtoAntigo: "app_treino_alimentacao", modo: "na_renovacao" } });
    expect(d).toEqual({ tipo: "assinada", registro: null });
    expect(h.invoke).toHaveBeenCalledWith("play-compras", { body: { acao: "registrar", token: "tok-novo", produto: "app_treino_alimentacao" } });
  });
  it("a revisão ⚪19: a compra que volta sem o produto pedido NÃO cai na 1ª da lista (nada é registrado)", async () => {
    h.comprar.mockResolvedValue({ resultado: "comprado", compras: [compra({ token: "tok-outro", produtos: ["outro_produto"] })] });
    expect(await assinarPelaPlay({ matriculaId: "m1", oferta: OFERTA })).toEqual({ tipo: "erro", codigo: "erro_play" });
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it("a revisão ⚪15: o já tem com a compra RECONHECIDA desta matrícula (o RTDN já reconheceu) também volta ao servidor", async () => {
    h.comprar.mockResolvedValue({ resultado: "ja_tem" });
    h.compras.mockResolvedValue([compra({ token: "tok-reconhecida", reconhecida: true }), compra({ token: "tok-de-outra", reconhecida: true, conta: "outra" })]);
    h.invoke.mockResolvedValue(ok({ estado: "ativa" }));
    expect(await assinarPelaPlay({ matriculaId: "m1", oferta: OFERTA })).toEqual({ tipo: "assinada", registro: null });
    const tokens = h.invoke.mock.calls.map((c) => (c[1] as { body: { token: string } }).body.token);
    expect(tokens).toEqual(["tok-reconhecida"]);
  });
  it("o servidor que recusa vira o código para a tela (nunca 'assinada')", async () => {
    h.comprar.mockResolvedValue({ resultado: "comprado", compras: [compra()] });
    h.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ ok: false, erro: "google_indisponivel" }), { status: 502 }) } });
    expect(await assinarPelaPlay({ matriculaId: "m1", oferta: OFERTA })).toEqual({ tipo: "erro", codigo: "google_indisponivel" });
  });
});

describe("a compra que ficou no meio", () => {
  it("só as compradas, não reconhecidas, desta matrícula (ou sem a matrícula opaca) e de produto do app", async () => {
    h.invoke.mockResolvedValue(ok({ estado: "ativa" }));
    const lista = [
      compra({ token: "a" }),
      compra({ token: "b", reconhecida: true }),
      compra({ token: "c", conta: "outra" }),
      compra({ token: "d", estado: "pendente" }),
      compra({ token: "e", produtos: ["outro_app"] }),
      compra({ token: "f", conta: null, produtos: ["app_treino_alimentacao"] }),
    ];
    expect(await recuperarComprasDaPlay("m1", lista)).toBe(2);
    const tokens = h.invoke.mock.calls.map((c) => (c[1] as { body: { token: string } }).body.token);
    expect(tokens).toEqual(["a", "f"]);
  });
  it("o servidor que recusa uma não para as outras; sem a Play, nada (nunca lança)", async () => {
    h.invoke.mockRejectedValueOnce(new Error("x")).mockResolvedValue(ok({}));
    expect(await recuperarComprasDaPlay("m1", [compra({ token: "a" }), compra({ token: "b" })])).toBe(1);
    h.compras.mockRejectedValue(new Error("sem play"));
    expect(await recuperarComprasDaPlay("m1")).toBe(0);
  });
});
