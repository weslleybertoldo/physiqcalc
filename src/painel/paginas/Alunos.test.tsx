import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlunoLinha, ListaAlunos } from "@/painel/alunos/regras";

const h = vi.hoisted(() => ({ listar: vi.fn() }));
vi.mock("@/nucleo/conta", () => ({
  useConta: () => ({ conta: { id: "c1", nome: "Consultoria Ferreira", codigo_convite: "PROF-LUCAS-FERREIRA", papeis: ["dono", "personal"] } }),
}));
vi.mock("@/ui/casca/topo", () => ({
  TopoPagina: ({ titulo, subtitulo, acoes }: { titulo?: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode }) => (
    <header><h1>{titulo}</h1><p data-testid="subtitulo">{subtitulo}</p>{acoes}</header>
  ),
}));
vi.mock("@/painel/alunos/api", async (orig) => ({ ...(await orig<typeof import("@/painel/alunos/api")>()), listarAlunos: h.listar }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

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

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/painel/alunos"]}>
        <Alunos />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.listar.mockReset();
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

  it("filtro de situação vai para o servidor; Ver mais pede a próxima página", async () => {
    h.listar.mockResolvedValue(lista({ total: 25 }));
    montar();
    await screen.findByText("Rafael Moura");
    expect(screen.getByText("Mostrando 2 de 25")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver mais" }));
    await waitFor(() => expect(h.listar.mock.calls.some((c) => c[3] === 40)).toBe(true));
    fireEvent.click(document.querySelector('[data-situacao-filtro="bloqueados"]')!);
    await waitFor(() => expect(h.listar.mock.calls.some((c) => c[1].situacao === "bloqueados")).toBe(true));
  });

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
});
