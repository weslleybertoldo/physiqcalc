// Physiq hml-19a (H-41 · jeito 2, 11/10/2026) — a porta da TELA para a função nutricao (supabase-principal/functions/nutricao): as
// gravações da nutrição saem do navegador e passam por aqui, no molde do acaoFinanceiro (src/financeiro/api.ts).
//   · 1 chamada só, sem repetição (função não repete — src/integrations/repeticao.ts; o servidor pode ter gravado e só a resposta se
//     perdido); sem internet → sem_internet ANTES de chamar;
//   · o erro vira ErroNutricao(codigo), cuja mensagem é o TEXTO FIXO do código (a mensagem crua do banco não chega mais à tela —
//     desvio 14): os toast.error(e.message) de hoje mostram esse texto sem mudar a tela;
//   · o cliente é o do principal pela porta das libs (@/nutricao/editor/lib/banco): a sessão de quem está logado vai no Bearer e o
//     schema do ambiente no x-schema (os testes que já falsificam o banco falsificam a função junto).
// hml-19b: a mesma porta serve a Dieta, as Dietas e o app do aluno (as 3 listas fechadas da função: AcaoDaFuncao). hml-19c: e a
// Avaliação (a antropometria, as fotos de evolução e o aviso "avaliação nova") — a 4ª lista. hml-20c (H-102): e as 5 da Pré-consulta (o
// formulário e a resposta) — a 5ª lista.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { AcaoAluno, AcaoAvaliacao, AcaoDieta, AcaoNutricao, AcaoPreconsulta } from "../../supabase-principal/functions/_shared/nutricao-regras";

export type { AcaoAluno, AcaoAvaliacao, AcaoDieta, AcaoNutricao, AcaoPreconsulta };
/** Toda ação da função nutricao: o Prontuário (hml-19a), a Dieta e as Dietas, o app do aluno (hml-19b), a Avaliação (hml-19c) e a
 *  Pré-consulta (hml-20c). */
export type AcaoDaFuncao = AcaoNutricao | AcaoDieta | AcaoAluno | AcaoAvaliacao | AcaoPreconsulta;

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
  // hml-19b — os códigos das RPCs do app do aluno (o app mostra o texto dele: refeicaoConcluidaUtil, metasUtil, diarioUtil — os mesmos)
  sem_alimentos: "Essa refeição ainda não tem alimentos.",
  data_invalida: "Confira a data e a hora do celular.",
  meta_pausada: "Essa meta está pausada pela sua nutricionista.",
  fora_do_dia: "Essa meta não vale para hoje.",
  codigo_invalido: "O envio de fotos não está liberado agora. Fale com a sua nutricionista.",
  diario_desligado: "O envio de fotos está desligado pelo seu profissional.",
  link_desligado: "O envio de fotos está desligado pelo seu profissional.",
  refeicao_invalida: "Escolha a refeição.",
  path_invalido: "A foto não subiu. Tente de novo.",
  arquivo_nao_encontrado: "A foto não subiu. Tente de novo.",
  arquivo_invalido: "A foto não subiu. Tente de novo.",
  muitos_envios: "Muitos envios em pouco tempo — tente de novo em alguns minutos.",
  // hml-19c — o aviso "avaliação nova" (a tela não mostra: o aviso que falha não desfaz nada)
  aluno_inexistente: "Aluno não encontrado.",
  // hml-20c — os gatilhos da W21 na Pré-consulta (a lib da tela troca pela frase dela, a mesma de antes)
  aluno_invisivel: "Este aluno não está na sua lista.",
  resposta_imutavel: "Esta resposta não pode mudar de conta nem de autor.",
  formulario_imutavel: "O formulário continua de quem o criou.",
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
export async function acaoNutricao<T = Record<string, unknown>>(acao: AcaoDaFuncao, corpo: Record<string, unknown> = {}): Promise<T> {
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
