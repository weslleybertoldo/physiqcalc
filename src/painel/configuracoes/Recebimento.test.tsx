import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import type { MpDaConta, RecebimentoDaConta } from "@/financeiro/tipos";

// hml-17 (H-39) + W1: Configurações › Recebimento — os comprovantes aguardando (a leitura que falha mostra o aviso e "—"); o jeito 2 (a
// tela lê e grava pela função — o cliente do banco falso explode se for usado); a InfinitePay (a opção só com a flag, a InfiniteTag sem o
// $, o Testar abrindo a aba reservada no toque); sair do MP com automática pede o OK (useConfirmar); o bloqueio do inadimplente.
// W2 (Task 15): o Mercado Pago DA CONTA — a opção com a flag, os 4 estados da conexão, o Conectar no site (a autorização na mesma aba, pelo
// filtro de verdade do abrirPagamento) e no APK (o SITE por cima do app; o fechar recarrega), a volta (?mp=conectar só destaca; ?mp=confirmar
// pergunta com o apelido e grava só no sim; ?mp=<erro> mostra o texto) e o Desconectar com as 2 confirmações.
const h = vi.hoisted(() => ({
  resumo: vi.fn(), ler: vi.fn(), salvar: vi.fn(), testar: vi.fn(), abrir: vi.fn(), externo: vi.fn(), aba: { ir: vi.fn(), fechar: vi.fn() },
  conectar: vi.fn(), conexao: vi.fn(), confirmar: vi.fn(), desconectar: vi.fn(), nativo: false, browserOpen: vi.fn(), ouvir: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: { id: "c1", nome: "Consultoria Teste", membro_id: "m1" }, situacao: { master: false } }) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarResumoDaConta: (c: string) => h.resumo(c),
  buscarRecebimento: (c: string) => h.ler(c),
  salvarRecebimento: (...a: unknown[]) => h.salvar(...a),
  testarInfinitePay: (...a: unknown[]) => h.testar(...a),
  conectarMercadoPago: (...a: unknown[]) => h.conectar(...a),
  conexaoMercadoPago: (...a: unknown[]) => h.conexao(...a),
  confirmarMercadoPago: (...a: unknown[]) => h.confirmar(...a),
  desconectarMercadoPago: (...a: unknown[]) => h.desconectar(...a),
}));
// a InfinitePay falsa; o Conectar do MP passa pelo filtro DE VERDADE (abrirConexaoMp / abrirSiteNoApp) com o Capacitor e o Browser falsos
vi.mock("@/financeiro/abrirPagamento", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/abrirPagamento")>()),
  reservarAba: () => h.aba, abrirPagina: (...a: unknown[]) => h.abrir(...a), abrirLinkExterno: (...a: unknown[]) => h.externo(...a),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => (h.nativo ? "android" : "web") }, registerPlugin: () => ({}),
}));
vi.mock("@capacitor/browser", () => ({
  Browser: { open: (...a: unknown[]) => h.browserOpen(...a), close: async () => undefined, addListener: (...a: unknown[]) => h.ouvir(...a) },
}));
vi.mock("@/components/admin/RecebimentosLista", () => ({ default: () => <div data-testid="chaves-pix" /> }));
vi.mock("@/components/admin/ComprovantePixCard", () => ({ default: ({ item }: { item: { id: string } }) => <div data-comprovante={item.id}>comprovante {item.id}</div> }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principal: { from: () => { throw new Error("a tela de Recebimento não fala mais com o banco (jeito 2)"); } },
}));

import { toast } from "sonner";
import { ErroFinanceiro } from "@/financeiro/api";
import { navegacao } from "@/financeiro/abrirPagamento";
import { TEXTO_DO_RETORNO } from "@/financeiro/mpConta";
import Recebimento from "./Recebimento";

const REC = (x: Partial<RecebimentoDaConta> = {}, ip: Partial<RecebimentoDaConta["infinitepay"]> = {}): RecebimentoDaConta => ({
  ok: true, master: false, pode_editar: true, conta: { id: "c1", nome: "Consultoria Teste", origem: "nova", modo: "pix_manual", bloquear: false },
  chaves: [], mp_liberado: false, infinitepay: { disponivel: true, handle: null, status: null, testado_em: null, ...ip }, ...x,
});
/** W2: o Recebimento com o MP da conta (a flag ligada) na forma `modo` e a conexão `mp`. */
const MP = (mp: Partial<MpDaConta> = {}, modo: RecebimentoDaConta["conta"]["modo"] = "mercadopago_conta", x: Partial<RecebimentoDaConta> = {}): RecebimentoDaConta =>
  REC({
    conta: { ...REC().conta, modo },
    mercadopago_conta: { disponivel: true, status: null, apelido: null, expira_em: null, erro: null, conectado_em: null, chave_publica: true, teste: false, ...mp },
    ...x,
  });

