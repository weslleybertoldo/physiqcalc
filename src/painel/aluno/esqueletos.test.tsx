import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-18a (H-40, E) — no lugar do `return null` enquanto carrega, o esqueleto do mesmo tamanho (nada aparece do nada nem empurra a
// tela) — e só onde o cartão vai aparecer: para quem nunca vê o cartão, o esqueleto seria um pulo novo.

const h = vi.hoisted(() => ({
  conta: { conta: null as null | { id: string; modulos: string[]; papeis: string[] }, ehMaster: false, ehDono: false },
  perfil: { data: undefined as unknown, isLoading: true },
  fin: { data: undefined as unknown, isLoading: true },
  auth: { user: null as unknown, loading: true, isMaster: false, isStaff: false },
}));
vi.mock("@/nucleo/conta", () => ({ useConta: () => h.conta }));
vi.mock("@/painel/aluno/dados/usePerfilAluno", () => ({ usePerfilAluno: () => h.perfil, chavePerfilAluno: (id: string) => ["perfil-aluno", id] }));
vi.mock("@/financeiro/ui/useFinanceiroDoAluno", () => ({ useFinanceiroDoAluno: () => h.fin }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.auth }));

import MasterLayout from "@/layouts/MasterLayout";
import KpiMensalidade from "./kpis/KpiMensalidade";
import CardDieta from "./resumo/CardDieta";
import CardFluxoConsulta from "./resumo/CardFluxoConsulta";

function montar(el: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false}>{el}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const nutri = { id: "c1", modulos: ["treino", "nutricao"], papeis: ["nutricionista"] };
const personal = { id: "c1", modulos: ["treino", "nutricao"], papeis: ["dono", "personal"] };
const soTreino = { id: "c1", modulos: ["treino"], papeis: ["dono", "personal"] };

beforeEach(() => {
  h.conta = { conta: null, ehMaster: false, ehDono: false };
  h.perfil = { data: undefined, isLoading: true };
  h.fin = { data: undefined, isLoading: true };
  h.auth = { user: null, loading: true, isMaster: false, isStaff: false };
});

describe("esqueletos no lugar do return null (hml-18a)", () => {
  it("Fluxo de consulta: a nutri vê o cartão-esqueleto (o mesmo tamanho, as 2/3 colunas) enquanto o perfil chega", () => {
    h.conta = { conta: nutri, ehMaster: false, ehDono: false };
    const { container } = montar(<CardFluxoConsulta alunoId="p1" />);
    const e = container.querySelector('[data-estado="carregando"]');
    expect(e).not.toBeNull();
    expect(e?.getAttribute("aria-busy")).toBe("true");
    expect(e?.className).toContain("md:col-span-2");
  });

  it("Fluxo de consulta: o personal (que nunca vê o cartão) não ganha esqueleto — sem pulo novo", () => {
    h.conta = { conta: personal, ehMaster: false, ehDono: true };
    const { container } = montar(<CardFluxoConsulta alunoId="p1" />);
    expect(container.innerHTML).toBe("");
  });

  it("Dieta do Resumo: conta com Nutrição → o esqueleto de 240 px; conta só de Treino → nada", () => {
    h.conta = { conta: personal, ehMaster: false, ehDono: true };
    const a = montar(<CardDieta alunoId="p1" />);
    expect(a.container.querySelector('[data-estado="carregando"]')?.className).toContain("min-h-[240px]");
    a.unmount();
    h.conta = { conta: soTreino, ehMaster: false, ehDono: true };
    const b = montar(<CardDieta alunoId="p1" />);
    expect(b.container.innerHTML).toBe("");
  });

  it("Mensalidade do cabeçalho: o dono vê o número com o esqueleto no valor; quem não vê a mensalidade, nada", () => {
    h.conta = { conta: personal, ehMaster: false, ehDono: true };
    const a = montar(<KpiMensalidade alunoId="p1" />);
    const kpi = a.container.querySelector('[data-kpi-mensalidade="carregando"]');
    expect(kpi).not.toBeNull();
    expect(kpi?.textContent).toContain("Mensalidade");
    a.unmount();
    h.conta = { conta: nutri, ehMaster: false, ehDono: false };
    const b = montar(<KpiMensalidade alunoId="p1" />);
    expect(b.container.innerHTML).toBe("");
  });

  it("a página antiga do master: o esqueleto enquanto a sessão chega (antes a área ficava vazia)", () => {
    const { container } = montar(<MasterLayout><span>biblioteca</span></MasterLayout>);
    const e = container.querySelector('[role="status"][data-estado="carregando"]');
    expect(e?.getAttribute("aria-label")).toBe("Carregando a página");
  });
});
