// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/consultas.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { formParaRegistro, type FormConsulta } from "@/nutricao/prontuario/lib/consultasUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso à tabela `consultas` (RLS: a nutricionista só vê as dela; master vê todas). Exclusão é SOFT
// (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada registro/alteração (trigger).
// hml-19a (H-41 · jeito 2): as gravações vão pela função nutricao (a origem "manual" e o dono são do servidor); leituras aqui.

export type Consulta = Database["public"]["Tables"]["consultas"]["Row"];
export type ConsultaInsert = Database["public"]["Tables"]["consultas"]["Insert"];
export type ConsultaUpdate = Database["public"]["Tables"]["consultas"]["Update"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

/** Consultas vivas do paciente, mais recente primeiro. */
export async function listarConsultas(pacienteId: string): Promise<Consulta[]> {
  const { data, error } = await supabase
    .from("consultas")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Consulta[];
}

export async function registrarConsulta(nutricionistaId: string, pacienteId: string, f: FormConsulta): Promise<Consulta> {
  const reg = formParaRegistro(f);
  const r = await acaoNutricao<{ linha: Consulta }>("consulta_criar", { paciente_id: pacienteId, data: reg.data, observacao: reg.observacao });
  return r.linha;
}

export async function atualizarConsulta(id: string, f: FormConsulta): Promise<Consulta> {
  const reg = formParaRegistro(f);
  const r = await acaoNutricao<{ linha: Consulta }>("consulta_editar", { id, data: reg.data, observacao: reg.observacao });
  return r.linha;
}

/** Exclusão SOFT (Lixeira, W32); 0 linha → nao_encontrado. */
export async function excluirConsulta(id: string): Promise<void> {
  await acaoNutricao("consulta_excluir", { id });
}
