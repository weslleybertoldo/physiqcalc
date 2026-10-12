// Physiq hml-20a (H-42 · jeito 2, etapa 2) — a porta das LEITURAS da tela para a função nutricao (ação `ler`): o lote automático
// (src/integrations/leituraEmLote.ts) com o cliente do principal pela porta das libs (@/nutricao/editor/lib/banco — a sessão de quem está
// logado vai no Bearer e o schema do ambiente no x-schema; os testes que falsificam o banco falsificam a função junto).
//   · lerNutricao("<consulta>", { ...params }) → { linhas?, valor?, total? } — as consultas são as do catálogo do servidor
//     (supabase-principal/functions/_shared/nutricao-leituras.ts: ConsultaDaNutricao); as libs mantêm a assinatura e o tipo de hoje;
//   · o erro vira ErroLeitura(codigo), cuja mensagem é o TEXTO FIXO do código (decisão 20 — a mensagem crua do banco não chega à tela);
//     quem precisa do código (o app do aluno compara "sem_internet") usa o `codigo` ou troca a mensagem (src/nutricao/app/pacienteApp.ts).
import { criarLeitor, type OpcoesLeitura, type ResultadoDeLeitura } from "@/integrations/leituraEmLote";
import { supabase } from "@/nutricao/editor/lib/banco";
import type { ConsultaDaNutricao } from "../../supabase-principal/functions/_shared/nutricao-leituras";

export type { ConsultaDaNutricao, ResultadoDeLeitura };

/** A frase de cada código de erro de uma leitura (os do motor e da porta da nutricao e os que nascem no navegador). */
export const MENSAGEM_ERRO_LEITURA: Record<string, string> = {
  sem_internet: "Sem internet. Confira a conexão e tente de novo.",
  rede: "Não foi possível falar com o servidor agora. Tente de novo.",
  sem_login: "Sua sessão expirou. Entre de novo para continuar.",
  sem_acesso: "Você não tem permissão para ver isso.",
  nao_encontrado: "Não encontrado: o registro foi excluído ou não está disponível.",
  dados_invalidos: "Não deu para carregar: o pedido veio fora do formato. Atualize o app.",
  consulta_invalida: "Esta tela não está disponível nesta versão. Atualize o app.",
  lote_grande: "Muitas informações pedidas de uma vez. Tente de novo.",
  acao_invalida: "Esta tela não está disponível nesta versão. Atualize o app.",
  schema_invalido: "Ambiente inválido. Atualize o app.",
  corpo_grande: "Muitas informações pedidas de uma vez. Tente de novo.",
  muitas_acoes: "Muitas aberturas seguidas. Espere um pouco e tente de novo.",
  tempo_esgotado: "O servidor demorou para responder. Tente de novo.",
  erro_interno: "Não deu para carregar agora. Tente de novo.",
};

export function mensagemErroLeitura(codigo: string | null | undefined, padrao = "Não deu para carregar agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_LEITURA[codigo]) || padrao;
}

/** O erro de uma leitura: `codigo` = o do servidor (ou sem_internet/rede); `message` = a frase fixa do código. */
export class ErroLeitura extends Error {
  readonly codigo: string;
  readonly extra: Record<string, unknown>;
  constructor(codigo: string, extra: Record<string, unknown> = {}, mensagem?: string) {
    super(mensagem ?? mensagemErroLeitura(codigo));
    this.name = "ErroLeitura";
    this.codigo = codigo;
    this.extra = extra;
  }
}

const leitor = criarLeitor({
  funcao: "nutricao",
  invocar: (funcao, corpo) => supabase.functions.invoke(funcao, { body: corpo }),
  erro: (codigo, extra) => new ErroLeitura(codigo, extra),
});

/** Uma leitura da nutricao, no lote da volta (1 chamada por tela). Erro → ErroLeitura com o código. */
export function lerNutricao(q: ConsultaDaNutricao, params?: Record<string, unknown>, opcoes?: OpcoesLeitura): Promise<ResultadoDeLeitura> {
  return leitor(q, params, opcoes);
}
