// Physiq W24 — regras puras do Painel › Dietas (testadas): a aba pela URL e quem escreve.

export type AbaDietas = "alimentos" | "receitas" | "diario";

/** A aba pela URL (?aba=alimentos|receitas|diario — os links antigos /alimentos, /receitas e /diario do Nutri caem aqui). */
export function abaDietasDaUrl(sp: URLSearchParams): AbaDietas {
  const a = sp.get("aba");
  return a === "receitas" || a === "diario" ? a : "alimentos";
}

/** Chaves do react-query das receitas (as mesmas do "Da receita" do editor da W16: a lista é uma só no cache). */
export const CHAVE_RECEITAS = ["receitas"] as const;
export const CHAVE_GRUPOS_RECEITA = ["grupos_receita"] as const;
