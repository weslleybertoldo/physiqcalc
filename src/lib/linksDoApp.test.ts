import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Physiq H2 — o roteador de links do app (url → rota), o destino guardado para depois do login, a chegada do link ao APK
// (frio: getLaunchUrl; aberto: appUrlOpen) e a faixa "Abrir no app Physiq" (intent://). O ?prof= (W7b) e a volta do login do
// Google (com.bertoldo.physiqcalc://) continuam como eram.
const h = vi.hoisted(() => ({
  nativo: false,
  launchUrl: null as string | null,
  ouvintes: [] as Array<(e: { url: string }) => void>,
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@capacitor/app", () => ({
  App: {
    getLaunchUrl: async () => (h.launchUrl ? { url: h.launchUrl } : undefined),
    addListener: async (_evento: string, cb: (e: { url: string }) => void) => {
      h.ouvintes.push(cb);
      return { remove: async () => {} };
    },
  },
}));

import {
  EVENTO_LINK,
  HOST_APP_LINK,
  PACOTE_APK,
  PAGINA_BAIXAR_APP,
  PREFIXOS_DO_APP,
  VALIDADE_DESTINO_MS,
  _zerarParaTestes,
  alvoDaFaixa,
  capturarDestinoDaUrl,
  capturarLinkDoApp,
  destinoDaEntrada,
  destinoGuardado,
  ehCaminhoDoApp,
  esquecerDestino,
  faixaNoAparelho,
  guardarDestino,
  intentDoApp,
  receberLink,
  rotaDoLink,
} from "./linksDoApp";
import { codigoDoDeepLink } from "./profPendente";
import { destinoDepoisDoLogin } from "@/nucleo/situacao";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFESTO = readFileSync(resolve(RAIZ, "android/app/src/main/AndroidManifest.xml"), "utf8");
const ASSETLINKS = JSON.parse(readFileSync(resolve(RAIZ, "public/.well-known/assetlinks.json"), "utf8"));
const CAPACITOR = readFileSync(resolve(RAIZ, "capacitor.config.ts"), "utf8");

/** O intent-filter das App Links do site (o que tem o host do site). */
function filtroDoSite(): string {
  const filtros = MANIFESTO.match(/<intent-filter[\s\S]*?<\/intent-filter>/g) ?? [];
  const doSite = filtros.filter((f) => f.includes('android:host="physiqcalc.com.br"'));
  expect(doSite).toHaveLength(1);
  return doSite[0];
}
const atributos = (f: string, nome: string) => [...f.matchAll(new RegExp(`android:${nome}="([^"]*)"`, "g"))].map((m) => m[1]);

