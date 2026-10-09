import { criarFetchResiliente } from "@/integrations/repeticao";

export const RELEASES_API = "https://api.github.com/repos/weslleybertoldo/physiqcalc/releases/latest";
export const RELEASES_PAGE = "https://github.com/weslleybertoldo/physiqcalc/releases/latest";

export interface ReleaseApk {
  version: string;
  url: string;
}

/** hml-14d (H-32, D37): o GitHub responde em até 8 s ou a consulta desiste (1 vez só) e cai no null de sempre. */
export const TEMPO_RELEASE_MS = 8_000;
const buscarRelease = criarFetchResiliente(0, TEMPO_RELEASE_MS);

/** Última release do GitHub → versão + URL do .apk. null se a API falhar (sem rede, rate limit, mais de 8 s) ou não houver .apk. */
export async function ultimoApk(fetcher: typeof fetch = buscarRelease): Promise<ReleaseApk | null> {
  try {
    const res = await fetcher(RELEASES_API, { cache: "no-store" });
    if (!res.ok) return null;
    const release = await res.json();
    const version = String(release.tag_name || "").replace(/^v/, "");
    const asset = ((release.assets || []) as { name: string; browser_download_url: string }[]).find((a) =>
      a.name.endsWith(".apk"),
    );
    if (!asset) return null;
    return { version, url: asset.browser_download_url };
  } catch {
    return null;
  }
}

/** Navega pra URL na MESMA aba: o asset do GitHub vem com Content-Disposition attachment → baixa sem sair da página
 *  e sem bloqueio de popup (window.open depois de await é bloqueado no Safari/Chrome). */
export function baixarNoNavegador(url: string): void {
  window.location.assign(url);
}
