import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlunoResumo, PendenteResumo, ResumoConta } from "@/financeiro/tipos";
import type { CobrancaResumo, Transacao } from "./dados";

const h = vi.hoisted(() => ({
  transacoes: [] as unknown[],
  cobrancas: [] as unknown[],
  resumo: null as unknown,
}));
vi.mock("./dados", async (original) => ({
  ...(await original<typeof import("./dados")>()),
  listarTransacoes: vi.fn(async () => h.transacoes),
  listarCobrancasDoResumo: vi.fn(async () => h.cobrancas),
}));
vi.mock("@/financeiro/api", async (original) => ({
  ...(await original<typeof import("@/financeiro/api")>()),
  buscarResumoDaConta: vi.fn(async () => h.resumo),
}));

import { hojeSP } from "@/financeiro/regras";
import { abaDaUrl } from "./financeiroUtil";
import Lancamentos from "./Lancamentos";
import Resumo from "./Resumo";
import { aReceber, kpis, recebimentos, somarDias, somarMeses } from "./resumo";
import { padraoDoRecibo } from "./recibosUtil";
import type { FinanceiroConta } from "./useFinanceiro";

const HOJE = hojeSP();
const papeis = ["dono", "nutricionista"];
const f = {
  conta: { id: "c1", nome: "Consultoria Ferreira", profissionais: 2, papeis }, contaId: "c1", uid: "u-camila", dono: true, papeis, padrao: padraoDoRecibo(papeis),
  pronto: true, nomeProfissional: "Camila Rocha", pessoas: new Map(),
  assinaturaDe: (id: string) => ({ nome: id === "u-camila" ? "Camila Rocha" : "Lucas Ferreira", padrao: padraoDoRecibo(papeis), rotulo: "Lucas Ferreira (personal trainer)" }),
  recarregar: vi.fn(async () => {}),
  categorias: { data: [{ id: "cat1", nome: "Consulta", nutricionista_id: "u-camila" }] }, alunos: { data: [] }, modelos: { data: [] }, ultimo: { data: 6 }, equipe: { data: undefined },
} as unknown as FinanceiroConta;

const tx = (p: Partial<Transacao>): Transacao => ({
  id: "t", nutricionista_id: "u-camila", conta_id: "c1", paciente_id: null, tipo: "entrada", descricao: "Consulta", valor: 100, data: HOJE, metodo: "pix",
  observacao: null, estornada: false, recibo_id: null, categoria_id: "cat1", created_at: `${HOJE}T12:00:00Z`, categoria: { nome: "Consulta" }, paciente: null, ...p,
});

function montar(el: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  h.transacoes = [];
  h.cobrancas = [];
  h.resumo = { ok: true, hoje: HOJE, agora: new Date().toISOString(), dono: true, alunos: [], pendentes: [] } satisfies ResumoConta;
});

describe("W19 — Lançamentos (o Financeiro do Nutri)", () => {
  beforeEach(() => {
    h.transacoes = [
      tx({ id: "a", descricao: "Consulta de retorno", valor: 180, data: somarDias(HOJE, -2), paciente_id: "p1", paciente: { nome: "Maria da Silva", cpf: null } }),
      tx({ id: "b", descricao: "Aluguel da sala", tipo: "saida", valor: 900, data: somarDias(HOJE, -5), metodo: "transferencia", categoria_id: null, categoria: null }),
      tx({ id: "c", descricao: "Avaliação física", valor: 120, data: somarDias(HOJE, -9), metodo: "dinheiro", nutricionista_id: "u-lucas", paciente_id: "p2",
        paciente: { nome: "Rafael Moura", cpf: null }, recibo_id: "r1" }),
      tx({ id: "d", descricao: "Plano cancelado", valor: 300, data: somarDias(HOJE, -12), estornada: true }),
    ];
  });

  it("totais do período (estornada fora), autor do lançamento da equipe e 'Emitir recibo' só na entrada com aluno e sem recibo", async () => {
    montar(<Lancamentos f={f} params={new URLSearchParams()} setParams={() => {}} aoNova={() => {}} />);
    await waitFor(() => expect(document.querySelectorAll("[data-transacao]")).toHaveLength(4));
    expect(document.querySelector("[data-total-entradas]")?.getAttribute("data-total-entradas")).toBe("300.00");
    expect(document.querySelector("[data-total-saidas]")?.getAttribute("data-total-saidas")).toBe("900.00");
    expect(document.querySelector("[data-total-saldo]")?.getAttribute("data-total-saldo")).toBe("-600.00");
    expect(screen.getByText("1 estornada fora dos totais")).toBeInTheDocument();
    expect(document.querySelector('[data-transacao="c"] [data-transacao-autor]')?.textContent).toBe("por Lucas Ferreira");
    expect(document.querySelector('[data-transacao="a"] [data-transacao-autor]')).toBeNull();
    expect(document.querySelectorAll("[data-btn-emitir-recibo]")).toHaveLength(1);
    expect(document.querySelector('[data-transacao="a"] [data-btn-emitir-recibo]')).not.toBeNull();
    expect(document.querySelector('[data-transacao="c"] [data-badge-recibo]')).not.toBeNull();
    expect(document.querySelector('[data-transacao="d"] [data-badge-estornada]')).not.toBeNull();
    expect(document.querySelector("[data-contagem]")?.textContent).toBe("4 movimentações no período");
  });

  it("a forma de pagamento filtra (?forma=dinheiro) e a contagem diz quantas de quantas", async () => {
    montar(<Lancamentos f={f} params={new URLSearchParams("forma=dinheiro")} setParams={() => {}} aoNova={() => {}} />);
    await waitFor(() => expect(document.querySelectorAll("[data-transacao]")).toHaveLength(1));
    expect(document.querySelector("[data-transacao]")?.getAttribute("data-transacao")).toBe("c");
    expect(document.querySelector("[data-contagem]")?.textContent).toBe("1 movimentação de 4 no período");
    expect(document.querySelector("[data-total-entradas]")?.getAttribute("data-total-entradas")).toBe("120.00");
  });
});

