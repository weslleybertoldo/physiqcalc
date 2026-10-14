// Physiq hml-19a/19b (H-41 · H-81 · jeito 2, 11/10/2026) — nutricao (banco principal): as GRAVAÇÕES da nutrição saem do navegador e
// passam por aqui, com a SESSÃO de quem chama (_shared/porta-pessoa.ts: cliente "como a pessoa", nenhuma chave secreta). O RLS de
// hoje continua decidindo quem grava (2ª camada); a função confere a FORMA (_shared/nutricao-regras.ts): a ação numa lista fechada,
// as colunas de cada ação com tipo e tamanho, o dono (nutricionista_id = quem chama, nunca do corpo) e a tradução do erro do banco
// (0 linha → 404 nao_encontrado · 42501 → 403 sem_acesso · 23505 → 409 conflito · dado ruim → 400 dados_invalidos · o resto → 500
// erro_interno + aviso).
// hml-20a (H-42 · jeito 2, etapa 2): as LEITURAS de saúde também passam por aqui, pela ação `ler` (em lote: { acao: "ler", itens: [{ q,
// ...params }] } → { ok: true, itens: [...] } na mesma ordem; até 16 itens, erro POR ITEM), com o catálogo fechado de consultas
// (_shared/nutricao-leituras.ts) e o motor puro (_shared/leitura-lote.ts) — módulo leituras.ts, como a pessoa. As ações de antes não mudam.
// Módulos por área: prontuario.ts (hml-19a — as 18 tabelas do Prontuário, o bucket de anexos pelo link assinado e os padrões do 1º
// acesso, H-81); dieta.ts (hml-19b — as 19 tabelas da Dieta e das Dietas, as RPCs atômicas e os padrões de Manipulados, Metas e
// Orientações); aluno.ts (hml-19b — o app do aluno: marcar refeição/meta e a foto do diário pelo link assinado); avaliacao.ts (hml-19c —
// a Avaliação do perfil do aluno: a antropometria, as fotos de evolução pelo link assinado e o aviso "avaliação nova"); leituras.ts
// (hml-20a — a ação `ler`); preconsulta.ts (hml-20c — as 5 gravações da Pré-consulta, H-102: o formulário com o slug nascido aqui e a
// resposta ligada/importada/excluída). O despacho (moduloDoPedido, em _shared/nutricao-regras.ts) é a lista fechada dos 6.
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
// 200 → { ok: true, ... } (linha · linhas · lista · registro/criado · bucket/caminho/token · itens, no `ler`) · 4xx/5xx → { ok: false, erro }.
// verify_jwt = true. Publicar (vale nos 2 schemas: o schema vem do x-schema):
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions nutricao true
// Precisa no banco, no schema do pedido: a migration 20261011100000_hml19a_nutricao_padroes.sql (a RPC nutricao_garantir_padroes;
// sem ela só o padroes_garantir falha — as outras ações usam as tabelas e as policies de hoje) e a 20261011110000_hml19b_dieta_atomicas.sql
// (as 7 RPCs dieta_*; sem ela só as ações tudo-ou-nada da Dieta falham). A Avaliação (hml-19c) não precisa de migration: as 2 tabelas,
// as policies, o bucket evolucao e a RPC aluno_avisar_avaliacao de hoje. As leituras (hml-20a) também não: as RPCs de leitura, as policies
// de leitura (tabelas e buckets) e os grants de hoje — o aluno lê o que já lia, agora pela função.
// hml-21c (H-112 · H-109, 13/10/2026): o `ler` passa ao motor comum (leituras.ts = _shared/leitura-servidor.ts + CATALOGO_NUTRICAO, com os ★
// da Ferramentas › Modelos por acréscimo) e o token do `ler` é conferido pelo JWKS do principal na porta (jwtLeitura: "jwks", como a conta),
// sem a ida ao Auth; as gravações seguem no getUser. Sem migration.
import { json, servirComoPessoa, type ContextoPessoa } from "../_shared/porta-pessoa.ts";
import { moduloDoPedido, statusDoErro, type PedidoNutricao } from "../_shared/nutricao-regras.ts";
import { atenderAluno } from "./aluno.ts";
import { atenderAvaliacao } from "./avaliacao.ts";
import { atenderDieta } from "./dieta.ts";
import { atenderLeitura } from "./leituras.ts";
import { atenderPreconsulta } from "./preconsulta.ts";
import { atenderProntuario } from "./prontuario.ts";

/** O módulo da área atende a ação (cada um devolve { ok: true, … } ou { ok: false, erro }). */
function atender(c: ContextoPessoa, pedido: PedidoNutricao) {
  switch (pedido.modulo) {
    case "prontuario":
      return atenderProntuario(c, pedido.acao);
    case "dieta":
      return atenderDieta(c, pedido.acao);
    case "aluno":
      return atenderAluno(c, pedido.acao);
    case "avaliacao":
      return atenderAvaliacao(c, pedido.acao);
    case "leitura":
      return atenderLeitura(c);
    case "preconsulta":
      return atenderPreconsulta(c, pedido.acao);
  }
}

servirComoPessoa("nutricao", { freio: 240, jwtLeitura: "jwks" }, async (c) => {
  const pedido = moduloDoPedido(c.corpo);
  if (!pedido) {
    c.log.aviso({ codigo: "acao_invalida", schema: c.schema });
    return json({ ok: false, erro: "acao_invalida" }, 400, c.origin);
  }
  const r = await atender(c, pedido);
  return json(r, r.ok ? 200 : statusDoErro(r.erro), c.origin);
});
