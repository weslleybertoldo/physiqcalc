// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/metas.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { normalizarDias, type RegistroMeta } from "@/nutricao/editor/lib/metasUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso às tabelas `modelos_meta` e `metas` (RLS: a nutricionista só vê os dela; master vê tudo; criar meta exige enxergar
// o paciente). Exclusão é SOFT nas duas (deleted_at → Lixeira, W32). A meta guarda a PRÓPRIA cópia de título/descrição/dias
// — mudar ou excluir o modelo depois não mexe nela (padrão dos documentos, W15). O banco mexe em `pacientes.updated_at` a
// cada meta (trigger). `dias_semana` é smallint[] no banco e chega como number[] pelo PostgREST.
// hml-19b (H-41 · H-81 · jeito 2): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama e
// as mesmas assinaturas (o dono é quem chama: o servidor põe). Os 5 modelos padrão do 1º acesso nascem no servidor
// (padroes_garantir { secao: "meta" }: 1 vez só, com trava), não mais aqui a cada abertura.

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

/**
 * Os modelos, com os 5 padrão favoritos no 1º acesso à seção: 1 chamada à função (padroes_garantir), que grava 1 vez só (trava por
 * pessoa) e devolve a lista (a mesma ordem do listar). Só para quem pode editar (a tela decide); quem só lê usa o listarModelosMeta.
 */
export async function garantirModelosMeta(nutricionistaId: string): Promise<ModeloMeta[]> {
  const r = await acaoNutricao<{ lista: ModeloMeta[] }>("padroes_garantir", { secao: "meta" });
  return Array.isArray(r.lista) ? r.lista : [];
}

export type DadosModeloMeta = { titulo: string; descricao: string; dias_semana: number[]; favorito: boolean };

export async function criarModeloMeta(nutricionistaId: string, d: DadosModeloMeta): Promise<ModeloMeta> {
  const { linha } = await acaoNutricao<{ linha: ModeloMeta }>("modelo_meta_criar", {
    titulo: d.titulo.trim(), descricao: d.descricao, dias_semana: normalizarDias(d.dias_semana), favorito: d.favorito,
  });
  return linha;
}

export async function atualizarModeloMeta(id: string, patch: Partial<DadosModeloMeta>): Promise<ModeloMeta> {
  const dados: Record<string, unknown> = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.descricao !== undefined) dados.descricao = patch.descricao;
  if (patch.dias_semana !== undefined) dados.dias_semana = normalizarDias(patch.dias_semana);
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { linha } = await acaoNutricao<{ linha: ModeloMeta }>("modelo_meta_editar", { id, ...dados });
  return linha;
}

/** Soft delete — as metas já prescritas guardam a própria cópia e não dependem do modelo. */
export async function excluirModeloMeta(id: string): Promise<void> {
  await acaoNutricao("modelo_meta_excluir", { id });
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
  const { linha } = await acaoNutricao<{ linha: Meta }>("meta_criar", {
    paciente_id: pacienteId, modelo_id: r.modelo_id, titulo: r.titulo, descricao: r.descricao, dias_semana: normalizarDias(r.dias_semana), ativa: r.ativa,
  });
  return linha;
}

/** Título, descrição, dias e/ou ativa. */
export async function atualizarMeta(id: string, patch: Partial<RegistroMeta>): Promise<Meta> {
  const dados: Record<string, unknown> = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo;
  if (patch.descricao !== undefined) dados.descricao = patch.descricao;
  if (patch.dias_semana !== undefined) dados.dias_semana = normalizarDias(patch.dias_semana);
  if (patch.ativa !== undefined) dados.ativa = patch.ativa;
  const { linha } = await acaoNutricao<{ linha: Meta }>("meta_editar", { id, ...dados });
  return linha;
}

/** Pausar (false) / retomar (true). */
export const alternarAtiva = (id: string, ativa: boolean): Promise<Meta> => atualizarMeta(id, { ativa });

/** Soft delete (Lixeira, W32). */
export async function excluirMeta(id: string): Promise<void> {
  await acaoNutricao("meta_excluir", { id });
}

/** Nome da nutricionista (assinatura do PDF) — mesma consulta das orientações (W10). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/orientacoes";
