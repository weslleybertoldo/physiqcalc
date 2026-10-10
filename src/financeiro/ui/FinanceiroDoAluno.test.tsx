// Physiq hml-14d (B21 · D31 · P7): Painel › aluno › Financeiro — os 3 cartões seguem com os primeiros e "Ver todos (N)" abre a lista do
// banco em páginas de 20 com a página no endereço (?pagina_cobrancas=, ?pagina_lancamentos=, ?pagina_recibos=); no painel "Cobrança"
// (compacto, uma folha) a página fica no estado; "Recebido/Gasto" vêm somados do banco (financeiro_totais_do_aluno). As funções de
// dados são falsas: respondem à página pedida sobre 41 itens.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CobrancaVista, FinanceiroProfissional } from "../tipos";

const h = vi.hoisted(() => ({
  cobrancas: vi.fn(),
  totais: vi.fn(),
  lancamentos: vi.fn(),
  recibos: vi.fn(),
  financeiro: null as unknown,
  // hml-17 (H-39): as categorias do diálogo de lançamento (garantirCategorias)
  categorias: vi.fn(),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u-dono" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { functions: { invoke: vi.fn(async () => ({ error: null })) } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/admin/ComprovantePixCard", () => ({ default: () => null }));
vi.mock("@/painel/financeiro/ModelosReciboDialog", () => ({ default: () => null }));
vi.mock("@/painel/financeiro/ReciboDialog", () => ({ default: () => null }));
vi.mock("@/painel/financeiro/pdfRecibo", () => ({ pdfDoRecibo: vi.fn() }));
vi.mock("@/painel/financeiro/useFinanceiro", () => ({
  useFinanceiroConta: () => ({ modelos: { data: [] }, ultimo: { data: 0 }, nomeProfissional: "Lucas", padrao: null, recarregar: vi.fn(async () => {}) }),
}));
vi.mock("./TagsDoAluno", () => ({ TagsDoAluno: () => null }));
vi.mock("./useFinanceiroDoAluno", async (orig) => ({
  ...(await orig<typeof import("./useFinanceiroDoAluno")>()),
  useFinanceiroDoAluno: () => ({ data: h.financeiro, isLoading: false, isError: false, error: null, refetch: vi.fn(), recarregar: vi.fn(async () => {}), agir: vi.fn(async () => null) }),
}));
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  buscarCobrancasDoAluno: (...a: unknown[]) => h.cobrancas(...a),
  buscarTotaisDoAluno: (...a: unknown[]) => h.totais(...a),
}));
vi.mock("../lancamentos", async (orig) => ({
  ...(await orig<typeof import("../lancamentos")>()),
  paginaLancamentosDoAluno: (...a: unknown[]) => h.lancamentos(...a),
  garantirCategorias: (...a: unknown[]) => h.categorias(...a),
}));
vi.mock("../recibos", async (orig) => ({ ...(await orig<typeof import("../recibos")>()), paginaRecibosDoAluno: (...a: unknown[]) => h.recibos(...a) }));

import { FinanceiroDoAluno } from "./FinanceiroDoAluno";

const DIA = 86_400_000;
const diaSP = (n: number) => new Date(Date.now() + n * DIA).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const cobranca = (i: number): CobrancaVista => ({
  id: `c${i}`, paciente_id: "p1", tipo: "avulsa", descricao: `Cobrança ${i}`, valor: 100 + i, vencimento: diaSP(-i), status: "paga", forma: "manual", metodo: "pix",
  mes_ref: null, pago_em: new Date(Date.now() - i * DIA).toISOString(), enviado_em: null, cobre_de: null, cobre_ate: null, comprovante: false, comprovante_pdf: false,
  recusado_motivo: null, recusado_em: null, reembolsado_em: null, mp_status: null, mp: false, mp_simulado: false, transacao_id: null, pix_qr: null,
  pix_copia_cola: null, pix_expira_em: null, criado_por: "u-dono", confirmado_em: null, created_at: new Date(Date.now() - i * DIA).toISOString(),
});
const COBRANCAS = Array.from({ length: 41 }, (_, i) => cobranca(i));
const LANCAMENTOS = Array.from({ length: 41 }, (_, i) => ({
  id: `l${i}`, nutricionista_id: "u-dono", paciente_id: "p1", tipo: i % 4 ? "entrada" : "saida", descricao: `Lançamento ${i}`, valor: 10 + i, data: diaSP(-i * 3),
  metodo: "pix", observacao: null, estornada: false, recibo_id: null, categoria_id: null, categoria: null, created_at: new Date().toISOString(),
}));
const RECIBOS = Array.from({ length: 41 }, (_, i) => ({
  id: `r${i}`, nutricionista_id: "u-dono", paciente_id: "p1", transacao_id: null, modelo_id: null, numero: 41 - i, valor: 50, data: diaSP(-i), descricao: `Recibo ${41 - i}`,
  texto: "Recebi", created_at: new Date().toISOString(),
}));
const pagina = <T,>(todos: T[], p: number) => ({ itens: todos.slice((p - 1) * 20, p * 20), total: todos.length });

