import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlunoResumo, MensalidadesDaConta, PendenteResumo, ResumoConta } from "@/financeiro/tipos";
import type { CobrancaResumo, FiltrosLancamentos, Recibo, Transacao } from "./dados";

// hml-14b (B21 · D14): o "banco" destes testes usa as MESMAS regras que a migration aplica (o espelho em financeiroUtil — a prova
// de que o SQL bate com elas é a local da migration, ~/projetos/physiqcalc-scratch/hml/hml14b/A/pglite/sql_test.mjs): cada chamada
// devolve só a página pedida e o total, como as RPCs.
const h = vi.hoisted(() => ({
  transacoes: [] as unknown[],
  cobrancas: [] as unknown[],
  recibos: [] as unknown[],
  resumo: null as unknown,
  mensalidades: null as null | ((pagina: number) => unknown),
  erro: null as Error | null,
  pedidos: [] as Array<{ nome: string; pagina?: number; filtros?: unknown; busca?: string }>,
}));
vi.mock("./dados", async (original) => {
  const real = await original<typeof import("./dados")>();
  const util = await import("./financeiroUtil");
  const pag = await import("@/lib/paginacao");
  const { diaSP } = await import("@/financeiro/regras");
  const doPeriodo = (de: string, ate: string) => (h.transacoes as Transacao[]).filter((t) => t.data >= de && t.data <= ate);
  // o filtro e a ordem do banco (financeiro_transacoes_visiveis): tipo, categoria e forma; o texto (todas as palavras, sem acento/caixa)
  // na descrição, no aluno, na categoria e na observação; a data mais recente primeiro (empate: a gravada por último) — hml-14d (D41):
  // aqui no mock, no lugar do filtrarTransacoes/ordenarTransacoes (só de teste), que saíram
  const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  // as palavras da busca (at\u00e9 6, sem acento/caixa) \u2014 como o banco corta o termo
  const palavras = (q: string | null | undefined) => semAcento(q ?? "").split(" ").filter(Boolean).slice(0, 6);
  const filtrar = (de: string, ate: string, f: FiltrosLancamentos) => {
    const ps = palavras(f.q);
    return doPeriodo(de, ate)
      .filter((t) => (!f.tipo || t.tipo === f.tipo) && (!f.categoria || t.categoria_id === f.categoria) && (!f.metodo || t.metodo === f.metodo))
      .filter((t) => ps.every((p) => semAcento([t.descricao, t.paciente?.nome, t.categoria?.nome, t.observacao].filter(Boolean).join(" ")).includes(p)))
      .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  };
  const totais = (de: string, ate: string, f: FiltrosLancamentos) => {
    const t = util.totais(filtrar(de, ate, f));
    const cats = new Map<string, string>();
    for (const x of doPeriodo(de, ate)) if (x.categoria_id && x.categoria) cats.set(x.categoria_id, x.categoria.nome);
    return { ...t, totalPeriodo: doPeriodo(de, ate).length, categorias: [...cats.entries()].map(([id, nome]) => ({ id, nome })) };
  };
  return {
    ...real,
    listarLancamentos: vi.fn(async (_c: string, de: string, ate: string, f: FiltrosLancamentos, pagina: number, porPagina = pag.POR_PAGINA) => {
      h.pedidos.push({ nome: "lancamentos", pagina, filtros: f });
      if (h.erro) throw h.erro;
      const todas = filtrar(de, ate, f);
      const [a, b] = pag.intervalo(pagina, porPagina);
      return { itens: todas.slice(a, b + 1), total: todas.length };
    }),
    totaisDoPeriodo: vi.fn(async (_c: string, de: string, ate: string, f: FiltrosLancamentos) => {
      if (h.erro) throw h.erro;
      return totais(de, ate, f);
    }),
    resumoDoPeriodo: vi.fn(async (_c: string, de: string, ate: string) => {
      const vazio = { tipo: "", categoria: "", metodo: "", q: "" };
      const porDia = new Map<string, number>();
      for (const t of doPeriodo(de, ate)) {
        if (t.tipo !== "entrada" || t.estornada) continue;
        const k = `${t.data}|${t.categoria?.nome ?? ""}`;
        porDia.set(k, (porDia.get(k) ?? 0) + Number(t.valor));
      }
      const cobs = new Map<string, number>();
      for (const c of h.cobrancas as CobrancaResumo[]) {
        const dia = diaSP(c.pago_em);
        if (c.status !== "paga" || c.reembolsado_em || c.transacao_id || !dia || dia < de || dia > ate) continue;
        cobs.set(dia, (cobs.get(dia) ?? 0) + Number(c.valor));
      }
      return {
        ...totais(de, ate, vazio),
        entradasPorDia: [...porDia.entries()].map(([k, valor]) => ({ dia: k.slice(0, 10), categoria: k.slice(11) || null, valor })),
        cobrancasPorDia: [...cobs.entries()].map(([dia, valor]) => ({ dia, valor })),
      };
    }),
    listarCobrancasDoResumo: vi.fn(async () => h.cobrancas),
    listarRecibos: vi.fn(async (_c: string, busca: string, pagina: number) => {
      h.pedidos.push({ nome: "recibos", pagina, busca });
      if (h.erro) throw h.erro;
      const ps = palavras(busca);
      const todos = (h.recibos as Recibo[]).filter((r) => {
        const alvo = palavras([r.paciente?.nome, r.descricao, String(r.numero).padStart(4, "0")].filter(Boolean).join(" ")).join(" ");
        return ps.every((p) => alvo.includes(p));
      });
      const [a, b] = pag.intervalo(pagina);
      return { itens: todos.slice(a, b + 1), total: todos.length, soma: todos.reduce((s, r) => s + Number(r.valor), 0) };
    }),
  };
});
vi.mock("@/financeiro/api", async (original) => ({
  ...(await original<typeof import("@/financeiro/api")>()),
  buscarResumoDaConta: vi.fn(async () => h.resumo),
  buscarMensalidadesDaConta: vi.fn(async (_c: string, p: { pagina: number; paginaSem: number; busca: string }) => {
    h.pedidos.push({ nome: "mensalidades", pagina: p.pagina, busca: p.busca });
    if (h.erro) throw h.erro;
    return h.mensalidades?.(p.pagina);
  }),
}));

