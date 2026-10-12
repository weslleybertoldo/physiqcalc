// Physiq W21 — Painel › Pré-consulta: acesso a dados no BANCO PRINCIPAL (porta de src/lib/preconsulta.ts e
// src/lib/respostasPreconsulta.ts do PhysiqNutri, main 294887a). As MESMAS tabelas e RPCs do site antigo (formularios_preconsulta,
// respostas_preconsulta, preconsulta_formulario, preconsulta_responder); o painel grava o formulário com a conta ativa e a resposta
// herda a conta do formulário (gatilho da migração 20261001120000_w21_preconsulta.sql). Quem vê o quê é do banco (RLS: P1 + a regra
// clínica da W18 nas respostas). Exclusão é SOFT nas duas (deleted_at → Lixeira, W26). O slug nasce no app e é re-tentado em
// conflito (23505), como no site antigo.
// hml-20c (H-42 + H-102 🟡 · jeito 2): as LEITURAS (os formulários, a página de respostas, os números) e as 5 GRAVAÇÕES (criar/editar/
// excluir formulário; ligar/marcar importada/excluir resposta) saem do navegador e vão pela função nutricao, com a sessão de quem chama
// e as MESMAS assinaturas: o recorte da conta ativa é montado no servidor (o recorteDaConta abaixo é a mesma regra, com o id do token lá);
// o dono do formulário é quem chama e o slug nasce no servidor (de novo no conflito, até 5 — antes era aqui); o "importada em" é o agora do
// servidor. Os códigos dos gatilhos da W21 voltam como eles e viram a MESMA frase de antes (MENSAGENS); o resto, a frase fixa do código.
import type { Database } from "@/integrations/principal/types";
import { POR_PAGINA, deslocamento } from "@/lib/paginacao";
import { lerNutricao } from "@/nutricao/leitura";
import { TEXTO_FILTRO_MAX } from "../../../supabase-principal/functions/_shared/nutricao-leituras";
import { acaoNutricao, comFraseDoCodigo } from "@/nutricao/servidor";
import { copiaDeFormulario, type RegistroFormulario } from "./preconsultaUtil";
import {
  filtrosParaBanco, normalizarNumeros, normalizarPaginaRespostas, type AlunoDaResposta, type FiltrosRespostas, type FormularioDaResposta, type NumerosPreConsulta,
  type PaginaRespostas, type TipoImportacao,
} from "./respostasUtil";

export type FormularioPreconsulta = Database["public"]["Tables"]["formularios_preconsulta"]["Row"];
export type RespostaPreconsulta = Database["public"]["Tables"]["respostas_preconsulta"]["Row"];
export type RespostaComFormulario = RespostaPreconsulta & { formulario: FormularioDaResposta | null };
/** A resposta na lista paginada (hml-14b): + o aluno ligado, quando é da conta ativa e está fora da lixeira (senão null). */
export type RespostaDaLista = RespostaComFormulario & { aluno: AlunoDaResposta | null };

/** O aluno que a resposta ganhou ao ligar (o do SeletorDeAluno ou o cadastrado com os dados da resposta) — vai a quem chama. */
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

/** As frases dos códigos dos gatilhos da W21 (hml-20c: chegam como o código da função; antes, dentro da mensagem do banco). */
const MENSAGENS: Record<string, string> = {
  aluno_invisivel: "Este aluno não está na sua lista.",
  resposta_imutavel: "Esta resposta não pode mudar de conta nem de autor.",
  formulario_imutavel: "O formulário continua de quem o criou.",
};
/** hml-20c: as frases de antes para os códigos que a função devolve (os 3 dos gatilhos, o RLS e o slug que não achou vaga). */
const FRASES_DA_PRECONSULTA = {
  ...MENSAGENS,
  sem_acesso: "Você não tem permissão para isso nesta conta.",
  conflito: "Não foi possível gerar um link único para o formulário. Tente de novo.",
};

/** A gravação pela função, com a frase de antes para os códigos que já tinham frase (o resto, a frase fixa do código). */
const comFrase = (e: unknown): never => comFraseDoCodigo(e, FRASES_DA_PRECONSULTA);

// ───────────────────────── formulários ─────────────────────────
/** Os formulários vivos do recorte da conta ativa, por título (o recorte e o RLS no servidor; `uid` fica na assinatura — é o do token). */
export async function listarFormularios(contaId: string, uid: string): Promise<FormularioPreconsulta[]> {
  const r = await lerNutricao("formularios_preconsulta", { conta: contaId });
  return (r.linhas ?? []) as FormularioPreconsulta[];
}

/**
 * Cria na conta ativa. hml-20c: o dono é quem chama e o slug aleatório nasce no servidor (em conflito de slug, ele tenta outro, até 5x);
 * `uid` fica na assinatura (o servidor usa o id do token).
 */
