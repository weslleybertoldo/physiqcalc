// Physiq W1 — abrir a página da InfinitePay: APK por cima do app (Browser); site numa aba reservada NO TOQUE (o navegador bloqueia janela
// aberta depois de um await) ou, bloqueada, na mesma aba; nada fora do domínio da InfinitePay.
// W2 (MENOR 9) — o Conectar do Mercado Pago do personal: no site, só a autorização do MP (https + host exato + /authorization) na mesma aba;
// no APK, só o SITE do Physiq (host exato) por cima do app — o fluxo inteiro acontece no navegador (decisão 6, I8) — e o "fechou" de volta.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ nativo: false, abrir: vi.fn(), fechar: vi.fn(), ouvir: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@capacitor/browser", () => ({
  Browser: { open: (...a: unknown[]) => h.abrir(...a), close: () => h.fechar(), addListener: (...a: unknown[]) => h.ouvir(...a) },
}));

import {
  abrirConexaoMp, abrirLinkExterno, abrirPagina, abrirSiteNoApp, aoFecharONavegador, fecharPagina, navegacao, reservarAba, urlDoSitePhysiq,
} from "./abrirPagamento";

const URL_IP = "https://checkout.infinitepay.com.br/fulano?lenc=x";

beforeEach(() => {
  h.nativo = false;
  h.abrir.mockReset();
  h.fechar.mockReset().mockResolvedValue(undefined);
  h.ouvir.mockReset();
  vi.restoreAllMocks();
});

describe("abrir a página da InfinitePay", () => {
  it("site: reserva a aba no toque (sem opener) e leva ao link quando ele chega", async () => {
    const janela = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(janela as unknown as Window);
    const aba = reservarAba();
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(janela.opener).toBeNull();
    expect(await abrirPagina(URL_IP, aba)).toBe("aba");
    expect(janela.location.href).toBe(URL_IP);
  });
  it("site com a aba bloqueada: a mesma aba (a volta traz o aluno a Pagamentos com a conferência)", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const ir = vi.fn();
    expect(reservarAba()).toBeNull();
    expect(await abrirPagina(URL_IP, null, ir)).toBe("mesma_aba");
    expect(ir).toHaveBeenCalledWith(URL_IP);
  });
  it("APK: por cima do app (Browser), sem aba; fecharPagina fecha o Browser", async () => {
    h.nativo = true;
    const open = vi.spyOn(window, "open");
    expect(reservarAba()).toBeNull();
    expect(await abrirPagina(URL_IP, null)).toBe("app");
    expect(h.abrir).toHaveBeenCalledWith({ url: URL_IP });
    expect(open).not.toHaveBeenCalled();
    await fecharPagina();
    expect(h.fechar).toHaveBeenCalled();
  });
  it("nada fora da InfinitePay (a página e o recibo)", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const fechar = vi.fn();
    expect(await abrirPagina("https://golpe.com/x", { ir: vi.fn(), fechar })).toBe("recusado");
    expect(fechar).toHaveBeenCalled();
    await abrirLinkExterno("https://golpe.com/r");
    expect(open).not.toHaveBeenCalled();
    await abrirLinkExterno("https://recibo.infinitepay.io/r");
    expect(open).toHaveBeenCalledWith("https://recibo.infinitepay.io/r", "_blank", "noopener,noreferrer");
  });
});

