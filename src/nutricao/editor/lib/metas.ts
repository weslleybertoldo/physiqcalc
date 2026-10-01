// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/metas.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { MODELOS_PADRAO, normalizarDias, ordenarModelosMeta, type RegistroMeta } from "@/nutricao/editor/lib/metasUtil";

// Acesso às tabelas `modelos_meta` e `metas` (RLS: a nutricionista só vê os dela; master vê tudo; criar meta exige enxergar
// o paciente). Exclusão é SOFT nas duas (deleted_at → Lixeira, W32). A meta guarda a PRÓPRIA cópia de título/descrição/dias
// — mudar ou excluir o modelo depois não mexe nela (padrão dos documentos, W15). O banco mexe em `pacientes.updated_at` a
// cada meta (trigger). `dias_semana` é smallint[] no banco e chega como number[] pelo PostgREST.

export type ModeloMeta = Database["public"]["Tables"]["modelos_meta"]["Row"];
export type ModeloMetaUpdate = Database["public"]["Tables"]["modelos_meta"]["Update"];
export type Meta = Database["public"]["Tables"]["metas"]["Row"];
export type MetaUpdate = Database["public"]["Tables"]["metas"]["Update"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ---- Modelos ----
export async function listarModelosMeta(): Promise<ModeloMeta[]> {
  const { data, error } = await supabase
    .from("modelos_meta")
    .select("*")
    .is("deleted_at", null)
    .order("favorito", { ascending: false })
    .order("titulo", { ascending: true });
  falhou(error);
  return (data ?? []) as ModeloMeta[];
}

/** Lista os modelos; sem nenhum, cria os 5 padrão favoritos — 1º acesso à seção (padrão `garantirModelos` da W10/W13/W15). */
export async function garantirModelosMeta(nutricionistaId: string): Promise<ModeloMeta[]> {
  const lista = await listarModelosMeta();
  if (lista.length) return lista;
  const criados: ModeloMeta[] = [];
  for (const m of MODELOS_PADRAO) {
    criados.push(await criarModeloMeta(nutricionistaId, { titulo: m.titulo, descricao: m.descricao, dias_semana: m.dias_semana, favorito: true }));
  }
  return ordenarModelosMeta(criados);
}

export type DadosModeloMeta = { titulo: string; descricao: string; dias_semana: number[]; favorito: boolean };

export async function criarModeloMeta(nutricionistaId: string, d: DadosModeloMeta): Promise<ModeloMeta> {
  const { data, error } = await supabase
    .from("modelos_meta")
    .insert({ nutricionista_id: nutricionistaId, titulo: d.titulo.trim(), descricao: d.descricao, dias_semana: normalizarDias(d.dias_semana), favorito: d.favorito })
    .select("*")
    .single();
  falhou(error);
  return data as ModeloMeta;
}

export async function atualizarModeloMeta(id: string, patch: Partial<DadosModeloMeta>): Promise<ModeloMeta> {
  const dados: ModeloMetaUpdate = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.descricao !== undefined) dados.descricao = patch.descricao;
  if (patch.dias_semana !== undefined) dados.dias_semana = normalizarDias(patch.dias_semana);
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { data, error } = await supabase.from("modelos_meta").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as ModeloMeta;
}

/** Soft delete — as metas já prescritas guardam a própria cópia e não dependem do modelo. */
export async function excluirModeloMeta(id: string): Promise<void> {
  const { error } = await supabase.from("modelos_meta").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** "Salvar também como modelo" na meta nova: nasce sem estrela (padrão da W10). */
export async function salvarComoModelo(nutricionistaId: string, r: RegistroMeta): Promise<ModeloMeta> {
  return criarModeloMeta(nutricionistaId, { titulo: r.titulo, descricao: r.descricao, dias_semana: r.dias_semana, favorito: false });
}

// ---- Metas do paciente ----
/** Metas vivas do paciente (ativas e pausadas), mais recente primeiro — a tela reordena (ativas primeiro). */
export async function listarMetasDoPaciente(pacienteId: string): Promise<Meta[]> {
  const { data, error } = await supabase
    .from("metas")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Meta[];
}

export async function criarMeta(nutricionistaId: string, pacienteId: string, r: RegistroMeta): Promise<Meta> {
  const { data, error } = await supabase
    .from("metas")
    .insert({
      nutricionista_id: nutricionistaId,
      paciente_id: pacienteId,
      modelo_id: r.modelo_id,
      titulo: r.titulo,
      descricao: r.descricao,
      dias_semana: normalizarDias(r.dias_semana),
      ativa: r.ativa,
    })
    .select("*")
    .single();
  falhou(error);
  return data as Meta;
}

/** Título, descrição, dias e/ou ativa. */
export async function atualizarMeta(id: string, patch: Partial<RegistroMeta>): Promise<Meta> {
  const dados: MetaUpdate = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo;
  if (patch.descricao !== undefined) dados.descricao = patch.descricao;
  if (patch.dias_semana !== undefined) dados.dias_semana = normalizarDias(patch.dias_semana);
  if (patch.ativa !== undefined) dados.ativa = patch.ativa;
  const { data, error } = await supabase.from("metas").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as Meta;
}

/** Pausar (false) / retomar (true). */
export const alternarAtiva = (id: string, ativa: boolean): Promise<Meta> => atualizarMeta(id, { ativa });

/** Soft delete (Lixeira, W32). */
export async function excluirMeta(id: string): Promise<void> {
  const { error } = await supabase.from("metas").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** Nome da nutricionista (assinatura do PDF) — mesma consulta das orientações (W10). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/orientacoes";
