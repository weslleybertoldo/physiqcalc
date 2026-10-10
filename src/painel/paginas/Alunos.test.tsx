import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlunoLinha, ListaAlunos } from "@/painel/alunos/regras";

const h = vi.hoisted(() => ({ listar: vi.fn(), rpc: vi.fn(), atribuir: vi.fn(), endereco: "" }));
vi.mock("@/nucleo/conta", () => ({
  useConta: () => ({ conta: { id: "c1", nome: "Consultoria Ferreira", codigo_convite: "PROF-LUCAS-FERREIRA", papeis: ["dono", "personal"] } }),
}));
vi.mock("@/ui/casca/topo", () => ({
  TopoPagina: ({ titulo, subtitulo, acoes }: { titulo?: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode }) => (
    <header><h1>{titulo}</h1><p data-testid="subtitulo">{subtitulo}</p>{acoes}</header>
  ),
}));
vi.mock("@/painel/alunos/api", async (orig) => ({ ...(await orig<typeof import("@/painel/alunos/api")>()), listarAlunos: h.listar, atribuirAlunos: h.atribuir }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: h.rpc, functions: { invoke: vi.fn() } } }));

import Alunos from "./Alunos";

function aluno(o: Partial<AlunoLinha>): AlunoLinha {
  return {
    id: "p1", rota_id: "t1", treino_user_id: "t1", tem_login: true, nome: "Rafael Moura", email: "rafael@x.com", telefone: null, foto_url: null,
    tags: ["VIP"], ativo: true, bloqueado: false, bloqueado_em: null, bloqueio_msg: null, conta_excluida: false, origem: "calc",
    criado_em: "2026-03-10T12:00:00Z", atualizado_em: "2026-09-01T12:00:00Z", modulos: ["treino"], personal: { id: "u-lucas", nome: "Lucas Ferreira" },
    nutricionista: null, pagamento: { s: "pendente", ate: null }, comprovante: false, sou_eu: false, ...o,
  };
}
function lista(o: Partial<ListaAlunos> = {}): ListaAlunos {
  return {
    total: 2, itens: [aluno({}), aluno({ id: "p2", rota_id: "p2", treino_user_id: null, nome: "Ana Lima", modulos: ["nutricao"], personal: null, nutricionista: { id: "u-camila", nome: "Camila Rocha" }, pagamento: null })],
    contagens: { ativos: 2, bloqueados: 1, desativados: 0, excluidas: 0, todos: 3 },
    vagas: { em_uso: 2, limite: 10, origem: "nova", faixa: "f10" },
    conta: { id: "c1", nome: "Consultoria Ferreira", modulos: ["treino", "nutricao"], origem: "nova", travada: false, dono_nome: "Lucas Ferreira" },
    eu: { id: "u-lucas", dono: true, personal: true, nutricionista: false },
    responsaveis: [{ id: "u-lucas", nome: "Lucas Ferreira", papeis: ["personal"], eu: true }, { id: "u-camila", nome: "Camila Rocha", papeis: ["nutricionista"], eu: false }],
    tags: ["VIP"], pendentes: 1, convites_pendentes: 0, ...o,
  };
}

/** O endereço atual (a página e os filtros que ficam nele). */
function Endereco() {
  h.endereco = useLocation().search;
  return null;
}

function montar(endereco = "/painel/alunos") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={[endereco]}>
        <Alunos />
        <Endereco />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const NOVOS = { ok: true, mes_atual: "2026-10", meses: [
  { mes: "2026-05", novos: 0 }, { mes: "2026-06", novos: 2 }, { mes: "2026-07", novos: 1 }, { mes: "2026-08", novos: 0 }, { mes: "2026-09", novos: 4 }, { mes: "2026-10", novos: 3 },
] };

beforeEach(() => {
  h.listar.mockReset();
  h.atribuir.mockReset();
  h.endereco = "";
  h.rpc.mockReset().mockImplementation(async (nome: string) => (nome === "alunos_novos_por_mes" ? { data: NOVOS, error: null } : { data: null, error: null }));
});

