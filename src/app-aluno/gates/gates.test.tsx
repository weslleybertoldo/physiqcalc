import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conta, matricula, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  auth: { user: null as null | { id: string }, isStaff: false },
  status: null as null | { bloqueadoPeloMaster?: boolean },
  dietaNova: false,
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.auth }));
vi.mock("@/hooks/useMensalidadeStatus", () => ({ useMensalidadeStatus: () => ({ status: h.status, pendente: false }) }));
vi.mock("@/rotas/registro", () => ({ existe: (g: string, n: string) => g === "abasApp" && n === "Dieta" && h.dietaNova }));

import GateBloqueioMaster from "./GateBloqueioMaster";
import GateSemModulo from "./GateSemModulo";
import GateSessaoTreino from "./GateSessaoTreino";

const sair = vi.fn(async () => {});
const tentar = vi.fn();
function montar(Gate: React.ComponentType<{ children: React.ReactNode }>, caminho = "/treino") {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/boas-vindas" element={<div>tela boas-vindas</div>} />
        <Route path="*" element={<Gate><div>o app</div></Gate>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.sessao = { situacao: situacao({ modulos_aluno: ["treino"], matriculas: [matricula()] }), treino: { estado: "pronto", erro: null }, sair, tentarTreinoDeNovo: tentar };
  h.auth = { user: { id: "t1" }, isStaff: false };
  h.status = null;
  h.dietaNova = false;
  sair.mockClear();
  tentar.mockClear();
});

describe("GateBloqueioMaster", () => {
  it("master bloqueou a conta do aluno → Acesso pausado com a mensagem; Sair funciona", () => {
    h.sessao.situacao = situacao({ modulos_aluno: ["treino"], matriculas: [matricula({ conta_alunos_bloqueados_em: "2026-09-28", conta_alunos_bloqueados_msg: "Regularize com o Lucas" })] });
    montar(GateBloqueioMaster);
    expect(screen.getByText("Acesso pausado")).toBeInTheDocument();
    expect(screen.getByText("Regularize com o Lucas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Sair/ }));
    expect(sair).toHaveBeenCalled();
  });
  it("bloqueio do painel master antigo (status-lite do Treino) também trava", () => {
    h.status = { bloqueadoPeloMaster: true };
    montar(GateBloqueioMaster);
    expect(screen.getByText("Acesso pausado")).toBeInTheDocument();
  });
  it("profissional e aluno livre passam", () => {
    h.status = { bloqueadoPeloMaster: true };
    h.auth.isStaff = true;
    montar(GateBloqueioMaster);
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
});

describe("GateSemModulo", () => {
  it("sem nada → Boas-vindas", () => {
    h.sessao.situacao = situacao({ sem_nada: true });
    montar(GateSemModulo);
    expect(screen.getByText("tela boas-vindas")).toBeInTheDocument();
  });
  it("matrícula sem módulo → 'Seu profissional ainda não liberou seu acesso'", () => {
    h.sessao.situacao = situacao({ matriculas: [matricula({ modulos: [] })], modulos_aluno: [] });
    montar(GateSemModulo);
    expect(screen.getByText("Seu profissional ainda não liberou seu acesso")).toBeInTheDocument();
  });
  it("profissional sem matrícula no app de aluno → volta ao painel", () => {
    h.sessao.situacao = situacao({ contas: [conta({ plano: "nutricao", modulos: ["nutricao"], papeis: ["dono", "nutricionista"] })], modulos_aluno: [] });
    montar(GateSemModulo);
    expect(screen.getByText("Você ainda não é aluno no Physiq")).toBeInTheDocument();
  });
  it("só Nutrição antes da aba Dieta nova → 'use o site do PhysiqNutri'; com a aba nova, passa", () => {
    h.sessao.situacao = situacao({ matriculas: [matricula({ modulos: ["nutricao"] })], modulos_aluno: ["nutricao"] });
    const r = montar(GateSemModulo);
    expect(screen.getByText("Sua dieta continua no PhysiqNutri por enquanto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir o PhysiqNutri/ })).toHaveAttribute("href", "https://nutri.physiqcalc.com.br/app/entrar");
    r.unmount();
    h.dietaNova = true;
    montar(GateSemModulo);
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
  it("sem situação (principal fora do ar) não trava", () => {
    h.sessao.situacao = null;
    montar(GateSemModulo);
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
});

describe("GateSessaoTreino", () => {
  it("troca falhou por rede na aba Treino → 'Não foi possível abrir seu treino' + Tentar de novo", () => {
    h.sessao = { ...h.sessao, situacao: situacao({ precisa_treino: true, modulos_aluno: ["treino"] }), treino: { estado: "erro", erro: "rede" } };
    h.auth.user = null;
    montar(GateSessaoTreino, "/treino");
    expect(screen.getByText("Não foi possível abrir seu treino")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(tentar).toHaveBeenCalled();
  });
  it("conflito de conta → conferência do master, sem 'tentar de novo'", () => {
    h.sessao = { ...h.sessao, situacao: situacao({ precisa_treino: true }), treino: { estado: "erro", erro: "conflito" } };
    h.auth.user = null;
    montar(GateSessaoTreino, "/");
    expect(screen.getByText("Sua conta precisa de uma conferência")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tentar de novo/ })).toBeNull();
  });
  it("fora das abas do Treino (Perfil, Dieta) não trava; com sessão do Treino também não", () => {
    h.sessao = { ...h.sessao, situacao: situacao({ precisa_treino: true }), treino: { estado: "erro", erro: "rede" } };
    h.auth.user = null;
    const r = montar(GateSessaoTreino, "/perfil/pagamentos");
    expect(screen.getByText("o app")).toBeInTheDocument();
    r.unmount();
    h.auth.user = { id: "t1" };
    montar(GateSessaoTreino, "/treino");
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
});
