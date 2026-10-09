// Physiq hml-14d (B19 · D22b) — a busca da lista de alunos do Treino (admin-list-users) sem acento. Regras PURAS: sem Deno, sem
// rede e sem banco — usadas pela função (o deploy leva a pasta dela) e testadas no Vitest (src/lib/adminTreinoListas.test.ts).
//
// Por que expressão regular e não uma coluna `busca`: a physiq_profiles vai ao app pelo PowerSync (coluna nova = mudança no app).
// O termo vira um padrão com as variantes acentuadas de cada letra ("jose" → "j[oó…]s[eé…]") e vai no `imatch` do PostgREST
// (o `~*` do Postgres: sem caixa). Assim "jose" acha "José" e "JOSÉ", e "josé" acha "Jose".

const VARIANTES: Record<string, string> = {
  a: "aáàâãäåAÁÀÂÃÄÅ",
  e: "eéèêëEÉÈÊË",
  i: "iíìîïIÍÌÎÏ",
  o: "oóòôõöOÓÒÔÕÖ",
  u: "uúùûüUÚÙÛÜ",
  c: "cçCÇ",
  n: "nñNÑ",
  y: "yýÿYÝŸ",
};

/** Pontuação ASCII (! a /, : a @, [ a `, { a ~): na expressão regular do Postgres (ARE), "\" + um caractere que não é letra nem
 * número = o próprio caractere. Letra acentuada, emoji e afins ficam de fora (escapar letra é erro no ARE). */
function ehPontuacao(c: string): boolean {
  const n = c.charCodeAt(0);
  return (n >= 0x21 && n <= 0x2f) || (n >= 0x3a && n <= 0x40) || (n >= 0x5b && n <= 0x60) || (n >= 0x7b && n <= 0x7e);
}

/** O termo sem acento, minúsculo, com os espaços juntos e sem espaço nas pontas. */
export function semAcento(termo: string): string {
  return (termo || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * O termo como expressão regular que acha o texto com ou sem acento: cada vogal, "c", "n" e "y" vira a classe com as variantes;
 * a pontuação vai escapada (`\.`, `\(`, `\*`, `\%`…) — nada do que a pessoa digita vira operador da expressão; o resto (letras,
 * números, espaço) fica como está. Termo vazio (ou só acento solto) → "".
 */
export function padraoSemAcento(termo: string): string {
  let saida = "";
  for (const c of semAcento(termo)) {
    if (VARIANTES[c]) saida += `[${VARIANTES[c]}]`;
    else if (ehPontuacao(c)) saida += `\\${c}`;
    else saida += c;
  }
  return saida;
}

/**
 * Um valor dentro do filtro `or=(…)` do PostgREST: entre aspas, com `\` e `"` escapados por `\` — a vírgula, o ponto e os
 * parênteses do termo ficam literais (sem aspas, quebrariam o filtro).
 */
export function valorDoFiltro(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * As partes do `or()` da busca: nome e e-mail sem acento (`imatch`); o termo só de dígitos também acha o `user_code` (como
 * antes; até 15 dígitos — mais que isso estoura o bigint e derrubaria a lista inteira). Termo que não sobra nada (vazio, só
 * acento) → [] (sem filtro).
 */
export function filtrosDaBusca(termo: string): string[] {
  const padrao = padraoSemAcento(termo);
  if (!padrao) return [];
  const v = valorDoFiltro(padrao);
  const partes = [`nome.imatch.${v}`, `email.imatch.${v}`];
  const t = (termo || "").trim();
  if (/^\d{1,15}$/.test(t)) partes.push(`user_code.eq.${Number(t)}`);
  return partes;
}