describe("W13 — Painel › Alunos (telas 6/7)", () => {
  it("linhas com foto, chips (TREINO · LUCAS / NUTRIÇÃO · CAMILA), tags, selos, vagas e o aviso dos bloqueados", async () => {
    h.listar.mockResolvedValue(lista());
    montar();
    expect(await screen.findByText("Rafael Moura")).toBeInTheDocument();
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
    expect(document.querySelector('[data-aluno-linha="p1"] [data-chip-aluno="treino"]')?.textContent).toBe("TREINO · LUCAS");
    expect(document.querySelector('[data-aluno-linha="p2"] [data-chip-aluno="nutricao"]')?.textContent).toBe("NUTRIÇÃO · CAMILA");
    expect(document.querySelector('[data-aluno-linha="p1"] [data-selo-aluno="pendente"]')).not.toBeNull();
    expect(screen.getByTestId("subtitulo").textContent).toBe("Consultoria Ferreira · 2 de 10 alunos ativos");
    expect(document.querySelector('[data-situacao-filtro="ativos"]')?.getAttribute("data-contagem")).toBe("2");
    expect(document.querySelector("[data-aviso-bloqueados]")?.textContent).toContain("1 aluno está com o acesso bloqueado");
    expect(document.querySelector("[data-pagina-alunos]")?.getAttribute("data-total-alunos")).toBe("2");
    // o filtro padrão é o do número do menu (Ativos)
    expect(h.listar.mock.calls[0][1]).toMatchObject({ situacao: "ativos" });
  });

  it("hml-14b (D15): a página vem do BANCO — 20 por vez com o deslocamento, \"1–20 de 41\" e a página no endereço", async () => {
    h.listar.mockResolvedValue(lista({ total: 41 }));
    montar();
    await screen.findByText("Rafael Moura");
    expect(h.listar.mock.calls[0].slice(2)).toEqual([0, 20]);
    const pag = () => document.querySelector('[data-lista="alunos"] [data-paginacao="alunos"]');
    expect(pag()?.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
    expect(document.querySelectorAll('[data-lista="alunos"] [data-item]')).toHaveLength(2);
    expect(document.querySelector("[data-ver-mais]")).toBeNull(); // o "Ver mais" (que parava no 500º) saiu
    fireEvent.click(pag()!.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.listar.mock.calls.some((c) => c[2] === 20 && c[3] === 20)).toBe(true));
    await waitFor(() => expect(h.endereco).toBe("?pagina=2"));
    expect(pag()?.getAttribute("data-pagina")).toBe("2");
  });

  it("hml-14b (D15): filtro mudou → volta à página 1 (e o endereço perde a página); a situação vai ao servidor", async () => {
    h.listar.mockResolvedValue(lista({ total: 61 }));
    montar("/painel/alunos?pagina=3");
    await screen.findByText("Rafael Moura");
    expect(h.listar.mock.calls[0].slice(2)).toEqual([40, 20]); // o endereço que chega com ?pagina=3 vale
    fireEvent.click(document.querySelector('[data-situacao-filtro="bloqueados"]')!);
    await waitFor(() => expect(h.listar.mock.calls.some((c) => c[1].situacao === "bloqueados" && c[2] === 0)).toBe(true));
    expect(h.listar.mock.calls.some((c) => c[1].situacao === "bloqueados" && c[2] !== 0)).toBe(false);
    await waitFor(() => expect(h.endereco).toBe("?situacao=bloqueados"));
  });

  it("hml-14b (D15): abrir um aluno e voltar mantém a página e a busca (os 2 no endereço); a busca nova volta à 1", async () => {
    h.listar.mockResolvedValue(lista({ total: 41 }));
    montar("/painel/alunos?q=rafa&pagina=2");
    await screen.findByText("Rafael Moura");
    expect(h.listar.mock.calls[0][1]).toMatchObject({ q: "rafa" });
    expect(h.listar.mock.calls[0].slice(2)).toEqual([20, 20]);
    expect((document.querySelector("[data-busca-alunos]") as HTMLInputElement).value).toBe("rafa");
    fireEvent.change(document.querySelector("[data-busca-alunos]")!, { target: { value: "ana" } });
    await waitFor(() => expect(h.listar.mock.calls.some((c) => c[1].q === "ana" && c[2] === 0)).toBe(true), { timeout: 1500 });
    await waitFor(() => expect(h.endereco).toBe("?q=ana"));
  });

  it("hml-14b (regra 4): erro do banco na página → o estado de erro da tela, nunca a lista vazia", async () => {
    h.listar.mockRejectedValue(new Error("banco fora"));
    montar();
    // a página tenta 1 vez de novo (retry: 1) antes de mostrar o erro
    expect(await screen.findByText("Não deu para carregar os alunos", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(document.querySelector('[data-pagina-alunos][data-estado="erro"]')).not.toBeNull();
    expect(screen.queryByText("Nenhum aluno ainda")).toBeNull();
  });

  it("hml-14b (D15): seleção em lote por página + \"todos os N do filtro\" com confirmação (500 em 500); atribui em lotes de 200", async () => {
    const todos = Array.from({ length: 250 }, (_, i) => aluno({ id: `s${i}`, nome: `Sem Resp ${i}`, personal: null, nutricionista: null }));
    h.listar.mockImplementation(async (_c: string, _f: unknown, offset: number, limite: number) =>
      lista({ total: 250, itens: todos.slice(offset, offset + Math.min(limite, 500)) }));
    h.atribuir.mockImplementation(async (_c: string, ids: string[]) => ({ atualizados: ids.length }));
    montar("/painel/alunos?responsavel=sem");
    await screen.findByText("Sem Resp 0");
    const quantos = () => document.querySelector("[data-atribuir-quantos]")?.getAttribute("data-atribuir-quantos");
    expect(document.querySelectorAll('[data-lista="alunos"] [data-item]')).toHaveLength(20);
    fireEvent.click(document.querySelector("[data-atribuir-todos]")!);
    expect(quantos()).toBe("20");
    expect(document.querySelector("[data-atribuir-quantos]")?.textContent).toBe("20 de 250");
    // "todos os 250 do filtro" pede confirmação antes de ler
    fireEvent.click(document.querySelector('[data-atribuir-todos-filtro="250"]')!);
    expect(await screen.findByText("Selecionar os 250 alunos do filtro?")).toBeInTheDocument();
    const antes = h.listar.mock.calls.length;
    fireEvent.click(document.querySelector("[data-atribuir-confirmar-todos]")!);
    await waitFor(() => expect(quantos()).toBe("250"));
    expect(h.listar.mock.calls.slice(antes).map((c) => [c[2], c[3]])).toEqual([[0, 500]]);
    fireEvent.click(document.querySelector("[data-atribuir-confirmar]")!);
    await waitFor(() => expect(h.atribuir).toHaveBeenCalledTimes(2));
    expect(h.atribuir.mock.calls.map((c) => (c[1] as string[]).length)).toEqual([200, 50]);
    expect(h.atribuir.mock.calls[0]).toEqual(["c1", todos.slice(0, 200).map((a) => a.id), "treino", "u-lucas"]);
    await waitFor(() => expect(quantos()).toBe("0"));
  }, 20_000);

  it("limite da faixa atingido: aviso com a mensagem da W4 e o uso atual", async () => {
    h.listar.mockResolvedValue(lista({ vagas: { em_uso: 10, limite: 10, origem: "nova", faixa: "f10" } }));
    montar();
    expect(await screen.findByText(/Seu plano permite 10 alunos ativos\. Mude de faixa em Configurações › Plano\. \(10 de 10 em uso\)/)).toBeInTheDocument();
  });

  it("lista vazia sem filtro convida a cadastrar", async () => {
    h.listar.mockResolvedValue(lista({ total: 0, itens: [], contagens: { ativos: 0, bloqueados: 0, desativados: 0, excluidas: 0, todos: 0 } }));
    montar();
    expect(await screen.findByText("Nenhum aluno ainda")).toBeInTheDocument();
  });

  it("W25 (N-9) — card 'Novos alunos por mês': 6 barras, o mês atual em destaque e o número de este mês (o do Dashboard)", async () => {
    h.listar.mockResolvedValue(lista());
    montar();
    await screen.findByText("Rafael Moura");
    await waitFor(() => expect(document.querySelector("[data-cartao-novos-por-mes]")?.getAttribute("data-novos-mes")).toBe("3"));
    expect(screen.getByText("Novos alunos por mês")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-novos-barra]")).toHaveLength(6);
    expect(document.querySelector('[data-novos-barra="2026-09"]')?.getAttribute("data-novos")).toBe("4");
    expect(document.querySelector("[data-novos-este-mes]")?.textContent).toBe("3");
    expect(h.rpc).toHaveBeenCalledWith("alunos_novos_por_mes", { p_conta: "c1", p_meses: 6 });
  });

  it("W25 — sem aluno novo nos 6 meses, o card mostra o texto (sem gráfico em branco)", async () => {
    h.rpc.mockImplementation(async () => ({ data: { ok: true, mes_atual: "2026-10", meses: NOVOS.meses.map((m) => ({ ...m, novos: 0 })) }, error: null }));
    h.listar.mockResolvedValue(lista());
    montar();
    expect(await screen.findByText(/Nenhum aluno novo nos últimos 6 meses/)).toBeInTheDocument();
    expect(document.querySelector("[data-grafico-novos]")).toBeNull();
  });
});