/** O endereço da tela agora (a busca limpa depois da volta). */
function Local() {
  const l = useLocation();
  return <output data-local={`${l.pathname}${l.search}`} />;
}
const local = () => document.querySelector("[data-local]")?.getAttribute("data-local");

function montar(caminho = "/painel/configuracoes/recebimento") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <MemoryRouter useTransitions={false} initialEntries={[caminho]}>
          <Recebimento />
          <Local />
        </MemoryRouter>
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
const contador = () => document.querySelector("[data-recebimento-pendentes-contador]")?.textContent;
const PENDENTE = { id: "p1", aluno: { nome: "Aluno Teste", paciente_id: "a1", treino_user_id: null } };

beforeEach(() => {
  for (const f of [h.resumo, h.ler, h.salvar, h.testar, h.abrir, h.externo, h.aba.ir, h.aba.fechar, h.conectar, h.conexao, h.confirmar, h.desconectar,
    h.browserOpen, h.ouvir]) f.mockReset();
  for (const f of [toast.success, toast.error, toast.info]) vi.mocked(f).mockClear();
  h.nativo = false;
  vi.restoreAllMocks();
  h.resumo.mockResolvedValue({ pendentes: [] });
  h.ler.mockResolvedValue(REC());
  h.salvar.mockImplementation(async (_c: string, p: { modo?: string }) => REC({ conta: { ...REC().conta, modo: (p.modo as never) ?? "pix_manual" } }));
});

describe("Configurações › Recebimento — os comprovantes aguardando (hml-17)", () => {
  it("a leitura falha → o aviso com Tentar de novo e o contador \"—\"; tocar refaz", async () => {
    h.resumo.mockReset().mockRejectedValueOnce(new Error("Failed to fetch"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-recebimento-pendentes-erro]")).not.toBeNull());
    expect(screen.queryByText("Nenhum comprovante aguardando.")).toBeNull();
    expect(contador()).toBe("—");
    h.resumo.mockResolvedValueOnce({ pendentes: [PENDENTE] });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("comprovante p1")).toBeInTheDocument();
    expect(contador()).toBe("1");
  });
  it("controle: nenhum comprovante → \"Nenhum comprovante aguardando.\" e 0", async () => {
    montar();
    expect(await screen.findByText("Nenhum comprovante aguardando.")).toBeInTheDocument();
    expect(contador()).toBe("0");
  });
});

