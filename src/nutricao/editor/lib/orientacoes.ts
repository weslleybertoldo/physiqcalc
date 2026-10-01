// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/orientacoes.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { CONTEUDO_MODELO_PADRAO, TITULO_MODELO_PADRAO, type RegistroOrientacao } from "@/nutricao/editor/lib/orientacoesUtil";

// Acesso às tabelas `modelos_orientacao` e `orientacoes` (RLS: a nutricionista só vê o dela; master vê tudo).
// Exclusão é SOFT (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada orientação (trigger).

export type ModeloOrientacao = Database["public"]["Tables"]["modelos_orientacao"]["Row"];
export type ModeloOrientacaoUpdate = Database["public"]["Tables"]["modelos_orientacao"]["Update"];
export type Orientacao = Database["public"]["Tables"]["orientacoes"]["Row"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ---- Modelos ----
export async function listarModelos(): Promise<ModeloOrientacao[]> {
  const { data, error } = await supabase
    .from("modelos_orientacao")
    .select("*")
    .is("deleted_at", null)
    .order("favorito", { ascending: false })
    .order("titulo", { ascending: true });
  falhou(error);
  return (data ?? []) as ModeloOrientacao[];
}

/** Lista os modelos; sem nenhum, cria o "Orientações gerais (padrão)" (1º acesso à seção). */
export async function garantirModelos(nutricionistaId: string): Promise<ModeloOrientacao[]> {
  const lista = await listarModelos();
  if (lista.length) return lista;
  return [await criarModelo(nutricionistaId, { titulo: TITULO_MODELO_PADRAO, conteudo: CONTEUDO_MODELO_PADRAO, favorito: true })];
}

export type DadosModelo = { titulo: string; conteudo: string; favorito: boolean };

export async function criarModelo(nutricionistaId: string, d: DadosModelo): Promise<ModeloOrientacao> {
  const { data, error } = await supabase
    .from("modelos_orientacao")
    .insert({ nutricionista_id: nutricionistaId, titulo: d.titulo.trim(), conteudo: d.conteudo, favorito: d.favorito })
    .select("*")
    .single();
  falhou(error);
  return data as ModeloOrientacao;
}

export async function atualizarModelo(id: string, patch: Partial<DadosModelo>): Promise<ModeloOrientacao> {
  const dados: ModeloOrientacaoUpdate = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.conteudo !== undefined) dados.conteudo = patch.conteudo;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { data, error } = await supabase.from("modelos_orientacao").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as ModeloOrientacao;
}

export async function excluirModelo(id: string): Promise<void> {
  const { error } = await supabase.from("modelos_orientacao").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** "Salvar também como modelo": a orientação recém-escrita vira um modelo (não favorito) da nutricionista. */
export const salvarComoModelo = (nutricionistaId: string, r: RegistroOrientacao): Promise<ModeloOrientacao> =>
  criarModelo(nutricionistaId, { titulo: r.titulo, conteudo: r.conteudo, favorito: false });

// ---- Orientações ----
export async function listarOrientacoes(pacienteId: string): Promise<Orientacao[]> {
  const { data, error } = await supabase
    .from("orientacoes")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Orientacao[];
}

export async function criarOrientacao(nutricionistaId: string, pacienteId: string, modeloId: string | null, r: RegistroOrientacao): Promise<Orientacao> {
  const { data, error } = await supabase
    .from("orientacoes")
    .insert({ nutricionista_id: nutricionistaId, paciente_id: pacienteId, modelo_id: modeloId, titulo: r.titulo, conteudo: r.conteudo })
    .select("*")
    .single();
  falhou(error);
  return data as Orientacao;
}

export async function atualizarOrientacao(id: string, r: RegistroOrientacao): Promise<Orientacao> {
  const { data, error } = await supabase.from("orientacoes").update({ titulo: r.titulo, conteudo: r.conteudo }).eq("id", id).select("*").single();
  falhou(error);
  return data as Orientacao;
}

export async function excluirOrientacao(id: string): Promise<void> {
  const { error } = await supabase.from("orientacoes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** Nome da nutricionista (cabeçalho do PDF). */
export async function nomeDaNutricionista(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("nome").eq("id", userId).maybeSingle();
  if (error) return null;
  return (data as { nome: string | null } | null)?.nome ?? null;
}
