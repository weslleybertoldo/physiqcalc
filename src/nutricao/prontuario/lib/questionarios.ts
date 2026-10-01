// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/questionarios.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { copiaDeQuestionario, type RegistroAplicacao, type RegistroQuestionario } from "@/nutricao/prontuario/lib/questionariosUtil";

// Acesso às tabelas `questionarios` e `respostas_questionario` (RLS: os do SISTEMA — nutricionista_id null — todas leem e
// ninguém edita/apaga, só duplica; os PRÓPRIOS só a dona; master vê tudo; criar aplicação exige enxergar o paciente). Exclusão
// é SOFT nas duas (deleted_at → Lixeira, W32). A aplicação guarda título, perguntas e faixas COPIADOS do questionário na
// hora — mudar ou excluir o questionário depois não mexe no histórico (padrão das W15–W18). Pontuação/faixa/nível são
// calculados pelo app (questionariosUtil) ao criar e ao editar. O banco mexe em `pacientes.updated_at` a cada aplicação
// (trigger). jsonb chega como JSON pelo PostgREST; a tela lê com `lerPerguntas`/`lerFaixas`/`lerRespostas` (tolerantes).

export type Questionario = Database["public"]["Tables"]["questionarios"]["Row"];
type QuestionarioUpdate = Database["public"]["Tables"]["questionarios"]["Update"];
export type Aplicacao = Database["public"]["Tables"]["respostas_questionario"]["Row"];
type AplicacaoUpdate = Database["public"]["Tables"]["respostas_questionario"]["Update"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ---- Questionários (do sistema + próprios) ----
/** Vivos que a RLS deixa ver: os 4 do sistema + os próprios (a tela ordena com `ordenarQuestionarios`). */
export async function listarQuestionarios(): Promise<Questionario[]> {
  const { data, error } = await supabase.from("questionarios").select("*").is("deleted_at", null).order("titulo", { ascending: true });
  falhou(error);
  return (data ?? []) as Questionario[];
}

export async function criarQuestionario(nutricionistaId: string, r: RegistroQuestionario): Promise<Questionario> {
  const { data, error } = await supabase
    .from("questionarios")
    .insert({ nutricionista_id: nutricionistaId, titulo: r.titulo, descricao: r.descricao, perguntas: r.perguntas, faixas: r.faixas, favorito: r.favorito })
    .select("*")
    .single();
  falhou(error);
  return data as Questionario;
}

/** Só os PRÓPRIOS (a RLS barra os do sistema — 0 linhas). */
export async function atualizarQuestionario(id: string, patch: Partial<RegistroQuestionario>): Promise<Questionario> {
  const dados: QuestionarioUpdate = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo;
  if (patch.descricao !== undefined) dados.descricao = patch.descricao;
  if (patch.perguntas !== undefined) dados.perguntas = patch.perguntas;
  if (patch.faixas !== undefined) dados.faixas = patch.faixas;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { data, error } = await supabase.from("questionarios").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as Questionario;
}

/** Soft delete (só próprios) — as aplicações já feitas guardam a própria cópia e continuam. */
export async function excluirQuestionario(id: string): Promise<void> {
  const { error } = await supabase.from("questionarios").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** Cópia PRÓPRIA e editável de qualquer questionário (inclusive um do sistema): '<título> (cópia)'. */
export const duplicarQuestionario = (q: Questionario, nutricionistaId: string): Promise<Questionario> => criarQuestionario(nutricionistaId, copiaDeQuestionario(q));

// ---- Aplicações do paciente ----
/** Aplicações vivas do paciente, mais recente primeiro. */
export async function listarAplicacoesDoPaciente(pacienteId: string): Promise<Aplicacao[]> {
  const { data, error } = await supabase
    .from("respostas_questionario")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Aplicacao[];
}

export async function criarAplicacao(nutricionistaId: string, pacienteId: string, r: RegistroAplicacao): Promise<Aplicacao> {
  const { data, error } = await supabase
    .from("respostas_questionario")
    .insert({
      nutricionista_id: nutricionistaId,
      paciente_id: pacienteId,
      questionario_id: r.questionario_id,
      titulo: r.titulo,
      perguntas: r.perguntas,
      faixas: r.faixas,
      respostas: r.respostas,
      pontuacao: r.pontuacao,
      faixa: r.faixa,
      nivel: r.nivel,
      data: r.data,
      observacao: r.observacao,
    })
    .select("*")
    .single();
  falhou(error);
  return data as Aplicacao;
}

export type PatchAplicacao = Partial<Pick<RegistroAplicacao, "respostas" | "pontuacao" | "faixa" | "nivel" | "data" | "observacao">>;

/** Edição: respostas (já recalculadas pelo app → pontuação/faixa/nível), data e/ou observação. Título/perguntas/faixas não mudam. */
export async function atualizarAplicacao(id: string, patch: PatchAplicacao): Promise<Aplicacao> {
  const dados: AplicacaoUpdate = {};
  if (patch.respostas !== undefined) dados.respostas = patch.respostas;
  if (patch.pontuacao !== undefined) dados.pontuacao = patch.pontuacao;
  if (patch.faixa !== undefined) dados.faixa = patch.faixa;
  if (patch.nivel !== undefined) dados.nivel = patch.nivel;
  if (patch.data !== undefined) dados.data = patch.data;
  if (patch.observacao !== undefined) dados.observacao = patch.observacao;
  const { data, error } = await supabase.from("respostas_questionario").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as Aplicacao;
}

/** Soft delete (Lixeira, W32). */
export async function excluirAplicacao(id: string): Promise<void> {
  const { error } = await supabase.from("respostas_questionario").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** Nome da nutricionista (assinatura do PDF) — mesma consulta das orientações (W10). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/orientacoes";
/** CRN/telefone/endereço no PDF quando já existirem (W15; preenchidos na W35). */
export { dadosProfissionais } from "@/nutricao/prontuario/lib/documentos";