function financeiro(): FinanceiroProfissional {
  return {
    ok: true, ambiente: "staging", simulacao: true, hoje: diaSP(0), agora: new Date().toISOString(),
    aluno: { paciente_id: "p1", treino_user_id: "t1", nome: "Rafael Moura", email: "r@teste.com", cpf: null, foto_url: null, ativo: true, tags: [], conta_id: "c1", conta_nome: "Lucas", tem_login: true },
    permissoes: { master: false, dono: true, responsavel: true, mensalidade: true },
    conta: { id: "c1", nome: "Lucas", modo: "pix_manual", bloquear: false, origem: "nova", chave: null },
    planos: [], mensalidade: null, assinatura: null,
    // o prof_aluno de sempre: até 72
    cobrancas: COBRANCAS,
  };
}

function Local() {
  const l = useLocation();
  return <span data-testid="url">{l.search}</span>;
}
const montar = (url = "/painel/alunos/p1/financeiro", compacto = false) =>
  render(
    <MemoryRouter useTransitions={false} initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="*" element={<><FinanceiroDoAluno alunoId="p1" compacto={compacto} /><Local /></>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
const url = () => screen.getByTestId("url").textContent ?? "";
const itens = (lista: string) => document.querySelectorAll(`[data-lista="${lista}"] [data-item]`);

beforeEach(() => {
  h.financeiro = financeiro();
  h.cobrancas.mockReset();
  h.cobrancas.mockImplementation(async (_a: string, p: number) => pagina(COBRANCAS, p));
  h.lancamentos.mockReset();
  h.lancamentos.mockImplementation(async (_pid: string, p: number) => pagina(LANCAMENTOS, p));
  h.recibos.mockReset();
  h.recibos.mockImplementation(async (_pid: string, p: number) => pagina(RECIBOS, p));
  h.totais.mockReset();
  h.totais.mockResolvedValue({ recebido: 1938.37, gasto: 760.52, total: 41, primeira: LANCAMENTOS[40].data, ultima: LANCAMENTOS[0].data });
  h.categorias.mockReset();
  h.categorias.mockResolvedValue([]);
});

describe("Financeiro do aluno — os 3 'Ver todos' em páginas do banco (hml-14d, P7)", () => {
  it("cobranças: o cartão com 8; 'Ver todas (41)' abre a lista do banco (página 1, depois ?pagina_cobrancas=2)", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-ver-todos="cobrancas"]')?.textContent).toBe("Ver todas (41)"));
    expect(document.querySelectorAll("[data-cartao-cobrancas] [data-cobranca]")).toHaveLength(8);
    fireEvent.click(document.querySelector('[data-ver-todos="cobrancas"]')!);
    await waitFor(() => expect(itens("aluno-cobrancas")).toHaveLength(20));
    expect(h.cobrancas).toHaveBeenLastCalledWith("p1", 1);
    const pag = document.querySelector('[data-paginacao="aluno-cobrancas"]')!;
    expect(pag.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
    fireEvent.click(pag.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.cobrancas).toHaveBeenLastCalledWith("p1", 2));
    await waitFor(() => expect(document.querySelector('[data-lista="aluno-cobrancas"] [data-cobranca="c20"]')).not.toBeNull());
    expect(url()).toContain("pagina_cobrancas=2");
    // "Ver menos": volta ao cartão e tira a página do endereço
    fireEvent.click(document.querySelector('[data-ver-menos="cobrancas"]')!);
    await waitFor(() => expect(document.querySelector('[data-lista="aluno-cobrancas"]')).toBeNull());
    expect(url()).not.toContain("pagina_cobrancas");
  });

  it("lançamentos: Recebido/Gasto do banco (não da página) e 'Ver todos (41)' com as páginas; o link do Financeiro usa o período do banco", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-totais-aluno]")?.getAttribute("data-recebido")).toBe("1938.37"));
    expect(document.querySelector("[data-totais-aluno]")?.getAttribute("data-gasto")).toBe("760.52");
    expect(h.totais).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(document.querySelectorAll("[data-cartao-lancamentos] [data-lancamento]")).toHaveLength(12));
    expect(document.querySelector('[data-ver-todos="lancamentos"]')?.textContent).toBe("Ver todos (41)");
    const link = document.querySelector("[data-lancamentos-no-financeiro]")!.getAttribute("href")!;
    expect(link).toContain(`de=${LANCAMENTOS[40].data}`);
    fireEvent.click(document.querySelector('[data-ver-todos="lancamentos"]')!);
    await waitFor(() => expect(itens("aluno-lancamentos")).toHaveLength(20));
    fireEvent.click(document.querySelector('[data-paginacao="aluno-lancamentos"] [data-pagina-proxima]')!);
    await waitFor(() => expect(h.lancamentos).toHaveBeenLastCalledWith("p1", 2));
    expect(url()).toContain("pagina_lancamentos=2");
    fireEvent.click(document.querySelector('[data-paginacao="aluno-lancamentos"] [data-pagina-proxima]')!);
    await waitFor(() => expect(document.querySelector('[data-lista="aluno-lancamentos"] [data-lancamento="l40"]')).not.toBeNull());
  });

  it("recibos: o cartão com 12; 'Ver todos (41)' com a página 1 do banco", async () => {
    montar();
    await waitFor(() => expect(document.querySelectorAll("[data-cartao-recibos] [data-recibo]")).toHaveLength(12));
    expect(document.querySelector('[data-ver-todos="recibos-aluno"]')?.textContent).toBe("Ver todos (41)");
    fireEvent.click(document.querySelector('[data-ver-todos="recibos-aluno"]')!);
    await waitFor(() => expect(itens("aluno-recibos")).toHaveLength(20));
    expect(document.querySelector('[data-paginacao="aluno-recibos"]')?.getAttribute("data-total")).toBe("41");
  });

  it("o endereço com ?pagina_recibos=3 já abre a lista na 3ª (o 41º aparece)", async () => {
    montar("/painel/alunos/p1/financeiro?pagina_recibos=3");
    await waitFor(() => expect(itens("aluno-recibos")).toHaveLength(1));
    expect(h.recibos).toHaveBeenCalledWith("p1", 3);
    expect(document.querySelector('[data-lista="aluno-recibos"] [data-recibo="1"]')).not.toBeNull();
  });

  it("no painel 'Cobrança' (compacto): a página fica na folha, não vai para o endereço", async () => {
    montar("/painel/financeiro?aba=mensalidades", true);
    await waitFor(() => expect(document.querySelector('[data-ver-todos="cobrancas"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ver-todos="cobrancas"]')!);
    await waitFor(() => expect(itens("aluno-cobrancas")).toHaveLength(20));
    fireEvent.click(document.querySelector('[data-paginacao="aluno-cobrancas"] [data-pagina-proxima]')!);
    await waitFor(() => expect(h.cobrancas).toHaveBeenLastCalledWith("p1", 2));
    expect(url()).toBe("?aba=mensalidades");
  });

  it("erro do banco na lista: o estado de erro no cartão (nunca a lista vazia)", async () => {
    h.lancamentos.mockRejectedValue(new Error("statement timeout"));
    montar();
    await waitFor(() => expect(screen.getByText("Não deu para abrir os lançamentos")).toBeInTheDocument(), { timeout: 5000 });
    expect(document.querySelector("[data-cartao-lancamentos] [data-lancamento]")).toBeNull();
  });
});

