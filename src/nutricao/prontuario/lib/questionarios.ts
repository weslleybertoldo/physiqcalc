// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/questionarios.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import type { Database } from "@/nutricao/editor/lib/banco";
import { lerNutricao } from "@/nutricao/leitura";
import { copiaDeQuestionario, type RegistroAplicacao, type RegistroQuestionario } from "@/nutricao/prontuario/lib/questionariosUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso às tabelas `questionarios` e `respostas_questionario` (RLS: os do SISTEMA — nutricionista_id null — todas leem e
// ninguém edita/apaga, só duplica; os PRÓPRIOS só a dona; master vê tudo; criar aplicação exige enxergar o paciente). Exclusão
// é SOFT nas duas (deleted_at → Lixeira, W32). A aplicação guarda título, perguntas e faixas COPIADOS do questionário na
// hora — mudar ou excluir o questionário depois não mexe no histórico (padrão das W15–W18). Pontuação/faixa/nível são
// calculados pelo app (questionariosUtil) ao criar e ao editar. O banco mexe em `pacientes.updated_at` a cada aplicação
// (trigger). jsonb chega como JSON pelo PostgREST; a tela lê com `lerPerguntas`/`lerFaixas`/`lerRespostas` (tolerantes).
// hml-19a (H-41 · jeito 2): as gravações vão pela função nutricao (a pontuação/faixa/nível seguem calculados aqui — o servidor
// confere a forma). Também a Pré-consulta › "importar como questionário" (src/painel/preconsulta/dados.ts).
// hml-20b (H-42 · jeito 2, etapa 2): as LEITURAS também vão pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa:
// questionarios (os do sistema + os próprios — o RLS decide, como antes) e respostas_questionario_do_aluno; o nome e os dados
// profissionais do PDF vêm da fonte única (src/nutricao/editor/lib/profissional.ts). Mesmos tipos; o erro é ErroLeitura (frase fixa).

export type Questionario = Database["public"]["Tables"]["questionarios"]["Row"];
type QuestionarioUpdate = Database["public"]["Tables"]["questionarios"]["Update"];
export type Aplicacao = Database["public"]["Tables"]["respostas_questionario"]["Row"];
type AplicacaoUpdate = Database["public"]["Tables"]["respostas_questionario"]["Update"];

// ---- Questionários (do sistema + próprios) ----
/** Vivos que a RLS deixa ver: os 4 do sistema + os próprios (a tela ordena com `ordenarQuestionarios`). */
export async function listarQuestionarios(): Promise<Questionario[]> {
  const r = await lerNutricao("questionarios");
  return (r.linhas ?? []) as Questionario[];
}

export async function criarQuestionario(nutricionistaId: string, r: RegistroQuestionario): Promise<Questionario> {
  const res = await acaoNutricao<{ linha: Questionario }>("questionario_criar", {
    titulo: r.titulo, descricao: r.descricao, perguntas: r.perguntas, faixas: r.faixas, favorito: r.favorito,
  });
  return res.linha;
}

/** Só os PRÓPRIOS (a RLS barra os do sistema — 0 linhas). */
export async function atualizarQuestionario(id: string, patch: Partial<RegistroQuestionario>): Promise<Questionario> {
  const dados: QuestionarioUpdate = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo;
  if (patch.descricao !== undefined) dados.descricao = patch.descricao;
  if (patch.perguntas !== undefined) dados.perguntas = patch.perguntas;
  if (patch.faixas !== undefined) dados.faixas = patch.faixas;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const r = await acaoNutricao<{ linha: Questionario }>("questionario_editar", { id, ...dados });
  return r.linha;
}

/** Soft delete (só próprios) — as aplicações já feitas guardam a própria cópia e continuam. 0 linha (do sistema) → nao_encontrado. */
export async function excluirQuestionario(id: string): Promise<void> {
  await acaoNutricao("questionario_excluir", { id });
}

/** Cópia PRÓPRIA e editável de qualquer questionário (inclusive um do sistema): '<título> (cópia)'. */
export const duplicarQuestionario = (q: Questionario, nutricionistaId: string): Promise<Questionario> => criarQuestionario(nutricionistaId, copiaDeQuestionario(q));

// ---- Aplicações do paciente ----
/** Aplicações vivas do paciente, mais recente primeiro. */
export async function listarAplicacoesDoPaciente(pacienteId: string): Promise<Aplicacao[]> {
  const r = await lerNutricao("respostas_questionario_do_aluno", { aluno: pacienteId });
  return (r.linhas ?? []) as Aplicacao[];
}

export async function criarAplicacao(nutricionistaId: string, pacienteId: string, r: RegistroAplicacao): Promise<Aplicacao> {
  const res = await acaoNutricao<{ linha: Aplicacao }>("aplicacao_criar", {
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
  });
  return res.linha;
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
  const r = await acaoNutricao<{ linha: Aplicacao }>("aplicacao_editar", { id, ...dados });
  return r.linha;
}

/** Soft delete (Lixeira, W32); 0 linha → nao_encontrado. */
export async function excluirAplicacao(id: string): Promise<void> {
  await acaoNutricao("aplicacao_excluir", { id });
}

/** Nome da nutricionista e CRN/telefone/endereço (assinatura do PDF) — a fonte única (hml-20b: o profiles de quem chama, pela função). */
export { dadosProfissionais, nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