describe("Configurações › Recebimento — W1 (jeito 2 e InfinitePay)", () => {
  it("lê pela função (o banco falso explode se for usado) e só mostra a InfinitePay com a flag ou já ligada", async () => {
    h.ler.mockResolvedValue(REC({}, { disponivel: false }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="pix_manual"]')).not.toBeNull());
    expect(h.ler).toHaveBeenCalledWith("c1");
    expect(document.querySelector('[data-opcao="infinitepay"]')).toBeNull();
  });
  it("InfinitePay: a InfiniteTag com $ vai sem ele; Testar reserva a aba no toque e abre o link", async () => {
    h.testar.mockResolvedValue({ ok: true, url: "https://checkout.infinitepay.com.br/fulano?lenc=t" });
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="infinitepay"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="infinitepay"]')!);
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: " $Fulano " } });
    fireEvent.click(document.querySelector("[data-infinitepay-testar]")!);
    await waitFor(() => expect(h.abrir).toHaveBeenCalledWith("https://checkout.infinitepay.com.br/fulano?lenc=t", h.aba));
    expect(h.testar).toHaveBeenCalledWith("c1", "fulano");
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { modo: "infinitepay", handle: "fulano" }));
  });
  it("InfiniteTag ruim não sai da tela; a InfinitePay recusou → a frase embaixo do campo", async () => {
    h.salvar.mockRejectedValueOnce(new ErroFinanceiro("infinitepay_recusou"));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="infinitepay"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="infinitepay"]')!);
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: "ana personal" } });
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    expect(document.querySelector("[data-infinitetag-erro]")?.textContent).toContain("sem o $");
    expect(h.salvar).not.toHaveBeenCalled();
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: "ana.personal" } });
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    await waitFor(() => expect(document.querySelector("[data-infinitetag-erro]")?.textContent).toContain("não aceitou"));
  });
  it("checkout externo desligado (ou a InfiniteTag que não existe — a API responde igual): a frase das 2 coisas e o botão de ativar", async () => {
    const ATIVAR = "https://app.infinitepay.io/external-checkout#configuracoes?enabled=true";
    h.testar.mockRejectedValueOnce(new ErroFinanceiro("infinitepay_checkout_desligado", { ativar: ATIVAR }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="infinitepay"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="infinitepay"]')!);
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: "$fulano" } });
    fireEvent.click(document.querySelector("[data-infinitepay-testar]")!);
    await waitFor(() => expect(document.querySelector("[data-infinitetag-erro]")?.textContent).toContain("ative o checkout externo"));
    expect(h.aba.fechar).toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-infinitepay-ativar]")!);
    expect(h.externo).toHaveBeenCalledWith(ATIVAR);
    // a 390 o rótulo longo quebra a linha dentro do cartão, com os 44 px do toque (o pq-botao sozinho é nowrap com 44 px fixos — passava
    // da borda em 11/10; a medida de verdade é a do e2e/w1/telas.py, a 390)
    for (const b of ["[data-infinitepay-testar]", "[data-infinitepay-ativar]"]) {
      const classes = document.querySelector(b)?.className.split(/\s+/) ?? [];
      expect(classes).toEqual(expect.arrayContaining(["whitespace-normal", "h-auto", "min-h-[44px]"]));
    }
  });
  it("sair do Mercado Pago com automática: pede o OK do app e manda cancelar_automaticas", async () => {
    h.ler.mockResolvedValue(REC({ mp_liberado: true, conta: { ...REC().conta, modo: "mercadopago" } }));
    h.salvar.mockRejectedValueOnce(new ErroFinanceiro("automaticas_ativas", { alunos: 2 }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="pix_manual"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="pix_manual"]')!);
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(document.body.textContent).toContain("2 alunos pagam");
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenLastCalledWith("c1", { modo: "pix_manual", cancelar_automaticas: true }));
  });
  it("o bloqueio do inadimplente grava pela função", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="sim"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="sim"]')!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { bloquear: true }));
  });
  it("o bloqueio muda na hora do toque (como antes da W1) e volta ao salvo quando o servidor recusa, com a frase da tela", async () => {
    vi.mocked(toast.error).mockClear();
    let recusar: (e: unknown) => void = () => {};
    h.salvar.mockImplementationOnce(() => new Promise((_ok, falha) => { recusar = falha; }));
    montar();
    const sim = () => document.querySelector('[data-opcoes="recebimento-bloqueio"] [data-opcao="sim"]');
    await waitFor(() => expect(sim()).not.toBeNull());
    fireEvent.click(sim()!);
    expect(sim()?.getAttribute("aria-checked")).toBe("true");
    recusar(new ErroFinanceiro("sem_permissao"));
    await waitFor(() => expect(sim()?.getAttribute("aria-checked")).toBe("false"));
    expect(toast.error).toHaveBeenCalledWith("Você não tem permissão para mudar o recebimento desta conta.");
  });
});

