// Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4) — a porta das LEITURAS da tela para a função financeiro (ação `ler`): a 2ª instância
// do lote automático (src/integrations/leituraEmLote.ts — o mesmo da nutricao), com o cliente do principal (a sessão de quem está logado
// vai no Bearer e o schema do ambiente no x-schema; os testes que falsificam o principal falsificam a função junto).
//   · lerFinanceiro("<consulta>", { ...params }) → { linhas?, valor?, total? } — as consultas são as do catálogo do servidor
//     (supabase-principal/functions/_shared/financeiro-leituras.ts: ConsultaDoFinanceiro); as libs mantêm a assinatura e o tipo de hoje;
//   · as leituras pedidas na MESMA volta (5 ms) viram 1 chamada (as comuns do Financeiro + as da aba aberta); até 16 por chamada;
//   · o erro vira o MESMO ErroLeitura da nutricao (src/nutricao/leitura.ts — importado, não duplicado): o `codigo` do servidor (ou
//     sem_internet/rede) e a frase fixa do código; as libs do Financeiro trocam a frase onde a tela tinha outra (os códigos das RPCs).
import { criarLeitor, type OpcoesLeitura, type ResultadoDeLeitura } from "@/integrations/leituraEmLote";
import { principal } from "@/integrations/principal/client";
import { ErroLeitura } from "@/nutricao/leitura";
import type { ConsultaDoFinanceiro } from "../../supabase-principal/functions/_shared/financeiro-leituras";

export type { ConsultaDoFinanceiro, ResultadoDeLeitura };
export { ErroLeitura };

const leitor = criarLeitor({
  funcao: "financeiro",
  invocar: (funcao, corpo) => principal.functions.invoke(funcao, { body: corpo }),
  erro: (codigo, extra) => new ErroLeitura(codigo, extra),
});

/** A página (a 1ª é 1) como o servidor pede: inteira e ≥ 1 (o intervalo() da tela fazia o mesmo com o que chegava). */
export const paginaDoServidor = (pagina: number): number => (Number.isFinite(pagina) ? Math.max(1, Math.floor(pagina)) : 1);

/** Uma leitura do Financeiro, no lote da volta (1 chamada por tela). Erro → ErroLeitura com o código. */
export function lerFinanceiro(q: ConsultaDoFinanceiro, params?: Record<string, unknown>, opcoes?: OpcoesLeitura): Promise<ResultadoDeLeitura> {
  return leitor(q, params, opcoes);
}
