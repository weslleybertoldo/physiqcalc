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
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import {
  ERROS_DA_PRECONSULTA, SLUG_PRECONSULTA_TAMANHO, SLUG_PRECONSULTA_TENTATIVAS, montarGravacaoPreconsulta, slugDaPreconsulta, type AcaoPreconsulta,
} from "../_shared/nutricao-regras.ts";
import { falha, naoEncontrado, recusa, type Resposta } from "./comum.ts";

export async function atenderPreconsulta(c: ContextoPessoa, acao: AcaoPreconsulta): Promise<Resposta> {
  const g = montarGravacaoPreconsulta(acao, c.corpo, c.userId);
  if (!g.ok) return recusa(c, acao, g.erro, g.campo);
  switch (g.operacao) {
    case "inserir": {
      // o slug do link público nasce aqui; o conflito (23505) só pode ser dele (o único índice único) → outro, até 5 vezes
      for (let tentativa = 1; tentativa <= SLUG_PRECONSULTA_TENTATIVAS; tentativa += 1) {
        const slug = slugDaPreconsulta(crypto.getRandomValues(new Uint8Array(SLUG_PRECONSULTA_TAMANHO)));
        const { data, error } = await c.comoPessoa.from(g.tabela).insert({ ...g.valores, slug }).select(g.volta).single();
        if (!error) return { ok: true, linha: data };
        if (error.code !== "23505" || tentativa === SLUG_PRECONSULTA_TENTATIVAS) return falha(c, acao, error, ERROS_DA_PRECONSULTA);
      }
      return { ok: false, erro: "conflito" };
    }
    case "editar": {
      const { data, error } = await c.comoPessoa.from(g.tabela).update(g.valores).eq("id", g.id).select(g.volta);
      if (error) return falha(c, acao, error, ERROS_DA_PRECONSULTA);
      if (!data?.length) return naoEncontrado(c, acao, g.id);
      return { ok: true, linha: data[0] };
    }
    case "excluir_suave": {
      const { data, error } = await c.comoPessoa.from(g.tabela).update(g.valores).eq("id", g.id).select("id");
      if (error) return falha(c, acao, error, ERROS_DA_PRECONSULTA);
      if (!data?.length) return naoEncontrado(c, acao, g.id);
      return { ok: true };
    }
  }
}
