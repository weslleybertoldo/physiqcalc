// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/documentos.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database, Json } from "@/nutricao/editor/lib/banco";
import { MODELOS_PADRAO, lerDadosProfissionais, ordenarModelosDocumento, type DadosProfissionais, type RegistroDocumento, type TipoDocumento } from "@/nutricao/prontuario/lib/documentosUtil";

// Acesso às tabelas `modelos_documento` e `documentos` (RLS: a nutricionista só vê os dela; master vê tudo; criar documento
// exige enxergar o paciente). Exclusão é SOFT nas duas (deleted_at → Lixeira, W32). O documento guarda o TEXTO final com as
// tags já substituídas — mudar ou excluir o modelo depois não mexe nele (padrão dos recibos, W13). O banco mexe em
// `pacientes.updated_at` a cada documento (trigger).

export type ModeloDocumento = Database["public"]["Tables"]["modelos_documento"]["Row"];
export type ModeloDocumentoUpdate = Database["public"]["Tables"]["modelos_documento"]["Update"];
export type Documento = Database["public"]["Tables"]["documentos"]["Row"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ---- Modelos ----
export async function listarModelosDocumento(): Promise<ModeloDocumento[]> {
  const { data, error } = await supabase
    .from("modelos_documento")
    .select("*")
    .is("deleted_at", null)
    .order("favorito", { ascending: false })
    .order("titulo", { ascending: true });
  falhou(error);
  return (data ?? []) as ModeloDocumento[];
}

/** Lista os modelos; sem nenhum, cria os 3 padrão (1 por tipo) favoritos — 1º acesso à seção (padrão `garantirModelos` da W10/W13). */
export async function garantirModelosDocumento(nutricionistaId: string): Promise<ModeloDocumento[]> {
  const lista = await listarModelosDocumento();
  if (lista.length) return lista;
  const criados: ModeloDocumento[] = [];
  for (const m of MODELOS_PADRAO) {
    criados.push(await criarModeloDocumento(nutricionistaId, { tipo: m.tipo, titulo: m.titulo, conteudo: m.conteudo, favorito: true }));
  }
  return ordenarModelosDocumento(criados);
}

export type DadosModeloDocumento = { tipo: TipoDocumento; titulo: string; conteudo: string; favorito: boolean };

export async function criarModeloDocumento(nutricionistaId: string, d: DadosModeloDocumento): Promise<ModeloDocumento> {
  const { data, error } = await supabase
    .from("modelos_documento")
    .insert({ nutricionista_id: nutricionistaId, tipo: d.tipo, titulo: d.titulo.trim(), conteudo: d.conteudo, favorito: d.favorito })
    .select("*")
    .single();
  falhou(error);
  return data as ModeloDocumento;
}

export async function atualizarModeloDocumento(id: string, patch: Partial<DadosModeloDocumento>): Promise<ModeloDocumento> {
  const dados: ModeloDocumentoUpdate = {};
  if (patch.tipo !== undefined) dados.tipo = patch.tipo;
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.conteudo !== undefined) dados.conteudo = patch.conteudo;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { data, error } = await supabase.from("modelos_documento").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as ModeloDocumento;
}

/** Soft delete — os documentos já emitidos guardam o texto final e não dependem do modelo. */
export async function excluirModeloDocumento(id: string): Promise<void> {
  const { error } = await supabase.from("modelos_documento").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

// ---- Documentos ----
/** Documentos vivos do paciente, mais recente primeiro. */
export async function listarDocumentosDoPaciente(pacienteId: string): Promise<Documento[]> {
  const { data, error } = await supabase
    .from("documentos")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Documento[];
}

export async function criarDocumento(nutricionistaId: string, pacienteId: string, r: RegistroDocumento): Promise<Documento> {
  const { data, error } = await supabase
    .from("documentos")
    .insert({
      nutricionista_id: nutricionistaId,
      paciente_id: pacienteId,
      modelo_id: r.modelo_id,
      tipo: r.tipo,
      titulo: r.titulo,
      texto: r.texto,
      dados: r.dados as Json,
      data: r.data,
    })
    .select("*")
    .single();
  falhou(error);
  return data as Documento;
}

/** Só o texto final (edição depois de emitido). */
export async function atualizarTextoDocumento(id: string, texto: string): Promise<Documento> {
  const { data, error } = await supabase.from("documentos").update({ texto }).eq("id", id).select("*").single();
  falhou(error);
  return data as Documento;
}

/** Soft delete (Lixeira, W32). */
export async function excluirDocumento(id: string): Promise<void> {
  const { error } = await supabase.from("documentos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** Nome da nutricionista (assinatura) — mesma consulta das orientações (W10). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/orientacoes";

/** CRN/telefone/endereço guardados em `profiles.dados_profissionais` (a tela de preencher é a W35); nada preenchido → null. */
export async function dadosProfissionais(userId: string): Promise<DadosProfissionais | null> {
  const { data, error } = await supabase.from("profiles").select("dados_profissionais").eq("id", userId).maybeSingle();
  if (error) return null;
  return lerDadosProfissionais((data as { dados_profissionais: unknown } | null)?.dados_profissionais);
}