const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; 21121210G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW = "Mozilla/5.0 (Linux; Android 14; 21121210G Build/UKQ1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  h.nativo = false;
  h.launchUrl = null;
  h.ouvintes = [];
  _zerarParaTestes();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("H2 — o link do site vira a rota do app (rotaDoLink)", () => {
  it("as páginas do aluno dos e-mails, avisos e Mercado Pago abrem no app, com a busca", () => {
    expect(rotaDoLink("https://physiqcalc.com.br/perfil/agenda")).toBe("/perfil/agenda"); // e-mail da agenda-avisar (W20)
    expect(rotaDoLink("https://physiqcalc.com.br/")).toBe("/"); // "Salvar e enviar" treino + dieta (W16/W17)
    expect(rotaDoLink("https://physiqcalc.com.br")).toBe("/");
    expect(rotaDoLink("https://physiqcalc.com.br/treino")).toBe("/treino");
    expect(rotaDoLink("https://physiqcalc.com.br/dieta")).toBe("/dieta");
    expect(rotaDoLink("https://physiqcalc.com.br/dieta?ver=metas")).toBe("/dieta?ver=metas");
    expect(rotaDoLink("https://physiqcalc.com.br/evolucao")).toBe("/evolucao"); // aviso da avaliação nova (W17)
    expect(rotaDoLink("https://physiqcalc.com.br/perfil")).toBe("/perfil");
    expect(rotaDoLink("https://physiqcalc.com.br/perfil/meu-plano")).toBe("/perfil/meu-plano"); // aviso da W7b
    expect(rotaDoLink("https://physiqcalc.com.br/perfil/pagamentos?assinatura=ok")).toBe("/perfil/pagamentos?assinatura=ok"); // volta do MP
    expect(rotaDoLink("https://www.physiqcalc.com.br/treino")).toBe("/treino");
    expect(rotaDoLink("https://PHYSIQCALC.com.br/perfil/agenda")).toBe("/perfil/agenda");
  });
  it("as rotas antigas do Calc que levam ao app do aluno também (o app redireciona depois)", () => {
    expect(rotaDoLink("https://physiqcalc.com.br/treinos")).toBe("/treinos");
    expect(rotaDoLink("https://physiqcalc.com.br/avaliacao")).toBe("/avaliacao");
    expect(rotaDoLink("https://physiqcalc.com.br/pagamentos")).toBe("/pagamentos"); // back_url antigo do mp-payments
  });
  it("o # nunca vai (o link 'já logado' leva os tokens nele) e o ?prof= sai da rota", () => {
    expect(rotaDoLink("https://physiqcalc.com.br/perfil/agenda#access_token=x&refresh_token=y")).toBe("/perfil/agenda");
    expect(rotaDoLink("https://physiqcalc.com.br/perfil?prof=PROF-X&aba=1")).toBe("/perfil?aba=1");
  });
  it("a raiz com ?prof= (o link do profissional, W7b) NÃO troca de tela — o profPendente guarda o código e o popup abre", () => {
    const link = "https://physiqcalc.com.br/?prof=PROF-LUCAS-FERREIRA";
    expect(rotaDoLink(link)).toBeNull();
    expect(codigoDoDeepLink(link)).toBe("PROF-LUCAS-FERREIRA");
    expect(rotaDoLink("https://www.physiqcalc.com.br/?prof=prof-y&x=1")).toBeNull();
    expect(codigoDoDeepLink("https://www.physiqcalc.com.br/?prof=prof-y&x=1")).toBe("PROF-Y");
  });
  it("a volta do login do Google e o deep link do código passam reto (são do capacitorAuth e do profPendente)", () => {
    expect(rotaDoLink("com.bertoldo.physiqcalc://login-callback?code=abc")).toBeNull();
    expect(rotaDoLink("com.bertoldo.physiqcalc://login-callback#access_token=a&refresh_token=b")).toBeNull();
    expect(rotaDoLink("com.bertoldo.physiqcalc://vincular?prof=PROF-X")).toBeNull();
    expect(codigoDoDeepLink("com.bertoldo.physiqcalc://vincular?prof=PROF-X")).toBe("PROF-X");
    expect(codigoDoDeepLink("com.bertoldo.physiqcalc://login-callback?code=abc")).toBeNull();
  });
  it("fora da lista: painel, master, entrada/convite e as páginas públicas ficam no navegador", () => {
    for (const c of ["/painel", "/painel/agenda?data=2026-10-01", "/master/contas", "/entrar", "/entrar?convite=1", "/entrar/email", "/boas-vindas",
      "/f/abcd2345", "/d/abc", "/c/abc", "/p/abc", "/calculator", "/privacidade", "/termos", "/app/agenda", "/admin/alunos"]) {
      expect(rotaDoLink(`https://physiqcalc.com.br${c}`), c).toBeNull();
    }
  });
  it("host ou esquema errado é ignorado", () => {
    expect(rotaDoLink("http://physiqcalc.com.br/perfil/agenda")).toBeNull();
    expect(rotaDoLink("https://outro-site.com/perfil/agenda")).toBeNull();
    expect(rotaDoLink("https://physiqcalc.com.br.golpe.com/perfil/agenda")).toBeNull();
    expect(rotaDoLink("https://nutri.physiqcalc.com.br/app/agenda")).toBeNull();
    expect(rotaDoLink("https://physiqcalc-staging.vercel.app/perfil/agenda")).toBeNull();
    expect(rotaDoLink("https://physiqcalc.com.br/perfil/../painel")).toBeNull();
    expect(rotaDoLink("")).toBeNull();
    expect(rotaDoLink(null)).toBeNull();
    expect(rotaDoLink("nada")).toBeNull();
    expect(rotaDoLink(`https://physiqcalc.com.br/perfil?x=${"a".repeat(600)}`)).toBeNull();
  });
  it("ehCaminhoDoApp: a raiz exata e os prefixos (a regra do android:pathPrefix)", () => {
    expect(ehCaminhoDoApp("/")).toBe(true);
    expect(ehCaminhoDoApp("/perfil/agenda")).toBe(true);
    expect(ehCaminhoDoApp("/painel")).toBe(false);
    expect(ehCaminhoDoApp("")).toBe(false);
    expect(ehCaminhoDoApp("perfil")).toBe(false);
  });
});