import { hojeSP } from "@/financeiro/regras";
import AbaCategorias from "./Categorias";
import { abaDaUrl } from "./financeiroUtil";
import Lancamentos from "./Lancamentos";
import Mensalidades from "./Mensalidades";
import Recibos from "./Recibos";
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
  categorias: { data: [{ id: "cat1", nome: "Consulta", nutricionista_id: "u-camila" }] }, modelos: { data: [] }, ultimo: { data: 6 }, equipe: { data: undefined },
} as unknown as FinanceiroConta;

const tx = (p: Partial<Transacao>): Transacao => ({
  id: "t", nutricionista_id: "u-camila", conta_id: "c1", paciente_id: null, tipo: "entrada", descricao: "Consulta", valor: 100, data: HOJE, metodo: "pix",
  observacao: null, estornada: false, recibo_id: null, categoria_id: "cat1", created_at: `${HOJE}T12:00:00Z`, categoria: { nome: "Consulta" }, paciente: null, ...p,
});

const sonda: { busca: string } = { busca: "" };
function Endereco() {
  sonda.busca = useLocation().search;
  return null;
}
/** Lançamentos recebe os parâmetros da página (como em paginas/Financeiro.tsx) */
function TelaLancamentos() {
  const [sp, setSp] = useSearchParams();
  return <Lancamentos f={f} params={sp} setParams={setSp} aoNova={() => {}} />;
}

function montar(el: React.ReactNode, endereco = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[endereco]}>{el}<Endereco /></MemoryRouter></QueryClientProvider>);
}
const atributo = (sel: string, nome: string) => document.querySelector(sel)?.getAttribute(nome) ?? null;
const proxima = (lista: string) => fireEvent.click(document.querySelector(`[data-paginacao="${lista}"] [data-pagina-proxima]`)!);

beforeEach(() => {
  h.transacoes = [];
  h.cobrancas = [];
  h.recibos = [];
  h.erro = null;
  h.pedidos = [];
  h.resumo = { ok: true, hoje: HOJE, agora: new Date().toISOString(), dono: true, alunos: [], pendentes: [] } satisfies ResumoConta;
  h.mensalidades = null;
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
    montar(<TelaLancamentos />);
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
    // uma página só: o rótulo, sem setas
    expect(atributo('[data-paginacao="lancamentos"]', "data-total")).toBe("4");
    expect(document.querySelector('[data-paginacao="lancamentos"] [data-pagina-proxima]')).toBeNull();
  });

  it("a forma de pagamento filtra (?forma=dinheiro) e a contagem diz quantas de quantas", async () => {
    montar(<TelaLancamentos />, "/?forma=dinheiro");
    await waitFor(() => expect(document.querySelectorAll("[data-transacao]")).toHaveLength(1));
    expect(document.querySelector("[data-transacao]")?.getAttribute("data-transacao")).toBe("c");
    expect(document.querySelector("[data-contagem]")?.textContent).toBe("1 movimentação de 4 no período");
    expect(document.querySelector("[data-total-entradas]")?.getAttribute("data-total-entradas")).toBe("120.00");
    // o filtro foi ao banco (não veio tudo para filtrar aqui)
    expect(h.pedidos.filter((p) => p.nome === "lancamentos").every((p) => (p.filtros as FiltrosLancamentos).metodo === "dinheiro")).toBe(true);
  });
});

