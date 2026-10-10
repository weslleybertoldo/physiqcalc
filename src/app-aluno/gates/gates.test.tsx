import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conta, matricula, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  auth: { user: null as null | { id: string }, isStaff: false },
  resumo: null as null | Array<Record<string, unknown>>,
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.auth }));
vi.mock("@/financeiro/useResumoFinanceiro", () => ({ useResumoFinanceiro: () => ({ resumo: h.resumo, carregando: false, erro: false }) }));

import GateBloqueioMaster from "./GateBloqueioMaster";
import GateSemModulo from "./GateSemModulo";
import GateSessaoTreino from "./GateSessaoTreino";

const sair = vi.fn(async () => {});
const tentar = vi.fn();
function montar(Gate: React.ComponentType<{ children: React.ReactNode }>, caminho = "/treino") {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={[caminho]}>
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
  h.resumo = null;
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
  it("profissional e aluno livre passam (W28: só o bloqueio do núcleo vale — o status-lite do Treino saiu)", () => {
    const r = montar(GateBloqueioMaster);
    expect(screen.getByText("o app")).toBeInTheDocument();
    r.unmount();
    h.sessao.situacao = situacao({ modulos_aluno: ["treino"], matriculas: [matricula({ conta_alunos_bloqueados_em: "2026-09-28" })] });
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
  it("hml-09 (D7): sem nada também abre o Perfil (o \"Excluir minha conta\" da /excluir-conta) — o resto segue nas Boas-vindas", () => {
    h.sessao.situacao = situacao({ sem_nada: true });
    for (const rota of ["/perfil", "/perfil?excluir=1", "/perfil/conta"]) {
      const { unmount } = montar(GateSemModulo, rota);
      expect(screen.getByText("o app")).toBeInTheDocument();
      unmount();
    }
    for (const rota of ["/", "/treino", "/dieta", "/perfilx"]) {
      const { unmount } = montar(GateSemModulo, rota);
      expect(screen.getByText("tela boas-vindas")).toBeInTheDocument();
      unmount();
    }
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
  it("W11: só Nutrição entra no app — a trava 'use o site do PhysiqNutri' da W3 saiu com a aba Dieta nova", () => {
    h.sessao.situacao = situacao({ matriculas: [matricula({ modulos: ["nutricao"] })], modulos_aluno: ["nutricao"] });
    for (const rota of ["/", "/dieta", "/evolucao", "/perfil"]) {
      const r = montar(GateSemModulo, rota);
      expect(screen.getByText("o app")).toBeInTheDocument();
      expect(screen.queryByText(/continua no PhysiqNutri/)).toBeNull();
      r.unmount();
    }
  });
  it("sem situação (principal fora do ar) não trava", () => {
    h.sessao.situacao = null;
    montar(GateSemModulo);
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
  it("W11 (R16): só Nutrição com cobrança a pagar — esta trava não fecha o app (a cobrança fica com a trava de pagamento e a faixa)", () => {
    h.sessao.situacao = situacao({ matriculas: [matricula({ modulos: ["nutricao"] })], modulos_aluno: ["nutricao"] });
    h.resumo = [{
      paciente_id: "p-1", conta_id: "c-1", conta_nome: "Nutri", recebimento_modo: "pix_manual", bloquear_inadimplente: true, tem_chave: true,
      profissional: "Marina Souza", mensalidade_valor: null, plano_nome: null, pausada: false, pago_ate: null, desde: null, aguardando: false,
      assinatura_ativa: false, abertas: [{ id: "cob-1", descricao: "Consulta", valor: 180, vencimento: "2026-09-01" }], aguardando_avulsas: 0,
    }];
    const r1 = montar(GateSemModulo, "/perfil/pagamentos");
    expect(screen.getByText("o app")).toBeInTheDocument();
    r1.unmount();
    montar(GateSemModulo, "/dieta");
    expect(screen.getByText("o app")).toBeInTheDocument();
    expect(document.querySelector("[data-trava-pagar]")).toBeNull();
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
    montar(GateSessaoTreino, "/treino");
    expect(screen.getByText("Sua conta precisa de uma conferência")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tentar de novo/ })).toBeNull();
  });
  it("W12: o Início (\"/\") não espera a troca nem fecha com o erro — o card do treino cuida disso no próprio lugar", () => {
    h.sessao = { ...h.sessao, situacao: situacao({ precisa_treino: true, modulos_aluno: ["treino", "nutricao"] }), treino: { estado: "trocando", erro: null } };
    h.auth.user = null;
    const r = montar(GateSessaoTreino, "/");
    expect(screen.getByText("o app")).toBeInTheDocument();
    r.unmount();
    h.sessao = { ...h.sessao, treino: { estado: "erro", erro: "rede" } };
    montar(GateSessaoTreino, "/");
    expect(screen.getByText("o app")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível abrir seu treino")).toBeNull();
  });
  it("W5: a troca ainda não chegou → 'Abrindo seu treino' só nas abas do Treino (a casca não espera mais)", () => {
    h.sessao = { ...h.sessao, situacao: situacao({ precisa_treino: true, modulos_aluno: ["treino"] }), treino: { estado: "trocando", erro: null } };
    h.auth.user = null;
    const r = montar(GateSessaoTreino, "/treino");
    expect(screen.getByText(/Abrindo seu treino/)).toBeInTheDocument();
    expect(screen.queryByText("o app")).toBeNull();
    r.unmount();
    montar(GateSessaoTreino, "/perfil/pagamentos");
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
  it("W5: limite de tentativas → 'Muitas tentativas' e o 'Tentar de novo' é da pessoa", () => {
    h.sessao = { ...h.sessao, situacao: situacao({ precisa_treino: true, modulos_aluno: ["treino"] }), treino: { estado: "erro", erro: "limite" } };
    h.auth.user = null;
    montar(GateSessaoTreino, "/evolucao");
    expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(tentar).toHaveBeenCalledTimes(1);
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
