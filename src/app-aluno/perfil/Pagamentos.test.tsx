// Physiq hml-14d (B21 · D31 · P7): Perfil › Pagamentos — os cartões continuam com as 24 de sempre e "Ver todos (N)" abre a folha com
// a lista inteira em páginas de 20 do banco (aluno_historico), "1–20 de N"; a página é da folha (fechar volta à 1); o erro aparece na
// folha; tocar num item abre o detalhe por cima e voltar mantém a página. A função falsa responde à página pedida sobre 41 itens.
// W-P: o plano com período no cartão da mensalidade (Plano · /ano · parcela n de N · Renovar) e o Mercado Pago com o plano (o cartão
// parcelado até o máximo do plano manda as parcelas; a automática só onde a modalidade aceita) — o Brick falso guarda o que recebeu.
// O título do painel de pagar: "Pagar o plano" / "Renovar o plano" no período todo; no mês a mês, no plano de 1 mês e no modo de
// hoje, "Pagar a mensalidade" / "Adiantar a mensalidade" como sempre.
// W1: na conta InfinitePay o Pagar abre a folha dela; a tentativa viva vira "Continuar o pagamento" e o cartão "em andamento" (fora do
// histórico); a volta da página (?order_nsu=…) confere na hora; a paga mostra "Pix (InfinitePay)" e o recibo; com a folha fechada, a tela
// confere de novo a cada 30 s. A função, a abertura da página e o recibo são falsos.
// W2: no Mercado Pago DO PERSONAL (mercadopago_conta) o Pagar abre o Mercado Pago com o cartão na chave pública dele (o ensureMpInit de
// verdade sobre o initMercadoPago falso: a chave da matrícula e, depois, a do Physiq no plano do personal — PlanoContaNova); a conexão
// caída → só o aviso (e a linha da mensalidade "pagamento pelo app indisponível", sem Pix nem cartão); sem a chave → só o Pix (decisão
// 14: nunca o Brick com a chave do Physiq para pagar o personal).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CobrancaVista, MatriculaPagamentos, ReciboVista, StatusAluno } from "@/financeiro/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

type BrickFalso = { customization: { paymentMethods: { maxInstallments: number } }; onSubmit: (form: unknown, extra?: unknown) => Promise<void> };
const h = vi.hoisted(() => ({
  status: vi.fn(), historico: vi.fn(), acao: vi.fn(), brick: [] as BrickFalso[],
  volta: vi.fn(), conferir: vi.fn(), link: vi.fn(), abrir: vi.fn(), recibo: vi.fn(),
  init: vi.fn(), statusPlano: vi.fn(), seguranca: vi.fn(), device: vi.fn(),
}));
vi.mock("@/lib/distribuicao", () => ({ ehLoja: false, DISTRIBUICAO: "site" }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" }, registerPlugin: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u1" } }) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarStatusAluno: () => h.status(),
  buscarHistoricoDoAluno: (...a: unknown[]) => h.historico(...a),
  acaoFinanceiro: (...a: unknown[]) => h.acao(...a),
  voltaDaInfinitePay: (...a: unknown[]) => h.volta(...a),
  conferirInfinitePay: (...a: unknown[]) => h.conferir(...a),
  abrirLinkDaInfinitePay: (...a: unknown[]) => h.link(...a),
  invalidarResumo: () => {},
}));
vi.mock("@/financeiro/abrirPagamento", () => ({
  reservarAba: () => null,
  abrirPagina: (...a: unknown[]) => h.abrir(...a),
  abrirLinkExterno: (...a: unknown[]) => h.recibo(...a),
  fecharPagina: async () => {},
}));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: (p: BrickFalso) => { h.brick.push(p); return null; }, initMercadoPago: (...a: unknown[]) => h.init(...a) }));
// W2: o ensureMpInit de verdade (por chave) sobre o initMercadoPago falso; a chave do Physiq do build fica fixa
vi.mock("@/components/pagamentos/mpInit", async (orig) => ({ ...(await orig<typeof import("@/components/pagamentos/mpInit")>()), MP_PUBLIC_KEY: "TEST-chave" }));
// mp-cartao: o security.js e o id do aparelho falsos (o pagadorDoBrick é o de verdade); sem id, o deviceIdMp falso responde na hora
vi.mock("@/components/pagamentos/mpDevice", async (orig) => ({
  ...(await orig<typeof import("@/components/pagamentos/mpDevice")>()),
  carregarSegurancaMp: () => h.seguranca(),
  deviceIdMp: (...a: unknown[]) => h.device(...a),
}));
// W2: o plano do personal (Configurações › Plano, a assinatura do Physiq) — o status da cobrança da conta é falso
vi.mock("@/painel/configuracoes/plano/api", async (orig) => ({
  ...(await orig<typeof import("@/painel/configuracoes/plano/api")>()),
  buscarStatusCobranca: (...a: unknown[]) => h.statusPlano(...a),
  acaoCobranca: async () => ({}),
}));