describe("W2 — o Conectar do Mercado Pago do personal (MENOR 9)", () => {
  const AUT = "https://auth.mercadopago.com/authorization?client_id=1&response_type=code&platform_id=mp&state=s&redirect_uri=https%3A%2F%2Fapi-principal.physiqcalc.com.br%2Ffunctions%2Fv1%2Fmp-conectar-retorno%2Fstaging";
  const SITE = "https://physiqcalc-staging.vercel.app/painel/configuracoes/recebimento?mp=conectar";

  it("site: a autorização do MP (.com e .com.br) na MESMA aba — a volta traz de novo para Configurações › Recebimento", () => {
    const ir = vi.spyOn(navegacao, "ir").mockImplementation(() => undefined);
    const open = vi.spyOn(window, "open");
    expect(abrirConexaoMp(AUT)).toBe("site");
    expect(ir).toHaveBeenCalledWith(AUT);
    expect(abrirConexaoMp(AUT.replace("auth.mercadopago.com/", "auth.mercadopago.com.br/"))).toBe("site");
    expect(open).not.toHaveBeenCalled();
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it("site: nada fora da autorização do MP — outro host, http, outro caminho, a página inicial do MP, o site do Physiq, não-texto", () => {
    const ir = vi.spyOn(navegacao, "ir").mockImplementation(() => undefined);
    for (const u of [
      "https://golpe.com/authorization?client_id=1", "http://auth.mercadopago.com/authorization?x=1", "https://auth.mercadopago.com/oauth/token",
      "https://auth.mercadopago.com.golpe.com/authorization", "https://www.mercadopago.com/?code=TG-1", SITE, "javascript:alert(1)", "", null, 42,
      { href: AUT },
    ]) {
      expect(abrirConexaoMp(u), String(u)).toBe("recusado");
    }
    expect(ir).not.toHaveBeenCalled();
  });

  it("no APK, a autorização do MP direto NUNCA abre (I8: o fluxo é no SITE — quem confirma é a sessão do site)", () => {
    h.nativo = true;
    const ir = vi.spyOn(navegacao, "ir").mockImplementation(() => undefined);
    expect(abrirConexaoMp(AUT)).toBe("recusado");
    expect(ir).not.toHaveBeenCalled();
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it("APK: o SITE do Physiq por cima do app (Browser), produção e staging — host EXATO, https, sem usuário na URL", async () => {
    h.nativo = true;
    expect(await abrirSiteNoApp(SITE)).toBe("app");
    expect(h.abrir).toHaveBeenLastCalledWith({ url: SITE });
    expect(await abrirSiteNoApp("https://physiqcalc.com.br/painel/configuracoes/recebimento?mp=conectar")).toBe("app");
    expect(h.abrir).toHaveBeenLastCalledWith({ url: "https://physiqcalc.com.br/painel/configuracoes/recebimento?mp=conectar" });
    h.abrir.mockClear();
    for (const u of [
      AUT, "http://physiqcalc.com.br/painel", "https://www.physiqcalc.com.br/painel", "https://physiqcalc.com.br.golpe.com/painel",
      "https://physiqcalc.com.br:8443/painel", "https://golpe@physiqcalc.com.br/painel", "https://golpe.vercel.app/painel",
      "https://physiqcalc-staging-git-x.vercel.app/painel", "javascript:alert(1)", "", null, undefined,
    ]) {
      expect(await abrirSiteNoApp(u), String(u)).toBe("recusado");
    }
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it("fora do APK, o abrirSiteNoApp não abre nada (o site conecta na própria aba)", async () => {
    const open = vi.spyOn(window, "open");
    expect(await abrirSiteNoApp(SITE)).toBe("recusado");
    expect(h.abrir).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("urlDoSitePhysiq: o filtro do host exato devolve a URL lida", () => {
    expect(urlDoSitePhysiq(SITE)).toBe(SITE);
    expect(urlDoSitePhysiq("https://physiqcalc.com.br")).toBe("https://physiqcalc.com.br/");
    expect(urlDoSitePhysiq(`https://physiqcalc.com.br/${"a".repeat(2100)}`)).toBeNull();
    expect(urlDoSitePhysiq("não é url")).toBeNull();
  });

  it("aoFecharONavegador: no APK ouve o browserFinished e o 'parar de ouvir' remove o ouvinte; fora do APK, nada", async () => {
    const remover = vi.fn().mockResolvedValue(undefined);
    h.ouvir.mockReturnValue(Promise.resolve({ remove: remover }));
    const f = vi.fn();
    const pararNoSite = aoFecharONavegador(f);
    expect(h.ouvir).not.toHaveBeenCalled();
    pararNoSite();
    h.nativo = true;
    const parar = aoFecharONavegador(f);
    expect(h.ouvir).toHaveBeenCalledWith("browserFinished", f);
    parar();
    await vi.waitFor(() => expect(remover).toHaveBeenCalled());
    // o ouvinte que falha ao registrar não derruba o "parar"
    h.ouvir.mockReturnValue(Promise.reject(new Error("sem plugin")));
    expect(() => aoFecharONavegador(f)()).not.toThrow();
  });
});
