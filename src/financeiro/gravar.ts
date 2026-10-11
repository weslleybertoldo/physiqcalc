// Physiq hml-19d (H-41 · jeito 2, 11/10/2026) — a porta da TELA para a função financeiro (supabase-principal/functions/financeiro): as
// gravações do Financeiro (movimentações, categorias, modelos e recibos do Painel › Financeiro e do Financeiro do aluno, as sementes do
// 1º acesso e as tags do aluno) saem do navegador e passam por aqui, no molde do acaoFinanceiro (src/financeiro/api.ts, que fala com a
// pagamentos-aluno e NÃO muda) e do acaoNutricao (src/nutricao/servidor.ts). Os nomes não colidem com os de lá (ErroFinanceiro,
// mensagemErroFinanceiro).
//   · 1 chamada só, sem repetição (função não repete — src/integrations/repeticao.ts; o servidor pode ter gravado e só a resposta se
//     perdido); sem internet → sem_internet ANTES de chamar; a rede que cai (FunctionsFetchError) → rede;
//   · o erro vira ErroGravacaoFinanceiro(codigo), cuja mensagem é o TEXTO FIXO do código (a mensagem crua do banco não chega mais à tela —
//     decisão 11): os toast.error(e.message) / setErro(e.message) de hoje mostram esse texto sem mudar a tela. O nome repetido da
//     categoria segue com a frase de hoje ("Já existe uma categoria com esse nome");
//   · o cliente é o do principal: a sessão de quem está logado vai no Bearer e o schema do ambiente no x-schema.
import { principal } from "@/integrations/principal/client";
import type { AcaoFinanceiroGravar } from "../../supabase-principal/functions/_shared/financeiro-gravar-regras";

export type { AcaoFinanceiroGravar };

/** A frase de cada código de erro da financeiro (STATUS_DO_ERRO_FINANCEIRO de _shared/financeiro-gravar-regras.ts) e dos que nascem aqui. */
export const MENSAGEM_ERRO_GRAVACAO_FINANCEIRO: Record<string, string> = {
  sem_internet: "Sem internet. Confira a conexão e tente de novo.",
  rede: "Não foi possível falar com o servidor agora. Tente de novo.",
  sem_login: "Sua sessão expirou. Entre de novo para continuar.",
  sem_acesso: "Você não tem permissão para fazer isso.",
  nao_encontrado: "Não encontrado: o registro foi excluído ou não é seu.",
  nome_repetido: "Já existe uma categoria com esse nome",
  conflito: "Já existe um registro igual.",
  dados_invalidos: "Confira os dados e tente de novo.",
  acao_invalida: "Esta ação não está disponível. Atualize o app.",
  schema_invalido: "Ambiente inválido. Atualize o app.",
  metodo: "Esta ação não está disponível. Atualize o app.",
  corpo_grande: "Dados grandes demais para enviar de uma vez.",
  muitas_acoes: "Muitas ações seguidas. Espere um pouco e tente de novo.",
  tempo_esgotado: "O servidor demorou para responder. Tente de novo.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemErroGravacaoFinanceiro(codigo: string | null | undefined, padrao = "Não deu certo agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_GRAVACAO_FINANCEIRO[codigo]) || padrao;
}

/** O erro de uma gravação pela financeiro: `codigo` = o da função (ou sem_internet/rede); `message` = a frase fixa do código. */
export class ErroGravacaoFinanceiro extends Error {
  readonly codigo: string;
  readonly extra: Record<string, unknown>;
  constructor(codigo: string, extra: Record<string, unknown> = {}) {
    super(mensagemErroGravacaoFinanceiro(codigo));
    this.name = "ErroGravacaoFinanceiro";
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
 * Chama UMA ação da financeiro; erro vira ErroGravacaoFinanceiro com o código da função (a tela mostra a frase fixa). A ação vai por
 * último no corpo: nenhum campo do corpo troca a ação.
 */
export async function gravarFinanceiro<T = Record<string, unknown>>(acao: AcaoFinanceiroGravar, corpo: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroGravacaoFinanceiro("sem_internet");
  const { data, error } = await principal.functions.invoke("financeiro", { body: { ...corpo, acao } });
  if (error) {
    const c = await corpoDoErro(error);
    const codigo = typeof c?.erro === "string" ? c.erro : ehFalhaDeRede(error) ? "rede" : "erro_interno";
    throw new ErroGravacaoFinanceiro(codigo, c ?? {});
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) throw new ErroGravacaoFinanceiro(typeof d.erro === "string" ? d.erro : "erro_interno", d);
  return d as T;
}

/** O que o padroes_garantir devolve: o que ele criou agora e as 2 listas vivas da pessoa (no formato das telas). */
export interface PadroesDoFinanceiro {
  criados: { categorias: number; modelos: number };
  categorias: Array<{ id: string; nome: string; nutricionista_id: string }>;
  modelos: Array<{ id: string; nutricionista_id: string; titulo: string; conteudo: string; favorito: boolean }>;
}

// as 2 listas da tela (categorias e modelos) abrem juntas e cada uma chama a semente só quando vem vazia: a mesma chamada em voo serve as
// duas (1 chamada por abertura); terminou (bem ou mal), a próxima abertura chama de novo
const emVoo = new Map<string, Promise<PadroesDoFinanceiro>>();

/** As sementes do 1º acesso (as 6 categorias e o "Recibo padrão", com a conta): 1 chamada, mesmo com as 2 listas pedindo juntas. */
export function garantirPadroesFinanceiro(contaId: string | null): Promise<PadroesDoFinanceiro> {
  const chave = contaId ?? "";
  const ja = emVoo.get(chave);
  if (ja) return ja;
  const p = gravarFinanceiro<PadroesDoFinanceiro & { ok: true }>("padroes_garantir", { conta_id: contaId })
    .then((r) => ({
      criados: { categorias: Number(r.criados?.categorias) || 0, modelos: Number(r.criados?.modelos) || 0 },
      categorias: Array.isArray(r.categorias) ? r.categorias : [],
      modelos: Array.isArray(r.modelos) ? r.modelos : [],
    }))
    .finally(() => emVoo.delete(chave));
  emVoo.set(chave, p);
  return p;
}