describe("Financeiro do aluno — as categorias do lançamento (hml-17, H-39)", () => {
  const opcoes = () => [...document.querySelectorAll("[data-lancamento-categoria] option")].map((o) => o.textContent);

  it("as categorias não vieram → o diálogo avisa com Tentar de novo (nunca só \"Sem categoria\", calado); tocar refaz e mostra", async () => {
    h.categorias.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar();
    await waitFor(() => expect(h.categorias).toHaveBeenCalled());
    fireEvent.click(document.querySelector("[data-btn-novo-lancamento]")!);
    await waitFor(() => expect(document.querySelector("[data-lancamento-categorias-erro]")).not.toBeNull());
    expect(screen.getByText(/Não deu para carregar as categorias/)).toBeInTheDocument();
    h.categorias.mockResolvedValueOnce([{ id: "cat1", nome: "Consulta" }]);
    fireEvent.click(document.querySelector("[data-lancamento-categorias-tentar]")!);
    await waitFor(() => expect(opcoes()).toEqual(["Sem categoria", "Consulta"]));
    expect(document.querySelector("[data-lancamento-categorias-erro]")).toBeNull();
    expect(h.categorias).toHaveBeenCalledTimes(2);
  });

  it("controle: as categorias vieram → o diálogo as oferece, sem aviso", async () => {
    h.categorias.mockResolvedValue([{ id: "cat1", nome: "Consulta" }]);
    montar();
    await waitFor(() => expect(h.categorias).toHaveBeenCalled());
    fireEvent.click(document.querySelector("[data-btn-novo-lancamento]")!);
    await waitFor(() => expect(opcoes()).toEqual(["Sem categoria", "Consulta"]));
    expect(document.querySelector("[data-lancamento-categorias-erro]")).toBeNull();
  });
});
