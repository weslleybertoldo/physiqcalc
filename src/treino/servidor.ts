// Physiq hml-21d (H-43 · jeito 2, etapa 3) — a porta da tela para a função treinos do Banco do Treino (supabase/functions/treinos): o molde de
// src/conta/{ler,gravar}.ts, com o cliente do TREINO (src/integrations/supabase/client.ts: a sessão do Treino de quem está logado — a da
// trocar-token, a MESMA que as funções do Treino recebem hoje pelo functions.invoke — vai no Bearer e o schema do ambiente no x-schema; os
// testes que falsificam o cliente do Treino falsificam a função junto — src/test/treinosFalso.ts).
//   · lerTreinos("<consulta>", { ...params }) → { linhas?, valor?, total? } — as consultas do catálogo do servidor
//     (supabase/functions/_shared/treinos-leituras.ts: ConsultaDoTreino); a 4ª instância do lote automático (src/integrations/leituraEmLote.ts):
//     as leituras pedidas na MESMA volta (5 ms) viram 1 chamada (até 16); sem internet → sem_internet na hora; a repetição (1 vez em
//     5xx/429/rede) é a do fetch do cliente (o `ler` da treinos em ACOES_DE_LEITURA de src/integrations/repeticao.ts); o erro vira o MESMO
//     ErroLeitura da nutricao e da conta (src/nutricao/leitura.ts — importado, não duplicado), com o código do servidor;
//   · acaoTreinos("<ação>", { ...corpo }) → { ok: true, … } — 1 chamada só, SEM repetição (o servidor pode ter gravado e só a resposta se
//     perdido); sem internet → sem_internet ANTES de chamar; a rede que cai → rede; o erro vira o MESMO ErroGravacaoConta da conta
//     (src/conta/gravar.ts — importado, não duplicado): o `codigo` da função e a frase fixa do código (a mensagem crua do banco não chega mais
//     à tela — decisão 20); as libs traduzem para o erro delas onde a tela já tinha um (o ErroTreinoPainel do painel, o texto do master).
import { ErroGravacaoConta } from "@/conta/gravar";
import { criarLeitor, type OpcoesLeitura, type ResultadoDeLeitura } from "@/integrations/leituraEmLote";
import { supabase } from "@/integrations/supabase/client";
import { ErroLeitura } from "@/nutricao/leitura";
import type { ConsultaDoTreino } from "../../supabase/functions/_shared/treinos-leituras";
import type { AcaoTreinos } from "../../supabase/functions/_shared/treinos-regras";

export type { AcaoTreinos, ConsultaDoTreino, ResultadoDeLeitura };
export { ErroGravacaoConta, ErroLeitura };

const leitor = criarLeitor({
  funcao: "treinos",
  invocar: (funcao, corpo) => supabase.functions.invoke(funcao, { body: corpo }),
  erro: (codigo, extra) => new ErroLeitura(codigo, extra),
});

/** Uma leitura da treinos, no lote da volta (1 chamada por tela). Erro → ErroLeitura com o código. */
export function lerTreinos(q: ConsultaDoTreino, params?: Record<string, unknown>, opcoes?: OpcoesLeitura): Promise<ResultadoDeLeitura> {
  return leitor(q, params, opcoes);
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
 * Chama UMA ação da treinos; erro vira ErroGravacaoConta com o código da função (a tela mostra a frase fixa). A ação vai por último no
 * corpo: nenhum campo do corpo troca a ação.
 */
export async function acaoTreinos<T = Record<string, unknown>>(acao: AcaoTreinos, corpo: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroGravacaoConta("sem_internet");
  const { data, error } = await supabase.functions.invoke("treinos", { body: { ...corpo, acao } });
  if (error) {
    const c = await corpoDoErro(error);
    const codigo = typeof c?.erro === "string" ? c.erro : ehFalhaDeRede(error) ? "rede" : "erro_interno";
    throw new ErroGravacaoConta(codigo, c ?? {});
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) throw new ErroGravacaoConta(typeof d.erro === "string" ? d.erro : "erro_interno", d);
  return d as T;
}

/** O código de um erro da treinos (leitura ou gravação; a rede que caiu é "sem_internet" para as telas, o PADRÃO da hml-20a). */
export function codigoDoTreino(e: unknown): string {
  const codigo = e instanceof ErroGravacaoConta || e instanceof ErroLeitura ? e.codigo : "erro_interno";
  return codigo === "rede" ? "sem_internet" : codigo;
}
