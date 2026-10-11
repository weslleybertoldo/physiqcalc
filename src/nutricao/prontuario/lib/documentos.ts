// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/documentos.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { lerDadosProfissionais, type DadosProfissionais, type RegistroDocumento, type TipoDocumento } from "@/nutricao/prontuario/lib/documentosUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso às tabelas `modelos_documento` e `documentos` (RLS: a nutricionista só vê os dela; master vê tudo; criar documento
// exige enxergar o paciente). Exclusão é SOFT nas duas (deleted_at → Lixeira, W32). O documento guarda o TEXTO final com as
// tags já substituídas — mudar ou excluir o modelo depois não mexe nele (padrão dos recibos, W13). O banco mexe em
// `pacientes.updated_at` a cada documento (trigger).
// hml-19a (H-41 · H-81 · jeito 2): as gravações vão pela função nutricao (o texto final segue montado aqui); os 3 modelos padrão do
// 1º acesso nascem no servidor (padroes_garantir: 1 chamada, 1 vez só). Mesmas assinaturas; leituras seguem pelo banco.

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

/**
 * Lista os modelos; sem nenhum próprio, o servidor cria os 3 padrão (1 por tipo) favoritos — 1º acesso à seção. hml-19a (H-81): 1
 * chamada à função (padroes_garantir), que grava 1 vez só (trava por pessoa) e devolve a lista (a mesma ordem do listar).
 */
export async function garantirModelosDocumento(nutricionistaId: string): Promise<ModeloDocumento[]> {
  const r = await acaoNutricao<{ lista: ModeloDocumento[] }>("padroes_garantir", { secao: "documento" });
  return Array.isArray(r.lista) ? r.lista : [];
}

export type DadosModeloDocumento = { tipo: TipoDocumento; titulo: string; conteudo: string; favorito: boolean };

export async function criarModeloDocumento(nutricionistaId: string, d: DadosModeloDocumento): Promise<ModeloDocumento> {
  const r = await acaoNutricao<{ linha: ModeloDocumento }>("modelo_documento_criar", {
    tipo: d.tipo, titulo: d.titulo.trim(), conteudo: d.conteudo, favorito: d.favorito,
  });
  return r.linha;
}

export async function atualizarModeloDocumento(id: string, patch: Partial<DadosModeloDocumento>): Promise<ModeloDocumento> {
  const dados: ModeloDocumentoUpdate = {};
  if (patch.tipo !== undefined) dados.tipo = patch.tipo;
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.conteudo !== undefined) dados.conteudo = patch.conteudo;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const r = await acaoNutricao<{ linha: ModeloDocumento }>("modelo_documento_editar", { id, ...dados });
  return r.linha;
}

/** Soft delete — os documentos já emitidos guardam o texto final e não dependem do modelo. 0 linha → nao_encontrado. */
export async function excluirModeloDocumento(id: string): Promise<void> {
  await acaoNutricao("modelo_documento_excluir", { id });
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
  const res = await acaoNutricao<{ linha: Documento }>("documento_criar", {
    paciente_id: pacienteId, modelo_id: r.modelo_id, tipo: r.tipo, titulo: r.titulo, texto: r.texto, dados: r.dados, data: r.data,
  });
  return res.linha;
}

/** Só o texto final (edição depois de emitido). */
export async function atualizarTextoDocumento(id: string, texto: string): Promise<Documento> {
  const r = await acaoNutricao<{ linha: Documento }>("documento_editar", { id, texto });
  return r.linha;
}

/** Soft delete (Lixeira, W32); 0 linha → nao_encontrado. */
export async function excluirDocumento(id: string): Promise<void> {
  await acaoNutricao("documento_excluir", { id });
}

/** Nome da nutricionista (assinatura) — mesma consulta das orientações (W10). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/orientacoes";

/** CRN/telefone/endereço guardados em `profiles.dados_profissionais` (a tela de preencher é a W35); nada preenchido → null. */
export async function dadosProfissionais(userId: string): Promise<DadosProfissionais | null> {
  const { data, error } = await supabase.from("profiles").select("dados_profissionais").eq("id", userId).maybeSingle();
  if (error) return null;
  return lerDadosProfissionais((data as { dados_profissionais: unknown } | null)?.dados_profissionais);
}
