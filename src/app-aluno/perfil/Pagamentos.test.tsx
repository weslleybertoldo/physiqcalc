// Physiq hml-14d (B21 · D31 · P7): Perfil › Pagamentos — os cartões continuam com as 24 de sempre e "Ver todos (N)" abre a folha com
// a lista inteira em páginas de 20 do banco (aluno_historico), "1–20 de N"; a página é da folha (fechar volta à 1); o erro aparece na
// folha; tocar num item abre o detalhe por cima e voltar mantém a página. A função falsa responde à página pedida sobre 41 itens.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CobrancaVista, MatriculaPagamentos, ReciboVista, StatusAluno } from "@/financeiro/tipos";

const h = vi.hoisted(() => ({ status: vi.fn(), historico: vi.fn() }));
vi.mock("@/lib/distribuicao", () => ({ ehLoja: false, DISTRIBUICAO: "site" }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" }, registerPlugin: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u1" } }) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarStatusAluno: () => h.status(),
  buscarHistoricoDoAluno: (...a: unknown[]) => h.historico(...a),
  invalidarResumo: () => {},
}));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: () => null, initMercadoPago: () => {} }));

import Pagamentos from "./Pagamentos";

const DIA = 86_400_000;
const dia = (n: number) => new Date(Date.now() + n * DIA).toISOString();
const cobranca = (i: number): CobrancaVista => ({
  id: `c${i}`, paciente_id: "p1", tipo: "mensalidade", descricao: `Mensalidade ${i}`, valor: 249, vencimento: dia(-i * 30).slice(0, 10), status: "paga",
  forma: "pix_manual", metodo: null, mes_ref: null, pago_em: dia(-i * 30), enviado_em: null, cobre_de: null, cobre_ate: null, comprovante: false,
  comprovante_pdf: false, recusado_motivo: null, recusado_em: null, reembolsado_em: null, mp_status: null, mp: false, mp_simulado: false, transacao_id: null,
  pix_qr: null, pix_copia_cola: null, pix_expira_em: null, criado_por: null, confirmado_em: null, created_at: dia(-i * 30),
});
const recibo = (n: number): ReciboVista => ({ id: `r${n}`, numero: n, data: dia(-n).slice(0, 10), valor: 100, descricao: `Recibo ${n}`, texto: "Recebi", nutricionista_id: "u9", created_at: dia(-n) });
const COBRANCAS = Array.from({ length: 41 }, (_, i) => cobranca(i));
const RECIBOS = Array.from({ length: 41 }, (_, i) => recibo(41 - i));

