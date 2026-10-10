import { render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-17 (H-53): no /painel, o número do menu e o Dashboard pediam o MESMO total de alunos com chaves diferentes (2 pedidos
// idênticos; a Pré-consulta era o 3º) e o contador do WhatsApp saía antes da conta ativa (p_conta null) e repetia quando ela chegava.
const h = vi.hoisted(() => ({ listar: vi.fn(), resumo: vi.fn(), conta: { id: "c1" } as null | { id: string }, uid: "u1" }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), listarAlunos: (...a: unknown[]) => h.listar(...a) }));
vi.mock("@/painel/mensagens/api", () => ({ buscarResumo: (c: string | null) => h.resumo(c) }));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: h.uid } }) }));

import useContadorAlunos from "@/painel/contadores/Alunos";
import useContadorMensagens from "@/painel/contadores/Mensagens";
import { chaveResumoAlunos, useResumoAlunos } from "./useResumoAlunos";
import { FILTROS_PADRAO } from "./regras";

const LISTA = { total: 7, pendentes: 2, itens: [], conta: { id: "c1" } };

function comCliente() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Embrulho = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, Embrulho };
}

beforeEach(() => {
  h.listar.mockReset().mockResolvedValue(LISTA);
  h.resumo.mockReset().mockResolvedValue({ falhas: 0, serie_enviadas: [] });
  h.conta = { id: "c1" };
});

describe("useResumoAlunos (hml-17)", () => {
  it("o número do menu, o Dashboard e o \"Cadastrar aluno\" da Pré-consulta montados juntos → listarAlunos chamado 1×", async () => {
    const { Embrulho } = comCliente();
    let menu: number | undefined;
    let dashboard: number | undefined;
    let preconsulta: number | undefined;
    function Tela() {
      menu = useContadorAlunos();
      dashboard = useResumoAlunos("c1").data?.total; // o Dashboard (useDashboard → alunosQ)
      preconsulta = useResumoAlunos("c1").data?.pendentes; // o LigarAlunoDialog › CadastrarDaResposta
      return null;
    }
    render(<Tela />, { wrapper: Embrulho });
    await waitFor(() => expect(menu).toBe(7));
    expect(dashboard).toBe(7);
    expect(preconsulta).toBe(2);
    expect(h.listar).toHaveBeenCalledTimes(1);
    expect(h.listar).toHaveBeenCalledWith("c1", FILTROS_PADRAO, 0, 0);
  });

  it("a chave é a que a página Alunos e o perfil do aluno já invalidam (\"alunos-contador\")", () => {
    expect(chaveResumoAlunos("c1")).toEqual(["alunos-contador", "c1"]);
  });

  it("controle: conta diferente → outra chave e outro pedido; sem conta, nada", async () => {
    const { Embrulho } = comCliente();
    const a = renderHook(() => useResumoAlunos("c1"), { wrapper: Embrulho });
    const b = renderHook(() => useResumoAlunos("c2"), { wrapper: Embrulho });
    renderHook(() => useResumoAlunos(null), { wrapper: Embrulho });
    await waitFor(() => expect(a.result.current.isSuccess && b.result.current.isSuccess).toBe(true));
    expect(h.listar.mock.calls.map((c) => c[0]).sort()).toEqual(["c1", "c2"]);
  });
});

describe("contador do WhatsApp (hml-17)", () => {
  it("só pede com a conta ativa (1 pedido, já com a conta)", async () => {
    const { Embrulho } = comCliente();
    h.conta = null;
    const r = renderHook(() => useContadorMensagens(), { wrapper: Embrulho });
    await new Promise((x) => setTimeout(x, 20));
    expect(h.resumo).not.toHaveBeenCalled();
    h.conta = { id: "c1" };
    r.rerender();
    await waitFor(() => expect(h.resumo).toHaveBeenCalledTimes(1));
    expect(h.resumo).toHaveBeenCalledWith("c1");
  });
});
