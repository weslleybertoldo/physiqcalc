// Physiq H2 — abrir o app NA tela do link (pedido dele, 01/10: "quando clicar o link apareça a sugestão de abrir o app e
// quando abrir o app abre na aba da agenda").
//
// 1. APK: o Android entrega ao app os links https das páginas do aluno (App Links — o intent-filter autoVerify do
//    android/app/src/main/AndroidManifest.xml, verificado pelo public/.well-known/assetlinks.json). Com o app aberto ou em
//    segundo plano o link chega pelo `appUrlOpen`; com o app fechado, pelo `App.getLaunchUrl()` (o Capacitor também retém o
//    `appUrlOpen` da abertura para o 1º ouvinte — o do profPendente —, por isso os 2 caminhos e a trava de repetição). A rota do
//    link vira o DESTINO guardado: com login, a casca navega até ela (src/ui/casca/AbrirLinkDoApp.tsx); sem login, a entrada
//    leva até ela depois de entrar (RotaEntrada em src/rotas/Rotas.tsx).
// 2. Site: o link que cai no navegador (app não instalado, App Link ainda não verificado, o Gmail abrindo no navegador dele)
//    guarda o destino do mesmo jeito — a volta do Google recarrega a página e o `state` do router se perde.
// 3. A faixa "Abrir no app Physiq" (src/ui/casca/FaixaAbrirNoApp.tsx) monta o intent:// com a mesma rota.
// Convive com o ?prof= (src/lib/profPendente.ts guarda o código; a raiz com ?prof= NÃO troca de tela — o popup "confirmar o
// profissional" abre por cima da tela em que a pessoa está, como na W7b) e com a volta do login do Google
// (src/lib/capacitorAuth.ts — o esquema com.bertoldo.physiqcalc://, que não é link do site e passa reto aqui).
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { RELEASES_PAGE } from "@/lib/apkRelease";

/** Pacote do APK (o appId do capacitor.config.ts e o package_name do assetlinks.json). */
export const PACOTE_APK = "com.bertoldo.physiqcalc";
/** O host das App Links: o único verificado (o www redireciona com 308 e não serve o assetlinks.json). */
export const HOST_APP_LINK = "physiqcalc.com.br";
/** Hosts cujos links o app aceita (o www só chega por um link colado; o Android não o entrega sozinho). */
export const HOSTS_DO_SITE: readonly string[] = ["physiqcalc.com.br", "www.physiqcalc.com.br"];
/**
 * As páginas do app do aluno que o APK abre — a MESMA lista dos `android:pathPrefix` do intent-filter do manifest (o teste
 * confere). Além delas, a raiz exata (`android:path="/"`: o Início e o link do profissional). /treinos, /avaliacao e
 * /pagamentos são as rotas antigas do Calc que levam ao Treino, à Evolução e ao Perfil › Pagamentos (o /treinos já cai no
 * /treino). Fora: painel, master, entrada (/entrar — o convite também é do profissional) e as páginas públicas.
 */
export const PREFIXOS_DO_APP: readonly string[] = ["/treino", "/dieta", "/evolucao", "/perfil", "/avaliacao", "/pagamentos"];
/** Sem o app instalado, o Chrome segue para a página de baixar o APK (a release mais nova do GitHub — a mesma do "Instalar"). */
export const PAGINA_BAIXAR_APP = RELEASES_PAGE;
/** Evento da janela: chegou um link do site ao APK (a casca navega até o destino). */
export const EVENTO_LINK = "physiq:link-do-app";
/** Quanto tempo o destino guardado vale: o tempo de entrar (Google, e-mail e senha, a troca de token). */
export const VALIDADE_DESTINO_MS = 30 * 60_000;

const CHAVE_DESTINO = "physiq_destino_do_link";
/** sessionStorage da WebView: o link da abertura já foi usado (um recarregar da página não leva de volta a ele). */
const CHAVE_ABERTURA = "physiq_link_da_abertura";
const MAX_ROTA = 500;