describe("W19 — Resumo (tela 6)", () => {
  it("os 4 cartões, a Receita, as Cobranças do mês e Precisam de atenção batem com as regras do resumo", async () => {
    const mesPassado = somarMeses(HOJE, -1);
    h.transacoes = [tx({ id: "x1", valor: 400, data: HOJE }), tx({ id: "x2", valor: 250, data: mesPassado })];
    const cobs: CobrancaResumo[] = [
      { id: "k1", paciente_id: "p1", nutricionista_id: "u-camila", tipo: "mensalidade", descricao: "Mensalidade", valor: 249, vencimento: HOJE, status: "paga",
        forma: "pix_manual", pago_em: new Date().toISOString(), transacao_id: null, reembolsado_em: null, enviado_em: null, created_at: new Date().toISOString(), paciente: { nome: "Maria" } },
      { id: "k2", paciente_id: "p2", nutricionista_id: "u-camila", tipo: "avulsa", descricao: "Consulta de retorno", valor: 80, vencimento: somarDias(HOJE, -3), status: "aberta",
        forma: null, pago_em: null, transacao_id: null, reembolsado_em: null, enviado_em: null, created_at: new Date().toISOString(), paciente: { nome: "Carlos Souza" } },
    ];
    h.cobrancas = cobs;
    const alunos: AlunoResumo[] = [{ paciente_id: "p3", treino_user_id: null, nome: "Marina Alves", email: null, ativo: true, mensalidade_valor: 249, plano: null, pausada: false,
      pago_ate: new Date(Date.now() - 6 * 86_400_000).toISOString(), desde: null, aguardando: null, abertas: 0 }];
    const pendentes = [{ id: "pix1", paciente_id: "p4", enviado_em: new Date().toISOString(), created_at: new Date().toISOString(),
      aluno: { paciente_id: "p4", treino_user_id: null, nome: "João Pedro", email: null } } as unknown as PendenteResumo];
    h.resumo = { ok: true, hoje: HOJE, agora: new Date().toISOString(), dono: true, alunos, pendentes } satisfies ResumoConta;

    montar(<Resumo f={f} irPara={() => {}} />);
    await waitFor(() => expect(document.querySelector("[data-recebido-mes]")).not.toBeNull());
    const k = kpis(recebimentos(h.transacoes as Transacao[], cobs), aReceber(cobs, alunos, HOJE, new Date()), HOJE);
    const raiz = document.querySelector("[data-recebido-mes]")!;
    expect(raiz.getAttribute("data-recebido-mes")).toBe(k.recebidoMes.toFixed(2));
    expect(k.recebidoMes).toBe(649);
    expect(raiz.getAttribute("data-previsto-mes")).toBe(k.previstoMes.toFixed(2));
    expect(raiz.getAttribute("data-vencido")).toBe("329.00");
    expect(document.querySelectorAll("[data-kpis-financeiro] [data-kpi]")).toHaveLength(4);
    expect(document.querySelector("[data-cartao-receita]")).not.toBeNull();
    expect(document.querySelector('[data-fatia="pagas"]')?.getAttribute("data-fatia-valor")).toBe("249.00");
    const atencao = [...document.querySelectorAll("[data-cartao-atencao] [data-atencao]")].map((e) => e.getAttribute("data-atencao"));
    expect(atencao).toEqual(["PIX", "VENCIDA", "VENCIDA"]);
    expect(document.querySelector("[data-cartao-atencao]")?.textContent).toContain("Pix aguardando sua confirmação");
  });
});

describe("W19 — a aba pela URL", () => {
  it("?aba= escolhe; link antigo do Financeiro do Nutri (?de=&ate=) abre em Lançamentos; sem nada, o Resumo", () => {
    expect(abaDaUrl(new URLSearchParams("aba=recibos"))).toBe("recibos");
    expect(abaDaUrl(new URLSearchParams("aba=xyz"))).toBe("resumo");
    expect(abaDaUrl(new URLSearchParams("de=2026-09-01&ate=2026-09-30"))).toBe("lancamentos");
    expect(abaDaUrl(new URLSearchParams("tipo=saida"))).toBe("lancamentos");
    expect(abaDaUrl(new URLSearchParams())).toBe("resumo");
  });
});
