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
vi.mock("@/hooks/useMensalidadeStatus", () => ({ useMensalidadeStatus: () => ({ status: null, pendente: false }) }));
vi.mock("@/rotas/registro", () => ({ existe: () => false }));
vi.mock("@/financeiro/useResumoFinanceiro", () => ({ useResumoFinanceiro: () => ({ resumo: h.resumo, carregando: false, erro: false }) }));

import GateBloqueioMaster from "./GateBloqueioMaster";
import GatePagamentoPendente from "./GatePagamentoPendente";
import GateSemModulo from "./GateSemModulo";
import { usePerfilReduzido } from "./pecas/modoReduzido";

function OApp() {
  const r = usePerfilReduzido();
  return <div>{r ? `perfil reduzido: ${r.titulo} — ${r.mensagem}` : "o app"}</div>;
}

function montar(Gate: React.ComponentType<{ children: React.ReactNode }>, caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="*" element={<Gate><OApp /></Gate>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.sessao = { situacao: situacao({ modulos_aluno: ["treino"], matriculas: [matricula()] }), sair: vi.fn(async () => {}) };
  h.auth = { user: { id: "t1" }, isStaff: false };
  h.resumo = null;
});

describe("W7 — aluno bloqueado pelo master: o Perfil segue com Sair, Exportar e Excluir (spec 9)", () => {
  beforeEach(() => {
    h.sessao.situacao = situacao({ modulos_aluno: ["treino"], matriculas: [matricula({ conta_alunos_bloqueados_em: "2026-09-28", conta_alunos_bloqueados_msg: "Regularize com o Lucas." })] });
  });
  it("/perfil abre no modo reduzido (com a mensagem do master)", () => {
    montar(GateBloqueioMaster, "/perfil");
    expect(screen.getByText("perfil reduzido: Acesso pausado — Regularize com o Lucas.")).toBeInTheDocument();
  });
  it("as outras abas e os itens do Perfil continuam fechados; a trava leva ao Perfil", () => {
    for (const rota of ["/treino", "/perfil/pagamentos", "/perfil/conta"]) {
      const r = montar(GateBloqueioMaster, rota);
      expect(screen.getByText("Acesso pausado")).toBeInTheDocument();
      expect(screen.queryByText("o app")).toBeNull();
      r.unmount();
    }
    montar(GateBloqueioMaster, "/treino");
    fireEvent.click(screen.getByRole("button", { name: /Exportar ou excluir meus dados/ }));
    expect(screen.getByText(/perfil reduzido/)).toBeInTheDocument();
  });
  it("sem bloqueio o Perfil é o completo", () => {
    h.sessao.situacao = situacao({ modulos_aluno: ["treino"], matriculas: [matricula()] });
    montar(GateBloqueioMaster, "/perfil");
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
});

describe("W7 — só Nutrição e aluno sem módulo abrem o Perfil", () => {
  it("só Nutrição (antes da aba Dieta nova): /perfil, /perfil/agenda e /perfil/conta abrem; o resto segue no aviso do Nutri", () => {
    h.sessao.situacao = situacao({ matriculas: [matricula({ modulos: ["nutricao"] })], modulos_aluno: ["nutricao"] });
    for (const rota of ["/perfil", "/perfil/agenda", "/perfil/conta", "/perfil/pagamentos"]) {
      const r = montar(GateSemModulo, rota);
      expect(screen.getByText("o app")).toBeInTheDocument();
      r.unmount();
    }
    montar(GateSemModulo, "/evolucao");
    expect(screen.getByText("Sua dieta continua no PhysiqNutri por enquanto")).toBeInTheDocument();
  });
  it("aluno sem módulo: o Perfil abre (Exportar, Excluir, o código do profissional); as abas não", () => {
    h.sessao.situacao = situacao({ matriculas: [matricula({ modulos: [] })], modulos_aluno: [] });
    const r = montar(GateSemModulo, "/perfil");
    expect(screen.getByText("o app")).toBeInTheDocument();
    r.unmount();
    montar(GateSemModulo, "/evolucao");
    expect(screen.getByText("Seu profissional ainda não liberou seu acesso")).toBeInTheDocument();
  });
  it("profissional sem matrícula continua voltando ao painel (não vê o Perfil do aluno)", () => {
    h.sessao.situacao = situacao({ contas: [conta({ plano: "nutricao", modulos: ["nutricao"], papeis: ["dono", "nutricionista"] })], modulos_aluno: [] });
    montar(GateSemModulo, "/perfil");
    expect(screen.getByText("Você ainda não é aluno no Physiq")).toBeInTheDocument();
  });
});

describe("W7 — inadimplente com o bloqueio ligado: só Perfil › Pagamentos abre (spec 9, R15)", () => {
  beforeEach(() => {
    h.resumo = [{
      paciente_id: "p1", conta_id: "c1", conta_nome: "Nutri", recebimento_modo: "pix_manual", bloquear_inadimplente: true, tem_chave: true,
      profissional: "Camila Rocha", mensalidade_valor: 150, plano_nome: null, pausada: false, pago_ate: "2026-01-10T12:00:00Z", desde: null,
      aguardando: false, assinatura_ativa: false, abertas: [], aguardando_avulsas: 0,
    }];
  });
  it("/perfil fica na trava 'Pagamento pendente'; /perfil/pagamentos abre", () => {
    const r = montar(GatePagamentoPendente, "/perfil");
    expect(screen.getByText("Pagamento pendente")).toBeInTheDocument();
    r.unmount();
    montar(GatePagamentoPendente, "/perfil/pagamentos");
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
});
