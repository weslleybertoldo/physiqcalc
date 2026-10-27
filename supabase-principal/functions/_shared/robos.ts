// Physiq T4 (27/10/2026) — os robôs que abrem o site e não são aluno: a lista num lugar só (a erro-avisar usa; o teste é
// src/lib/erroAvisarServidor.test.ts). Os avisos falsos do grupo Physiq eram deles: a Google Play abre o site para conferir a página de
// privacidade e a de excluir a conta ("PlayStore-Google"), o Googlebot indexa — e cada um que recusa o service worker ou roda um
// WebView velho virava aviso. Só entra robô com MARCA EXPLÍCITA no user-agent: um celular comum (mesmo um Android 11 com o Chrome 90,
// como o celular de teste do Google na revisão, que não tem marca nenhuma) continua avisando — aluno real nunca pode sumir.
// A comparação não diferencia maiúsculas; a marca vale em qualquer lugar do UA ("…Safari/537.36 PlayStore-Google",
// "…compatible; Googlebot/2.1…"). Exceção: "Google" sozinho só conta quando é o UA INTEIRO (um robô do Google manda só isso; dentro do
// UA de um navegador, "Google" pode ser o nome do aparelho). Sem Deno e sem rede.

export interface Robo {
  /** O que procurar no user-agent (sem diferenciar maiúsculas). */
  marca: string;
  /** O código que vai para o log (resultado do aviso_de_robo): [a-z0-9_]. */
  codigo: string;
}

/** Os robôs com marca explícita no user-agent. Robô novo? Entra aqui (e no teste, com o UA de verdade). */
export const ROBOS: readonly Robo[] = [
  // Google — a loja (a revisão do app e a ficha), a busca, os anúncios e as ferramentas
  { marca: "PlayStore-Google", codigo: "playstore_google" },
  { marca: "Googlebot", codigo: "googlebot" },
  { marca: "Google-InspectionTool", codigo: "google_inspectiontool" },
  { marca: "AdsBot-Google", codigo: "adsbot_google" },
  { marca: "Mediapartners-Google", codigo: "mediapartners_google" },
  { marca: "APIs-Google", codigo: "apis_google" },
  { marca: "FeedFetcher-Google", codigo: "feedfetcher_google" },
  { marca: "Google-Read-Aloud", codigo: "google_read_aloud" },
  { marca: "Storebot-Google", codigo: "storebot_google" },
  { marca: "GoogleOther", codigo: "googleother" },
  { marca: "Google-Site-Verification", codigo: "google_site_verification" },
  { marca: "Google-Safety", codigo: "google_safety" },
  { marca: "Chrome-Lighthouse", codigo: "chrome_lighthouse" },
  // os outros buscadores e robôs que rodam o JavaScript da página
  { marca: "bingbot", codigo: "bingbot" },
  { marca: "Applebot", codigo: "applebot" },
  { marca: "YandexBot", codigo: "yandexbot" },
  { marca: "DuckDuckBot", codigo: "duckduckbot" },
  { marca: "Baiduspider", codigo: "baiduspider" },
  { marca: "PetalBot", codigo: "petalbot" },
  { marca: "Bytespider", codigo: "bytespider" },
  { marca: "AhrefsBot", codigo: "ahrefsbot" },
  { marca: "SemrushBot", codigo: "semrushbot" },
  { marca: "facebookexternalhit", codigo: "facebookexternalhit" },
];

/** O UA inteiro (sem os espaços das pontas) que, sozinho, é robô do Google. */
const SO_O_NOME = "google";

const MARCAS = ROBOS.map((r) => ({ ...r, procura: r.marca.toLowerCase() }));

/** O código do robô deste user-agent, ou null (gente, ou sem o cabeçalho). Nunca lança. */
export function roboDoAgente(ua: string | null | undefined): string | null {
  if (typeof ua !== "string") return null;
  const t = ua.trim().toLowerCase();
  if (!t) return null;
  if (t === SO_O_NOME) return "google";
  for (const r of MARCAS) if (t.includes(r.procura)) return r.codigo;
  return null;
}
