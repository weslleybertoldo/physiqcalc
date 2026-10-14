// Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4, 12/10/2026) — o módulo das LEITURAS da função financeiro: a ação `ler` (em lote:
// { acao: "ler", itens: [{ q, ...params }] } → { ok: true, itens } na mesma ordem; até 16 itens, erro POR ITEM).
// hml-21c (H-112, 13/10/2026): o módulo passa a ser o MOTOR COMUM (_shared/leitura-servidor.ts) com o catálogo da financeiro
// (_shared/financeiro-leituras.ts → CATALOGO_FINANCEIRO: as consultas + o { ok: false, erro } de propósito das RPCs da conta como o erro do
// item — erroNoValorDaRpc — + o "em aberto OU no período" das cobranças como filtro a mais — filtrosExtras). O que estava aqui — os tipos
// do cliente e do contexto, o aplicarFiltro, o laço, o filtrosDaConsulta e o falhou — era a 2ª cópia do motor (a DUPLICAÇÃO anotada na
// hml-20d, que o H-112 tira). A prova é a diferencial (src/integrations/leituraServidor.test.ts): cada consulta do catálogo do c6e795b no
// módulo de antes (a cópia congelada em src/test/oraculoH112/) × aqui, com o MESMO banco falso → a mesma resposta, os mesmos pedidos ao
// banco e o mesmo log. Sem Storage: nenhuma consulta do Financeiro assina URL (o catálogo não declara `assinar`). Tudo COMO A PESSOA
// (c.comoPessoa — o token de quem chama; nenhuma chave secreta).
// Este arquivo NÃO importa a porta: o contexto é estrutural (o deno check confere no index.ts que o ContextoPessoa encaixa).
import {
  atenderLeitura as atenderNoMotor, type ClienteLeitura, type ContextoLeitura, type RespostaDaLeitura,
} from "../_shared/leitura-servidor.ts";
import { CATALOGO_FINANCEIRO } from "../_shared/financeiro-leituras.ts";

export type { ClienteLeitura, ContextoLeitura, RespostaDaLeitura };

/** A ação `ler` da financeiro: o motor comum com o catálogo dela. */
export function atenderLeitura(c: ContextoLeitura): Promise<RespostaDaLeitura> {
  return atenderNoMotor(c, CATALOGO_FINANCEIRO);
}
