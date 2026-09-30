import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pontos de extensão da casca do app (spec 11.1): travas de src/app-aluno/gates e faixas do topo de
// src/app-aluno/avisos. O registro é trocado por um falso — nenhum arquivo de mentira vai para o src.
const h = vi.hoisted(() => ({
  bloquear: false,
  dados: { carregando: false, usuario: { id: "u1", nome: "Rafa", email: null, fotoUrl: null }, ehProfissional: false, ehMaster: false, ehDono: false, papelRotulo: "Aluno", modulosAluno: ["treino"], conta: null, contas: [], plano: null, contadores: {} },
}));

vi.mock("@/ui/casca/dadosCasca", () => ({ useDadosCasca: () => h.dados }));
vi.mock("@/rotas/registro", async () => {
  const { lazy } = await import("react");
  const FaixaMensalidade = lazy(async () => ({ default: () => <div data-testid="faixa">Sua mensalidade vence em 3 dias</div> }));
  return {
    // W8/W10: as abas Treino e Evolução novas existem (a TreinosPage e o UserDashboard saíram); as outras ainda não
    existe: (grupo: string, nome: string) => grupo === "abasApp" && (nome === "Treino" || nome === "Evolucao"),
    tela: () => null,
    listar: (grupo: string) => (grupo === "avisosApp" ? [{ nome: "FaixaMensalidade", caminho: "x", carregar: async () => ({ default: () => null }), Componente: FaixaMensalidade }] : []),
    gatesApp: [
      {
        nome: "GateBloqueioAluno",
        Gate: ({ children }: { children: ReactNode }) => (h.bloquear ? <div data-testid="trava">Acesso pausado pelo seu profissional</div> : <>{children}</>),
      },
      { nome: "FaixaTeste", Gate: ({ children }: { children: ReactNode }) => <><div data-testid="faixa-gate">faixa da trava</div>{children}</> },
    ],
  };
});

import AppAlunoLayout from "./AppAlunoLayout";

function abrir(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route element={<AppAlunoLayout />}>
          <Route path="/treino" element={<div>conteúdo treino</div>} />
          <Route path="/evolucao" element={<div>conteúdo evolução</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.bloquear = false;
});

describe("casca do app: travas e faixas registradas", () => {
  it("faixa do topo aparece só na aba de abertura (Treino antes da W12)", async () => {
    abrir("/treino");
    expect(await screen.findByTestId("faixa")).toBeInTheDocument();
    expect(screen.getByText("conteúdo treino")).toBeInTheDocument();
  });

  it("em outra aba, sem a faixa do topo", async () => {
    abrir("/evolucao");
    expect(await screen.findByText("conteúdo evolução")).toBeInTheDocument();
    expect(screen.queryByTestId("faixa")).toBeNull();
  });

  it("travas envolvem as abas: faixa da trava + conteúdo, ou a tela da trava no lugar", async () => {
    const r = abrir("/evolucao");
    expect(await screen.findByTestId("faixa-gate")).toBeInTheDocument();
    r.unmount();
    h.bloquear = true;
    abrir("/evolucao");
    expect(await screen.findByTestId("trava")).toBeInTheDocument();
    expect(screen.queryByText("conteúdo evolução")).toBeNull();
    // a barra de abas continua (a trava decide o conteúdo, não a navegação)
    expect(document.querySelector("[data-tabbar]")).not.toBeNull();
  });
});
