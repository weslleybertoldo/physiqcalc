// Physiq hml-21a (H-43 · jeito 2, etapa 3) — a porta das GRAVAÇÕES da tela para a função conta (supabase-principal/functions/conta): a
// casca (o sino, o aviso de membro removido, o aviso de mudança, a senha provisória, o push, o aceite dos textos e o onboarding) e o app do
// aluno (o nome e a foto do perfil, o objetivo do plano do app) saem do navegador e passam por aqui, no molde do gravarFinanceiro
// (src/financeiro/gravar.ts) e do acaoNutricao (src/nutricao/servidor.ts). Os nomes não colidem com o MENSAGEM_ERRO_CONTA/mensagemErroConta
// da exclusão da conta (src/app-aluno/perfil/pecas/api.ts).
//   · 1 chamada só, SEM repetição (função não repete — src/integrations/repeticao.ts; o servidor pode ter gravado e só a resposta se perdido;
//     o sino que fazia 2 PATCH com o `retry: 1` passa a 1 ação); sem internet → sem_internet ANTES de chamar; a rede que cai
//     (FunctionsFetchError) → rede;
//   · o erro vira ErroGravacaoConta(codigo), cuja mensagem é o TEXTO FIXO do código (a mensagem crua do banco não chega mais à tela —
//     decisão 20); as libs que tinham um texto próprio (ou um código próprio, como o ErroApp do app sem profissional) traduzem;
//   · o cliente é o do principal: a sessão de quem está logado vai no Bearer e o schema do ambiente no x-schema.
import { principal } from "@/integrations/principal/client";
import type { AcaoConta } from "../../supabase-principal/functions/_shared/conta-regras";

export type { AcaoConta };

/** A frase de cada código de erro da conta (STATUS_DO_ERRO_CONTA de _shared/conta-regras.ts) e dos que nascem aqui. */
export const MENSAGEM_ERRO_GRAVACAO_CONTA: Record<string, string> = {
  sem_internet: "Sem internet. Confira a conexão e tente de novo.",
  rede: "Não foi possível falar com o servidor agora. Tente de novo.",
  sem_login: "Sua sessão expirou. Entre de novo para continuar.",
  sem_acesso: "Você não tem permissão para fazer isso.",
  nao_encontrado: "Não encontrado: o registro foi excluído ou não é seu.",
  conflito: "Já existe um registro igual.",
  dados_invalidos: "Confira os dados e tente de novo.",
  acao_invalida: "Esta ação não está disponível. Atualize o app.",
  schema_invalido: "Ambiente inválido. Atualize o app.",
  metodo: "Esta ação não está disponível. Atualize o app.",
  corpo_grande: "Dados grandes demais para enviar de uma vez.",
  muitas_acoes: "Muitas ações seguidas. Espere um pouco e tente de novo.",
  storage_falhou: "O armazenamento de arquivos não respondeu. Tente de novo.",
  tempo_esgotado: "O servidor demorou para responder. Tente de novo.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemErroGravacaoConta(codigo: string | null | undefined, padrao = "Não deu certo agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_GRAVACAO_CONTA[codigo]) || padrao;
}

/** O erro de uma gravação pela conta: `codigo` = o da função (ou sem_internet/rede); `message` = a frase fixa do código. */
export class ErroGravacaoConta extends Error {
  readonly codigo: string;
  readonly extra: Record<string, unknown>;
  constructor(codigo: string, extra: Record<string, unknown> = {}) {
    super(mensagemErroGravacaoConta(codigo));
    this.name = "ErroGravacaoConta";
    this.codigo = codigo;
    this.extra = extra;
  }
}

/** O corpo da resposta de erro da função ({ ok: false, erro }), quando houver. */
async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** O pedido nem chegou (rede caiu, a API não respondeu): o supabase-js devolve um FunctionsFetchError sem Response. */
const ehFalhaDeRede = (erro: unknown): boolean => (erro as { name?: unknown })?.name === "FunctionsFetchError";

/**
 * Chama UMA ação da conta; erro vira ErroGravacaoConta com o código da função (a tela mostra a frase fixa). A ação vai por último no
 * corpo: nenhum campo do corpo troca a ação.
 */
export async function acaoConta<T = Record<string, unknown>>(acao: AcaoConta, corpo: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroGravacaoConta("sem_internet");
  const { data, error } = await principal.functions.invoke("conta", { body: { ...corpo, acao } });
  if (error) {
    const c = await corpoDoErro(error);
    const codigo = typeof c?.erro === "string" ? c.erro : ehFalhaDeRede(error) ? "rede" : "erro_interno";
    throw new ErroGravacaoConta(codigo, c ?? {});
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) throw new ErroGravacaoConta(typeof d.erro === "string" ? d.erro : "erro_interno", d);
  return d as T;
}

/** O código de uma gravação que falhou (o da função; a rede que caiu é "sem_internet" para as telas do app). */
export function codigoDaGravacao(e: unknown): string {
  const codigo = e instanceof ErroGravacaoConta ? e.codigo : "erro_interno";
  return codigo === "rede" ? "sem_internet" : codigo;
}

/** O valor que a RPC devolveu numa ação da conta (o `resultado`: o { ok, erro } dela, como hoje). */
export function resultadoDaAcao(r: { resultado?: unknown } | null | undefined): Record<string, unknown> {
  const v = r?.resultado;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
