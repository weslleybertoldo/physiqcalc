import { ClipboardCheck, Dumbbell, FileText, LayoutDashboard, Salad, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { existe } from "@/rotas/registro";
import type { Modulo } from "@/ui/casca/dadosCasca";

/**
 * As 6 abas do perfil do aluno (spec 4.5, tela 7). A aba é `src/painel/aluno/abas/<arquivo>.tsx`; o Resumo é da casca e monta os
 * cards de `src/painel/aluno/resumo/`. Sem a tela, a aba some. W28: o fallback do "Configurar aluno" antigo do Calc (os grupos
 * `?ct=`) saiu com o legado — os links antigos com `?ct=` caem na aba certa pelos redirecionamentos (src/rotas/redirecionamentos.ts).
 */
export interface AbaAluno {
  id: "resumo" | "treino" | "dieta" | "avaliacao" | "prontuario" | "financeiro";
  arquivo: string | null;
  rotulo: string;
  icone: LucideIcon;
  /** Pedaço da rota depois de /painel/alunos/:id ("" = Resumo). */
  rota: string;
  modulo: Modulo | "ambos";
}

export const ABAS_ALUNO: AbaAluno[] = [
  { id: "resumo", arquivo: null, rotulo: "Resumo", icone: LayoutDashboard, rota: "", modulo: "ambos" },
  { id: "treino", arquivo: "Treino", rotulo: "Treino", icone: Dumbbell, rota: "treino", modulo: "treino" },
  { id: "dieta", arquivo: "Dieta", rotulo: "Dieta", icone: Salad, rota: "dieta", modulo: "nutricao" },
  { id: "avaliacao", arquivo: "Avaliacao", rotulo: "Avaliação", icone: ClipboardCheck, rota: "avaliacao", modulo: "ambos" },
  { id: "prontuario", arquivo: "Prontuario", rotulo: "Prontuário", icone: FileText, rota: "prontuario", modulo: "ambos" },
  { id: "financeiro", arquivo: "Financeiro", rotulo: "Financeiro", icone: Wallet, rota: "financeiro", modulo: "ambos" },
];

/** Ordem dos cards do Resumo (tela 7 e spec 4.5): os 6 de cima e, abaixo, os de dados/acesso/ajustes. */
export const ORDEM_RESUMO = [
  "CardTreino",
  "CardDieta",
  "CardEvolucao",
  "CardProntuario",
  "CardFinanceiro",
  "CardProximosCompromissos",
  "CardDadosAluno",
  "CardAcessoAluno",
  "CardAjustesAluno",
  "CardLinkDiario",
  "CardResumoPrivado",
  "CardFluxoConsulta",
] as const;

/** Ordem dos números do cabeçalho (tela 7): Peso, Gordura, Mensalidade. */
export const ORDEM_KPIS = ["KpiPeso", "KpiGordura", "KpiMensalidade"] as const;

/** nova = aba registrada (o Resumo é sempre da casca) · null = escondida */
export type EstadoAbaAluno = "nova" | null;

export function estadoDaAbaAluno(
  aba: AbaAluno,
  modulos: readonly Modulo[],
  temNova: (arquivo: string) => boolean = (a) => existe("abasAluno", a),
): EstadoAbaAluno {
  if (aba.modulo !== "ambos" && !modulos.includes(aba.modulo)) return null;
  if (aba.id === "resumo") return "nova";
  return aba.arquivo !== null && temNova(aba.arquivo) ? "nova" : null;
}

export function abaAtualDaRota(pathname: string, alunoId: string): AbaAluno["id"] {
  const base = `/painel/alunos/${encodeURIComponent(alunoId)}`;
  const resto = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+/, "").split("/")[0] : "";
  return (ABAS_ALUNO.find((a) => a.rota === resto)?.id ?? "resumo") as AbaAluno["id"];
}
