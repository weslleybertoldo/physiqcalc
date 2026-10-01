// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/calculosEnergeticos.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database, Json } from "@/nutricao/editor/lib/banco";
import type { RegistroEnergetico } from "@/nutricao/editor/lib/energeticoUtil";

// Acesso à tabela `calculos_energeticos` (RLS: a nutricionista só vê os dela; master vê tudo). Exclusão é SOFT
// (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada cálculo (trigger genérico da W5).

export type CalculoEnergetico = Database["public"]["Tables"]["calculos_energeticos"]["Row"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

const colunas = (r: RegistroEnergetico) => ({
  data: r.data,
  formula: r.formula,
  peso: r.peso,
  altura: r.altura,
  idade: r.idade,
  sexo: r.sexo,
  massa_magra: r.massa_magra,
  fator_atividade: r.fator_atividade,
  atividades: r.atividades as unknown as Json,
  tmb: r.tmb,
  get: r.get,
  ajuste_kcal: r.ajuste_kcal,
  vet: r.vet,
  objetivo: r.objetivo,
  observacao: r.observacao,
});

export async function listarCalculos(pacienteId: string): Promise<CalculoEnergetico[]> {
  const { data, error } = await supabase
    .from("calculos_energeticos")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as CalculoEnergetico[];
}

export async function criarCalculo(nutricionistaId: string, pacienteId: string, r: RegistroEnergetico): Promise<CalculoEnergetico> {
  const { data, error } = await supabase
    .from("calculos_energeticos")
    .insert({ nutricionista_id: nutricionistaId, paciente_id: pacienteId, ...colunas(r) })
    .select("*")
    .single();
  falhou(error);
  return data as CalculoEnergetico;
}

export async function atualizarCalculo(id: string, r: RegistroEnergetico): Promise<CalculoEnergetico> {
  const { data, error } = await supabase.from("calculos_energeticos").update(colunas(r)).eq("id", id).select("*").single();
  falhou(error);
  return data as CalculoEnergetico;
}

export async function excluirCalculo(id: string): Promise<void> {
  const { error } = await supabase.from("calculos_energeticos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}
