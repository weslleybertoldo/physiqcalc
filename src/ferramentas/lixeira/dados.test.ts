import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-14b (B21): a tela pede UMA página da aba à lixeira_da_conta (com a aba, a busca e a página); sem a página na resposta = erro.
const h = vi.hoisted(() => ({ rpc: vi.fn() }));
// hml-21c (H-43): a lib lê pela função conta — o functions.invoke("conta") roda os módulos de verdade do servidor (src/test/contaFalsa.ts)
// sobre o MESMO banco falso (a RPC de hoje, como a pessoa); o que o teste prova não muda
vi.mock("@/integrations/principal/client", async () => {
  const { invocarComConta } = await import("@/test/contaFalsa");
  const banco = { rpc: h.rpc };
  return { principal: { ...banco, functions: { invoke: invocarComConta(banco) } }, PRINCIPAL_SCHEMA: "staging" };
});

import { ErroLixeira, listarLixeira } from "./dados";

beforeEach(() => {
  h.rpc.mockReset();
});

describe("listarLixeira (hml-14b)", () => {
  it("pede a aba, a busca e a página 3 (deslocamento 40, 20 por vez); aba e busca vazias vão como null (o banco escolhe a aba)", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, ve_clinico: true, tem_nutricao: true, tipo: "paciente", totais: { paciente: 41 }, total: 41, itens: [] }, error: null });
    const l = await listarLixeira("c1", { tipo: "paciente", busca: " zé ", pagina: 3 });
    expect(h.rpc).toHaveBeenCalledWith("lixeira_da_conta", { p_conta: "c1", p_tipo: "paciente", p_busca: "zé", p_offset: 40, p_limite: 20 });
    expect(l.pagina).toMatchObject({ tipo: "paciente", total: 41 });
    await listarLixeira("c1", { tipo: null, busca: "", pagina: 1 });
    // hml-21c: o null que a lib manda vira o arg DE FORA no servidor (o motor não manda null) — a lixeira_da_conta tem DEFAULT null nos 2:
    // o banco escolhe a aba igual
    expect(h.rpc).toHaveBeenLastCalledWith("lixeira_da_conta", { p_conta: "c1", p_offset: 0, p_limite: 20 });
  });

  it("recusa do banco vira ErroLixeira; a resposta sem a página (formato antigo) também", async () => {
    h.rpc.mockResolvedValue({ data: { ok: false, erro: "sem_acesso" }, error: null });
    await expect(listarLixeira("c1", { tipo: null, busca: "", pagina: 1 })).rejects.toMatchObject({ codigo: "sem_acesso" });
    h.rpc.mockResolvedValue({ data: { ok: true, itens: [] }, error: null });
    await expect(listarLixeira("c1", { tipo: null, busca: "", pagina: 1 })).rejects.toBeInstanceOf(ErroLixeira);
  });
});
