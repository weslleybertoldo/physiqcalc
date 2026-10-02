/**
 * Dados que as cascas mostram (menu, card da conta, card do plano, menu do usuário, abas do app). Os tipos moram aqui; quem
 * monta os dados é o `useDadosCasca()` de src/nucleo/casca.ts (W3 — o login do banco principal e a minha_situacao()). W28: o
 * padrão da W1 (login do Banco do Treino + `plano-status` do Calc) saiu com o legado.
 */
export type Modulo = "treino" | "nutricao";

export interface ContaCasca {
  id: string | null;
  nome: string;
  profissionais: number;
  fotoUrl: string | null;
  modulos: Modulo[];
}

export interface PlanoCasca {
  /** "Plano Treino + Nutrição", "Plano Start"… */
  nome: string;
  modulos: Modulo[];
  /** "Renova em 12/08 · cartão", "Teste até 20/10", "Venceu em 10/09"… */
  linha: string;
  tom: "ok" | "aviso" | "erro" | "neutro";
}

export interface DadosCasca {
  carregando: boolean;
  usuario: { id: string; nome: string; email: string | null; fotoUrl: string | null } | null;
  /** Pode abrir o painel (profissional ou master). */
  ehProfissional: boolean;
  ehMaster: boolean;
  /** Dono da conta ativa (vê Conta, Equipe, Plano e Recebimento nas Configurações). */
  ehDono: boolean;
  /** "Personal trainer", "Nutricionista", "Master"… (menu do usuário) */
  papelRotulo: string;
  /** Módulos do aluno: decidem as abas do app (Treino some sem treino; Dieta some sem nutrição). */
  modulosAluno: Modulo[];
  /** Conta ativa no painel (card do topo do menu). */
  conta: ContaCasca | null;
  /** Contas de que a pessoa é membro (troca no card da conta — NF13). */
  contas: ContaCasca[];
  trocarConta?: (id: string) => void;
  plano: PlanoCasca | null;
  /** Números do menu por arquivo da página ("Alunos": 132). */
  contadores: Partial<Record<string, number>>;
}

/** Dados da casca: o hook do núcleo (src/nucleo/casca.ts — W3: login único, contas e módulos). */
export { useDadosCasca } from "@/nucleo/casca";
