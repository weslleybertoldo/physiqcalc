import { ClipboardCheck, Dumbbell, FileText, LayoutDashboard, Salad, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { existe, registro } from "@/rotas/registro";
import type { Modulo } from "@/ui/casca/dadosCasca";

/**
 * As 6 abas do perfil do aluno (spec 4.5, tela 7). A aba nova é `src/painel/aluno/abas/<arquivo>.tsx`;
 * o Resumo é da casca e monta os cards de `src/painel/aluno/resumo/`. Enquanto a tela nova não
 * existe, vale o "Configurar aluno" antigo do Calc no grupo equivalente (`antigas` = os `?ct=` dele,
 * tabela do fim da 5.2). Sem nova e sem antiga, a aba some.
 */
export interface SubAbaAntiga {
  ct: string;
  rotulo: string;
}

export interface AbaAluno {
  id: "resumo" | "treino" | "dieta" | "avaliacao" | "prontuario" | "financeiro";
  arquivo: string | null;
  rotulo: string;
  icone: LucideIcon;
  /** Pedaço da rota depois de /painel/alunos/:id ("" = Resumo). */
  rota: string;
  modulo: Modulo | "ambos";
  antigas?: SubAbaAntiga[];
}

export const ABAS_ALUNO: AbaAluno[] = [
  {
    id: "resumo",
    arquivo: null,
    rotulo: "Resumo",
    icone: LayoutDashboard,
    rota: "",
    modulo: "ambos",
    antigas: [
      { ct: "dados", rotulo: "Dados" },
      { ct: "geral", rotulo: "Dados gerais" },
    ],
  },
  {
    id: "treino",
    arquivo: "Treino",
    rotulo: "Treino",
    icone: Dumbbell,
    rota: "treino",
    modulo: "treino",
    antigas: [
      { ct: "treino", rotulo: "Treino" },
      { ct: "historico", rotulo: "Histórico" },
      { ct: "config", rotulo: "Configuração" },
    ],
  },
  { id: "dieta", arquivo: "Dieta", rotulo: "Dieta", icone: Salad, rota: "dieta", modulo: "nutricao" },
  {
    id: "avaliacao",
    arquivo: "Avaliacao",
    rotulo: "Avaliação",
    icone: ClipboardCheck,
    rota: "avaliacao",
    modulo: "ambos",
    antigas: [
      { ct: "dobras", rotulo: "Dobras e medidas" },
      { ct: "evolucao", rotulo: "Evolução" },
      { ct: "registros", rotulo: "Registros" },
    ],
  },
  { id: "prontuario", arquivo: "Prontuario", rotulo: "Prontuário", icone: FileText, rota: "prontuario", modulo: "ambos" },
  { id: "financeiro", arquivo: "Financeiro", rotulo: "Financeiro", icone: Wallet, rota: "financeiro", modulo: "ambos", antigas: [{ ct: "plano", rotulo: "Plano" }] },
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

export type EstadoAbaAluno = "nova" | "antiga" | null;

export function estadoDaAbaAluno(
  aba: AbaAluno,
  modulos: readonly Modulo[],
  temNova: (arquivo: string) => boolean = (a) => existe("abasAluno", a),
  temCardsResumo: () => boolean = () => Object.keys(registro.resumoAluno).length > 0,
): EstadoAbaAluno {
  if (aba.modulo !== "ambos" && !modulos.includes(aba.modulo)) return null;
  if (aba.id === "resumo" ? temCardsResumo() : aba.arquivo !== null && temNova(aba.arquivo)) return "nova";
  // o "Configurar aluno" antigo é do Banco do Treino: vale para conta com Treino
  if (aba.antigas && modulos.includes("treino")) return "antiga";
  return aba.id === "resumo" ? "nova" : null;
}

export function abaAtualDaRota(pathname: string, alunoId: string): AbaAluno["id"] {
  const base = `/painel/alunos/${encodeURIComponent(alunoId)}`;
  const resto = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+/, "").split("/")[0] : "";
  return (ABAS_ALUNO.find((a) => a.rota === resto)?.id ?? "resumo") as AbaAluno["id"];
}