describe("Configurações › Recebimento — W2 (o Mercado Pago da conta do personal)", () => {
  const UUID = "0f8c2a7e-1b2c-4d3e-8f90-a1b2c3d4e5f6";
  const AUT = "https://auth.mercadopago.com/authorization?client_id=1&response_type=code&platform_id=mp&state=s&redirect_uri=x";
  const SITE = "https://physiqcalc-staging.vercel.app/painel/configuracoes/recebimento?mp=conectar";
  const opcao = (v: string) => document.querySelector(`[data-opcao="${v}"]`);
  const bloco = () => document.querySelector("[data-recebimento-mp-conta]");
  const situacao = () => document.querySelector("[data-mp-situacao]")?.getAttribute("data-mp-situacao");
  const salvarForma = () => document.querySelector<HTMLButtonElement>("[data-recebimento-salvar-modo]");
  const chamouOMp = () => [h.conectar, h.conexao, h.confirmar, h.desconectar].some((f) => f.mock.calls.length > 0);

  it("a opção 'Mercado Pago (sua conta)' só com a flag (ou já nela); o MP do Physiq com o nome novo, só para o master ou para quem já está nele", async () => {
    h.ler.mockResolvedValue(REC());
    const { unmount } = montar();
    await waitFor(() => expect(opcao("pix_manual")).not.toBeNull());
    expect(opcao("mercadopago_conta")).toBeNull();
    expect(opcao("mercadopago")).toBeNull();
    unmount();
    h.ler.mockResolvedValue(MP({}, "pix_manual"));
    const m2 = montar();
    await waitFor(() => expect(opcao("mercadopago_conta")).not.toBeNull());
    expect(opcao("mercadopago_conta")?.textContent).toContain("Mercado Pago (sua conta)");
    expect(opcao("mercadopago_conta")?.textContent).toContain("o dinheiro cai direto no seu Mercado Pago");
    expect(opcao("mercadopago")).toBeNull();
    m2.unmount();
    // a flag desligada, mas a conta já está no MP da conta: a opção fica
    h.ler.mockResolvedValue(MP({ disponivel: false, status: "ativa" }, "mercadopago_conta"));
    const m3 = montar();
    await waitFor(() => expect(opcao("mercadopago_conta")).not.toBeNull());
    m3.unmount();
    h.ler.mockResolvedValue(REC({ master: true, mp_liberado: true }));
    montar();
    await waitFor(() => expect(opcao("mercadopago")).not.toBeNull());
    expect(opcao("mercadopago")?.textContent).toContain("Mercado Pago do Physiq");
    expect(opcao("mercadopago")?.hasAttribute("disabled")).toBe(false);
  });

  it.each([
    ["sem conexão", {}, "desconectado", ["data-mp-conectar"], ["data-mp-reconectar", "data-mp-desconectar"]],
    ["desconectada", { status: "desconectada" as const, apelido: "FULANO" }, "desconectado", ["data-mp-conectar"], ["data-mp-reconectar", "data-mp-desconectar"]],
    ["ativa", { status: "ativa" as const, apelido: "FULANO" }, "conectado", ["data-mp-desconectar"], ["data-mp-conectar", "data-mp-reconectar"]],
    ["renove", { status: "ativa" as const, apelido: "FULANO", erro: "renovacao_recusada", expira_em: "2027-04-01T15:00:00Z" }, "renove",
      ["data-mp-reconectar", "data-mp-desconectar"], ["data-mp-conectar"]],
    ["erro", { status: "erro" as const, apelido: "FULANO" }, "caiu", ["data-mp-reconectar", "data-mp-desconectar"], ["data-mp-conectar"]],
  ])("os estados da conexão: %s", async (_nome, mp, marca, tem, naoTem) => {
    h.ler.mockResolvedValue(MP(mp));
    montar();
    await waitFor(() => expect(bloco()).not.toBeNull());
    expect(situacao()).toBe(marca);
    for (const a of tem) expect(document.querySelector(`[${a}]`), a).not.toBeNull();
    for (const a of naoTem) expect(document.querySelector(`[${a}]`), a).toBeNull();
    if ("apelido" in mp && mp.status !== "desconectada") expect(bloco()?.textContent).toContain("FULANO");
    if (marca === "renove") expect(bloco()?.textContent).toContain("01/04/2027");
  });

  it("conectado sem a chave do cartão: avisa que os alunos pagam só por Pix (decisão 14); com a chave, não", async () => {
    h.ler.mockResolvedValue(MP({ status: "ativa", chave_publica: false }));
    const { unmount } = montar();
    await waitFor(() => expect(bloco()).not.toBeNull());
    expect(document.querySelector("[data-mp-so-pix]")?.textContent).toContain("só por Pix");
    unmount();
    h.ler.mockResolvedValue(MP({ status: "ativa", chave_publica: true }));
    montar();
    await waitFor(() => expect(situacao()).toBe("conectado"));
    expect(document.querySelector("[data-mp-so-pix]")).toBeNull();
  });

  it("'Salvar a forma' com o MP da conta sem a conexão ativa: desligado com 'Conecte o Mercado Pago primeiro'; conectado, salva", async () => {
    h.ler.mockResolvedValue(MP({ status: "erro" }, "pix_manual"));
    const { unmount } = montar();
    await waitFor(() => expect(opcao("mercadopago_conta")).not.toBeNull());
    fireEvent.click(opcao("mercadopago_conta")!);
    expect(bloco()).not.toBeNull();
    expect(salvarForma()?.disabled).toBe(true);
    expect(document.querySelector("[data-mp-salvar-dica]")?.textContent).toBe("Conecte o Mercado Pago primeiro.");
    unmount();
    h.ler.mockResolvedValue(MP({ status: "ativa", apelido: "FULANO" }, "pix_manual"));
    montar();
    await waitFor(() => expect(opcao("mercadopago_conta")).not.toBeNull());
    fireEvent.click(opcao("mercadopago_conta")!);
    expect(document.querySelector("[data-mp-salvar-dica]")).toBeNull();
    expect(salvarForma()?.disabled).toBe(false);
    fireEvent.click(salvarForma()!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { modo: "mercadopago_conta" }));
  });

  it("Conectar no SITE: pede a URL (origem site) e vai à autorização na mesma aba; uma URL fora do filtro é recusada", async () => {
    const ir = vi.spyOn(navegacao, "ir").mockImplementation(() => undefined);
    h.ler.mockResolvedValue(MP());
    h.conectar.mockResolvedValueOnce({ ok: true, url: AUT, expira_em: "2026-10-11T23:00:00Z" });
    montar();
    await waitFor(() => expect(document.querySelector("[data-mp-conectar]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-mp-conectar]")!);
    await waitFor(() => expect(ir).toHaveBeenCalledWith(AUT));
    expect(h.conectar).toHaveBeenCalledWith("c1", "site");
    expect(h.browserOpen).not.toHaveBeenCalled();
    // o servidor devolvendo outra coisa (o site, um golpe): nada abre e a pessoa vê o erro
    for (const url of ["https://golpe.com/authorization?client_id=1", SITE]) {
      h.conectar.mockResolvedValueOnce({ ok: true, url });
      await waitFor(() => expect(document.querySelector<HTMLButtonElement>("[data-mp-conectar]")?.disabled).toBe(false));
      fireEvent.click(document.querySelector("[data-mp-conectar]")!);
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      vi.mocked(toast.error).mockClear();
    }
    expect(ir).toHaveBeenCalledTimes(1);
  });

  it("Conectar recusado pelo servidor: a frase do dono (MENOR 19) e a da conexão ainda sendo preparada", async () => {
    h.ler.mockResolvedValue(MP());
    h.conectar.mockRejectedValueOnce(new ErroFinanceiro("so_o_dono"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-mp-conectar]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-mp-conectar]")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Só o dono da conta conecta o Mercado Pago."));
    h.conectar.mockRejectedValueOnce(new ErroFinanceiro("mp_oauth_nao_configurado"));
    await waitFor(() => expect(document.querySelector<HTMLButtonElement>("[data-mp-conectar]")?.disabled).toBe(false));
    fireEvent.click(document.querySelector("[data-mp-conectar]")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A conexão com o Mercado Pago ainda está sendo preparada. Tente mais tarde."));
  });

  it("Conectar no APK: pede a URL com origem apk e abre o SITE por cima do app (Browser.open); o navegador fechou → recarrega; sair da tela solta o ouvinte", async () => {
    h.nativo = true;
    const ir = vi.spyOn(navegacao, "ir").mockImplementation(() => undefined);
    const remover = vi.fn().mockResolvedValue(undefined);
    let fechou: () => void = () => undefined;
    h.ouvir.mockImplementation((_ev: string, f: () => void) => { fechou = f; return Promise.resolve({ remove: remover }); });
    h.ler.mockResolvedValue(MP({ status: "erro", apelido: "FULANO" }));
    h.conectar.mockResolvedValueOnce({ ok: true, url: SITE, no_site: true });
    const { unmount } = montar();
    await waitFor(() => expect(document.querySelector("[data-mp-reconectar]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-mp-reconectar]")!);
    await waitFor(() => expect(h.browserOpen).toHaveBeenCalledWith({ url: SITE }));
    expect(h.conectar).toHaveBeenCalledWith("c1", "apk");
    expect(ir).not.toHaveBeenCalled();
    // o aviso e o ouvinte nascem depois do Browser.open (o setNoNavegador e o efeito dele): espera os 2 — com o CI lento, o efeito roda depois
    await waitFor(() => expect(document.querySelector("[data-mp-no-navegador]")?.textContent).toBe("Conecte no navegador que abriu e volte ao app."));
    await waitFor(() => expect(h.ouvir).toHaveBeenCalledWith("browserFinished", expect.any(Function)));
    const leituras = h.ler.mock.calls.length;
    h.ler.mockResolvedValue(MP({ status: "ativa", apelido: "FULANO" }));
    act(() => fechou());
    await waitFor(() => expect(h.ler.mock.calls.length).toBeGreaterThan(leituras));
    await waitFor(() => expect(situacao()).toBe("conectado"));
    expect(document.querySelector("[data-mp-no-navegador]")).toBeNull();
    unmount();
    await waitFor(() => expect(remover).toHaveBeenCalled());
  });

  it("no APK, o servidor devolvendo a autorização do MP (e não o site) não abre nada (I8)", async () => {
    h.nativo = true;
    h.ouvir.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
    h.ler.mockResolvedValue(MP());
    h.conectar.mockResolvedValueOnce({ ok: true, url: AUT });
    montar();
    await waitFor(() => expect(document.querySelector("[data-mp-conectar]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-mp-conectar]")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(h.browserOpen).not.toHaveBeenCalled();
  });

  it("?mp=conectar (o APK abriu o site): só destaca o botão, com a opção do MP da conta já escolhida — nunca começa sozinho", async () => {
    h.ler.mockResolvedValue(MP({}, "pix_manual"));
    montar("/painel/configuracoes/recebimento?mp=conectar");
    await waitFor(() => expect(document.querySelector("[data-mp-conectar-destaque]")).not.toBeNull());
    expect(document.querySelector("[data-mp-conectar-destaque]")?.hasAttribute("data-mp-conectar")).toBe(true);
    expect(opcao("mercadopago_conta")?.getAttribute("aria-checked")).toBe("true");
    expect(local()).toBe("/painel/configuracoes/recebimento");
    await new Promise((r) => setTimeout(r, 30));
    expect(chamouOMp()).toBe(false);
    // escolher outra forma tira o destaque (e a escolha fica)
    fireEvent.click(opcao("pix_manual")!);
    expect(bloco()).toBeNull();
  });

  it("?mp=confirmar&c=<uuid>: pergunta com o apelido, grava só no sim, mostra o resultado e limpa a busca", async () => {
    h.ler.mockResolvedValue(MP({}, "pix_manual"));
    h.conexao.mockResolvedValueOnce({ ok: true, apelido: "FULANO.PERSONAL", teste: false });
    h.confirmar.mockResolvedValueOnce({ ok: true, resultado: "ok", apelido: "FULANO.PERSONAL", recebimento: MP({ status: "ativa", apelido: "FULANO.PERSONAL" }) });
    montar(`/painel/configuracoes/recebimento?mp=confirmar&c=${UUID}`);
    await waitFor(() => expect(document.querySelector("[data-mp-confirmar]")).not.toBeNull());
    expect(h.conexao).toHaveBeenCalledWith(UUID);
    expect(document.body.textContent).toContain("Conectar a conta FULANO.PERSONAL do Mercado Pago?");
    expect(h.confirmar).not.toHaveBeenCalled();
    expect(local()).toBe("/painel/configuracoes/recebimento");
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.confirmar).toHaveBeenCalledWith(UUID));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(TEXTO_DO_RETORNO.ok));
    await waitFor(() => expect(situacao()).toBe("conectado"));
    expect(document.querySelector('[data-mp-retorno="ok"]')?.textContent).toBe(TEXTO_DO_RETORNO.ok);
    expect(document.querySelector("[data-mp-pode-fechar]")?.textContent).toBe("Pronto. Se você começou pelo app, pode fechar esta janela e voltar a ele.");
  });

  it("?mp=confirmar dentro do APK: confirma igual, sem o 'pode fechar esta janela' (o recado é só do site aberto por cima do app)", async () => {
    h.nativo = true;
    h.ler.mockResolvedValue(MP({}, "pix_manual"));
    h.conexao.mockResolvedValueOnce({ ok: true, apelido: "FULANO", teste: false });
    h.confirmar.mockResolvedValueOnce({ ok: true, resultado: "ok", apelido: "FULANO", recebimento: MP({ status: "ativa", apelido: "FULANO" }) });
    montar(`/painel/configuracoes/recebimento?mp=confirmar&c=${UUID}`);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(document.querySelector('[data-mp-retorno="ok"]')).not.toBeNull());
    expect(h.confirmar).toHaveBeenCalledWith(UUID);
    expect(document.querySelector("[data-mp-pode-fechar]")).toBeNull();
  });

  it("?mp=confirmar sem apelido: a pergunta sem o nome; 'Agora não' → nada gravado", async () => {
    h.ler.mockResolvedValue(MP({}, "pix_manual"));
    h.conexao.mockResolvedValueOnce({ ok: true, apelido: null, teste: true });
    montar(`/painel/configuracoes/recebimento?mp=confirmar&c=${UUID}`);
    await waitFor(() => expect(document.querySelector("[data-mp-confirmar]")).not.toBeNull());
    expect(document.body.textContent).toContain("Conectar esta conta do Mercado Pago?");
    fireEvent.click(document.querySelector("[data-confirmar-cancelar]")!);
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Nada foi conectado."));
    expect(h.confirmar).not.toHaveBeenCalled();
    expect(document.querySelector("[data-mp-pode-fechar]")).toBeNull();
  });

  it("conectado sem trocar a forma (havia automática viva no MP de antes): o texto do 'Salvar a forma' e a opção do MP da conta já escolhida", async () => {
    h.ler.mockResolvedValue(MP({}, "mercadopago", { master: false, mp_liberado: true }));
    h.conexao.mockResolvedValueOnce({ ok: true, apelido: "FULANO", teste: false });
    h.confirmar.mockResolvedValueOnce({ ok: true, resultado: "conectado_sem_trocar", apelido: "FULANO",
      recebimento: MP({ status: "ativa", apelido: "FULANO" }, "mercadopago", { mp_liberado: true }) });
    montar(`/painel/configuracoes/recebimento?mp=confirmar&c=${UUID}`);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(document.querySelector('[data-mp-retorno="conectado_sem_trocar"]')).not.toBeNull());
    expect(document.querySelector('[data-mp-retorno="conectado_sem_trocar"]')?.textContent).toBe(TEXTO_DO_RETORNO.conectado_sem_trocar);
    expect(opcao("mercadopago_conta")?.getAttribute("aria-checked")).toBe("true");
    expect(situacao()).toBe("conectado");
    expect(salvarForma()?.disabled).toBe(false);
    // saindo do MP do Physiq (quem não é master não volta sozinho): o aviso com o nome novo
    expect(document.querySelector("[data-recebimento-sair-mp-physiq]")?.textContent).toBe("Saindo do Mercado Pago do Physiq, voltar a ele depende do master.");
  });

  it("a confirmação recusada: o texto da volta de mesmo nome (mp_outra_pessoa → outra_pessoa; mp_outra_conta → o do I5)", async () => {
    h.ler.mockResolvedValue(MP({}, "pix_manual"));
    h.conexao.mockRejectedValueOnce(new ErroFinanceiro("mp_outra_pessoa"));
    const { unmount } = montar(`/painel/configuracoes/recebimento?mp=confirmar&c=${UUID}`);
    await waitFor(() => expect(document.querySelector('[data-mp-retorno="mp_outra_pessoa"]')).not.toBeNull());
    expect(document.querySelector("[data-mp-retorno]")?.textContent).toBe(TEXTO_DO_RETORNO.outra_pessoa);
    expect(toast.error).toHaveBeenCalledWith(TEXTO_DO_RETORNO.outra_pessoa);
    expect(h.confirmar).not.toHaveBeenCalled();
    unmount();
    h.conexao.mockResolvedValueOnce({ ok: true, apelido: "OUTRA", teste: false });
    h.confirmar.mockRejectedValueOnce(new ErroFinanceiro("mp_outra_conta", { abertos: 2 }));
    montar(`/painel/configuracoes/recebimento?mp=confirmar&c=${UUID}`);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(document.querySelector('[data-mp-retorno="mp_outra_conta"]')).not.toBeNull());
    // a contagem da recebimento_mp_confirmar entra na frase da volta (I5)
    expect(document.querySelector('[data-mp-retorno="mp_outra_conta"]')?.textContent)
      .toBe(TEXTO_DO_RETORNO.outra_conta.replace("ainda tem pagamento em andamento", "ainda tem 2 pagamentos em andamento"));
    expect(toast.error).toHaveBeenLastCalledWith(expect.stringContaining("a de antes ainda tem 2 pagamentos em andamento"));
  });

  it("?mp=confirmar&c=lixo → 'invalido' sem pedir nada à função", async () => {
    h.ler.mockResolvedValue(MP({}, "pix_manual"));
    montar("/painel/configuracoes/recebimento?mp=confirmar&c=lixo");
    await waitFor(() => expect(document.querySelector('[data-mp-retorno="invalido"]')).not.toBeNull());
    expect(document.querySelector("[data-mp-retorno]")?.textContent).toBe(TEXTO_DO_RETORNO.invalido);
    expect(chamouOMp()).toBe(false);
    expect(local()).toBe("/painel/configuracoes/recebimento");
  });

  it("?mp=negado: o texto (no aviso e na tela), a opção do MP da conta para tentar de novo e a busca limpa", async () => {
    h.ler.mockResolvedValue(MP({}, "pix_manual"));
    montar("/painel/configuracoes/recebimento?mp=negado");
    await waitFor(() => expect(document.querySelector('[data-mp-retorno="negado"]')).not.toBeNull());
    expect(document.querySelector("[data-mp-retorno]")?.textContent).toBe(TEXTO_DO_RETORNO.negado);
    expect(toast.error).toHaveBeenCalledWith(TEXTO_DO_RETORNO.negado);
    expect(document.querySelector("[data-mp-conectar]")).not.toBeNull();
    expect(local()).toBe("/painel/configuracoes/recebimento");
    expect(chamouOMp()).toBe(false);
  });

  it("?mp=ok (só a confirmação devolve) e lixo: ignorados — nada de 'conectado' por um link; a busca limpa", async () => {
    h.ler.mockResolvedValue(MP({}, "pix_manual"));
    montar("/painel/configuracoes/recebimento?mp=ok");
    await waitFor(() => expect(opcao("pix_manual")).not.toBeNull());
    await waitFor(() => expect(local()).toBe("/painel/configuracoes/recebimento"));
    expect(document.querySelector("[data-mp-retorno]")).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
    expect(opcao("pix_manual")?.getAttribute("aria-checked")).toBe("true");
    expect(chamouOMp()).toBe(false);
  });

  it("Desconectar: pede o OK; no 409 automaticas_ativas, a 2ª confirmação com N alunos e manda cancelar", async () => {
    h.ler.mockResolvedValue(MP({ status: "ativa", apelido: "FULANO" }));
    h.desconectar.mockRejectedValueOnce(new ErroFinanceiro("automaticas_ativas", { alunos: 2 }));
    h.desconectar.mockResolvedValueOnce({ ...MP({ status: "desconectada", apelido: "FULANO" }, "pix_manual"), automaticas_canceladas: 2 });
    montar();
    await waitFor(() => expect(document.querySelector("[data-mp-desconectar]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-mp-desconectar]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(document.body.textContent).toContain("Desconectar o Mercado Pago?");
    expect(document.querySelector("[data-confirmar]")?.getAttribute("data-confirmar")).toBe("perigo");
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.desconectar).toHaveBeenCalledWith("c1", false));
    await waitFor(() => expect(document.body.textContent).toContain("Desligar as cobranças automáticas de 2 alunos?"));
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.desconectar).toHaveBeenLastCalledWith("c1", true));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.success).mock.calls.at(-1)?.[0]).toContain("2 cobranças automáticas desligadas");
    // a forma salva voltou ao Pix: o bloco do MP sai
    await waitFor(() => expect(opcao("pix_manual")?.getAttribute("aria-checked")).toBe("true"));
  });

  it("Desconectar: 'Voltar' não chama nada; a 2ª recusada também não; recusado pelo MP → a frase com a contagem (nada mudou)", async () => {
    h.ler.mockResolvedValue(MP({ status: "erro", apelido: "FULANO" }));
    montar();
    await waitFor(() => expect(document.querySelector("[data-mp-desconectar]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-mp-desconectar]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-cancelar]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-confirmar-cancelar]")!);
    await new Promise((r) => setTimeout(r, 30));
    expect(h.desconectar).not.toHaveBeenCalled();
    h.desconectar.mockRejectedValueOnce(new ErroFinanceiro("mp_sem_acesso", { alunos: 1, falhas: 0 }));
    await waitFor(() => expect(document.querySelector<HTMLButtonElement>("[data-mp-desconectar]")?.disabled).toBe(false));
    fireEvent.click(document.querySelector("[data-mp-desconectar]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "1 cobrança automática ficou ligada: o Physiq não tem mais acesso à conta do Mercado Pago onde ela está. Conecte de novo ou cancele pelo app do Mercado Pago. Nada mudou."));
    expect(situacao()).toBe("caiu");
  });

  it("o toast do automaticas_falhas da W1 saiu: a recusa do cancelamento agora é o 502 automaticas_nao_canceladas (MENOR 11), com a contagem", async () => {
    h.ler.mockResolvedValue(REC({ mp_liberado: true, conta: { ...REC().conta, modo: "mercadopago" } }));
    h.salvar.mockRejectedValueOnce(new ErroFinanceiro("automaticas_ativas", { alunos: 2 }));
    h.salvar.mockRejectedValueOnce(new ErroFinanceiro("automaticas_nao_canceladas", { falhas: 2 }));
    montar();
    await waitFor(() => expect(opcao("pix_manual")).not.toBeNull());
    fireEvent.click(opcao("pix_manual")!);
    fireEvent.click(salvarForma()!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("O Mercado Pago não desligou 2 cobranças automáticas agora. Nada mudou — tente de novo em instantes."));
    // um 200 com o campo antigo (o APK antigo lê) não mostra mais o aviso da W1
    h.salvar.mockResolvedValueOnce({ ...REC({ conta: { ...REC().conta, modo: "pix_manual" } }), automaticas_canceladas: 2, automaticas_falhas: 1 });
    await waitFor(() => expect(salvarForma()?.disabled).toBe(false));
    fireEvent.click(salvarForma()!);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls.some(([m]) => String(m).includes("não desligaram"))).toBe(false);
  });
});
