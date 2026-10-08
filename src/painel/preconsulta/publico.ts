// Physiq W21 — as 2 chamadas PÚBLICAS da pré-consulta (sem login): o formulário vivo pelo slug e a gravação da resposta, pelas RPCs
// security definer do banco principal (as do site antigo do Nutri — preconsulta_formulario / preconsulta_responder), no schema do
// ambiente. Módulo leve de propósito: a página /f/:slug carrega só isto (e as regras puras), nada do painel.
import { principal } from "@/integrations/principal/client";
import type { Json } from "@/integrations/principal/types";
import type { Respostas } from "@/nutricao/prontuario/lib/questionariosUtil";
import { normalizarSlug } from "./preconsultaUtil";

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

export type FormularioPublico = { id: string; titulo: string; descricao: string; perguntas: unknown; faixas: unknown; nutricionista: string };

/** O formulário vivo e ativo pelo slug, ou null (inexistente, inativo ou excluído). */
export async function carregarFormularioPublico(slug: string): Promise<FormularioPublico | null> {
  const { data, error } = await principal.rpc("preconsulta_formulario", { p_slug: normalizarSlug(slug) });
  falhou(error);
  return (data ?? null) as unknown as FormularioPublico | null;
}

export type RespostaEnviada = { id: string; pontuacao: number; faixa: string; nivel: string };

/**
 * Grava a resposta pela RPC (validação, pontuação e limite por hora no banco; a conta vem do formulário pelo gatilho). hml-12 (H-30,
 * H8): com o `consentimento` (a versão do texto que a pessoa leu — só o build de staging até a virada) vai a sobrecarga de 6
 * argumentos, que o grava na própria resposta; sem ele, a de 5 de sempre — que, depois da virada (versão dos textos ligada no banco),
 * recusa com sem_consentimento.
 */
export async function responderFormularioPublico(
  slug: string,
  nome: string,
  email: string,
  telefone: string,
  respostas: Respostas,
  consentimento?: string,
): Promise<RespostaEnviada> {
  const args = {
    p_slug: normalizarSlug(slug),
    p_nome: nome.trim(),
    p_email: email.trim(),
    p_telefone: telefone.trim(),
    p_respostas: respostas as unknown as Json,
  };
  const { data, error } = consentimento
    ? await principal.rpc("preconsulta_responder" as never, { ...args, p_consentimento: consentimento } as never)
    : await principal.rpc("preconsulta_responder", args);
  falhou(error);
  return data as unknown as RespostaEnviada;
}
