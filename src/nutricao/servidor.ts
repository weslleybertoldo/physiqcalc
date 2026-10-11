// Physiq hml-19a (H-41 · jeito 2, 11/10/2026) — a porta da TELA para a função nutricao (supabase-principal/functions/nutricao): as
// gravações da nutrição saem do navegador e passam por aqui, no molde do acaoFinanceiro (src/financeiro/api.ts).
//   · 1 chamada só, sem repetição (função não repete — src/integrations/repeticao.ts; o servidor pode ter gravado e só a resposta se
//     perdido); sem internet → sem_internet ANTES de chamar;
//   · o erro vira ErroNutricao(codigo), cuja mensagem é o TEXTO FIXO do código (a mensagem crua do banco não chega mais à tela —
//     desvio 14): os toast.error(e.message) de hoje mostram esse texto sem mudar a tela;
//   · o cliente é o do principal pela porta das libs (@/nutricao/editor/lib/banco): a sessão de quem está logado vai no Bearer e o
//     schema do ambiente no x-schema (os testes que já falsificam o banco falsificam a função junto).
import { supabase } from "@/nutricao/editor/lib/banco";
import type { AcaoNutricao } from "../../supabase-principal/functions/_shared/nutricao-regras";

export type { AcaoNutricao };

/** A frase de cada código de erro da nutricao (STATUS_DO_ERRO de _shared/nutricao-regras.ts) e dos que nascem aqui. */
export const MENSAGEM_ERRO_NUTRICAO: Record<string, string> = {
  sem_internet: "Sem internet. Confira a conexão e tente de novo.",
  rede: "Não foi possível falar com o servidor agora. Tente de novo.",
  sem_login: "Sua sessão expirou. Entre de novo para continuar.",
  sem_acesso: "Você não tem permissão para fazer isso com este aluno.",
  fora_da_pasta: "Arquivo inválido. Envie de novo.",
  nao_encontrado: "Não encontrado: o registro foi excluído ou não é seu.",
  conflito: "Já existe um registro igual.",
  dados_invalidos: "Confira os dados e tente de novo.",
  acao_invalida: "Esta ação não está disponível. Atualize o app.",
  schema_invalido: "Ambiente inválido. Atualize o app.",
  secao_invalida: "Esta seção não está disponível. Atualize o app.",
  tipo_invalido: "Tipo de arquivo não permitido (use PDF, imagem, Word, Excel ou texto).",
  arquivo_grande: "Arquivo acima de 20 MB.",
  anexo_nao_enviado: "O arquivo não chegou. Envie de novo.",
  upload_falhou: "Não foi possível enviar o arquivo. Tente de novo.",
  storage_falhou: "O armazenamento de arquivos não respondeu. Tente de novo.",
  corpo_grande: "Dados grandes demais para enviar de uma vez.",
  muitas_acoes: "Muitas ações seguidas. Espere um pouco e tente de novo.",
  tempo_esgotado: "O servidor demorou para responder. Tente de novo.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemErroNutricao(codigo: string | null | undefined, padrao = "Não deu certo agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_NUTRICAO[codigo]) || padrao;
}

/** O erro de uma ação da nutricao: `codigo` = o da função (ou sem_internet/rede); `message` = a frase fixa do código. */
export class ErroNutricao extends Error {
  readonly codigo: string;
  readonly extra: Record<string, unknown>;
  constructor(codigo: string, extra: Record<string, unknown> = {}, mensagem?: string) {
    super(mensagem ?? mensagemErroNutricao(codigo));
    this.name = "ErroNutricao";
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
 * Chama UMA ação da nutricao; erro vira ErroNutricao com o código da função (a tela mostra a frase fixa). A ação vai por último no
 * corpo: nenhum campo do corpo troca a ação.
 */
export async function acaoNutricao<T = Record<string, unknown>>(acao: AcaoNutricao, corpo: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroNutricao("sem_internet");
  const { data, error } = await supabase.functions.invoke("nutricao", { body: { ...corpo, acao } });
  if (error) {
    const c = await corpoDoErro(error);
    const codigo = typeof c?.erro === "string" ? c.erro : ehFalhaDeRede(error) ? "rede" : "erro_interno";
    throw new ErroNutricao(codigo, c ?? {});
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) throw new ErroNutricao(typeof d.erro === "string" ? d.erro : "erro_interno", d);
  return d as T;
}

/**
 * Para as libs que já tinham a frase própria de um caso (ex.: "Só quem escreveu a anotação pode mudar." no 0 linha): se o erro é
 * da nutricao com um desses códigos, troca a frase; o resto sobe como veio.
 */
export function comFraseDoCodigo(e: unknown, frases: Partial<Record<string, string>>): never {
  if (e instanceof ErroNutricao && frases[e.codigo]) throw new ErroNutricao(e.codigo, e.extra, frases[e.codigo]);
  throw e;
}
