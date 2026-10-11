// Physiq hml-14d (B21 · D31 · P7): Perfil › Pagamentos — os cartões continuam com as 24 de sempre e "Ver todos (N)" abre a folha com
// a lista inteira em páginas de 20 do banco (aluno_historico), "1–20 de N"; a página é da folha (fechar volta à 1); o erro aparece na
// folha; tocar num item abre o detalhe por cima e voltar mantém a página. A função falsa responde à página pedida sobre 41 itens.
// W-P: o plano com período no cartão da mensalidade (Plano · /ano · parcela n de N · Renovar) e o Mercado Pago com o plano (o cartão
// parcelado até o máximo do plano manda as parcelas; a automática só onde a modalidade aceita) — o Brick falso guarda o que recebeu.
// O título do painel de pagar: "Pagar o plano" / "Renovar o plano" no período todo; no mês a mês, no plano de 1 mês e no modo de
// hoje, "Pagar a mensalidade" / "Adiantar a mensalidade" como sempre.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CobrancaVista, MatriculaPagamentos, ReciboVista, StatusAluno } from "@/financeiro/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

type BrickFalso = { customization: { paymentMethods: { maxInstallments: number } }; onSubmit: (form: unknown) => Promise<void> };
const h = vi.hoisted(() => ({ status: vi.fn(), historico: vi.fn(), acao: vi.fn(), brick: [] as BrickFalso[] }));
vi.mock("@/lib/distribuicao", () => ({ ehLoja: false, DISTRIBUICAO: "site" }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" }, registerPlugin: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u1" } }) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarStatusAluno: () => h.status(),
  buscarHistoricoDoAluno: (...a: unknown[]) => h.historico(...a),
  acaoFinanceiro: (...a: unknown[]) => h.acao(...a),
  invalidarResumo: () => {},
}));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: (p: BrickFalso) => { h.brick.push(p); return null; }, initMercadoPago: () => {} }));
vi.mock("@/components/pagamentos/mpInit", () => ({ MP_PUBLIC_KEY: "TEST-chave", ensureMpInit: () => {} }));

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
      <ProvedorConfirmar>
        <MemoryRouter useTransitions={false} initialEntries={["/perfil/pagamentos"]}>
          <Routes>
            <Route path="*" element={<Pagamentos />} />
          </Routes>
        </MemoryRouter>
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
const folha = (tipo: string) => document.body.querySelector(`[data-folha-todos="${tipo}"]`) as HTMLElement | null;