export async function criarFormulario(uid: string, contaId: string, r: RegistroFormulario): Promise<FormularioPreconsulta> {
  const { linha } = await acaoNutricao<{ linha: FormularioPreconsulta }>("preconsulta_formulario_criar", {
    conta_id: contaId, titulo: r.titulo, descricao: r.descricao, origem: r.origem, origem_id: r.origem_id, perguntas: r.perguntas, faixas: r.faixas, ativo: r.ativo,
  }).catch(comFrase);
  return linha;
}

export async function atualizarFormulario(id: string, patch: Partial<RegistroFormulario>): Promise<FormularioPreconsulta> {
  const dados: Record<string, unknown> = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo;
  if (patch.descricao !== undefined) dados.descricao = patch.descricao;
  if (patch.perguntas !== undefined) dados.perguntas = patch.perguntas;
  if (patch.faixas !== undefined) dados.faixas = patch.faixas;
  if (patch.ativo !== undefined) dados.ativo = patch.ativo;
  const { linha } = await acaoNutricao<{ linha: FormularioPreconsulta }>("preconsulta_formulario_editar", { id, ...dados }).catch(comFrase);
  return linha;
}

/** Soft delete — as respostas já recebidas guardam a própria cópia e continuam (o link deixa de responder). */
export async function excluirFormulario(id: string): Promise<void> {
  await acaoNutricao("preconsulta_formulario_excluir", { id }).catch(comFrase);
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
  // hml-20c (revisão ⚪4): cada texto do filtro no teto do servidor (TEXTO_FILTRO_MAX) — a busca longa dá a página vazia, como antes
  const filtros = Object.fromEntries(Object.entries(filtrosParaBanco(f)).map(([k, v]) => [k, v.slice(0, TEXTO_FILTRO_MAX)]));
  const r = await lerNutricao("respostas_da_conta", { conta: contaId, filtros, offset: deslocamento(pagina), limite: POR_PAGINA });
  const p = normalizarPaginaRespostas<RespostaDaLista>(r.valor);
  if (!p) throw new Error("A lista de respostas voltou num formato inesperado.");
  return p;
}

/**
 * hml-14d (B21 · D35): os números do topo (novas, no mês com as 8 semanas, ligadas, importadas, o total), da aba Respostas e de cada
 * formulário, contados no banco (preconsulta_numeros, com a RLS de quem pede, sobre o recorte da conta) — antes, uma leitura de até
 * 1000 respostas contada aqui. `inicioMes` = o 1º instante do mês no fuso do navegador. Erro do banco → lança.
 */
export async function buscarNumerosPreConsulta(contaId: string, inicioMes: Date): Promise<NumerosPreConsulta> {
  const r = await lerNutricao("preconsulta_numeros", { conta: contaId, inicio_mes: inicioMes.toISOString() });
  const n = normalizarNumeros(r.valor);
  if (!n) throw new Error("Os números da pré-consulta voltaram num formato inesperado.");
  return n;
}

/** hml-20c: o "ligar" da resposta pela função (o aluno e/ou a importação); volta a linha com o formulário embutido (o SELECT_RESPOSTA de antes). */
async function atualizarResposta(id: string, dados: Record<string, unknown>): Promise<RespostaComFormulario> {
  const { linha } = await acaoNutricao<{ linha: RespostaComFormulario }>("preconsulta_resposta_ligar", { id, ...dados }).catch(comFrase);
  return linha;
}

/** Liga (ou troca) o aluno da resposta; `null` desliga. O banco confere que quem liga vê o aluno (P1). */
export const ligarAluno = (id: string, alunoId: string | null): Promise<RespostaComFormulario> => atualizarResposta(id, { paciente_id: alunoId });

/** Registra para onde a resposta foi importada (anamnese ou aplicação de questionário) e quando (hml-20c: o "quando" é do servidor). */
export const marcarImportada = (id: string, tipo: TipoImportacao, alvoId: string): Promise<RespostaComFormulario> =>
  atualizarResposta(id, { importada_tipo: tipo, importada_id: alvoId });

/** Soft delete (Lixeira, W26). */
export async function excluirResposta(id: string): Promise<void> {
  await acaoNutricao("preconsulta_resposta_excluir", { id }).catch(comFrase);
}

export { contarRespostasNovas, recorteDaConta } from "./novas";

// ───────────────────────── origens e destinos (portados na W18) ─────────────────────────
export { listarModelos as listarModelosAnamnese, criarAnamnese, type ModeloAnamnese } from "@/nutricao/prontuario/lib/anamneses";
export { listarQuestionarios, criarAplicacao, type Questionario } from "@/nutricao/prontuario/lib/questionarios";
