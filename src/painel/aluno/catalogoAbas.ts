import { ClipboardCheck, Dumbbell, FileText, LayoutDashboard, Salad, ShieldCheck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { existe } from "@/rotas/registro";
import type { Modulo } from "@/ui/casca/dadosCasca";

/**
 * As 7 abas do perfil do aluno (spec 4.5, tela 7; W-A P4: Acessos depois de Financeiro, para todo aluno). A aba é
 * `src/painel/aluno/abas/<arquivo>.tsx`; o Resumo é da casca e monta os cards de `src/painel/aluno/resumo/`. Sem a tela, a aba some. W28:
 * o fallback do "Configurar aluno" antigo do Calc (os grupos `?ct=`) saiu com o legado — os links antigos com `?ct=` caem na aba certa
 * pelos redirecionamentos (src/rotas/redirecionamentos.ts).
 */
export interface AbaAluno {
  id: "resumo" | "treino" | "dieta" | "avaliacao" | "prontuario" | "financeiro" | "acessos";
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
  // W-A P4 (spec §4.1): o que o aluno pode no app — todo aluno (o Login do aluno mora aqui)
  { id: "acessos", arquivo: "Acessos", rotulo: "Acessos", icone: ShieldCheck, rota: "acessos", modulo: "ambos" },
];

/**
 * Ordem dos cards do Resumo (tela 7 e spec 4.5): os 6 de cima e, abaixo, os de dados/mensagens/link. W-A P4: o card de login saiu (mora
 * na aba Acessos — src/painel/aluno/resumo/acesso/) e o lugar do card Rotinas (a P6 cria) é o 7º, o 1º de baixo.
 */
export const ORDEM_RESUMO = [
  "CardTreino",
  "CardDieta",
  "CardEvolucao",
  "CardProntuario",
  "CardFinanceiro",
  "CardProximosCompromissos",
  "CardRotinas",
  "CardDadosAluno",
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

/**
 * W-A P4 (spec §4.1: "a aba ativa rola para a vista na barra"): o quanto a barra de abas (que rola na horizontal no celular) tem de rolar
 * para a aba ativa aparecer inteira, com uma folga; null = ela já está toda à vista.
 */
export function rolagemParaMostrar(
  aba: { esquerda: number; largura: number },
  barra: { rolagem: number; largura: number },
  folga = 16,
): number | null {
  if (barra.largura <= 0 || aba.largura <= 0) return null;
  if (aba.esquerda < barra.rolagem) return Math.max(0, aba.esquerda - folga);
  if (aba.esquerda + aba.largura > barra.rolagem + barra.largura) return Math.max(0, aba.esquerda + aba.largura - barra.largura + folga);
  return null;
}

export function abaAtualDaRota(pathname: string, alunoId: string): AbaAluno["id"] {
  const base = `/painel/alunos/${encodeURIComponent(alunoId)}`;
  const resto = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+/, "").split("/")[0] : "";
  return (ABAS_ALUNO.find((a) => a.rota === resto)?.id ?? "resumo") as AbaAluno["id"];
}