function matricula(p: Partial<MatriculaPagamentos> = {}): MatriculaPagamentos {
  return {
    paciente_id: "p1", nome: "Rafael Moura",
    conta: { id: "c1", nome: "Consultoria Ferreira", modo: "nenhum", bloquear: false, profissional: "Lucas Ferreira" },
    chave: null, mensalidade: null, assinatura: null,
    // o aluno_status de sempre: até 48 cobranças e 24 recibos
    cobrancas: COBRANCAS.slice(0, 41), recibos: RECIBOS.slice(0, 24), total_cobrancas: 41, total_recibos: 41, ...p,
  };
}
const status = (m: MatriculaPagamentos[]): StatusAluno => ({ ok: true, ambiente: "staging", simulacao: true, hoje: dia(0).slice(0, 10), agora: dia(0), matriculas: m });

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter useTransitions={false} initialEntries={["/perfil/pagamentos"]}>
        <Routes>
          <Route path="*" element={<Pagamentos />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
const folha = (tipo: string) => document.body.querySelector(`[data-folha-todos="${tipo}"]`) as HTMLElement | null;

beforeEach(() => {
  h.status.mockReset();
  h.historico.mockReset();
  h.status.mockResolvedValue(status([matricula()]));
  h.historico.mockImplementation(async (_p: string, tipo: "cobrancas" | "recibos", pagina: number) => {
    const todas = tipo === "cobrancas" ? COBRANCAS : RECIBOS;
    return { itens: todas.slice((pagina - 1) * 20, pagina * 20), total: todas.length };
  });
});

describe("Perfil › Pagamentos — Ver todos (hml-14d, P7)", () => {
  it("o cartão do histórico segue com as 24 e 'Ver todos (41)' abre a folha na página 1 com o total do banco", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-ver-todos="pagamentos"]')).not.toBeNull());
    expect(document.querySelectorAll("[data-historico-pagamentos] [data-cobranca]")).toHaveLength(24);
    expect(document.querySelector('[data-ver-todos="pagamentos"]')?.textContent).toBe("Ver todos (41)");
    fireEvent.click(document.querySelector('[data-ver-todos="pagamentos"]')!);
    await waitFor(() => expect(folha("pagamentos")?.querySelectorAll('[data-lista="app-pagamentos"] [data-item]')).toHaveLength(20));
    expect(h.historico).toHaveBeenLastCalledWith("p1", "cobrancas", 1);
    const pag = folha("pagamentos")!.querySelector('[data-paginacao="app-pagamentos"]')!;
    expect(pag.getAttribute("data-total")).toBe("41");
    expect(pag.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
  });

  it("Próxima até a última: a 41ª aparece; fechar e abrir de novo volta à 1", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-ver-todos="pagamentos"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ver-todos="pagamentos"]')!);
    await waitFor(() => expect(folha("pagamentos")?.querySelectorAll("[data-item]")).toHaveLength(20));
    fireEvent.click(folha("pagamentos")!.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.historico).toHaveBeenLastCalledWith("p1", "cobrancas", 2));
    fireEvent.click(folha("pagamentos")!.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(folha("pagamentos")?.querySelector('[data-cobranca="c40"]')).not.toBeNull());
    expect(folha("pagamentos")!.querySelectorAll("[data-item]")).toHaveLength(1);
    fireEvent.click(within(document.body.querySelector("[data-painel]") as HTMLElement).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(folha("pagamentos")).toBeNull());
    fireEvent.click(document.querySelector('[data-ver-todos="pagamentos"]')!);
    // a página 1 já está guardada (não pede de novo): a folha abre nela
    await waitFor(() => expect(folha("pagamentos")?.querySelector('[data-paginacao="app-pagamentos"]')?.getAttribute("data-pagina")).toBe("1"));
    expect(folha("pagamentos")!.querySelector('[data-cobranca="c0"]')).not.toBeNull();
  });

  it("tocar num pagamento da folha abre o detalhe por cima; voltar mantém a página", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-ver-todos="pagamentos"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ver-todos="pagamentos"]')!);
    await waitFor(() => expect(folha("pagamentos")?.querySelectorAll("[data-item]")).toHaveLength(20));
    fireEvent.click(folha("pagamentos")!.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(folha("pagamentos")?.querySelector('[data-cobranca="c20"]')).not.toBeNull());
    fireEvent.click(folha("pagamentos")!.querySelector('[data-cobranca="c25"] [data-cobranca-abrir]')!);
    await waitFor(() => expect(document.body.querySelector('[data-detalhe-cobranca="c25"]')).not.toBeNull());
    const detalhe = document.body.querySelector('[data-detalhe-cobranca="c25"]')!.closest("[data-painel]") as HTMLElement;
    fireEvent.click(within(detalhe).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(document.body.querySelector('[data-detalhe-cobranca="c25"]')).toBeNull());
    expect(folha("pagamentos")?.querySelector('[data-paginacao="app-pagamentos"]')?.getAttribute("data-pagina")).toBe("2");
  });

  it("trocar de página segura a anterior na folha até a nova chegar; abrir os recibos depois não mostra as cobranças", async () => {
    let soltar: () => void = () => {};
    montar();
    await waitFor(() => expect(document.querySelector('[data-ver-todos="pagamentos"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ver-todos="pagamentos"]')!);
    await waitFor(() => expect(folha("pagamentos")?.querySelectorAll("[data-item]")).toHaveLength(20));
    h.historico.mockImplementationOnce(
      (_p: string, _t: string, pagina: number) => new Promise((ok) => (soltar = () => ok({ itens: COBRANCAS.slice((pagina - 1) * 20, pagina * 20), total: 41 }))),
    );
    fireEvent.click(folha("pagamentos")!.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.historico).toHaveBeenLastCalledWith("p1", "cobrancas", 2));
    // enquanto a 2 não chega: a 1 continua na tela (sem piscar o "carregando")
    expect(folha("pagamentos")!.querySelector('[data-cobranca="c0"]')).not.toBeNull();
    soltar();
    await waitFor(() => expect(folha("pagamentos")!.querySelector('[data-cobranca="c20"]')).not.toBeNull());
    fireEvent.click(within(document.body.querySelector("[data-painel]") as HTMLElement).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(folha("pagamentos")).toBeNull());
    h.historico.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(document.querySelector('[data-ver-todos="recibos"]')!);
    await waitFor(() => expect(folha("recibos")).not.toBeNull());
    expect(folha("recibos")!.querySelector("[data-cobranca]")).toBeNull();
  });

  it("recibos: o cartão com os 24 e 'Ver todos (41)' com a página 1 do banco", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-ver-todos="recibos"]')).not.toBeNull());
    expect(document.querySelectorAll("[data-recibos-aluno] [data-recibo-aluno]")).toHaveLength(24);
    expect(document.querySelector('[data-ver-todos="recibos"]')?.textContent).toBe("Ver todos (41)");
    fireEvent.click(document.querySelector('[data-ver-todos="recibos"]')!);
    await waitFor(() => expect(folha("recibos")?.querySelectorAll('[data-lista="app-recibos"] [data-item]')).toHaveLength(20));
    expect(h.historico).toHaveBeenLastCalledWith("p1", "recibos", 1);
    expect(folha("recibos")!.querySelector('[data-paginacao="app-recibos"]')?.getAttribute("data-total")).toBe("41");
  });

  it("a folha que falha mostra o erro (nunca a lista vazia)", async () => {
    h.historico.mockRejectedValue(new Error("rede"));
    montar();
    await waitFor(() => expect(document.querySelector('[data-ver-todos="pagamentos"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ver-todos="pagamentos"]')!);
    // a consulta tenta 1 vez a mais (retry 1) antes de mostrar o erro
    await waitFor(() => expect(within(folha("pagamentos")!).getByRole("button", { name: /Tentar/ })).toBeInTheDocument(), { timeout: 5000 });
    expect(folha("pagamentos")!.querySelector('[data-lista="app-pagamentos"]')).toBeNull();
  });

  it("a função de antes (sem total_cobrancas/total_recibos): o N é o que veio; recibos todos no cartão = sem botão", async () => {
    h.status.mockResolvedValue(status([matricula({ cobrancas: COBRANCAS.slice(0, 3), recibos: RECIBOS.slice(0, 2), total_cobrancas: undefined, total_recibos: undefined })]));
    montar();
    await waitFor(() => expect(document.querySelector('[data-ver-todos="pagamentos"]')).not.toBeNull());
    expect(document.querySelector('[data-ver-todos="pagamentos"]')?.textContent).toBe("Ver todos (3)");
    expect(document.querySelector('[data-ver-todos="recibos"]')).toBeNull();
    expect(screen.getAllByText(/Recibo nº/)).toHaveLength(2);
  });
});
