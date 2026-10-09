// Physiq W21 — Painel › Pré-consulta: acesso a dados no BANCO PRINCIPAL (porta de src/lib/preconsulta.ts e
// src/lib/respostasPreconsulta.ts do PhysiqNutri, main 294887a). As MESMAS tabelas e RPCs do site antigo (formularios_preconsulta,
// respostas_preconsulta, preconsulta_formulario, preconsulta_responder); o painel grava o formulário com a conta ativa e a resposta
// herda a conta do formulário (gatilho da migração 20261001120000_w21_preconsulta.sql). Quem vê o quê é do banco (RLS: P1 + a regra
// clínica da W18 nas respostas). Exclusão é SOFT nas duas (deleted_at → Lixeira, W26). O slug nasce no app e é re-tentado em
// conflito (23505), como no site antigo.
import { principal } from "@/integrations/principal/client";
import type { Database, Json } from "@/integrations/principal/types";
import { POR_PAGINA, deslocamento } from "@/lib/paginacao";
import { copiaDeFormulario, gerarSlug, type RegistroFormulario } from "./preconsultaUtil";
import { recorteDaConta } from "./novas";
import {
  filtrosParaBanco, normalizarPaginaRespostas, type AlunoDaResposta, type FiltrosRespostas, type FormularioDaResposta, type PaginaRespostas, type TipoImportacao,
} from "./respostasUtil";

export type FormularioPreconsulta = Database["public"]["Tables"]["formularios_preconsulta"]["Row"];
type FormularioUpdate = Database["public"]["Tables"]["formularios_preconsulta"]["Update"];
export type RespostaPreconsulta = Database["public"]["Tables"]["respostas_preconsulta"]["Row"];
type RespostaUpdate = Database["public"]["Tables"]["respostas_preconsulta"]["Update"];
export type RespostaComFormulario = RespostaPreconsulta & { formulario: FormularioDaResposta | null };
/** A resposta na lista paginada (hml-14b): + o aluno ligado, quando é da conta ativa e está fora da lixeira (senão null). */
export type RespostaDaLista = RespostaComFormulario & { aluno: AlunoDaResposta | null };

/** O aluno nos seletores (ligar a resposta) e na importação (de quem é a nutrição dele). */
export interface AlunoPreconsulta {
  id: string;
  nome: string;
  apelido: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  foto_url: string | null;
  personal_id: string | null;
  nutricionista_id: string | null;
}

const SLUG_TENTATIVAS = 5;
const SELECT_RESPOSTA = "*, formulario:formularios_preconsulta(id, titulo, origem, origem_id, slug, ativo, deleted_at)";

const MENSAGENS: Record<string, string> = {
  aluno_invisivel: "Este aluno não está na sua lista.",
  resposta_imutavel: "Esta resposta não pode mudar de conta nem de autor.",
  formulario_imutavel: "O formulário continua de quem o criou.",
};

/** Erro do banco → mensagem da tela (os códigos dos gatilhos da W21 viram frase; o resto passa como veio). */
export function mensagemDoBanco(e: unknown, padrao: string): string {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  for (const [codigo, frase] of Object.entries(MENSAGENS)) if (m.includes(codigo)) return frase;
  if (/row-level security|violates row-level|permission denied/i.test(m)) return "Você não tem permissão para isso nesta conta.";
  return m || padrao;
}