/** A página é do app do aluno (a raiz exata ou um dos prefixos — a mesma regra do `android:pathPrefix`). */
export function ehCaminhoDoApp(caminho: string | null | undefined): boolean {
  if (!caminho || !caminho.startsWith("/")) return false;
  if (caminho === "/") return true;
  return PREFIXOS_DO_APP.some((p) => caminho.startsWith(p));
}

/** Rota interna segura (caminho do app + busca), sem esquema, host, # nem caractere de controle. */
function rotaValida(rota: unknown): rota is string {
  if (typeof rota !== "string" || rota.length > MAX_ROTA) return false;
  // eslint-disable-next-line no-control-regex
  if (!rota.startsWith("/") || rota.startsWith("//") || rota.includes("\\") || rota.includes("#") || /[\u0000-\u001f\u007f]/.test(rota)) return false;
  return ehCaminhoDoApp(rota.split("?")[0]);
}

/**
 * Link do site → rota do app: "https://physiqcalc.com.br/perfil/agenda?x=1" → "/perfil/agenda?x=1". null quando não é link
 * do site (outro host, http, o esquema do APK da volta do login), quando a página não é do app do aluno (painel, master,
 * entrada, públicas) e na raiz com ?prof= (o link do profissional só guarda o código — sem trocar de tela). O ?prof= sai da
 * rota (o profPendente já guardou) e o # nunca vai (o link "já logado" leva os tokens no #).
 */
export function rotaDoLink(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !HOSTS_DO_SITE.includes(u.hostname.toLowerCase())) return null;
  const caminho = u.pathname || "/";
  if (!ehCaminhoDoApp(caminho)) return null;
  const busca = new URLSearchParams(u.search);
  const comProf = busca.has("prof");
  busca.delete("prof");
  if (caminho === "/" && comProf) return null;
  const q = busca.toString();
  const rota = `${caminho}${q ? `?${q}` : ""}`;
  return rotaValida(rota) ? rota : null;
}

// ───────────────────────── o destino guardado ─────────────────────────

export function guardarDestino(rota: string, agora: number = Date.now()): void {
  if (!rotaValida(rota)) return;
  try {
    localStorage.setItem(CHAVE_DESTINO, JSON.stringify({ rota, em: agora }));
  } catch {
    /* sem armazenamento: só não guarda */
  }
}

/** O destino do último link (null se não há, se venceu ou se o que está guardado não é rota do app). */
export function destinoGuardado(agora: number = Date.now()): string | null {
  try {
    const bruto = localStorage.getItem(CHAVE_DESTINO);
    if (!bruto) return null;
    const d = JSON.parse(bruto) as { rota?: unknown; em?: unknown };
    const em = typeof d?.em === "number" ? d.em : NaN;
    if (!rotaValida(d?.rota) || !(agora - em >= 0 && agora - em <= VALIDADE_DESTINO_MS)) {
      localStorage.removeItem(CHAVE_DESTINO);
      return null;
    }
    return d.rota;
  } catch {
    return null;
  }
}

export function esquecerDestino(): void {
  try {
    localStorage.removeItem(CHAVE_DESTINO);
  } catch {
    /* noop */
  }
}

/** Para onde a entrada leva depois do login: a página que pediu o login; sem ela (ou só a raiz), o destino do link. */
export function destinoDaEntrada(de: string | null | undefined): string | null {
  if (de && de !== "/") return de;
  return destinoGuardado() ?? de ?? null;
}

// ───────────────────────── a chegada do link (APK e site) ─────────────────────────

let ultimo: { url: string; em: number } | null = null;

/** Trata o link que chegou ao APK; true quando virou destino. O mesmo link 2× em 3 s (abertura + evento retido) vale 1. */
export function receberLink(url: string | null | undefined, agora: number = Date.now()): boolean {
  const rota = rotaDoLink(url);
  if (!rota) return false;
  if (ultimo && ultimo.url === url && agora - ultimo.em < 3000) return false;
  ultimo = { url: url as string, em: agora };
  guardarDestino(rota, agora);
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_LINK, { detail: rota }));
  } catch {
    /* sem window */
  }
  return true;
}

