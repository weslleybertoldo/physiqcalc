// Physiq hml-19a (H-41 · H-81 · jeito 2, 11/10/2026) — nutricao (banco principal): as GRAVAÇÕES da nutrição saem do navegador e
// passam por aqui, com a SESSÃO de quem chama (_shared/porta-pessoa.ts: cliente "como a pessoa", nenhuma chave secreta). O RLS de
// hoje continua decidindo quem grava (2ª camada); a função confere a FORMA (_shared/nutricao-regras.ts): a ação numa lista fechada,
// as colunas de cada ação com tipo e tamanho, o dono (nutricionista_id = quem chama, nunca do corpo) e a tradução do erro do banco
// (0 linha → 404 nao_encontrado · 42501 → 403 sem_acesso · 23505 → 409 conflito · dado ruim → 400 dados_invalidos · o resto → 500
// erro_interno + aviso). As leituras seguem pela tela (H-42 = etapa 2 do jeito 2).
// Módulos por área: prontuario.ts (hml-19a — as 18 tabelas do Prontuário, o bucket de anexos pelo link assinado e os padrões do 1º
// acesso, H-81); a Dieta, o app do aluno (hml-19b) e a Avaliação (hml-19c) entram como módulos novos, na mesma função.
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
// 200 → { ok: true, ... } (linha · linhas · lista · registro/criado · bucket/caminho/token) · 4xx/5xx → { ok: false, erro }.
// verify_jwt = true. Publicar (vale nos 2 schemas: o schema vem do x-schema):
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions nutricao true
// Precisa no banco, no schema do pedido: a migration 20261011100000_hml19a_nutricao_padroes.sql (a RPC nutricao_garantir_padroes;
// sem ela só o padroes_garantir falha — as outras ações usam as tabelas e as policies de hoje).
import { json, servirComoPessoa } from "../_shared/porta-pessoa.ts";
import { acaoDoPedido, statusDoErro } from "../_shared/nutricao-regras.ts";
import { atenderProntuario } from "./prontuario.ts";

servirComoPessoa("nutricao", { freio: 240 }, async (c) => {
  const acao = acaoDoPedido(c.corpo.acao);
  if (!acao) {
    c.log.aviso({ codigo: "acao_invalida", schema: c.schema });
    return json({ ok: false, erro: "acao_invalida" }, 400, c.origin);
  }
  const r = await atenderProntuario(c, acao);
  return json(r, r.ok ? 200 : statusDoErro(r.erro), c.origin);
});
