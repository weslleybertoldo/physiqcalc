// Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — o módulo das LEITURAS da função nutricao: a ação `ler` (em lote:
// { acao: "ler", itens: [{ q, ...params }] } → { ok: true, itens } na mesma ordem; até 16 itens, erro POR ITEM).
// hml-21c (H-112, 13/10/2026): o módulo passa a ser o MOTOR COMUM (_shared/leitura-servidor.ts) com o catálogo da nutricao
// (_shared/nutricao-leituras.ts → CATALOGO_NUTRICAO: as consultas + o bucket do ambiente). O que estava aqui — os tipos do cliente e do
// contexto, o atenderLeitura, o aplicarFiltro, o laço, o HEAD, o total por dia, as URLs assinadas e o falhou — era uma cópia do motor (a
// duplicação que o H-112 tira). A prova é a diferencial (src/integrations/leituraServidor.test.ts): cada consulta do catálogo do c6e795b no
// módulo de antes (a cópia congelada em src/test/oraculoH112/) × aqui, com o MESMO banco falso → a mesma resposta, os mesmos pedidos ao
// banco/Storage e o mesmo log. Tudo segue COMO A PESSOA (c.comoPessoa — o token de quem chama; nenhuma chave secreta): o RLS de hoje decide
// quem vê e o motor confere a forma.
// Este arquivo NÃO importa a porta (_shared/porta-pessoa.ts traz o supabase-js do esm.sh e o Deno): o contexto é estrutural (o deno check
// confere no index.ts que o ContextoPessoa encaixa). Assim o Vitest roda o módulo com um cliente falso e o tsc do app não puxa o Deno.
import {
  atenderLeitura as atenderNoMotor, type ClienteLeitura, type ContextoLeitura, type RespostaDaLeitura,
} from "../_shared/leitura-servidor.ts";
import { CATALOGO_NUTRICAO } from "../_shared/nutricao-leituras.ts";

export type { ClienteLeitura, ContextoLeitura, RespostaDaLeitura };

/** A ação `ler` da nutricao: o motor comum com o catálogo dela. */
export function atenderLeitura(c: ContextoLeitura): Promise<RespostaDaLeitura> {
  return atenderNoMotor(c, CATALOGO_NUTRICAO);
}