function aberturaJaUsada(url: string): boolean {
  try {
    return sessionStorage.getItem(CHAVE_ABERTURA) === url;
  } catch {
    return false;
  }
}

function marcarAbertura(url: string): void {
  try {
    sessionStorage.setItem(CHAVE_ABERTURA, url);
  } catch {
    /* noop */
  }
}

/** APK: o link do site que abre o app — fechado (getLaunchUrl) ou já aberto/em segundo plano (appUrlOpen). */
export function capturarLinkDoApp(): void {
  if (!Capacitor.isNativePlatform()) return;
  try {
    void App.getLaunchUrl()
      .then((r) => {
        const url = r?.url;
        if (!url || aberturaJaUsada(url)) return;
        marcarAbertura(url);
        receberLink(url);
      })
      .catch(() => {});
    void App.addListener("appUrlOpen", ({ url }) => {
      receberLink(url);
    });
  } catch {
    /* sem o plugin */
  }
}

/**
 * Site: a página do app aberta por um link (e-mail, aviso, link colado) vira o destino — quem está sem login entra e volta para
 * ela. A raiz não precisa (já é o destino de sempre). Com login, a casca esquece o destino assim que a situação chega.
 */
export function capturarDestinoDaUrl(): void {
  if (Capacitor.isNativePlatform()) return;
  try {
    const { pathname, search } = window.location;
    if (pathname === "/" || !ehCaminhoDoApp(pathname)) return;
    const rota = rotaDoLink(`https://${HOST_APP_LINK}${pathname}${search}`);
    if (rota) guardarDestino(rota);
  } catch {
    /* sem window */
  }
}

/** Só para os testes: zera a trava de repetição. */
export function _zerarParaTestes(): void {
  ultimo = null;
}

// ───────────────────────── a faixa "Abrir no app Physiq" (site no Android) ─────────────────────────

/**
 * O link que abre o APK pelo Chrome do Android (abre o app se instalado; sem ele, a página de baixar o APK). O host é sempre
 * o das App Links (é o que o intent-filter do APK aceita — vale também no staging e no local, que não têm APK próprio).
 */
export function intentDoApp(rota: string, opcoes: { prof?: string | null; fallback?: string } = {}): string {
  const [caminho, busca = ""] = (rotaValida(rota) ? rota : "/").split("?");
  const q = new URLSearchParams(busca);
  const prof = (opcoes.prof ?? "").trim();
  if (prof) q.set("prof", prof.toUpperCase().slice(0, 60));
  const qs = q.toString();
  const fallback = opcoes.fallback ?? PAGINA_BAIXAR_APP;
  return `intent://${HOST_APP_LINK}${caminho}${qs ? `?${qs}` : ""}#Intent;scheme=https;package=${PACOTE_APK};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

/** A faixa só faz sentido no navegador do Android (fora do APK; a WebView de outros apps não abre o intent://). */
export function faixaNoAparelho(userAgent: string | null | undefined, nativo: boolean): boolean {
  const ua = userAgent ?? "";
  return !nativo && /Android/i.test(ua) && !/;\s*wv\)/.test(ua);
}

/**
 * A tela que a faixa abre no app: nas páginas do aluno, a própria (caminho + busca); na entrada sem login, o destino do link
 * (ou a página que pediu o login, se é do app). Fora disso (painel, master, públicas, logado na entrada) não há faixa.
 */
export function alvoDaFaixa(p: { pathname: string; search?: string; de?: string | null; logado: boolean; destino?: string | null }): string | null {
  if (ehCaminhoDoApp(p.pathname)) {
    const rota = `${p.pathname}${p.search ?? ""}`;
    return rotaValida(rota) ? rota : p.pathname;
  }
  if ((p.pathname === "/entrar" || p.pathname === "/entrar/email") && !p.logado) {
    if (p.destino && rotaValida(p.destino)) return p.destino;
    if (p.de && rotaValida(p.de)) return p.de;
  }
  return null;
}
