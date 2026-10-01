// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/antropometrias.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database, Json } from "@/nutricao/editor/lib/banco";
import type { RegistroAntropometria } from "@/nutricao/editor/lib/antropometriaUtil";

// Acesso à tabela `antropometrias` (RLS: a nutricionista só vê as dela; master vê tudo). Exclusão é SOFT
// (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada avaliação (trigger genérico da W5).

export type Antropometria = Database["public"]["Tables"]["antropometrias"]["Row"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

const colunas = (r: RegistroAntropometria) => ({
  data: r.data,
  peso: r.peso,
  altura: r.altura,
  sexo: r.sexo,
  idade: r.idade,
  protocolo: r.protocolo,
  circunferencias: r.circunferencias as unknown as Json,
  dobras: r.dobras as unknown as Json,
  resultados: r.resultados as unknown as Json,
  observacao: r.observacao,
});

export async function listarAntropometrias(pacienteId: string): Promise<Antropometria[]> {
  const { data, error } = await supabase
    .from("antropometrias")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Antropometria[];
}

export async function criarAntropometria(nutricionistaId: string, pacienteId: string, r: RegistroAntropometria): Promise<Antropometria> {
  const { data, error } = await supabase
    .from("antropometrias")
    .insert({ nutricionista_id: nutricionistaId, paciente_id: pacienteId, ...colunas(r) })
    .select("*")
    .single();
  falhou(error);
  return data as Antropometria;
}

export async function atualizarAntropometria(id: string, r: RegistroAntropometria): Promise<Antropometria> {
  const { data, error } = await supabase.from("antropometrias").update(colunas(r)).eq("id", id).select("*").single();
  falhou(error);
  return data as Antropometria;
}

export async function excluirAntropometria(id: string): Promise<void> {
  const { error } = await supabase.from("antropometrias").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}