const falhou = (error: { message: string; code?: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ───────────────────────── formulários ─────────────────────────
export async function listarFormularios(contaId: string, uid: string): Promise<FormularioPreconsulta[]> {
  const { data, error } = await principal.from("formularios_preconsulta").select("*").is("deleted_at", null).or(recorteDaConta(contaId, uid))
    .order("titulo", { ascending: true });
  falhou(error);
  return (data ?? []) as FormularioPreconsulta[];
}

/** Cria na conta ativa com slug aleatório; em conflito de slug (23505) tenta outro, até 5x. */
export async function criarFormulario(uid: string, contaId: string, r: RegistroFormulario): Promise<FormularioPreconsulta> {
  let ultimo = "";
  for (let tentativa = 0; tentativa < SLUG_TENTATIVAS; tentativa += 1) {
    const { data, error } = await principal
      .from("formularios_preconsulta")
      .insert({
        nutricionista_id: uid,
        conta_id: contaId,
        titulo: r.titulo,
        descricao: r.descricao,
        origem: r.origem,
        origem_id: r.origem_id,
        perguntas: r.perguntas as unknown as Json,
        faixas: r.faixas as unknown as Json,
        slug: gerarSlug(),
        ativo: r.ativo,
      })
      .select("*")
      .single();
    if (!error) return data as FormularioPreconsulta;
    if (error.code !== "23505") throw new Error(mensagemDoBanco(new Error(error.message), "Não foi possível salvar o formulário"));
    ultimo = error.message;
  }
  throw new Error(`Não foi possível gerar um link único para o formulário (${ultimo})`);
}

export async function atualizarFormulario(id: string, patch: Partial<RegistroFormulario>): Promise<FormularioPreconsulta> {
  const dados: FormularioUpdate = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo;
  if (patch.descricao !== undefined) dados.descricao = patch.descricao;
  if (patch.perguntas !== undefined) dados.perguntas = patch.perguntas as unknown as Json;
  if (patch.faixas !== undefined) dados.faixas = patch.faixas as unknown as Json;
  if (patch.ativo !== undefined) dados.ativo = patch.ativo;
  const { data, error } = await principal.from("formularios_preconsulta").update(dados).eq("id", id).select("*").single();
  if (error) throw new Error(mensagemDoBanco(new Error(error.message), "Não foi possível salvar o formulário"));
  return data as FormularioPreconsulta;
}

/** Soft delete — as respostas já recebidas guardam a própria cópia e continuam (o link deixa de responder). */
export async function excluirFormulario(id: string): Promise<void> {
  const { error } = await principal.from("formularios_preconsulta").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** Cópia '(cópia)' com slug NOVO, ativa, na conta ativa e no seu nome. */
export const duplicarFormulario = (f: FormularioPreconsulta, uid: string, contaId: string): Promise<FormularioPreconsulta> =>
  criarFormulario(uid, contaId, copiaDeFormulario(f));

export { carregarFormularioPublico, responderFormularioPublico, type FormularioPublico, type RespostaEnviada } from "./publico";

// ───────────────────────── respostas ─────────────────────────
/**
 * hml-14b (B21): UMA página (20) das respostas vivas do recorte da conta, com os filtros (formulário, busca, novas, aluno), a contagem
 * e os títulos do filtro — tudo no banco (respostas_da_conta, com a RLS de quem chama). Erro do banco → lança (a tela mostra o erro).
 */
export async function listarRespostasPagina(contaId: string, f: FiltrosRespostas, pagina: number): Promise<PaginaRespostas<RespostaDaLista>> {
  const { data, error } = await principal.rpc("respostas_da_conta" as never, {
    p_conta: contaId, p_filtros: filtrosParaBanco(f), p_offset: deslocamento(pagina), p_limite: POR_PAGINA,
  } as never);
  falhou(error);
  const p = normalizarPaginaRespostas<RespostaDaLista>(data);
  if (!p) throw new Error("A lista de respostas voltou num formato inesperado.");
  return p;
}

/**
 * Respostas vivas do recorte, com o formulário embutido, mais recente primeiro. hml-14b: a aba Respostas lê a página acima; esta
 * leitura (até 1000) sobra só para os números do topo e da aba Formulários (usePreConsulta).
 */
export async function listarRespostas(contaId: string, uid: string): Promise<RespostaComFormulario[]> {
  const { data, error } = await principal
    .from("respostas_preconsulta")
    .select(SELECT_RESPOSTA)
    .is("deleted_at", null)
    .or(recorteDaConta(contaId, uid))
    .order("respondido_em", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  falhou(error);
  return (data ?? []) as unknown as RespostaComFormulario[];
}

async function atualizarResposta(id: string, dados: RespostaUpdate): Promise<RespostaComFormulario> {
  const { data, error } = await principal.from("respostas_preconsulta").update(dados).eq("id", id).select(SELECT_RESPOSTA).single();
  if (error) throw new Error(mensagemDoBanco(new Error(error.message), "Não foi possível salvar a resposta"));
  return data as unknown as RespostaComFormulario;
}

/** Liga (ou troca) o aluno da resposta; `null` desliga. O banco confere que quem liga vê o aluno (P1). */
export const ligarAluno = (id: string, alunoId: string | null): Promise<RespostaComFormulario> => atualizarResposta(id, { paciente_id: alunoId });

/** Registra para onde a resposta foi importada (anamnese ou aplicação de questionário) e quando. */
export const marcarImportada = (id: string, tipo: TipoImportacao, alvoId: string): Promise<RespostaComFormulario> =>
  atualizarResposta(id, { importada_em: new Date().toISOString(), importada_tipo: tipo, importada_id: alvoId });

/** Soft delete (Lixeira, W26). */
export async function excluirResposta(id: string): Promise<void> {
  const { error } = await principal.from("respostas_preconsulta").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(mensagemDoBanco(new Error(error.message), "Não foi possível excluir"));
}

// ───────────────────────── alunos (P1: os que você vê na conta) ─────────────────────────
export async function listarAlunosParaLigar(contaId: string): Promise<AlunoPreconsulta[]> {
  const { data, error } = await principal
    .from("pacientes")
    .select("id, nome, apelido, email, telefone, ativo, foto_url, personal_id, nutricionista_id")
    .eq("conta_id", contaId)
    .is("deleted_at", null)
    .order("nome", { ascending: true })
    .limit(2000);
  falhou(error);
  return (data ?? []) as unknown as AlunoPreconsulta[];
}

export { contarRespostasNovas, recorteDaConta } from "./novas";

// ───────────────────────── origens e destinos (portados na W18) ─────────────────────────
export { listarModelos as listarModelosAnamnese, criarAnamnese, type ModeloAnamnese } from "@/nutricao/prontuario/lib/anamneses";
export { listarQuestionarios, criarAplicacao, type Questionario } from "@/nutricao/prontuario/lib/questionarios";
