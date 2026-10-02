/**
 * Treinos prontos do aluno sem profissional (herdado da W7b) — leitura e escrita do master no BANCO DO TREINO, no MESMO lugar da carga
 * scripts/conteudo/carregar_treinos_prontos.py (physiq_treinos_prontos / _grupos / _exercicios; a RLS da W27 deixa só o master
 * escrever). Salvar refaz as divisões e os exercícios do treino, como a carga do JSON (o JSON segue valendo para recarregar). O que o
 * aluno já escolheu é cópia dele e não muda.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const OBJETIVOS = ["emagrecer", "manter", "ganhar_massa"] as const;
export const NIVEIS = ["iniciante", "intermediario", "avancado"] as const;
export const DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"] as const;
export const ROTULO_OBJETIVO: Record<string, string> = { emagrecer: "Emagrecer", manter: "Manter a forma", ganhar_massa: "Ganhar massa" };
export const ROTULO_NIVEL: Record<string, string> = { iniciante: "Iniciante", intermediario: "Intermediário", avancado: "Avançado" };

export interface ExercicioPronto { exercicio_id: string; nome?: string; series: number; reps: string; descanso_segundos: number | null; observacao: string | null }
export interface GrupoPronto { letra: string; nome: string; dias: string[]; exercicios: ExercicioPronto[] }
export interface TreinoPronto {
  id: string | null;
  codigo: string;
  nome: string;
  objetivo: (typeof OBJETIVOS)[number];
  nivel: (typeof NIVEIS)[number];
  dias_por_semana: number;
  divisao: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  grupos: GrupoPronto[];
}

const cliente = () => supabase as unknown as SupabaseClient;

const COLUNAS =
  "id, codigo, nome, objetivo, nivel, dias_por_semana, divisao, descricao, ordem, ativo, " +
  "grupos:physiq_treinos_prontos_grupos(letra, nome, dias, ordem, " +
  "exercicios:physiq_treinos_prontos_exercicios(exercicio_id, ordem, series, reps, descanso_segundos, observacao, exercicio:tb_exercicios(nome)))";

type Linha = Omit<TreinoPronto, "grupos"> & {
  grupos: Array<GrupoPronto & { ordem: number; exercicios: Array<ExercicioPronto & { ordem: number; exercicio?: { nome: string } | null }> }>;
};

export async function listarTreinosProntos(): Promise<TreinoPronto[]> {
  const { data, error } = await cliente().from("physiq_treinos_prontos").select(COLUNAS).order("ordem");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Linha[]).map((t) => ({
    ...t,
    grupos: [...(t.grupos ?? [])].sort((a, b) => a.ordem - b.ordem).map((g) => ({
      letra: g.letra, nome: g.nome, dias: g.dias ?? [],
      exercicios: [...(g.exercicios ?? [])].sort((a, b) => a.ordem - b.ordem).map((e) => ({
        exercicio_id: e.exercicio_id, nome: e.exercicio?.nome, series: e.series, reps: e.reps, descanso_segundos: e.descanso_segundos, observacao: e.observacao,
      })),
    })),
  }));
}

export async function bibliotecaGlobal(): Promise<Array<{ id: string; nome: string; grupo_muscular: string | null }>> {
  const { data, error } = await cliente().from("tb_exercicios").select("id, nome, grupo_muscular").is("professor_id", null).order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; nome: string; grupo_muscular: string | null }>;
}

/** O mesmo que a carga confere (carregar_treinos_prontos.py → validar): dias × dias por semana, letras, exercícios, séries e reps. */
export function validarTreino(t: TreinoPronto): string | null {
  if (t.nome.trim().length < 2) return "Escreva o nome do treino.";
  if (!t.grupos.length) return "O treino precisa de pelo menos uma divisão.";
  const letras = t.grupos.map((g) => g.letra);
  if (new Set(letras).size !== letras.length || letras.some((l) => !/^[A-Z]$/.test(l))) return "Cada divisão precisa de uma letra diferente (A–Z).";
  const dias = t.grupos.flatMap((g) => g.dias);
  if (new Set(dias).size !== dias.length) return "Um dia da semana está em 2 divisões.";
  if (dias.length < 1 || dias.length > 7) return "Marque de 1 a 7 dias na semana.";
  for (const g of t.grupos) {
    if (g.nome.trim().length < 2) return `Dê um nome à divisão ${g.letra}.`;
    if (!g.exercicios.length) return `A divisão ${g.letra} está sem exercícios.`;
    for (const e of g.exercicios) {
      if (!e.exercicio_id) return `Escolha o exercício na divisão ${g.letra}.`;
      if (!(e.series >= 1 && e.series <= 10)) return "Séries de 1 a 10.";
      if (!e.reps.trim() || e.reps.trim().length > 20) return "Repetições: ex. 12 ou 8-12.";
      if (e.descanso_segundos !== null && !(e.descanso_segundos >= 0 && e.descanso_segundos <= 600)) return "Descanso de 0 a 600 s.";
    }
  }
  return null;
}

export async function salvarTreinoPronto(t: TreinoPronto): Promise<string> {
  const db = cliente();
  const linha = {
    codigo: t.codigo || `master-${Math.random().toString(36).slice(2, 10)}`,
    nome: t.nome.trim(), objetivo: t.objetivo, nivel: t.nivel, dias_por_semana: t.grupos.flatMap((g) => g.dias).length,
    divisao: t.divisao.trim() || t.grupos.map((g) => g.letra).join(" · "), descricao: t.descricao?.trim() || null, ordem: t.ordem, ativo: t.ativo,
  };
  let id = t.id;
  if (id) {
    const { error } = await db.from("physiq_treinos_prontos").update(linha).eq("id", id);
    if (error) throw new Error(error.message);
    const { error: ed } = await db.from("physiq_treinos_prontos_grupos").delete().eq("treino_id", id);
    if (ed) throw new Error(ed.message);
  } else {
    const { data, error } = await db.from("physiq_treinos_prontos").insert(linha).select("id").single();
    if (error) throw new Error(error.message);
    id = (data as { id: string }).id;
  }
  for (const [i, g] of t.grupos.entries()) {
    const { data: gd, error: eg } = await db.from("physiq_treinos_prontos_grupos")
      .insert({ treino_id: id, letra: g.letra, nome: g.nome.trim(), dias: g.dias, ordem: i + 1 }).select("id").single();
    if (eg) throw new Error(eg.message);
    const exs = g.exercicios.map((e, j) => ({ grupo_id: (gd as { id: string }).id, exercicio_id: e.exercicio_id, ordem: j + 1, series: e.series,
      reps: e.reps.trim(), descanso_segundos: e.descanso_segundos, observacao: e.observacao?.trim() || null }));
    const { error: ee } = await db.from("physiq_treinos_prontos_exercicios").insert(exs);
    if (ee) throw new Error(ee.message);
  }
  return id!;
}

export async function ativarTreinoPronto(id: string, ativo: boolean): Promise<void> {
  const { error } = await cliente().from("physiq_treinos_prontos").update({ ativo }).eq("id", id);
  if (error) throw new Error(error.message);
}

export function treinoNovo(): TreinoPronto {
  return { id: null, codigo: "", nome: "", objetivo: "manter", nivel: "iniciante", dias_por_semana: 3, divisao: "", descricao: "", ordem: 99, ativo: true,
    grupos: [{ letra: "A", nome: "Treino A", dias: ["SEG"], exercicios: [] }] };
}
