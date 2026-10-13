// Physiq hml-21a (H-43 · jeito 2, etapa 3) — a porta das LEITURAS da tela para a função conta (ação `ler`): a 3ª instância do lote automático
// (src/integrations/leituraEmLote.ts — o mesmo da nutricao e da financeiro), com o cliente do principal (a sessão de quem está logado vai no
// Bearer e o schema do ambiente no x-schema; os testes que falsificam o principal falsificam a função junto — src/test/contaFalsa.ts).
//   · lerConta("<consulta>", { ...params }) → { linhas?, valor?, total? } — as consultas são as do catálogo do servidor
//     (supabase-principal/functions/_shared/conta-leituras.ts: ConsultaDaConta); as libs mantêm a assinatura e o tipo de hoje;
//   · as leituras pedidas na MESMA volta (5 ms) viram 1 chamada (o Início do aluno: o sino + o perfil + a agenda numa ida); até 16;
//   · sem internet → sem_internet na hora, sem chamar; a repetição (1 vez em 5xx/429/rede) é a do fetch do cliente (o `ler` da conta está em
//     ACOES_DE_LEITURA de src/integrations/repeticao.ts);
//   · o erro vira o MESMO ErroLeitura da nutricao (src/nutricao/leitura.ts — importado, não duplicado): o `codigo` do servidor (ou
//     sem_internet/rede) e a frase fixa do código; as libs trocam pelo erro delas onde a tela já tinha um (o mesmo desfecho de hoje).
import { criarLeitor, type OpcoesLeitura, type ResultadoDeLeitura } from "@/integrations/leituraEmLote";
import { principal } from "@/integrations/principal/client";
import { ErroLeitura } from "@/nutricao/leitura";
import type { ConsultaDaConta } from "../../supabase-principal/functions/_shared/conta-leituras";

export type { ConsultaDaConta, ResultadoDeLeitura };
export { ErroLeitura };

const leitor = criarLeitor({
  funcao: "conta",
  invocar: (funcao, corpo) => principal.functions.invoke(funcao, { body: corpo }),
  erro: (codigo, extra) => new ErroLeitura(codigo, extra),
});

/** Uma leitura da conta, no lote da volta (1 chamada por tela). Erro → ErroLeitura com o código. */
export function lerConta(q: ConsultaDaConta, params?: Record<string, unknown>, opcoes?: OpcoesLeitura): Promise<ResultadoDeLeitura> {
  return leitor(q, params, opcoes);
}

/** O código do erro de uma leitura (o do servidor; a rede que caiu é "sem_internet" para as telas do app — o PADRÃO da hml-20a). */
export function codigoDaLeitura(e: unknown): string {
  const codigo = e instanceof ErroLeitura ? e.codigo : "erro_interno";
  return codigo === "rede" ? "sem_internet" : codigo;
}