describe("H2 — o manifest do APK tem exatamente as páginas do aluno (App Links)", () => {
  it("o intent-filter autoVerify do site: https, só physiqcalc.com.br, a raiz exata e os prefixos de PREFIXOS_DO_APP", () => {
    const f = filtroDoSite();
    expect(f).toMatch(/android:autoVerify="true"/);
    expect(f).toMatch(/android\.intent\.action\.VIEW/);
    expect(f).toMatch(/android\.intent\.category\.DEFAULT/);
    expect(f).toMatch(/android\.intent\.category\.BROWSABLE/);
    expect(atributos(f, "scheme")).toEqual(["https"]);
    expect(atributos(f, "host")).toEqual([HOST_APP_LINK]); // o www redireciona e não se verifica
    expect(atributos(f, "path")).toEqual(["/"]);
    expect([...atributos(f, "pathPrefix")].sort()).toEqual([...PREFIXOS_DO_APP].sort());
    expect(atributos(f, "pathPattern")).toEqual([]);
  });
  it("nenhum prefixo pega o painel, o master, a entrada nem as páginas públicas", () => {
    const prefixos = atributos(filtroDoSite(), "pathPrefix");
    for (const c of ["/painel", "/painel/agenda", "/master", "/entrar", "/boas-vindas", "/f/x", "/d/x", "/c/x", "/p/x", "/calculator", "/privacidade", "/termos"]) {
      expect(prefixos.some((p) => c.startsWith(p)), c).toBe(false);
    }
  });
  it("a volta do login do Google (com.bertoldo.physiqcalc://) continua no manifest", () => {
    expect(MANIFESTO).toMatch(/<data android:scheme="com\.bertoldo\.physiqcalc" \/>/);
  });
  it("o pacote do intent:// é o do APK e o do assetlinks.json do site", () => {
    expect(CAPACITOR).toMatch(new RegExp(`appId: '${PACOTE_APK.replace(/\./g, "\\.")}'`));
    expect(ASSETLINKS[0].target.package_name).toBe(PACOTE_APK);
    expect(ASSETLINKS[0].relation).toContain("delegate_permission/common.handle_all_urls");
    expect(ASSETLINKS[0].target.sha256_cert_fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
});

describe("H2 — o destino guardado (o login leva de volta à tela do link)", () => {
  it("guarda, lê e esquece", () => {
    guardarDestino("/perfil/agenda");
    expect(destinoGuardado()).toBe("/perfil/agenda");
    esquecerDestino();
    expect(destinoGuardado()).toBeNull();
  });
  it("vence em 30 min", () => {
    guardarDestino("/perfil/agenda", 1_000);
    expect(destinoGuardado(1_000 + VALIDADE_DESTINO_MS)).toBe("/perfil/agenda");
    expect(destinoGuardado(1_000 + VALIDADE_DESTINO_MS + 1)).toBeNull();
    expect(localStorage.getItem("physiq_destino_do_link")).toBeNull();
  });
  it("só rota do app: o que não é (ou está estragado) não vale", () => {
    guardarDestino("/painel/agenda");
    guardarDestino("https://golpe.com/perfil");
    guardarDestino("//golpe.com/perfil");
    expect(destinoGuardado()).toBeNull();
    localStorage.setItem("physiq_destino_do_link", JSON.stringify({ rota: "//golpe.com", em: Date.now() }));
    expect(destinoGuardado()).toBeNull();
    localStorage.setItem("physiq_destino_do_link", "{quebrado");
    expect(destinoGuardado()).toBeNull();
  });
  it("sem armazenamento (navegador bloqueado) não quebra", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => guardarDestino("/perfil/agenda")).not.toThrow();
    expect(destinoGuardado()).toBeNull();
    expect(() => esquecerDestino()).not.toThrow();
    set.mockRestore();
    get.mockRestore();
  });
  it("a entrada: a página que pediu o login vence; sem ela (ou só a raiz), o destino do link", () => {
    guardarDestino("/perfil/agenda");
    expect(destinoDaEntrada("/painel/alunos")).toBe("/painel/alunos");
    expect(destinoDaEntrada("/")).toBe("/perfil/agenda");
    expect(destinoDaEntrada(undefined)).toBe("/perfil/agenda");
    esquecerDestino();
    expect(destinoDaEntrada("/")).toBe("/");
    expect(destinoDaEntrada(null)).toBeNull();
  });
  it("com a regra de sempre do login: conta sem nada vai às Boas-vindas; senão, a tela do link", () => {
    guardarDestino("/perfil/agenda");
    expect(destinoDepoisDoLogin({ sem_nada: true } as never, destinoDaEntrada(undefined))).toBe("/boas-vindas");
    expect(destinoDepoisDoLogin({ sem_nada: false } as never, destinoDaEntrada(undefined))).toBe("/perfil/agenda");
    expect(destinoDepoisDoLogin({ sem_nada: false } as never, destinoDaEntrada("/"))).toBe("/perfil/agenda");
  });
});

describe("H2 — a chegada do link ao APK", () => {
  it("app fechado: o link da abertura (getLaunchUrl) vira o destino e avisa a casca", async () => {
    h.nativo = true;
    h.launchUrl = "https://physiqcalc.com.br/perfil/agenda";
    const avisos: string[] = [];
    const ouvir = (e: Event) => avisos.push((e as CustomEvent<string>).detail);
    window.addEventListener(EVENTO_LINK, ouvir);
    capturarLinkDoApp();
    await vi.waitFor(() => expect(destinoGuardado()).toBe("/perfil/agenda"));
    expect(avisos).toEqual(["/perfil/agenda"]);
    expect(h.ouvintes).toHaveLength(1);
    // o mesmo link retido pelo Capacitor (appUrlOpen da abertura) logo depois: vale 1 vez só
    h.ouvintes[0]({ url: "https://physiqcalc.com.br/perfil/agenda" });
    expect(avisos).toEqual(["/perfil/agenda"]);
    window.removeEventListener(EVENTO_LINK, ouvir);
  });
  it("um recarregar da página (a mesma abertura) não leva de volta ao link", async () => {
    h.nativo = true;
    h.launchUrl = "https://physiqcalc.com.br/perfil/agenda";
    capturarLinkDoApp();
    await vi.waitFor(() => expect(destinoGuardado()).toBe("/perfil/agenda"));
    esquecerDestino();
    _zerarParaTestes();
    capturarLinkDoApp();
    await new Promise((r) => setTimeout(r, 20));
    expect(destinoGuardado()).toBeNull();
  });
  it("app aberto ou em segundo plano: o appUrlOpen do link vira o destino; o OAuth e o ?prof= passam reto", () => {
    h.nativo = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T13:30:00Z"));
    capturarLinkDoApp();
    const [aoAbrir] = h.ouvintes;
    aoAbrir({ url: "com.bertoldo.physiqcalc://login-callback?code=abc" });
    aoAbrir({ url: "https://physiqcalc.com.br/?prof=PROF-X" });
    aoAbrir({ url: "https://physiqcalc.com.br/painel/agenda" });
    expect(destinoGuardado()).toBeNull();
    aoAbrir({ url: "https://physiqcalc.com.br/dieta" });
    expect(destinoGuardado()).toBe("/dieta");
    // o mesmo link de novo, minutos depois (tocou de novo no e-mail): vale de novo
    esquecerDestino();
    vi.setSystemTime(new Date("2026-10-01T13:40:00Z"));
    aoAbrir({ url: "https://physiqcalc.com.br/dieta" });
    expect(destinoGuardado()).toBe("/dieta");
  });
  it("no site (fora do APK) nada disso roda", async () => {
    h.launchUrl = "https://physiqcalc.com.br/perfil/agenda";
    capturarLinkDoApp();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.ouvintes).toHaveLength(0);
    expect(destinoGuardado()).toBeNull();
    expect(receberLink("https://physiqcalc.com.br/treino")).toBe(true); // a regra pura vale em qualquer lugar
  });
});