import { PRECOS_PADRAO } from "@/nucleo/cobranca/regras";
import { PlanoContaNova } from "@/painel/configuracoes/plano/PlanoContaNova";
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

const montar = (rota?: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProvedorConfirmar>
        <MemoryRouter useTransitions={false} initialEntries={[rota ?? "/perfil/pagamentos"]}>
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
  for (const f of [h.volta, h.conferir, h.link, h.abrir, h.recibo]) f.mockReset();
  h.conferir.mockResolvedValue({ ok: true, paga: false, resultado: "em_andamento", cobranca: { status: "aguardando_confirmacao" } });
  h.brick.length = 0;
  h.init.mockReset();
  h.statusPlano.mockReset();
  h.seguranca.mockReset();
  h.device.mockReset();
  h.device.mockResolvedValue(undefined);
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

describe("Perfil › Pagamentos — InfinitePay (W1)", () => {
  const IP = (x: Partial<MatriculaPagamentos> = {}) => matricula({
    conta: { id: "c1", nome: "Consultoria", modo: "infinitepay", bloquear: false, profissional: "Lucas Ferreira" },
    mensalidade: { valor: 100, plano_id: null, plano: null, pausada: false, pago_ate: null, desde: dia(-1), coberta: false }, cobrancas: [], ...x });
  it("Pagar abre a folha da InfinitePay (não a do Pix na chave)", async () => {
    h.status.mockResolvedValue(status([IP()]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-pagar-mensalidade]")!);
    await waitFor(() => expect(document.querySelector("[data-pagar-ip]")).not.toBeNull());
    expect(document.querySelector("[data-pagar-mp]")).toBeNull();
  });
  it("com a tentativa viva: 'Continuar o pagamento' e o cartão 'em andamento'; ela não entra no histórico", async () => {
    const t = { ...cobranca(1), id: "t1", status: "aguardando_confirmacao", forma: "infinitepay", ip_link: "https://checkout.infinitepay.com.br/x", ip_expira_em: dia(2) } as CobrancaVista;
    h.status.mockResolvedValue(status([IP({ cobrancas: [t] })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")?.textContent).toBe("Continuar o pagamento"));
    expect(document.querySelector('[data-pagamento-ip="t1"]')).not.toBeNull();
    expect(document.querySelector('[data-historico-pagamentos] [data-cobranca="t1"]')).toBeNull();
  });
  it("a volta da página (?order_nsu=…) confere na hora e limpa a busca", async () => {
    h.status.mockResolvedValue(status([IP()]));
    h.volta.mockResolvedValue({ ok: true, paga: true, resultado: "baixar", cobranca: {} });
    montar("/perfil/pagamentos?order_nsu=11111111-2222-4333-8444-555555555555-1&transaction_nsu=n1&slug=s1&capture_method=pix");
    await waitFor(() => expect(h.volta).toHaveBeenCalledWith({ order_nsu: "11111111-2222-4333-8444-555555555555-1", transaction_nsu: "n1", slug: "s1", capture_method: "pix" }));
  });
  it("paga pela InfinitePay: 'Pix (InfinitePay)' e o recibo no detalhe", async () => {
    const pg = { ...cobranca(1), id: "p9", forma: "infinitepay", metodo: "pix", ip_meio: "pix", ip_recibo_url: "https://recibo.infinitepay.io/r" } as CobrancaVista;
    h.status.mockResolvedValue(status([IP({ cobrancas: [pg] })]));
    montar();
    await waitFor(() => expect(document.querySelector('[data-cobranca="p9"]')?.textContent).toContain("Pix (InfinitePay)"));
    fireEvent.click(document.querySelector('[data-cobranca="p9"] [data-cobranca-abrir]')!);
    await waitFor(() => expect(document.querySelector("[data-recibo-infinitepay]")).not.toBeNull());
  });

  // ── além do plano (registrado no relatório da Task 16) ──
  const viva = () => ({ ...cobranca(1), id: "t1", status: "aguardando_confirmacao", forma: "infinitepay", ip_link: "https://checkout.infinitepay.com.br/x",
    ip_expira_em: dia(2) }) as CobrancaVista;
  it("a volta só com o pedido (sem o NSU): confere a cobrança do pedido, sem a volta", async () => {
    h.status.mockResolvedValue(status([IP()]));
    montar("/perfil/pagamentos?order_nsu=11111111-2222-4333-8444-555555555555-2");
    await waitFor(() => expect(h.conferir).toHaveBeenCalledWith("11111111-2222-4333-8444-555555555555"));
    expect(h.volta).not.toHaveBeenCalled();
  });
  it("o recibo abre pelo abrirLinkExterno (só endereço da InfinitePay)", async () => {
    const pg = { ...cobranca(1), id: "p9", forma: "infinitepay", metodo: "pix", ip_meio: "pix", ip_recibo_url: "https://recibo.infinitepay.io/r" } as CobrancaVista;
    h.status.mockResolvedValue(status([IP({ cobrancas: [pg] })]));
    montar();
    await waitFor(() => expect(document.querySelector('[data-cobranca="p9"] [data-cobranca-abrir]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-cobranca="p9"] [data-cobranca-abrir]')!);
    await waitFor(() => expect(document.querySelector("[data-recibo-infinitepay]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-recibo-infinitepay]")!);
    expect(h.recibo).toHaveBeenCalledWith("https://recibo.infinitepay.io/r");
  });
  it("a avulsa esperando a InfinitePay ganha 'Continuar', que abre a folha dela em 'aguardando'", async () => {
    const av = { ...viva(), id: "a1", tipo: "avulsa", descricao: "Avaliação" } as CobrancaVista;
    h.status.mockResolvedValue(status([IP({ cobrancas: [av] })]));
    montar();
    await waitFor(() => expect(document.querySelector('[data-continuar-cobranca="a1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-continuar-cobranca="a1"]')!);
    await waitFor(() => expect(document.querySelector('[data-ip-aguardando="a1"]')).not.toBeNull());
  });
  it("com a folha fechada e a tentativa viva, a tela confere de novo a cada 30 s; paga → 'Pagamento confirmado!' e atualiza", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const sucesso = vi.spyOn(toast, "success");
    try {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      const t = viva();
      h.status.mockResolvedValue(status([IP({ cobrancas: [t] })]));
      h.conferir.mockResolvedValue({ ok: true, paga: false, resultado: "em_andamento", cobranca: t });
      montar();
      await waitFor(() => expect(document.querySelector('[data-pagamento-ip="t1"]')).not.toBeNull());
      expect(h.conferir).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(h.conferir).toHaveBeenCalledWith("t1");
      expect(sucesso).not.toHaveBeenCalled();
      h.conferir.mockResolvedValue({ ok: true, paga: true, resultado: "baixar", cobranca: { ...t, status: "paga" } });
      h.status.mockResolvedValue(status([IP({ cobrancas: [{ ...t, status: "paga" }] })]));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      await waitFor(() => expect(document.querySelector('[data-pagamento-ip="t1"]')).toBeNull());
      expect(sucesso).toHaveBeenCalledWith("Pagamento confirmado!");
    } finally {
      sucesso.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("Perfil › Pagamentos — o Mercado Pago do personal (W2: o cartão com a chave pública do vendedor)", () => {
  const CHAVE_DO_LUCAS = "APP_USR-chave-publica-do-lucas";
  const MES_A_MES = { valor: 83.33, modalidade: "mensal" as const, automatica: true, parcela: { num: 4, total: 12 } };
  /** O plano numa conta que recebe no Mercado Pago DO PERSONAL (sem chave Pix: Pix e cartão do MP dele). */
  const MP_CONTA = (mp: MatriculaPagamentos["mp"]) =>
    ({ ...PLANO(MES_A_MES), conta: { id: "c1", nome: "Consultoria", modo: "mercadopago_conta" as const, bloquear: false, profissional: "Lucas Ferreira" }, chave: null, mp });
  /** O plano do próprio personal (Configurações › Plano): no teste grátis, com o Pagar. */
  const STATUS_PLANO = {
    ok: true, ambiente: "staging", simulacao: true, hoje: "2026-10-12",
    conta: { id: "c9", nome: "Consultoria Ferreira", origem: "nova", plano: "treino_nutricao", faixa: "f10", periodicidade: "mensal", situacao: "teste",
      teste_ate: "2026-10-20", vence_em: null, tolerancia_dias: 0, valor_travado: null, regra_pix: "mes", isenta_motivo: null, efetiva: "teste" },
    alunos_ativos: 3, limite_alunos: 10, precos: PRECOS_PADRAO, valor_mensal: 59.9, valor_anual: 599, faturas: [], pix_aberto: null, assinatura: null,
  };
  /** Pagar da mensalidade → o painel de pagar abre. */
  async function abrirPagar() {
    const r = montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-pagar-mensalidade]")!);
    await waitFor(() => expect(document.body.querySelector("[data-pagar-mp]")).not.toBeNull());
    return r;
  }
  const brickChave = () => document.body.querySelector("[data-brick-mp]")?.getAttribute("data-brick-chave") ?? null;

  it("com a chave do personal: o Brick nasce com a chave DELE (o initMercadoPago com a da matrícula) e, depois, o plano do personal com a do Physiq", async () => {
    h.status.mockResolvedValue(status([MP_CONTA({ disponivel: true, chave_publica: CHAVE_DO_LUCAS })]));
    const r = await abrirPagar();
    expect(document.querySelector("[data-linha-mensalidade]")!.textContent).toMatch(/· Pix ou cartão$/);
    // não cai no Pix com comprovante (o modo de antes da W2 ia para o PagarPixManual)
    expect(document.body.querySelector("[data-pagar-pix-manual]")).toBeNull();
    expect(document.body.querySelector("[data-mp-gerar-pix]")).not.toBeNull();
    expect(document.body.querySelector("[data-mp-assinar]")).not.toBeNull();
    fireEvent.click(document.body.querySelector("[data-mp-cartao]")!);
    await waitFor(() => expect(brickChave()).toBe("conta"));
    await waitFor(() => expect(h.init).toHaveBeenCalledWith(CHAVE_DO_LUCAS, expect.objectContaining({ locale: "pt-BR" })));
    // o pagamento vai à mesma ação (o servidor escolhe a credencial da conta) com o token que o Brick do personal gerou
    await act(() => h.brick.at(-1)!.onSubmit({ token: "tok-conta", payment_method_id: "visa", issuer_id: "25", installments: 1 }));
    expect(h.acao).toHaveBeenCalledWith("aluno_mp_cartao", { paciente_id: "p1", card_token: "tok-conta", payment_method_id: "visa", issuer_id: "25", installments: 1 });
    expect(document.body.innerHTML).not.toContain(CHAVE_DO_LUCAS);
    r.unmount();

    // a assinatura do próprio personal (Configurações › Plano) segue na chave do Physiq
    h.statusPlano.mockResolvedValue(STATUS_PLANO);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter useTransitions={false} initialEntries={["/painel/configuracoes/plano"]}>
          <PlanoContaNova contaId="c9" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(document.querySelector("[data-botao-cartao]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-botao-cartao]")!);
    await waitFor(() => expect(brickChave()).toBe("physiq"));
    await waitFor(() => expect(h.init.mock.calls.map((c) => c[0])).toEqual([CHAVE_DO_LUCAS, "TEST-chave"]));
    expect(h.statusPlano).toHaveBeenCalledWith("c9");
  });

  it("a conexão do personal caída (mp.disponivel false): só o aviso — sem Pix, sem cartão, sem automática", async () => {
    h.status.mockResolvedValue(status([MP_CONTA({ disponivel: false, chave_publica: null })]));
    await abrirPagar();
    // a linha do cartão da mensalidade diz o mesmo que a folha: não promete Pix nem cartão (o E2E de tela, passo 7, achou "· Pix")
    const linha = document.querySelector("[data-linha-mensalidade]")!.textContent!;
    expect(linha).toMatch(/· parcela 4 de 12 · pagamento pelo app indisponível$/);
    expect(linha).not.toMatch(/Pix|cartão/);
    const aviso = document.body.querySelector("[data-mp-indisponivel]");
    expect(aviso?.textContent).toBe("O pagamento pelo app está indisponível agora. Avise o seu profissional.");
    for (const sel of ["[data-mp-gerar-pix]", "[data-mp-cartao]", "[data-mp-assinar]", "[data-brick-mp]", "[data-pagar-pix-manual]"]) {
      expect(document.body.querySelector(sel), sel).toBeNull();
    }
    expect(h.acao).not.toHaveBeenCalled();
    expect(h.init).not.toHaveBeenCalled();
  });

  it("sem a chave pública do personal: só o Pix — sem cartão nem automática, e o Brick nunca abre com a chave do Physiq (decisão 14)", async () => {
    h.status.mockResolvedValue(status([MP_CONTA({ disponivel: true, chave_publica: null })]));
    await abrirPagar();
    expect(document.querySelector("[data-linha-mensalidade]")!.textContent).toMatch(/· Pix$/);
    expect(document.body.querySelector("[data-mp-indisponivel]")).toBeNull();
    for (const sel of ["[data-mp-cartao]", "[data-mp-assinar]", "[data-brick-mp]", "[data-cartao-mp]"]) {
      expect(document.body.querySelector(sel), sel).toBeNull();
    }
    // o Pix do MP do personal funciona
    h.acao.mockResolvedValueOnce({ cobranca: { ...cobranca(0), id: "px1", status: "aguardando_confirmacao", forma: "mp", pix_copia_cola: "000201", pix_expira_em: dia(3) } });
    fireEvent.click(document.body.querySelector("[data-mp-gerar-pix]")!);
    await waitFor(() => expect(document.body.querySelector('[data-mp-pix-aberto="px1"]')).not.toBeNull());
    expect(h.acao).toHaveBeenCalledWith("aluno_mp_pix", { paciente_id: "p1" });
    expect(h.init).not.toHaveBeenCalled();
  });

  it("o Mercado Pago do Physiq (o modo de hoje) segue com a chave do Physiq", async () => {
    h.status.mockResolvedValue(status([PLANO_MP(MES_A_MES)]));
    const cartao = await abrirPagarMp();
    fireEvent.click(cartao);
    await waitFor(() => expect(brickChave()).toBe("physiq"));
    expect(h.init.mock.calls.every((c) => c[0] === "TEST-chave")).toBe(true);
  });
});

describe("Perfil › Pagamentos — mp-cartao: o aparelho, o titular e o texto da recusa por segurança", () => {
  const DEVICE = "armor.4f1c2e3d5a6b7c8d9e0f1a2b3c4d5e6f.1760500000";
  const MES_A_MES = { valor: 83.33, modalidade: "mensal" as const, automatica: true, parcela: { num: 4, total: 12 } };
  const FORM = { token: "tok", payment_method_id: "master", issuer_id: "24", installments: 1, transaction_amount: 83.33,
    payer: { email: "aluno2@teste.com", identification: { type: "CPF", number: "123.456.789-09" } } };
  const EXTRA = { bin: "503143", lastFourDigits: "6351", cardholderName: "Maria  da Silva" };

  it("abrir com cartão põe o security.js na página (decisão 2: só na folha de pagar do aluno, com cartão)", async () => {
    h.status.mockResolvedValue(status([PLANO_MP(MES_A_MES)]));
    await abrirPagarMp();
    expect(h.seguranca).toHaveBeenCalled();
  });

  it.each([
    { caso: "só Pix (sem a chave do personal)", mp: { disponivel: true, chave_publica: null } },
    { caso: "a conexão do personal caída", mp: { disponivel: false, chave_publica: null } },
  ])("$caso: sem cartão, o security.js não carrega", async ({ mp }) => {
    h.status.mockResolvedValue(status([{ ...PLANO(MES_A_MES), chave: null, mp,
      conta: { id: "c1", nome: "Consultoria", modo: "mercadopago_conta" as const, bloquear: false, profissional: "Lucas Ferreira" } }]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-pagar-mensalidade]")!);
    await waitFor(() => expect(document.body.querySelector("[data-pagar-mp]")).not.toBeNull());
    expect(document.body.querySelector("[data-mp-cartao]")).toBeNull();
    expect(h.seguranca).not.toHaveBeenCalled();
  });

  it("o cartão à vista: o corpo de sempre + pagador (o titular e o CPF só com os dígitos) + device_id", async () => {
    h.status.mockResolvedValue(status([PLANO_MP(MES_A_MES)]));
    h.device.mockResolvedValue(DEVICE);
    h.acao.mockResolvedValueOnce({ status: "paga" });
    fireEvent.click(await abrirPagarMp());
    await waitFor(() => expect(h.brick.length).toBeGreaterThan(0));
    await act(() => h.brick.at(-1)!.onSubmit(FORM, EXTRA));
    expect(h.acao).toHaveBeenCalledWith("aluno_mp_cartao", {
      paciente_id: "p1", card_token: "tok", payment_method_id: "master", issuer_id: "24", installments: 1,
      pagador: { nome: "Maria da Silva", documento: { tipo: "CPF", numero: "12345678909" } }, device_id: DEVICE,
    });
  });

  it("a automática: só o device_id (o titular e o CPF não saem do aparelho — o /preapproval leva só o cabeçalho)", async () => {
    h.status.mockResolvedValue(status([PLANO_MP(MES_A_MES)]));
    h.device.mockResolvedValue(DEVICE);
    h.acao.mockResolvedValueOnce({ primeira_cobranca: null, sandbox: false, init_point: null });
    await abrirPagarMp();
    fireEvent.click(document.body.querySelector("[data-mp-assinar]")!);
    await waitFor(() => expect(h.brick.length).toBeGreaterThan(0));
    await act(() => h.brick.at(-1)!.onSubmit(FORM, EXTRA));
    expect(h.acao).toHaveBeenCalledWith("aluno_mp_assinar", { paciente_id: "p1", card_token: "tok", device_id: DEVICE });
  });

  it("sem o id e sem o titular (o Brick antigo, o script bloqueado): o corpo IGUAL ao de antes", async () => {
    h.status.mockResolvedValue(status([PLANO_MP(MES_A_MES)]));
    fireEvent.click(await abrirPagarMp());
    await waitFor(() => expect(h.brick.length).toBeGreaterThan(0));
    await act(() => h.brick.at(-1)!.onSubmit({ token: "tok", payment_method_id: "visa", issuer_id: "25" }));
    expect(h.acao.mock.calls.at(-1)).toStrictEqual(["aluno_mp_cartao", { paciente_id: "p1", card_token: "tok", payment_method_id: "visa", issuer_id: "25", installments: 1 }]);
  });

  it("a recusa do antifraude do MP (cc_rejected_high_risk) tem o texto próprio; outra recusa, o texto de sempre", async () => {
    const erro = vi.spyOn(toast, "error");
    h.status.mockResolvedValue(status([PLANO_MP(MES_A_MES)]));
    h.acao.mockResolvedValueOnce({ status: "cancelada", status_detail: "cc_rejected_high_risk" });
    fireEvent.click(await abrirPagarMp());
    await waitFor(() => expect(h.brick.length).toBeGreaterThan(0));
    await act(() => h.brick.at(-1)!.onSubmit(FORM, EXTRA));
    expect(erro).toHaveBeenLastCalledWith("O Mercado Pago recusou este pagamento por segurança. Tente o Pix ou outro cartão.");
    h.acao.mockResolvedValueOnce({ status: "cancelada", status_detail: "cc_rejected_insufficient_amount" });
    fireEvent.click(document.body.querySelector("[data-mp-cartao]")!);
    await waitFor(() => expect(h.brick.length).toBeGreaterThan(1));
    await act(() => h.brick.at(-1)!.onSubmit(FORM, EXTRA));
    expect(erro).toHaveBeenLastCalledWith("Pagamento recusado pelo cartão.");
    erro.mockRestore();
  });

  it("a automática recusada pela função (400 cartao_recusado com o código): o texto por segurança; sem o código, o de sempre", async () => {
    const { ErroFinanceiro } = await import("@/financeiro/api");
    const erro = vi.spyOn(toast, "error");
    h.status.mockResolvedValue(status([PLANO_MP(MES_A_MES)]));
    h.acao.mockRejectedValueOnce(new ErroFinanceiro("cartao_recusado", { ok: false, erro: "cartao_recusado", status_detail: "cc_rejected_high_risk" }));
    await abrirPagarMp();
    fireEvent.click(document.body.querySelector("[data-mp-assinar]")!);
    await waitFor(() => expect(h.brick.length).toBeGreaterThan(0));
    await expect(h.brick.at(-1)!.onSubmit(FORM, EXTRA)).rejects.toBeInstanceOf(ErroFinanceiro);
    expect(erro).toHaveBeenLastCalledWith("O Mercado Pago recusou este pagamento por segurança. Tente o Pix ou outro cartão.");
    h.acao.mockRejectedValueOnce(new ErroFinanceiro("cartao_recusado", { ok: false, erro: "cartao_recusado", status_detail: null }));
    await expect(h.brick.at(-1)!.onSubmit(FORM, EXTRA)).rejects.toBeInstanceOf(ErroFinanceiro);
    expect(erro).toHaveBeenLastCalledWith("Pagamento recusado pelo cartão.");
    erro.mockRestore();
  });
});
