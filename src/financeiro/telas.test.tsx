import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conta, matricula, situacao } from "@/test/fixturesNucleo";
import type { CobrancaVista, FinanceiroProfissional, ResumoMatricula } from "./tipos";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  resumo: null as ResumoMatricula[] | null,
  financeiro: null as FinanceiroProfissional | null,
  navegar: vi.fn(),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/financeiro/useResumoFinanceiro", () => ({ useResumoFinanceiro: () => ({ resumo: h.resumo, carregando: false, erro: false }) }));
vi.mock("@/financeiro/ui/useFinanceiroDoAluno", () => ({
  useFinanceiroDoAluno: () => ({ data: h.financeiro, isLoading: false, recarregar: async () => {}, agir: async () => null }),
  chaveFinanceiroDoAluno: (id: string) => ["financeiro-aluno", id],
}));
vi.mock("react-router-dom", async (original) => ({ ...(await original<typeof import("react-router-dom")>()), useNavigate: () => h.navegar }));

import FaixaMensalidade from "@/app-aluno/avisos/FaixaMensalidade";
import GatePagamentoPendente from "@/app-aluno/gates/GatePagamentoPendente";
import KpiMensalidade from "@/painel/aluno/kpis/KpiMensalidade";
import CardFinanceiro from "@/painel/aluno/resumo/CardFinanceiro";

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const diaSP = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const ddmm = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

function resumo(p: Partial<ResumoMatricula> = {}): ResumoMatricula {
  return {
    paciente_id: "p1", conta_id: "c1", conta_nome: "Lucas Ferreira", recebimento_modo: "pix_manual", bloquear_inadimplente: false, tem_chave: true,
    profissional: "Lucas Ferreira", mensalidade_valor: 249, plano_nome: "Mensal", pausada: false, pago_ate: null, desde: null, aguardando: false,
    assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, ...p,
  };
}

function cobranca(p: Partial<CobrancaVista> = {}): CobrancaVista {
  return {
    id: "c1", paciente_id: "p1", tipo: "mensalidade", descricao: "Mensalidade", valor: 249, vencimento: diaSP(-40), status: "paga", forma: "pix_manual",
    metodo: null, mes_ref: `${diaSP(-40).slice(0, 7)}-01`, pago_em: dia(-40), enviado_em: null, cobre_de: null, cobre_ate: null, comprovante: true,
    comprovante_pdf: false, recusado_motivo: null, recusado_em: null, reembolsado_em: null, mp_status: null, mp: false, mp_simulado: false,
    transacao_id: null, pix_qr: null, pix_copia_cola: null, pix_expira_em: null, criado_por: null, confirmado_em: null, created_at: dia(-40), ...p,
  };
}

function financeiro(p: Partial<FinanceiroProfissional> = {}): FinanceiroProfissional {
  return {
    ok: true, ambiente: "staging", simulacao: true, hoje: diaSP(0), agora: new Date().toISOString(),
    aluno: { paciente_id: "p1", treino_user_id: "t1", nome: "Rafael Moura", email: "r@teste.com", cpf: null, foto_url: null, ativo: true, tags: [], conta_id: "c1", conta_nome: "Lucas", tem_login: true },
    permissoes: { master: false, dono: true, responsavel: true, mensalidade: true },
    conta: { id: "c1", nome: "Lucas", modo: "pix_manual", bloquear: false, origem: "legado_calc", chave: null },
    planos: [], mensalidade: { valor: 249, plano_id: null, plano: "Mensal", pausada: false, pago_ate: dia(20), desde: dia(-60), coberta: true },
    assinatura: null, cobrancas: [], ...p,
  };
}

function montar(el: React.ReactNode, caminho = "/treino") {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="*" element={el} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.sessao = { situacao: situacao({ modulos_aluno: ["treino"], matriculas: [matricula()] }), usuario: { id: "u1" } };
  h.resumo = null;
  h.financeiro = null;
  h.navegar.mockClear();
});

