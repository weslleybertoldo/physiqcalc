// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/anamneses.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database, Json } from "@/nutricao/editor/lib/banco";
import { PERGUNTAS_PADRAO, TITULO_MODELO_PADRAO, lerPerguntas, temModeloProprio, tituloCopia, type RegistroAnamnese } from "@/nutricao/prontuario/lib/anamneseUtil";

// Acesso às tabelas `modelos_anamnese` e `anamneses` (RLS: a nutricionista vê os modelos DO SISTEMA — nutricionista_id NULL,
// só leitura — e os dela; anamneses só as dela; master vê tudo).
// Exclusão é SOFT (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada anamnese (trigger).

export type ModeloAnamnese = Database["public"]["Tables"]["modelos_anamnese"]["Row"];
export type ModeloUpdate = Database["public"]["Tables"]["modelos_anamnese"]["Update"];
export type Anamnese = Database["public"]["Tables"]["anamneses"]["Row"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ---- Modelos ----
export async function listarModelos(): Promise<ModeloAnamnese[]> {
  const { data, error } = await supabase
    .from("modelos_anamnese")
    .select("*")
    .is("deleted_at", null)
    .order("favorito", { ascending: false })
    .order("titulo", { ascending: true });
  falhou(error);
  return (data ?? []) as ModeloAnamnese[];
}

/** Lista os modelos (do sistema + próprios); sem nenhum PRÓPRIO, cria o "Anamnese geral (padrão)" — a versão curta (1º acesso à seção). */
export async function garantirModelos(nutricionistaId: string): Promise<ModeloAnamnese[]> {
  const lista = await listarModelos();
  if (temModeloProprio(lista, nutricionistaId)) return lista;
  return [...lista, await criarModelo(nutricionistaId, { titulo: TITULO_MODELO_PADRAO, perguntas: PERGUNTAS_PADRAO, favorito: true })];
}

/** "Duplicar": cópia PRÓPRIA (editável) de um modelo — do sistema ou de outro seu. */
export async function duplicarModelo(nutricionistaId: string, m: ModeloAnamnese): Promise<ModeloAnamnese> {
  return criarModelo(nutricionistaId, { titulo: tituloCopia(m.titulo), perguntas: lerPerguntas(m.perguntas), favorito: false });
}

export type DadosModelo = { titulo: string; perguntas: string[]; favorito: boolean };

export async function criarModelo(nutricionistaId: string, d: DadosModelo): Promise<ModeloAnamnese> {
  const { data, error } = await supabase
    .from("modelos_anamnese")
    .insert({ nutricionista_id: nutricionistaId, titulo: d.titulo.trim(), perguntas: d.perguntas as unknown as Json, favorito: d.favorito })
    .select("*")
    .single();
  falhou(error);
  return data as ModeloAnamnese;
}

export async function atualizarModelo(id: string, patch: Partial<DadosModelo>): Promise<ModeloAnamnese> {
  const dados: ModeloUpdate = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.perguntas !== undefined) dados.perguntas = patch.perguntas as unknown as Json;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { data, error } = await supabase.from("modelos_anamnese").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as ModeloAnamnese;
}

export async function excluirModelo(id: string): Promise<void> {
  const { error } = await supabase.from("modelos_anamnese").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

// ---- Anamneses ----
export async function listarAnamneses(pacienteId: string): Promise<Anamnese[]> {
  const { data, error } = await supabase
    .from("anamneses")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Anamnese[];
}

export async function criarAnamnese(nutricionistaId: string, pacienteId: string, modeloId: string | null, r: RegistroAnamnese): Promise<Anamnese> {
  const { data, error } = await supabase
    .from("anamneses")
    .insert({
      nutricionista_id: nutricionistaId,
      paciente_id: pacienteId,
      modelo_id: modeloId,
      titulo: r.titulo,
      data: r.data,
      conteudo: r.conteudo as unknown as Json,
      texto_livre: r.texto_livre,
    })
    .select("*")
    .single();
  falhou(error);
  return data as Anamnese;
}

export async function atualizarAnamnese(id: string, r: RegistroAnamnese): Promise<Anamnese> {
  const { data, error } = await supabase
    .from("anamneses")
    .update({ titulo: r.titulo, data: r.data, conteudo: r.conteudo as unknown as Json, texto_livre: r.texto_livre })
    .eq("id", id)
    .select("*")
    .single();
  falhou(error);
  return data as Anamnese;
}

export async function excluirAnamnese(id: string): Promise<void> {
  const { error } = await supabase.from("anamneses").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** Nome da nutricionista (cabeçalho do PDF). */
export async function nomeDaNutricionista(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("nome").eq("id", userId).maybeSingle();
  if (error) return null;
  return (data as { nome: string | null } | null)?.nome ?? null;
}
