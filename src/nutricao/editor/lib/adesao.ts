// Physiq W16 — os ✓ das refeições vistos pela nutricionista (falha F3, R14) e a adesão de 7 dias do card Dieta do Resumo (tela 7).
// Mesma conta do app do aluno (W11): no dia, contam as refeições do plano atual que valem naquele dia e têm alimento (as que o
// aluno pode marcar); feitas = as marcadas (refeicoes_concluidas) naquele dia. Regras puras — o card, o acompanhamento e o app
// mostram o mesmo número (lição da W10).
import { diaDaSemana } from "@/nutricao/app/metasUtil";
import { hojeSP, somarDias } from "@/nutricao/app/dia";
import { refeicaoMarcavel } from "@/nutricao/app/refeicaoConcluidaUtil";
import { DIAS_SEMANA } from "@/nutricao/app/metasUtil";
import { valeNoDiaDaSemana } from "./semanaPlano";

export type RefeicaoAdesao = { id: string; nome: string; horario: string | null; ordem: number; dias_semana?: unknown; itens: readonly unknown[] };
export type Concluida = { refeicao_id: string; data: string };

export type DiaAdesao = {
  /** yyyy-mm-dd */
  dia: string;
  /** 1 = segunda … 7 = domingo */
  semana: number;
  rotulo: string;
  /** refeições que o aluno podia marcar no dia (valem no dia e têm alimento), na ordem */
  marcaveis: { id: string; nome: string; horario: string | null; feita: boolean }[];
  feitas: number;
  total: number;
  /** 0 a 1 (sem refeição marcável = 0) */
  fracao: number;
};

export type Adesao = { dias: DiaAdesao[]; feitas: number; total: number; pct: number };

/** Os N dias que terminam hoje (São Paulo), do mais antigo para hoje. */
export function ultimosDias(n: number, agora: Date = new Date()): string[] {
  const hoje = hojeSP(agora);
  return Array.from({ length: n }, (_, i) => somarDias(hoje, i - (n - 1)));
}

const ordenar = <T extends { ordem: number; horario: string | null; nome: string }>(l: T[]): T[] =>
  [...l].sort((a, b) => a.ordem - b.ordem || (a.horario ?? "").localeCompare(b.horario ?? "") || a.nome.localeCompare(b.nome, "pt-BR"));

/** A adesão de cada dia e do período: feitas / marcáveis, com o ✓ de cada refeição. */
export function adesaoDoPeriodo(refeicoes: RefeicaoAdesao[], concluidas: Concluida[], dias: string[]): Adesao {
  const marcadas = new Set(concluidas.map((c) => `${c.data}|${c.refeicao_id}`));
  const lista = ordenar(refeicoes.filter(refeicaoMarcavel));
  const saida = dias.map((dia): DiaAdesao => {
    const semana = diaDaSemana(dia);
    const marcaveis = lista.filter((r) => valeNoDiaDaSemana(r, semana)).map((r) => ({ id: r.id, nome: r.nome, horario: r.horario, feita: marcadas.has(`${dia}|${r.id}`) }));
    const feitas = marcaveis.filter((m) => m.feita).length;
    return {
      dia,
      semana,
      rotulo: DIAS_SEMANA.find((d) => d.n === semana)?.curto ?? "",
      marcaveis,
      feitas,
      total: marcaveis.length,
      fracao: marcaveis.length ? feitas / marcaveis.length : 0,
    };
  });
  const feitas = saida.reduce((s, d) => s + d.feitas, 0);
  const total = saida.reduce((s, d) => s + d.total, 0);
  return { dias: saida, feitas, total, pct: total ? Math.round((feitas / total) * 100) : 0 };
}

/** "3 de 5" */
export const textoFeitas = (feitas: number, total: number): string => `${feitas} de ${total}`;