describe("faixa do topo (tela 1)", () => {
  it("vence em 3 dias: âmbar, 'R$ 249,00 · Pix' e o Pagar leva ao Pix da mensalidade", () => {
    h.resumo = [resumo({ pago_ate: dia(3) })];
    montar(<FaixaMensalidade />);
    const faixa = document.querySelector("[data-faixa-mensalidade]")!;
    expect(faixa.getAttribute("data-faixa-mensalidade")).toBe("vencendo");
    expect(screen.getByText("Sua mensalidade vence em 3 dias")).toBeInTheDocument();
    expect(screen.getByText("R$ 249,00 · Pix")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Pagar"));
    expect(h.navegar).toHaveBeenCalledWith("/perfil/pagamentos?pagar=mensalidade");
  });
  it("vencida fica vermelha; cobrança avulsa do Nutri leva à cobrança", () => {
    h.resumo = [resumo({ mensalidade_valor: null, abertas: [{ id: "cob-9", descricao: "Consulta", valor: 180, vencimento: diaSP(-2) }] })];
    montar(<FaixaMensalidade />);
    expect(document.querySelector("[data-faixa-mensalidade='vencida']")).not.toBeNull();
    fireEvent.click(screen.getByText("Pagar"));
    expect(h.navegar).toHaveBeenCalledWith("/perfil/pagamentos?pagar=cob-9");
  });
  it("em dia, sem mensalidade ou profissional: nada", () => {
    h.resumo = [resumo({ pago_ate: dia(20) })];
    const a = montar(<FaixaMensalidade />);
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    h.resumo = [resumo({ pago_ate: dia(-3) })];
    h.sessao = { situacao: situacao({ contas: [conta()] }), usuario: { id: "u1" } };
    const b = montar(<FaixaMensalidade />);
    expect(b.container).toBeEmptyDOMElement();
  });
});

describe("trava do inadimplente (R15, P13)", () => {
  const app = <GatePagamentoPendente><div>o app</div></GatePagamentoPendente>;
  it("conta com o bloqueio ligado e mensalidade vencida: 'Pagamento pendente' com Pagar", () => {
    h.resumo = [resumo({ bloquear_inadimplente: true, pago_ate: dia(-3) })];
    montar(app);
    expect(screen.getByText("Pagamento pendente")).toBeInTheDocument();
    expect(screen.getByText(/R\$ 249,00 vencido com Lucas/)).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-trava-pagar]")!);
    expect(h.navegar).toHaveBeenCalledWith("/perfil/pagamentos");
  });
  it("Perfil › Pagamentos abre mesmo travado", () => {
    h.resumo = [resumo({ bloquear_inadimplente: true, pago_ate: dia(-3) })];
    montar(app, "/perfil/pagamentos");
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
  it("bloqueio desligado, em dia, aguardando a confirmação, outra matrícula livre ou profissional: passa", () => {
    for (const r of [
      [resumo({ pago_ate: dia(-3) })],
      [resumo({ bloquear_inadimplente: true, pago_ate: dia(20) })],
      [resumo({ bloquear_inadimplente: true, pago_ate: dia(-3), aguardando: true })],
      [resumo({ bloquear_inadimplente: true, pago_ate: dia(-3) }), resumo({ paciente_id: "p2", pago_ate: dia(20) })],
    ]) {
      h.resumo = r;
      const m = montar(app);
      expect(screen.getByText("o app")).toBeInTheDocument();
      m.unmount();
    }
    h.resumo = [resumo({ bloquear_inadimplente: true, pago_ate: dia(-3) })];
    h.sessao = { situacao: situacao({ contas: [conta()] }), usuario: { id: "u1" } };
    montar(app);
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
});

describe("perfil do aluno no painel (tela 7)", () => {
  it("KPI Mensalidade: 'R$ 249' e 'pago até'; vencida em rosa; sem permissão some", () => {
    h.financeiro = financeiro();
    const a = montar(<KpiMensalidade alunoId="t1" />);
    expect(document.querySelector("[data-kpi-mensalidade='em_dia']")?.textContent).toContain("R$ 249");
    expect(screen.getByText(`pago até ${ddmm(dia(20))}`)).toBeInTheDocument();
    a.unmount();
    h.financeiro = financeiro({ mensalidade: { valor: 249, plano_id: null, plano: null, pausada: false, pago_ate: dia(-2), desde: null, coberta: false } });
    const b = montar(<KpiMensalidade alunoId="t1" />);
    expect(document.querySelector("[data-kpi-mensalidade='vencida']")).not.toBeNull();
    b.unmount();
    h.financeiro = financeiro({ permissoes: { master: false, dono: false, responsavel: true, mensalidade: false } });
    const c = montar(<KpiMensalidade alunoId="t1" />);
    expect(c.container).toBeEmptyDOMElement();
  });
  it("card Financeiro: 'R$ 249/MÊS', 'Emitir recibo' e a cobrança em aberto antes das pagas com ✓", () => {
    h.financeiro = financeiro({
      cobrancas: [
        cobranca({ id: "paga-1" }),
        cobranca({ id: "paga-2", pago_em: dia(-10), created_at: dia(-10) }),
        cobranca({ id: "aberta-1", tipo: "avulsa", descricao: "Avaliação", status: "aberta", forma: null, vencimento: diaSP(5), pago_em: null, created_at: dia(-1) }),
      ],
    });
    montar(<CardFinanceiro alunoId="t1" />);
    const card = document.querySelector("[data-card-financeiro]")!;
    expect(card.textContent).toContain("R$ 249/MÊS");
    expect(screen.getByText("Emitir recibo").getAttribute("href")).toBe("/painel/alunos/t1/financeiro?recibo=novo");
    expect([...card.querySelectorAll("[data-cobranca]")].map((e) => e.getAttribute("data-cobranca"))).toEqual(["aberta-1", "paga-2", "paga-1"]);
    expect(card.querySelector("[data-cobranca='aberta-1']")?.getAttribute("data-cobranca-situacao")).toBe("a_vencer");
  });
});
