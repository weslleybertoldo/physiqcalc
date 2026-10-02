// Physiq W28 (virada — spec §9 e §12, risco 11): quem chega do site antigo do Nutri. O domínio nutri.physiqcalc.com.br responde
// 308 para https://physiqcalc.com.br/<mesmo caminho>?<query original>&origem=nutri (o # vai junto). ANTES do React Router ler a
// URL (src/main.tsx), este módulo:
//   · guarda a marca no sessionStorage (com o caminho de chegada) — a tela "O PhysiqNutri agora é o Physiq"
//     (src/ui/casca/BoasVindasNutri.tsx) aparece por cima, logado ou não, e a "Página não encontrada" leva ao início;
//   · TIRA só o origem=nutri da barra de endereço (history.replaceState): o Master › Contas lê ?origem= como filtro (ficaria
//     vazio) e um recarregar não traz a marca de volta. O resto da query vai como veio (sem recodificar) e o # também (o link
//     "já logado" leva os tokens nele).
// Fechar a tela apaga a marca e ela não volta na mesma sessão do navegador. Sem React aqui (roda antes de tudo).

/** A marca de quem chegou do Nutri nesta sessão do navegador: { caminho, em }. */
export const CHAVE_VEIO_DO_NUTRI = "physiq_veio_do_nutri";
/** A tela de boas-vindas já foi fechada nesta sessão (uma nova chegada pelo Nutri não a abre de novo). */
export const CHAVE_NUTRI_FECHADA = "physiq_veio_do_nutri_fechada";
/** Evento da janela: a marca mudou (a tela de boas-vindas e o aviso "o Physiq mudou" escutam). */
export const EVENTO_VEIO_DO_NUTRI = "physiq:veio-do-nutri";

export interface MarcaNutri {
  /** o caminho em que a pessoa chegou (sem a query e sem o #) */
  caminho: string;
  em: number;
}

function decodificar(v: string): string {
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v;
  }
}

/** "origem=nutri" (a chave e o valor, sem diferença de maiúsculas no valor) — o resto da query não é a marca. */
function ehMarca(parte: string): boolean {
  const i = parte.indexOf("=");
  if (i < 0) return false;
  return decodificar(parte.slice(0, i)) === "origem" && decodificar(parte.slice(i + 1)).trim().toLowerCase() === "nutri";
}

/**
 * A URL sem o origem=nutri: "/dashboard?x=1&origem=nutri#a" → { veio: true, url: "/dashboard?x=1#a" }. Os outros parâmetros ficam
 * na ordem e na escrita em que vieram (o ?origem=legado_nutri do filtro do master não é a marca).
 */
export function tirarMarcaDaUrl(pathname: string, search: string, hash: string): { veio: boolean; url: string } {
  const partes = (search.startsWith("?") ? search.slice(1) : search).split("&").filter((p) => p !== "");
  const resto = partes.filter((p) => !ehMarca(p));
  const h = hash && hash !== "#" ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  const q = resto.length ? `?${resto.join("&")}` : "";
  return { veio: resto.length !== partes.length, url: `${pathname || "/"}${q}${h}` };
}

function avisar(): void {
  try {
    window.dispatchEvent(new Event(EVENTO_VEIO_DO_NUTRI));
  } catch {
    /* sem window */
  }
}

/** A marca guardada, crua (o mesmo texto enquanto não muda — serve de retrato para o useSyncExternalStore). */
export function lerMarcaNutri(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_VEIO_DO_NUTRI);
  } catch {
    return null;
  }
}

/** Quem chegou do Nutri nesta sessão (e ainda não fechou a tela de boas-vindas). */
export function veioDoNutri(): MarcaNutri | null {
  const bruto = lerMarcaNutri();
  if (!bruto) return null;
  try {
    const m = JSON.parse(bruto) as Partial<MarcaNutri>;
    return { caminho: typeof m.caminho === "string" ? m.caminho : "/", em: typeof m.em === "number" ? m.em : 0 };
  } catch {
    return { caminho: "/", em: 0 };
  }
}

function fechadaNestaSessao(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_NUTRI_FECHADA) === "1";
  } catch {
    return false;
  }
}

/**
 * Chamado em src/main.tsx antes do render: com o origem=nutri na query, guarda a marca (se a tela ainda não foi fechada nesta
 * sessão) e tira o parâmetro da barra de endereço. true quando a pessoa veio do Nutri.
 */
export function capturarOrigemNutri(agora: number = Date.now()): boolean {
  try {
    const { pathname, search, hash } = window.location;
    const r = tirarMarcaDaUrl(pathname, search, hash);
    if (!r.veio) return false;
    chegadaNestaCarga = pathname || "/";
    if (!fechadaNestaSessao()) {
      try {
        sessionStorage.setItem(CHAVE_VEIO_DO_NUTRI, JSON.stringify({ caminho: pathname || "/", em: agora } satisfies MarcaNutri));
      } catch {
        /* sem armazenamento: só limpa a URL */
      }
    }
    window.history.replaceState(window.history.state, "", r.url);
    avisar();
    return true;
  } catch {
    return false;
  }
}

/** O caminho por onde a pessoa chegou do Nutri NESTA carga da página (mesmo que a tela já tenha sido fechada antes). */
let chegadaNestaCarga: string | null = null;

/**
 * A pessoa chegou do Nutri nesta carga da página exatamente por este caminho? (a "Página não encontrada" não aparece para um link
 * antigo do Nutri, nem para quem já fechou a tela de boas-vindas antes nesta aba).
 */
export function chegouDoNutriPor(pathname: string): boolean {
  return chegadaNestaCarga !== null && chegadaNestaCarga === pathname;
}

/** Só para os testes: esquece a chegada desta carga. */
export function esquecerChegadaNutri(): void {
  chegadaNestaCarga = null;
}

/** A pessoa fechou a tela de boas-vindas: apaga a marca e não abre de novo nesta sessão do navegador. */
export function fecharBoasVindasNutri(): void {
  try {
    sessionStorage.removeItem(CHAVE_VEIO_DO_NUTRI);
    sessionStorage.setItem(CHAVE_NUTRI_FECHADA, "1");
  } catch {
    /* sem armazenamento */
  }
  avisar();
}

/** Escuta as mudanças da marca (para o useSyncExternalStore). */
export function assinarMarcaNutri(aoMudar: () => void): () => void {
  try {
    window.addEventListener(EVENTO_VEIO_DO_NUTRI, aoMudar);
    return () => window.removeEventListener(EVENTO_VEIO_DO_NUTRI, aoMudar);
  } catch {
    return () => {};
  }
}
