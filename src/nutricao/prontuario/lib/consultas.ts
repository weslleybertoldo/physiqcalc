// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/consultas.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import type { Database } from "@/nutricao/editor/lib/banco";
import { lerNutricao } from "@/nutricao/leitura";
import { formParaRegistro, type FormConsulta } from "@/nutricao/prontuario/lib/consultasUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso à tabela `consultas` (RLS: a nutricionista só vê as dela; master vê todas). Exclusão é SOFT
// (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada registro/alteração (trigger).
// hml-19a (H-41 · jeito 2): as gravações vão pela função nutricao (a origem "manual" e o dono são do servidor).
// hml-20b (H-42 · jeito 2, etapa 2): a LEITURA também — consulta consultas_do_aluno (as colunas do tipo, as vivas, a mesma ordem), no
// lote da tela (src/nutricao/leitura.ts), como a pessoa; o erro chega como ErroLeitura com a frase fixa do código.

export type Consulta = Database["public"]["Tables"]["consultas"]["Row"];
export type ConsultaInsert = Database["public"]["Tables"]["consultas"]["Insert"];
export type ConsultaUpdate = Database["public"]["Tables"]["consultas"]["Update"];

/** Consultas vivas do paciente, mais recente primeiro. */
export async function listarConsultas(pacienteId: string): Promise<Consulta[]> {
  const r = await lerNutricao("consultas_do_aluno", { aluno: pacienteId });
  return (r.linhas ?? []) as Consulta[];
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
