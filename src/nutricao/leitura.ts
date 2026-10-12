// Physiq hml-20a (H-42 · jeito 2, etapa 2) — a porta das LEITURAS da tela para a função nutricao (ação `ler`): o lote automático
// (src/integrations/leituraEmLote.ts) com o cliente do principal pela porta das libs (@/nutricao/editor/lib/banco — a sessão de quem está
// logado vai no Bearer e o schema do ambiente no x-schema; os testes que falsificam o banco falsificam a função junto).
//   · lerNutricao("<consulta>", { ...params }) → { linhas?, valor?, total? } — as consultas são as do catálogo do servidor
//     (supabase-principal/functions/_shared/nutricao-leituras.ts: ConsultaDaNutricao); as libs mantêm a assinatura e o tipo de hoje;
//   · o erro vira ErroLeitura(codigo), cuja mensagem é o TEXTO FIXO do código (decisão 20 — a mensagem crua do banco não chega à tela);
//     quem precisa do código (o app do aluno compara "sem_internet") usa o `codigo` ou troca a mensagem (src/nutricao/app/pacienteApp.ts).
// hml-20b (Painel › Aluno): + a frase do muitas_linhas (o laço dos resultados de exame) e o urlAssinadaDoServidor — a URL assinada que o
// servidor devolve RELATIVA (/storage/v1/object/sign/…) montada com o domínio do cliente do principal (a MESMA URL de hoje: o host das
// funções fica fora do CSP do site), para as fotos da casca/Avaliação e o Ver/Baixar dos anexos.
// hml-20c (⚪ H-106): o urlAssinadaDoServidor é a ÚNICA montagem da URL relativa (eram 3 cópias: esta, a urlDoServidor da Evolução e a
// privada do app do aluno) — as outras 2 importam esta, com a mesma saída e a base que cada uma passava; as URLs do diário do painel também.
import { criarLeitor, type OpcoesLeitura, type ResultadoDeLeitura } from "@/integrations/leituraEmLote";
import { PRINCIPAL_URL } from "@/integrations/principal/client";
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
  // hml-20b — o laço que passou do teto de leituras (os resultados de exame de um aluno: 50 × 1000)
  muitas_linhas: "Informações demais para ler de uma vez.",
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

/** O começo da URL assinada de leitura que o servidor devolve (relativa ao projeto). */
const PREFIXO_ASSINADA = "/storage/v1/object/sign/";

/**
 * hml-20b: a URL assinada que o servidor devolve (RELATIVA ao projeto — /storage/v1/object/sign/<bucket>/…?token=…) montada com o
 * domínio do cliente do principal: a MESMA URL que o navegador assinava. Fora do formato (ou sem o domínio) → null (a tela mostra o
 * "indisponível" dela, como quando a assinatura falhava).
 */
export function urlAssinadaDoServidor(relativa: unknown, base: string = PRINCIPAL_URL): string | null {
  if (typeof relativa !== "string" || !relativa.startsWith(PREFIXO_ASSINADA) || !base) return null;
  return `${base.replace(/\/+$/, "")}${relativa}`;
}
