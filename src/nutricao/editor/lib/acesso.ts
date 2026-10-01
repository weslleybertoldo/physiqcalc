// Physiq W16 — quem vê e quem muda a dieta do aluno no painel (spec 4.1) e as seções da aba Dieta (spec 4.5). Regras puras.
import type { PerfilAluno } from "@/painel/aluno/dados/tipos";

/** As seções da aba (spec 4.5 › Dieta): o editor da tela 8 e as 6 seções do prontuário do Nutri que são da dieta. */
export const SECOES_DIETA = [
  { id: "planejamento", rotulo: "Plano" },
  { id: "acompanhamento", rotulo: "Acompanhamento" },
  { id: "calculo-energetico", rotulo: "Cálculo energético" },
  { id: "suplementos", rotulo: "Suplementos" },
  { id: "manipulados", rotulo: "Manipulados" },
  { id: "orientacoes", rotulo: "Orientações" },
  { id: "metas", rotulo: "Metas" },
] as const;
export type SecaoDieta = (typeof SECOES_DIETA)[number]["id"];

/** Os atalhos do "Fluxo de consulta" (W14) chegam com o parâmetro do formulário: cada um abre a sua seção. */
export function secaoDaUrl(params: URLSearchParams): SecaoDieta {
  const s = params.get("secao");
  if (SECOES_DIETA.some((x) => x.id === s)) return s as SecaoDieta;
  if (params.get("nova") === "orientacao") return "orientacoes";
  if (params.get("novo") === "manipulado") return "manipulados";
  return "planejamento";
}

export type AcessoDieta = "editar" | "ver" | "so-plano";

/**
 * Quem vê e quem muda a dieta (spec 4.1): a nutricionista responsável, o dono com papel de nutricionista e o master mudam; o dono
 * sem papel de nutri vê tudo; o personal responsável vê só o plano (refeições, kcal, macros) e a adesão. O banco confere de novo
 * (RLS da nutrição — W3 e W16).
 */
export function acessoDaDieta(p: Pick<PerfilAluno, "eu" | "nutricionista" | "conta_id">): AcessoDieta {
  const eu = p.eu;
  if (!eu) return "so-plano";
  if (eu.master) return "editar";
  if (eu.nutricionista && (p.nutricionista?.id === eu.id || eu.dono)) return "editar";
  if (!p.conta_id && p.nutricionista?.id === eu.id) return "editar";
  if (eu.dono) return "ver";
  return "so-plano";
}

