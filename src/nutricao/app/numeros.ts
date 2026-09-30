// Physiq W11 — números e macros do módulo Nutrição, portados do PhysiqNutri (src/lib/{alimentosUtil,antropometriaUtil,
// energeticoUtil}.ts): a MESMA conta do site antigo (regra de 3 a partir dos 100 g, 2 casas) para o aluno ver no Physiq
// exatamente o que via lá. Funções puras, testadas em numeros.test.ts.

/** Macros por 100 g (ou já calculados para uma quantidade). `null` = sem valor na tabela. */
export type Macros = {
  energia_kcal: number | null;
  proteina_g: number | null;
  carboidrato_g: number | null;
  lipidio_g: number | null;
  fibra_g: number | null;
  sodio_mg: number | null;
};

export const MACROS_VAZIOS: Macros = { energia_kcal: null, proteina_g: null, carboidrato_g: null, lipidio_g: null, fibra_g: null, sodio_mg: null };

/** "12,5" · 12.5 · "" → 12.5 · 12.5 · null */
export function numero(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = (v ?? "").toString().trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const arred = (n: number, casas = 2): number => Math.round(n * 10 ** casas) / 10 ** casas;

/** Número pra tela, com vírgula ("—" quando não há). */
export const fmtNum = (n: number | null | undefined, casas = 1): string => (n === null || n === undefined ? "—" : n.toFixed(casas).replace(".", ","));

/** 2 casas no máximo, sem zeros no fim, vírgula: 12.5 → "12,5" · 100 → "100" · null → "—". */
export const fmtQtd = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");

/** kcal inteiras com ponto de milhar: 1480.4 → "1.480". */
export const fmtKcal = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Valor por 100 g → valor pra `gramas` (regra de 3), 2 casas. Sem valor → null. */
export const porGramas = (por100: number | null | undefined, gramas: number): number | null =>
  por100 === null || por100 === undefined || !Number.isFinite(gramas) || gramas < 0 ? null : arred((Number(por100) * gramas) / 100, 2);

export const macrosPorGramas = (a: Macros, gramas: number): Macros => ({
  energia_kcal: porGramas(a.energia_kcal, gramas),
  proteina_g: porGramas(a.proteina_g, gramas),
  carboidrato_g: porGramas(a.carboidrato_g, gramas),
  lipidio_g: porGramas(a.lipidio_g, gramas),
  fibra_g: porGramas(a.fibra_g, gramas),
  sodio_mg: porGramas(a.sodio_mg, gramas),
});

export const semAcento = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "Maria da Silva" → "maria-da-silva" (nome de arquivo; até 40 letras; vazio → "paciente"). */
export function slugNome(texto: string): string {
  return (
    semAcento(texto ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "paciente"
  );
}