beforeEach(() => {
  h.status.mockReset();
  h.historico.mockReset();
  h.acao.mockReset();
  h.acao.mockResolvedValue({});
  h.brick.length = 0;
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

describe("Perfil › Pagamentos — cancelar a cobrança automática (hml-18a: a confirmação do app)", () => {
  it("Cancelar abre a confirmação do app: Voltar não cancela; Cancelar cobrança chama aluno_mp_cancelar", async () => {
    const assinatura = { id: "a1", status: "authorized" as const, valor: 249, proximo_vencimento: null, sandbox: false, simulada: true, init_point: null };
    h.status.mockResolvedValue(status([matricula({ assinatura })]));
    montar();
    const cartao = (await screen.findByText("Cobrança automática ligada")).closest("[data-assinatura-aluno]") as HTMLElement;
    fireEvent.click(within(cartao).getByRole("button", { name: "Cancelar" }));
    let dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("Cancelar a cobrança automática?");
    expect(dialogo.querySelector("[data-confirmar-ok]")).toHaveTextContent("Cancelar cobrança");
    fireEvent.click(dialogo.querySelector("[data-confirmar-cancelar]")!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.acao).not.toHaveBeenCalled();
    fireEvent.click(within(cartao).getByRole("button", { name: "Cancelar" }));
    dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("aluno_mp_cancelar", { paciente_id: "p1" }));
  });
});

const PLANO = (x: Partial<NonNullable<MatriculaPagamentos["mensalidade"]>> = {}) => matricula({
  conta: { id: "c1", nome: "Consultoria", modo: "pix_manual", bloquear: false, profissional: "Lucas Ferreira" },
  chave: { tipo: "email", chave: "lucas@teste.com", favorecido: "Lucas", banco: null },
  mensalidade: { valor: 1000, plano_id: "pl1", plano: "Anual", pausada: false, pago_ate: null, desde: dia(-1), coberta: false,
    modalidade: "avista", meses: 12, negociado: null, max_parcelas: 1, automatica: false, parcela: null, ...x },
});

describe("Perfil › Pagamentos — plano com período (W-P)", () => {
  it("período todo: 'Plano · Anual', '/ano' e Pagar o valor todo", async () => {
    h.status.mockResolvedValue(status([PLANO()]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-mensalidade-aluno]")).not.toBeNull());
    const cartao = document.querySelector("[data-mensalidade-aluno]")!;
    expect(cartao.textContent).toContain("Plano · Anual");
    expect(cartao.textContent).toContain("/ano");
    expect(document.querySelector("[data-pagar-mensalidade]")!.textContent).toBe("Pagar R$ 1.000,00");
  });
  it("mês a mês: '/mês' e 'parcela 4 de 12'", async () => {
    h.status.mockResolvedValue(status([PLANO({ valor: 83.33, modalidade: "mensal", automatica: true, parcela: { num: 4, total: 12 } })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-mensalidade-aluno]")).not.toBeNull());
    expect(document.querySelector("[data-linha-mensalidade]")!.textContent).toContain("parcela 4 de 12");
    expect(document.querySelector("[data-mensalidade-aluno]")!.textContent).toContain("/mês");
  });
  it("período todo já pago e vencendo: 'Renovar plano'", async () => {
    h.status.mockResolvedValue(status([PLANO({ pago_ate: dia(3), desde: dia(-360), coberta: true })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    expect(document.querySelector("[data-pagar-mensalidade]")!.textContent).toBe("Renovar plano · R$ 1.000,00");
  });
  it("plano de 1 mês já pago e vencendo: 'Pagar', sem o 'Renovar plano' (o plano de 1 mês fala de mensalidade — E2E de tela)", async () => {
    h.status.mockResolvedValue(status([PLANO({ valor: 249, plano: "Mensal", meses: 1, pago_ate: dia(3), desde: dia(-30), coberta: true })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    expect(document.querySelector("[data-pagar-mensalidade]")!.textContent).toBe("Pagar R$ 249,00");
    expect(document.querySelector("[data-pagar-mensalidade]")!.getAttribute("data-renovar")).toBeNull();
  });
});

/** O plano numa conta do Mercado Pago (Pix ou cartão; sem chave Pix). */
const PLANO_MP = (x: Partial<NonNullable<MatriculaPagamentos["mensalidade"]>> = {}) =>
  ({ ...PLANO(x), conta: { id: "c1", nome: "Consultoria", modo: "mercadopago" as const, bloquear: false, profissional: "Lucas Ferreira" }, chave: null });

/** Pagar da mensalidade → o Mercado Pago abre; devolve o botão do cartão. */
async function abrirPagarMp() {
  montar();
  await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
  fireEvent.click(document.querySelector("[data-pagar-mensalidade]")!);
  await waitFor(() => expect(document.body.querySelector("[data-mp-cartao]")).not.toBeNull());
  return document.body.querySelector("[data-mp-cartao]") as HTMLElement;
}

describe("Perfil › Pagamentos — Mercado Pago com o plano (W-P: I6 e B2)", () => {
  it("cartão parcelado: 'Pagar com cartão (até 3×)', sem a automática, e o pagamento manda as parcelas escolhidas", async () => {
    h.status.mockResolvedValue(status([PLANO_MP({ modalidade: "cartao_parcelado", max_parcelas: 3 })]));
    const cartao = await abrirPagarMp();
    expect(cartao.textContent).toBe("Pagar com cartão (até 3×)");
    expect(document.body.querySelector("[data-mp-assinar]")).toBeNull();
    fireEvent.click(cartao);
    await waitFor(() => expect(h.brick.length).toBeGreaterThan(0));
    const brick = h.brick.at(-1)!;
    expect(brick.customization.paymentMethods.maxInstallments).toBe(3);
    await act(() => brick.onSubmit({ token: "tok", payment_method_id: "master", issuer_id: "24", installments: 3 }));
    expect(h.acao).toHaveBeenCalledWith("aluno_mp_cartao", { paciente_id: "p1", card_token: "tok", payment_method_id: "master", issuer_id: "24", installments: 3 });
  });
  it("mês a mês: a automática continua e o cartão é 1× (manda installments 1)", async () => {
    h.status.mockResolvedValue(status([PLANO_MP({ valor: 83.33, modalidade: "mensal", automatica: true, parcela: { num: 4, total: 12 } })]));
    const cartao = await abrirPagarMp();
    expect(cartao.textContent).toBe("Pagar com cartão");
    expect(document.body.querySelector("[data-mp-assinar]")).not.toBeNull();
    fireEvent.click(cartao);
    await waitFor(() => expect(h.brick.length).toBeGreaterThan(0));
    const brick = h.brick.at(-1)!;
    expect(brick.customization.paymentMethods.maxInstallments).toBe(1);
    await act(() => brick.onSubmit({ token: "tok", payment_method_id: "visa", issuer_id: "25" }));
    expect(h.acao).toHaveBeenCalledWith("aluno_mp_cartao", { paciente_id: "p1", card_token: "tok", payment_method_id: "visa", issuer_id: "25", installments: 1 });
  });
});

describe("Perfil › Pagamentos — o título do painel de pagar (W-P: no período todo, o plano)", () => {
  const MES_A_MES = { valor: 83.33, modalidade: "mensal" as const, automatica: true, parcela: { num: 4, total: 12 } };
  const UM_MES = { valor: 249, plano: "Mensal", meses: 1, automatica: true };
  const MODO_DE_HOJE = { valor: 249, plano_id: null, plano: null, modalidade: null, meses: 1, automatica: true };
  const EM_DIA = { pago_ate: dia(20), desde: dia(-10), coberta: true };
  it.each([
    { caso: "Pix · período todo", m: PLANO(), botao: "[data-pagar-mensalidade]", titulo: "Pagar o plano" },
    { caso: "Pix · período todo em dia, adiantar", m: PLANO(EM_DIA), botao: "[data-adiantar-mensalidade]", titulo: "Renovar o plano" },
    { caso: "Pix · mês a mês", m: PLANO(MES_A_MES), botao: "[data-pagar-mensalidade]", titulo: "Pagar a mensalidade" },
    { caso: "Pix · mês a mês em dia, adiantar", m: PLANO({ ...MES_A_MES, ...EM_DIA }), botao: "[data-adiantar-mensalidade]", titulo: "Adiantar a mensalidade" },
    { caso: "Pix · plano de 1 mês", m: PLANO(UM_MES), botao: "[data-pagar-mensalidade]", titulo: "Pagar a mensalidade" },
    { caso: "Pix · plano de 1 mês em dia, adiantar", m: PLANO({ ...UM_MES, ...EM_DIA }), botao: "[data-adiantar-mensalidade]", titulo: "Adiantar a mensalidade" },
    { caso: "Pix · modo de hoje", m: PLANO(MODO_DE_HOJE), botao: "[data-pagar-mensalidade]", titulo: "Pagar a mensalidade" },
    { caso: "Mercado Pago · cartão parcelado", m: PLANO_MP({ modalidade: "cartao_parcelado", max_parcelas: 3 }), botao: "[data-pagar-mensalidade]", titulo: "Pagar o plano" },
    { caso: "Mercado Pago · mês a mês", m: PLANO_MP(MES_A_MES), botao: "[data-pagar-mensalidade]", titulo: "Pagar a mensalidade" },
    { caso: "Mercado Pago · plano de 1 mês", m: PLANO_MP(UM_MES), botao: "[data-pagar-mensalidade]", titulo: "Pagar a mensalidade" },
  ])("$caso → $titulo", async ({ m, botao, titulo }) => {
    h.status.mockResolvedValue(status([m]));
    montar();
    await waitFor(() => expect(document.querySelector(botao)).not.toBeNull());
    fireEvent.click(document.querySelector(botao)!);
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByRole("heading").textContent).toBe(titulo);
  });
});
