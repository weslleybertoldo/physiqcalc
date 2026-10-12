// Physiq hml-20c (H-102 🟡 · jeito 2, decisão 8 da spec hml-20, 12/10/2026) — o módulo da PRÉ-CONSULTA da função nutricao (Painel ›
// Pré-consulta): as 5 gravações que a tela fazia direto (src/painel/preconsulta/dados.ts). As ações estão em _shared/nutricao-regras.ts →
// ACOES_PRECONSULTA. Tudo com o cliente "como a pessoa" (c.comoPessoa): o RLS de hoje decide (as policies da W21: só membro ativo mexe
// no formulário da conta; quem cria é o autor; a resposta pela regra clínica) e os gatilhos da W21 seguem guardando; aqui a forma, o dono
// e a tradução do erro.
//   formulário  _criar: a conta do corpo, o dono (nutricionista_id) = quem chama e o slug NASCE AQUI (crypto, o alfabeto e o tamanho da
//               tela), de novo no conflito (23505 — o índice único do slug), até 5 vezes; volta a linha · _editar (0 linha → 404) ·
//               _excluir (a Lixeira: deleted_at; 0 linha → 404)
//   resposta    _ligar (o aluno — null desliga — e/ou a importação, com o importada_em do servidor; volta a linha com o formulário
//               embutido) · _excluir (a Lixeira; 0 linha → 404)
// Os códigos dos gatilhos da W21 (aluno_invisivel, resposta_imutavel, formulario_imutavel) voltam como eles (a tela tem a frase); o
// resto do erro do banco, a tradução de sempre (42501 → sem_acesso; dado ruim → dados_invalidos; o inesperado → erro_interno + aviso).
// Como o leituras.ts (hml-20a), este arquivo NÃO importa a porta (_shared/porta-pessoa.ts traz o supabase-js do esm.sh e o Deno): o
// contexto é o pedaço do ContextoPessoa que ele usa (ContextoPreconsulta, estrutural — o deno check confere no index.ts que o da porta
// encaixa) e a resposta/recusa/tradução são as do comum.ts, aqui, com a mesma regra (erroDaRpc). Assim o Vitest roda o módulo de verdade
// com um cliente falso (src/nutricao/preconsultaServidor.test.ts) e o tsc do app não puxa o Deno.
import {
  ERROS_DA_PRECONSULTA, SLUG_PRECONSULTA_TAMANHO, SLUG_PRECONSULTA_TENTATIVAS, erroDaRpc, montarGravacaoPreconsulta, slugDaPreconsulta,
  type AcaoPreconsulta,
} from "../_shared/nutricao-regras.ts";
import type { Log } from "../_shared/log.ts";

type Resultado = { data: unknown; error: { code?: string; message?: string } | null };
/** O encadeamento que o módulo usa (o PostgrestQueryBuilder do supabase-js encaixa). */
interface GravacaoNaTabela {
  insert(valores: Record<string, unknown>): { select(colunas: string): { single(): PromiseLike<Resultado> } };
  update(valores: Record<string, unknown>): { eq(coluna: string, valor: unknown): { select(colunas: string): PromiseLike<Resultado> } };
}
/** O pedaço do ContextoPessoa (_shared/porta-pessoa.ts) que o módulo usa. */
export interface ContextoPreconsulta {
  schema: "public" | "staging";
  corpo: Record<string, unknown>;
  /** quem chama (o user do token, conferido no Auth pela porta) — o dono do formulário */
  userId: string;
  comoPessoa: { from(tabela: string): GravacaoNaTabela };
  log: Log;
}
export type RespostaPreconsulta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

export async function atenderPreconsulta(c: ContextoPreconsulta, acao: AcaoPreconsulta): Promise<RespostaPreconsulta> {
  const g = montarGravacaoPreconsulta(acao, c.corpo, c.userId);
  if (g.ok === false) return recusa(c, acao, g.erro, g.campo);
  switch (g.operacao) {
    case "inserir": {
      // o slug do link público nasce aqui; o conflito (23505) só pode ser dele (o único índice único) → outro, até 5 vezes
      for (let tentativa = 1; tentativa <= SLUG_PRECONSULTA_TENTATIVAS; tentativa += 1) {
        const slug = slugDaPreconsulta(crypto.getRandomValues(new Uint8Array(SLUG_PRECONSULTA_TAMANHO)));
        const { data, error } = await c.comoPessoa.from(g.tabela).insert({ ...g.valores, slug }).select(g.volta).single();
        if (!error) return { ok: true, linha: data };
        if (error.code !== "23505" || tentativa === SLUG_PRECONSULTA_TENTATIVAS) return falha(c, acao, error);
      }
      return { ok: false, erro: "conflito" };
    }
    case "editar": {
      const { data, error } = await c.comoPessoa.from(g.tabela).update(g.valores).eq("id", g.id).select(g.volta);
      if (error) return falha(c, acao, error);
      const linhas = Array.isArray(data) ? data : [];
      if (!linhas.length) return naoEncontrado(c, acao, g.id);
      return { ok: true, linha: linhas[0] };
    }
    case "excluir_suave": {
      const { data, error } = await c.comoPessoa.from(g.tabela).update(g.valores).eq("id", g.id).select("id");
      if (error) return falha(c, acao, error);
      if (!(Array.isArray(data) && data.length)) return naoEncontrado(c, acao, g.id);
      return { ok: true };
    }
  }
}

/** Recusa esperada (dado fora da forma): só o código ao log, como aviso (o recusa do comum.ts). */
function recusa(c: ContextoPreconsulta, acao: string, erro: string, campo?: string): RespostaPreconsulta {
  c.log.aviso({ codigo: erro, schema: c.schema, acao, resultado: campo ?? null });
  return { ok: false, erro };
}

/** 0 linha: o id não existe ou o RLS não deixa (a outra conta) — a mesma resposta nos 2 casos (o naoEncontrado do comum.ts). O que já está
 *  na Lixeira NÃO é 0 linha: o update é pelo id, sem o filtro da Lixeira, como a lib de hoje — o excluir de novo volta ok e segue lá. */
function naoEncontrado(c: ContextoPreconsulta, acao: string, ref: string | null): RespostaPreconsulta {
  c.log.aviso({ codigo: "nao_encontrado", schema: c.schema, acao, ref });
  return { ok: false, erro: "nao_encontrado" };
}

/** O erro do banco vira o código (os dos gatilhos da W21 como eles); o inesperado avisa o Weslley (o falha do comum.ts). */
function falha(c: ContextoPreconsulta, acao: string, e: { code?: unknown; message?: unknown }): RespostaPreconsulta {
  const t = erroDaRpc(e, ERROS_DA_PRECONSULTA);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof e.code === "string" ? e.code : null });
  return { ok: false, erro: t.erro };
}
