// Physiq hml-19a (H-41 · jeito 2) — a porta da tela para a função nutricao (src/nutricao/servidor.ts): 1 chamada só, sem internet não
// chama, o erro vira ErroNutricao com o código da função e a FRASE FIXA (a mensagem crua do banco não chega à tela).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/nutricao/editor/lib/banco", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => h.invoke(...a) } } }));

import { ErroNutricao, MENSAGEM_ERRO_NUTRICAO, acaoNutricao, comFraseDoCodigo, mensagemErroNutricao } from "./servidor";
import { STATUS_DO_ERRO } from "../../supabase-principal/functions/_shared/nutricao-regras";

const respostaDeErro = (status: number, corpo: unknown) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } }) },
});

beforeEach(() => h.invoke.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("hml-19a — acaoNutricao", () => {
  it("chama a nutricao 1 vez com { ...corpo, acao } e devolve o corpo da resposta", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, linha: { id: "x" } }, error: null });
    const r = await acaoNutricao<{ linha: { id: string } }>("consulta_excluir", { id: "x", acao: "apagar_tudo" });
    expect(h.invoke).toHaveBeenCalledTimes(1);
    // a ação vai por último: um campo "acao" no corpo não troca a ação
    expect(h.invoke).toHaveBeenCalledWith("nutricao", { body: { id: "x", acao: "consulta_excluir" } });
    expect(r.linha.id).toBe("x");
  });

  it("sem internet: sem_internet sem chamar a função", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(acaoNutricao("consulta_excluir", { id: "x" })).rejects.toMatchObject({ codigo: "sem_internet", message: MENSAGEM_ERRO_NUTRICAO.sem_internet });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("a recusa da função vira ErroNutricao com o código e a frase fixa (nunca a mensagem do banco)", async () => {
    h.invoke.mockResolvedValue(respostaDeErro(403, { ok: false, erro: "sem_acesso", detalhe: 'new row violates row-level security policy for table "anamneses"' }));
    const e = await acaoNutricao("anamnese_criar", {}).catch((x) => x);
    expect(e).toBeInstanceOf(ErroNutricao);
    expect(e).toMatchObject({ codigo: "sem_acesso", message: "Você não tem permissão para fazer isso com este aluno." });
    expect(String(e.message)).not.toMatch(/row-level|anamneses/);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it("5xx sem corpo → erro_interno; a rede caiu (FunctionsFetchError) → rede; 200 com ok:false → o código", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsHttpError", context: new Response("bad gateway", { status: 502 }) } });
    await expect(acaoNutricao("consulta_excluir", {})).rejects.toMatchObject({ codigo: "erro_interno" });
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") } });
    await expect(acaoNutricao("consulta_excluir", {})).rejects.toMatchObject({ codigo: "rede", message: MENSAGEM_ERRO_NUTRICAO.rede });
    h.invoke.mockResolvedValueOnce({ data: { ok: false, erro: "nao_encontrado" }, error: null });
    await expect(acaoNutricao("consulta_excluir", {})).rejects.toMatchObject({ codigo: "nao_encontrado" });
    h.invoke.mockResolvedValueOnce({ data: null, error: null });
    await expect(acaoNutricao("consulta_excluir", {})).rejects.toMatchObject({ codigo: "erro_interno" });
  });

  it("todo código que a função devolve tem frase; código desconhecido cai no padrão", () => {
    for (const codigo of Object.keys(STATUS_DO_ERRO)) {
      if (codigo === "metodo") continue; // a tela nunca manda outro método
      expect(MENSAGEM_ERRO_NUTRICAO[codigo], codigo).toBeTruthy();
    }
    for (const codigo of ["acao_invalida", "dados_invalidos", "schema_invalido", "secao_invalida", "tipo_invalido", "arquivo_grande", "anexo_nao_enviado"]) {
      expect(MENSAGEM_ERRO_NUTRICAO[codigo], codigo).toBeTruthy();
    }
    expect(mensagemErroNutricao("xyz")).toBe("Não deu certo agora. Tente de novo.");
    expect(mensagemErroNutricao(null, "outra")).toBe("outra");
  });

  it("comFraseDoCodigo: troca a frase só do código pedido; o resto sobe igual", () => {
    expect(() => comFraseDoCodigo(new ErroNutricao("nao_encontrado"), { nao_encontrado: "Só quem escreveu pode mudar." })).toThrow("Só quem escreveu pode mudar.");
    const outro = new ErroNutricao("sem_acesso");
    expect(() => comFraseDoCodigo(outro, { nao_encontrado: "x" })).toThrow(outro);
    const comum = new Error("boom");
    expect(() => comFraseDoCodigo(comum, { nao_encontrado: "x" })).toThrow(comum);
  });
});
