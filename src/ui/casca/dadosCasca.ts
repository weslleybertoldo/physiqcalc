import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { invokeMp } from "@/lib/mpClient";
import type { PlanoStatus } from "@/lib/saasApi";

/**
 * Dados que as cascas mostram (menu, card da conta, card do plano, menu do usuário, abas do app).
 *
 * Até a W3 vêm do que o Physiq já sabe hoje (login do Banco do Treino + `plano-status` do professor).
 * A W3 (login único, contas e módulos) entrega os dados reais criando `src/nucleo/casca.ts` com
 * `export function useDadosCasca(): DadosCasca` — a casca passa a usar esse sozinha (registro por
 * convenção, spec 11.1), sem ninguém editar este arquivo.
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

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return d && m ? `${d}/${m}` : "";
}

/** Linha do card do plano a partir do `plano-status` do Calc (regras de hoje, P9). */
export function planoDoStatusLegado(s: PlanoStatus): PlanoCasca {
  const p = s.professor;
  const hoje = s.hoje;
  const nome = s.isento ? "Conta master" : s.plano?.nome ? `Plano ${s.plano.nome}` : "Plano a definir";
  const base = { nome, modulos: ["treino"] as Modulo[] };
  if (s.isento) return { ...base, linha: "Sem cobrança", tom: "ok" };
  if (p.status === "suspenso") return { ...base, linha: "Conta suspensa", tom: "erro" };
  if (p.cobranca_pausada) return { ...base, linha: "Cobrança pausada", tom: "neutro" };
  if (p.acesso_liberado_ate && p.acesso_liberado_ate >= hoje) return { ...base, linha: `Liberado até ${dataCurta(p.acesso_liberado_ate)}`, tom: "ok" };
  if (p.anual_ate && p.anual_ate >= hoje) return { ...base, linha: `Anual até ${dataCurta(p.anual_ate)}`, tom: "ok" };
  if (s.travado) return { ...base, linha: "Plano vencido", tom: "erro" };
  if (p.adesao_paga_em && p.ciclo_vence_em && s.diasAtraso !== null && s.diasAtraso >= 0) {
    return { ...base, linha: s.diasAtraso === 0 ? "Vence hoje" : `Venceu em ${dataCurta(p.ciclo_vence_em)}`, tom: "aviso" };
  }
  if (!p.adesao_paga_em) {
    if (p.trial_ate && p.trial_ate >= hoje) return { ...base, linha: `Teste até ${dataCurta(p.trial_ate)}`, tom: "neutro" };
    return { ...base, linha: "Conta não ativada", tom: "aviso" };
  }
  const assinatura = s.assinatura;
  if (assinatura?.status === "authorized" && (assinatura.proxima_cobranca || p.ciclo_vence_em)) {
    return { ...base, linha: `Renova em ${dataCurta(assinatura.proxima_cobranca || p.ciclo_vence_em)} · cartão`, tom: "ok" };
  }
  if (p.ciclo_vence_em) return { ...base, linha: `Vence em ${dataCurta(p.ciclo_vence_em)}`, tom: "ok" };
  return { ...base, linha: "Conta ativa", tom: "ok" };
}

type Metadados = { full_name?: string; name?: string; avatar_url?: string; picture?: string };

/** Padrão da W1: login do Treino (papel pelo JWT) + `plano-status` para quem é profissional. */
export function useDadosCascaPadrao(): DadosCasca {
  const { user, loading, isStaff, isMaster } = useAuth();
  const plano = useQuery({
    // mesma chave do AdminLayout antigo: um pedido só para o card do plano e para a trava das telas antigas
    queryKey: ["plano-status", user?.id],
    queryFn: () => invokeMp<PlanoStatus>("plano-status"),
    enabled: Boolean(user) && isStaff,
    staleTime: 60_000,
    retry: 1,
  });
  const meta = (user?.user_metadata ?? {}) as Metadados;
  const status = plano.data ?? null;
  const nome = meta.full_name || meta.name || status?.professor?.nome || user?.email || "";
  const fotoUrl = meta.avatar_url || meta.picture || null;
  const conta: ContaCasca | null = isStaff
    ? { id: null, nome: status?.professor?.nome || nome, profissionais: 1, fotoUrl, modulos: ["treino"] }
    : null;
  return {
    carregando: loading,
    usuario: user ? { id: user.id, nome, email: user.email ?? null, fotoUrl } : null,
    ehProfissional: isStaff,
    ehMaster: isMaster,
    // no Calc cada professor é a própria conta
    ehDono: isStaff,
    papelRotulo: isMaster ? "Master" : isStaff ? "Personal trainer" : "Aluno",
    modulosAluno: ["treino"],
    conta,
    contas: conta ? [conta] : [],
    plano: isStaff && status ? planoDoStatusLegado(status) : null,
    contadores: status?.professor ? { Alunos: status.professor.alunos } : {},
  };
}

const SUBSTITUTO = import.meta.glob<{ useDadosCasca?: () => DadosCasca }>("/src/nucleo/casca.ts", { eager: true });
const hookDaW3 = Object.values(SUBSTITUTO)[0]?.useDadosCasca;

/** Dados da casca: o hook da W3 (`src/nucleo/casca.ts`) quando existir; senão o padrão acima. */
export const useDadosCasca: () => DadosCasca = hookDaW3 ?? useDadosCascaPadrao;