describe("hml-14b — Lançamentos por página do banco (B21 · D14)", () => {
  // 41 entradas de 10 reais (a 41ª, a mais antiga, é "Última consulta"), mais 1 estornada
  beforeEach(() => {
    h.transacoes = [
      ...Array.from({ length: 41 }, (_, i) => tx({ id: `t${String(i).padStart(2, "0")}`, descricao: i === 40 ? "Última consulta" : `Consulta ${i}`, valor: 10,
        data: somarDias(HOJE, -Math.floor(i / 2)), created_at: `${HOJE}T${String(10 + (i % 2)).padStart(2, "0")}:00:00Z` })),
      tx({ id: "est", descricao: "Estornada", valor: 999, data: somarDias(HOJE, -25), estornada: true }),
    ];
  });

  it("mostra 20, '1–20 de 42', os totais do período inteiro (não só da página) e a página no endereço", async () => {
    montar(<TelaLancamentos />);
    await waitFor(() => expect(document.querySelectorAll('[data-lista="lancamentos"] [data-item]')).toHaveLength(20));
    expect(document.querySelector('[data-paginacao="lancamentos"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 42");
    expect(atributo("[data-total-entradas]", "data-total-entradas")).toBe("410.00");
    expect(screen.getByText("1 estornada fora dos totais")).toBeInTheDocument();
    // o pedido foi da página 1 (20 itens); nada de "Ver mais"
    expect(h.pedidos.filter((p) => p.nome === "lancamentos").map((p) => p.pagina)).toEqual([1]);
    expect(document.querySelector("[data-ver-mais]")).toBeNull();
    proxima("lancamentos");
    await waitFor(() => expect(atributo('[data-paginacao="lancamentos"]', "data-pagina")).toBe("2"));
    expect(sonda.busca).toBe("?pagina=2");
    proxima("lancamentos");
    await waitFor(() => expect(document.querySelector('[data-paginacao="lancamentos"] [data-paginacao-rotulo]')?.textContent).toBe("41–42 de 42"));
    await waitFor(() => expect(screen.getByText("Última consulta")).toBeInTheDocument());
    expect(sonda.busca).toBe("?pagina=3");
    expect(h.pedidos.filter((p) => p.nome === "lancamentos").map((p) => p.pagina)).toEqual([1, 2, 3]);
  });

  it("a busca vai ao banco, acha o da página 3 estando na 3 e volta à página 1 (sem acento: 'ultima' acha 'Última')", async () => {
    montar(<TelaLancamentos />, "/?pagina=3");
    await waitFor(() => expect(atributo('[data-paginacao="lancamentos"]', "data-pagina")).toBe("3"));
    fireEvent.change(document.querySelector("[data-busca-transacoes]")!, { target: { value: "ultima" } });
    await waitFor(() => expect(document.querySelectorAll('[data-lista="lancamentos"] [data-item]')).toHaveLength(1), { timeout: 3000 });
    expect(screen.getByText("Última consulta")).toBeInTheDocument();
    expect(sonda.busca).toBe("?q=ultima");
    const ultimo = h.pedidos.filter((p) => p.nome === "lancamentos").at(-1)!;
    expect([ultimo.pagina, (ultimo.filtros as FiltrosLancamentos).q]).toEqual([1, "ultima"]);
    // nenhum pedido saiu com a página velha e o filtro novo
    expect(h.pedidos.some((p) => p.nome === "lancamentos" && p.pagina !== 1 && (p.filtros as FiltrosLancamentos).q)).toBe(false);
    expect(document.querySelector("[data-contagem]")?.textContent).toBe("1 movimentação de 42 no período");
  });

  it("erro do banco: o aviso de erro, nunca 'nenhuma movimentação'", async () => {
    h.erro = new Error("canceling statement due to statement timeout");
    montar(<TelaLancamentos />);
    await waitFor(() => expect(screen.getByText("Não foi possível carregar o financeiro")).toBeInTheDocument());
    expect(screen.queryByText("Nenhuma movimentação no período")).toBeNull();
    expect(screen.queryByText("Nenhuma movimentação com esses filtros")).toBeNull();
    expect(document.querySelector("[data-paginacao]")).toBeNull();
    expect(document.querySelector("[data-contagem]")?.textContent).toBe("Não deu para carregar");
  });

  it("endereço com uma página além do fim vai para a última", async () => {
    montar(<TelaLancamentos />, "/?pagina=9");
    await waitFor(() => expect(atributo('[data-paginacao="lancamentos"]', "data-pagina")).toBe("3"));
    expect(sonda.busca).toBe("?pagina=3");
  });
});

const recibo = (i: number, p: Partial<Recibo> = {}): Recibo => ({
  id: `r${i}`, nutricionista_id: "u-camila", paciente_id: `p${i}`, transacao_id: null, modelo_id: null, numero: i + 1, valor: 100, data: HOJE,
  descricao: "Atendimento", texto: "Recebi de…", created_at: `${HOJE}T12:00:00Z`, paciente: { nome: i === 40 ? "Zé Último" : `Aluno ${i}`, cpf: null },
  transacao: null, ...p,
});

describe("hml-14b — Recibos por página do banco (B21)", () => {
  beforeEach(() => {
    h.recibos = Array.from({ length: 41 }, (_, i) => recibo(i));
  });

  it("20 por página, '1–20 de 41', o total e a SOMA de todos (do banco), a página no endereço (?pagina_recibos=)", async () => {
    montar(<Recibos f={f} />);
    await waitFor(() => expect(document.querySelectorAll('[data-lista="recibos"] [data-item]')).toHaveLength(20));
    expect(document.querySelector('[data-paginacao="recibos"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 41");
    expect(atributo("[data-recibos-total]", "data-recibos-total")).toBe("41");
    expect(atributo("[data-recibos-soma]", "data-recibos-soma")).toBe("4100.00");
    proxima("recibos");
    await waitFor(() => expect(sonda.busca).toBe("?pagina_recibos=2"));
    proxima("recibos");
    await waitFor(() => expect(screen.getByText("· Zé Último")).toBeInTheDocument());
    expect(h.pedidos.filter((p) => p.nome === "recibos").map((p) => p.pagina)).toEqual([1, 2, 3]);
  });

  it("a busca (no banco, sem acento) acha o da página 3 estando na 3 e volta à página 1", async () => {
    montar(<Recibos f={f} />, "/?pagina_recibos=3");
    await waitFor(() => expect(atributo('[data-paginacao="recibos"]', "data-pagina")).toBe("3"));
    fireEvent.change(document.querySelector("[data-busca-recibos]")!, { target: { value: "ze ultimo" } });
    // (a página 3 já tinha 1 item: espera o total da busca)
    await waitFor(() => expect(atributo('[data-paginacao="recibos"]', "data-total")).toBe("1"), { timeout: 3000 });
    expect(document.querySelectorAll('[data-lista="recibos"] [data-item]')).toHaveLength(1);
    await waitFor(() => expect(sonda.busca).toBe(""));
    expect(h.pedidos.filter((p) => p.nome === "recibos").at(-1)).toMatchObject({ pagina: 1, busca: "ze ultimo" });
    expect(h.pedidos.some((p) => p.nome === "recibos" && p.pagina !== 1 && p.busca)).toBe(false);
  });

  it("erro do banco: 'Não deu para carregar os recibos', sem 'Nenhum recibo ainda'", async () => {
    h.erro = new Error("falhou");
    montar(<Recibos f={f} />);
    await waitFor(() => expect(screen.getByText("Não deu para carregar os recibos")).toBeInTheDocument());
    expect(screen.queryByText("Nenhum recibo ainda")).toBeNull();
    expect(document.querySelector("[data-paginacao]")).toBeNull();
  });
});

const alunoResumo = (i: number, p: Partial<AlunoResumo> = {}): AlunoResumo => ({
  paciente_id: `a${i}`, treino_user_id: null, nome: `Aluno ${String(i).padStart(2, "0")}`, email: null, ativo: true, mensalidade_valor: 249, plano: null, pausada: false,
  pago_ate: new Date(Date.now() + 86_400_000).toISOString(), desde: null, aguardando: null, abertas: 0, ...p,
});

describe("hml-14b — Mensalidades por página do servidor (B21)", () => {
  const resposta = (pagina: number, extra: Partial<MensalidadesDaConta> = {}): MensalidadesDaConta => ({
    ok: true, hoje: HOJE, agora: new Date().toISOString(), dono: true, pagina, por_pagina: 20, total: 41,
    alunos: Array.from({ length: pagina === 3 ? 1 : 20 }, (_, i) => alunoResumo((pagina - 1) * 20 + i)),
    sem: { pagina: 1, total: 2, alunos: [alunoResumo(90, { mensalidade_valor: null }), alunoResumo(91, { mensalidade_valor: null })] },
    contagens: { alunos: 43, com_mensalidade: 41, em_dia: 38, pendentes: 3, sem_mensalidade: 2 },
    pendentes: [], ...extra,
  });

  it("os números da conta vêm prontos, a lista é a página (20) e 'Próxima' pede a 2 ao servidor (?pagina_mensalidades=2)", async () => {
    h.mensalidades = (pagina) => resposta(pagina);
    montar(<Mensalidades f={f} />);
    await waitFor(() => expect(document.querySelectorAll('[data-lista="mensalidades"] [data-item]')).toHaveLength(20));
    expect(document.querySelector('[data-paginacao="mensalidades"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 41");
    expect(screen.getByText("38")).toBeInTheDocument();
    proxima("mensalidades");
    await waitFor(() => expect(sonda.busca).toBe("?pagina_mensalidades=2"));
    await waitFor(() => expect(document.querySelector('[data-cobranca-aluno="a20"]')).not.toBeNull());
    expect(h.pedidos.filter((p) => p.nome === "mensalidades").map((p) => p.pagina)).toEqual([1, 2]);
  });

  it("erro do servidor: só o aviso (sem 'Nenhum aluno' nem números zerados)", async () => {
    const api = await import("@/financeiro/api");
    h.erro = new api.ErroFinanceiro("erro_interno");
    montar(<Mensalidades f={f} />);
    await waitFor(() => expect(document.querySelector('[data-aba-financeiro-conteudo="mensalidades"]')?.getAttribute("data-estado")).toBe("erro"));
    expect(screen.queryByText("Nenhum aluno ainda")).toBeNull();
    expect(document.querySelector("[data-kpi-comprovantes]")).toBeNull();
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
    // o recebido do banco (por dia): as 2 entradas e o Pix confirmado sem lançamento
    const recs = recebimentos({
      entradasPorDia: [{ dia: HOJE, categoria: "Consulta", valor: 400 }, { dia: mesPassado, categoria: "Consulta", valor: 250 }],
      cobrancasPorDia: [{ dia: hojeSP(new Date(cobs[0].pago_em!)), valor: 249 }],
    });
    const k = kpis(recs, aReceber(cobs, alunos, HOJE, new Date()), HOJE);
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
    // as recentes: 6 do banco (a página de financeiro_lancamentos), a mais nova primeiro
    await waitFor(() => expect(document.querySelectorAll("[data-recente]")).toHaveLength(2));
    expect(document.querySelector("[data-recente]")?.getAttribute("data-recente")).toBe("x1");
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

describe("W19 — Categorias: enquanto a lista não chega, nada de \"Nenhuma categoria ainda\"", () => {
  const base = { uid: "u-camila", contaId: "c1", onMudou: () => {} };

  it("carregando: esqueleto, contagem '…' e o Adicionar travado (sem a lista não dá para recusar nome repetido)", () => {
    montar(<AbaCategorias {...base} categorias={[]} carregando />);
    expect(document.querySelector("[data-carregando-categorias]")).not.toBeNull();
    expect(document.querySelector("[data-categorias-vazio]")).toBeNull();
    expect(screen.getByText("…")).toBeTruthy();
    expect((document.querySelector("[data-btn-add-categoria]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("erro: avisa que não carregou (não diz que não há categorias)", () => {
    montar(<AbaCategorias {...base} categorias={[]} erro />);
    expect(document.querySelector("[data-categorias-erro]")).not.toBeNull();
    expect(document.querySelector("[data-categorias-vazio]")).toBeNull();
  });

  it("carregou: vazia mostra o convite; com categorias, a lista e a contagem", () => {
    const { unmount } = montar(<AbaCategorias {...base} categorias={[]} />);
    expect(document.querySelector("[data-categorias-vazio]")).not.toBeNull();
    unmount();
    montar(<AbaCategorias {...base} categorias={[{ id: "cat1", nome: "Consulta", nutricionista_id: "u-camila" }]} />);
    expect(document.querySelector("[data-lista-categorias]")?.getAttribute("data-categorias-total")).toBe("1");
    expect(document.querySelector("[data-carregando-categorias]")).toBeNull();
  });
});