describe("H2 — o site guarda a página do link para depois do login", () => {
  const ir = (caminho: string) => window.history.replaceState(null, "", caminho);
  afterEach(() => ir("/"));
  it("página do aluno aberta pelo link → destino; a raiz e o resto, não", () => {
    ir("/perfil/agenda?x=1");
    capturarDestinoDaUrl();
    expect(destinoGuardado()).toBe("/perfil/agenda?x=1");
    esquecerDestino();
    for (const c of ["/", "/painel/agenda", "/entrar", "/f/abc", "/calculator"]) {
      ir(c);
      capturarDestinoDaUrl();
      expect(destinoGuardado(), c).toBeNull();
    }
  });
  it("no APK não (o link chega pelo Android)", () => {
    h.nativo = true;
    ir("/perfil/agenda");
    capturarDestinoDaUrl();
    expect(destinoGuardado()).toBeNull();
  });
});

describe("H2 — a faixa \"Abrir no app Physiq\"", () => {
  it("o intent:// abre o APK na mesma tela; sem o app, a página de baixar o APK", () => {
    expect(intentDoApp("/perfil/agenda")).toBe(
      `intent://physiqcalc.com.br/perfil/agenda#Intent;scheme=https;package=com.bertoldo.physiqcalc;S.browser_fallback_url=${encodeURIComponent(PAGINA_BAIXAR_APP)};end`,
    );
    expect(PAGINA_BAIXAR_APP).toBe("https://github.com/weslleybertoldo/physiqcalc/releases/latest");
    expect(intentDoApp("/dieta?ver=metas")).toContain("intent://physiqcalc.com.br/dieta?ver=metas#Intent;");
    expect(intentDoApp("/", { prof: "prof-lucas" })).toContain("intent://physiqcalc.com.br/?prof=PROF-LUCAS#Intent;");
    expect(intentDoApp("/painel")).toContain("intent://physiqcalc.com.br/#Intent;"); // rota fora do app → a raiz
    expect(intentDoApp("/treino", { fallback: "https://physiqcalc.com.br/treino" })).toContain(`S.browser_fallback_url=${encodeURIComponent("https://physiqcalc.com.br/treino")};end`);
  });
  it("só no navegador do Android: nem no APK, nem na WebView de outro app, nem no iPhone ou no computador", () => {
    expect(faixaNoAparelho(ANDROID_CHROME, false)).toBe(true);
    expect(faixaNoAparelho(ANDROID_CHROME, true)).toBe(false);
    expect(faixaNoAparelho(ANDROID_WEBVIEW, false)).toBe(false);
    expect(faixaNoAparelho(IPHONE, false)).toBe(false);
    expect(faixaNoAparelho(DESKTOP, false)).toBe(false);
    expect(faixaNoAparelho("", false)).toBe(false);
  });
  it("o alvo: a página do aluno; na entrada sem login, o destino do link (ou a página que pediu o login)", () => {
    expect(alvoDaFaixa({ pathname: "/perfil/agenda", search: "", logado: true })).toBe("/perfil/agenda");
    expect(alvoDaFaixa({ pathname: "/dieta", search: "?ver=metas", logado: false })).toBe("/dieta?ver=metas");
    expect(alvoDaFaixa({ pathname: "/", logado: true })).toBe("/");
    expect(alvoDaFaixa({ pathname: "/entrar", logado: false, destino: "/perfil/agenda" })).toBe("/perfil/agenda");
    expect(alvoDaFaixa({ pathname: "/entrar/email", logado: false, destino: "/perfil/agenda" })).toBe("/perfil/agenda");
    expect(alvoDaFaixa({ pathname: "/entrar", logado: false, de: "/treino" })).toBe("/treino");
    expect(alvoDaFaixa({ pathname: "/entrar", logado: false, de: "/" })).toBe("/");
    expect(alvoDaFaixa({ pathname: "/entrar", logado: false, de: "/painel/agenda" })).toBeNull();
    expect(alvoDaFaixa({ pathname: "/entrar", logado: false })).toBeNull();
    expect(alvoDaFaixa({ pathname: "/entrar", logado: true, destino: "/perfil/agenda" })).toBeNull();
    for (const c of ["/painel", "/painel/agenda", "/master/contas", "/f/abc", "/d/abc", "/c/abc", "/p/abc", "/calculator", "/privacidade", "/termos", "/boas-vindas"]) {
      expect(alvoDaFaixa({ pathname: c, logado: false, destino: "/perfil/agenda" }), c).toBeNull();
    }
  });
});
