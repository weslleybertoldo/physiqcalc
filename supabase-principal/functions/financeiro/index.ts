// Physiq hml-19d (H-41 · jeito 2, 11/10/2026) — financeiro (banco principal): as GRAVAÇÕES do Financeiro (Painel › Financeiro e o
// Financeiro do aluno) saem do navegador e passam por aqui, com a SESSÃO de quem chama (_shared/porta-pessoa.ts: cliente "como a pessoa",
// nenhuma chave secreta). O RLS de hoje continua decidindo quem grava (2ª camada); a função confere a FORMA
// (_shared/financeiro-gravar-regras.ts): a ação numa lista fechada, as colunas de cada ação com tipo e tamanho, o dono
// (nutricionista_id = quem chama, nunca do corpo) e a tradução do erro do banco.
// hml-20d (H-42 · jeito 2, etapa 2, parte 4): as LEITURAS do Financeiro (as 6 abas, o Financeiro do aluno, a parte do Financeiro do
// Dashboard e o resumo leve do app do aluno) também passam por aqui, pela ação `ler` (em lote: { acao: "ler", itens: [{ q, ...params }] }
// → { ok: true, itens: [...] } na mesma ordem; até 16 itens, erro POR ITEM), com o catálogo fechado (_shared/financeiro-leituras.ts) e o
// motor puro da nutricao (_shared/leitura-lote.ts) — módulo leituras.ts, como a pessoa. O `ler` é despachado ANTES do acaoDoFinanceiro
// (que só conhece as gravações): as 14 ações de antes não mudam. Quem chama pode ser qualquer pessoa logada (a aluna lê o resumo leve do
// app pela fin_do_aluno), como na nutricao.
//   CRUD          transacao_criar|editar|estornar|excluir, categoria_criar|renomear|excluir, modelo_recibo_criar|editar|excluir:
//                 inserir (.select(volta).single()) · editar (0 linha → 404) · excluir (a Lixeira: deleted_at; 0 linha → 404 — antes a
//                 tela dizia "excluído" quando o RLS recusava calado). O que volta é o MESMO select das libs de hoje (as telas não mudam).
//   sementes      padroes_garantir { conta_id }: o papel da pessoa NA conta (1 leitura, como ela) escolhe o texto do "Recibo padrão" e a
//                 RPC financeiro_garantir_padroes grava as 6 categorias e o modelo, cada conjunto só se ela não tem nenhum vivo, com a
//                 conta e com trava; devolve as 2 listas. A tela chama só quando a lista dela vem vazia.
//   recibos       recibo_emitir (RPC financeiro_emitir_recibo: o recibo + a movimentação ligada + o texto com o número real, tudo ou nada;
//                 a volta relida com o select de hoje) · recibo_excluir (RPC financeiro_excluir_recibo: a Lixeira + a movimentação solta).
//   tags          tags_salvar { paciente_id, tags }: só pacientes.tags, como a pessoa (o gatilho da W-P segura as colunas de cobrança; a
//                 admin-tags do Treino segue chamada pela tela).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
// 200 → { ok: true, ... } (linha · categorias/modelos) · 4xx/5xx → { ok: false, erro }.
// verify_jwt = true. Publicar (vale nos 2 schemas: o schema vem do x-schema):
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions financeiro true
// Precisa no banco, no schema do pedido: a migration 20261011120000_hml19d_financeiro_atomicas.sql (as 3 RPCs; sem ela só as sementes e
// o emitir/excluir recibo falham — o CRUD usa as tabelas e as policies de hoje). As leituras (hml-20d) não precisam de migration: as RPCs
// de leitura (hml-14b/14d, W6), as policies de leitura e os grants de hoje — cada pessoa lê o que já lia, agora pela função.
import { json, servirComoPessoa, type ContextoPessoa } from "../_shared/porta-pessoa.ts";
import {
  CATEGORIAS_PADRAO, VOLTA_RECIBO, acaoDoFinanceiro, erroDoFinanceiro, lerPadroes, lerReciboEmitir, lerReciboExcluir, lerTags, modeloPadraoDoRecibo,
  montarGravacaoFinanceiro, statusDoErroFinanceiro, type AcaoFinanceiroGravar,
} from "../_shared/financeiro-gravar-regras.ts";
import { atenderLeitura } from "./leituras.ts";

type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

/** Recusa esperada (dado fora da forma…): só o código ao log, como aviso. */
function recusa(c: ContextoPessoa, acao: string, erro: string, campo?: string): Resposta {
  c.log.aviso({ codigo: erro, schema: c.schema, acao, resultado: campo ?? null });
  return { ok: false, erro };
}

/** 0 linha: não existe, está na Lixeira ou o RLS não deixa (a mesma resposta nos 3 casos). */
function naoEncontrado(c: ContextoPessoa, acao: string, ref: string | null): Resposta {
  c.log.aviso({ codigo: "nao_encontrado", schema: c.schema, acao, ref });
  return { ok: false, erro: "nao_encontrado" };
}

/** O erro do banco (ou da RPC) vira o código da resposta; o inesperado avisa o Weslley (log.excecao: só nome, código e mensagem limpa). */
function falha(c: ContextoPessoa, acao: string, e: { code?: unknown; message?: unknown }): Resposta {
  const t = erroDoFinanceiro(acao, e);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof e.code === "string" ? e.code : null });
  return { ok: false, erro: t.erro };
}

function atender(c: ContextoPessoa, acao: AcaoFinanceiroGravar): Promise<Resposta> {
  switch (acao) {
    case "padroes_garantir":
      return garantirPadroes(c);
    case "recibo_emitir":
      return emitirRecibo(c);
    case "recibo_excluir":
      return excluirRecibo(c);
    case "tags_salvar":
      return salvarTags(c);
    default:
      return gravar(c, acao);
  }
}

// ───────────────────────── CRUD declarativo ─────────────────────────
async function gravar(c: ContextoPessoa, acao: AcaoFinanceiroGravar): Promise<Resposta> {
  const g = montarGravacaoFinanceiro(acao, c.corpo, c.userId);
  if (!g.ok) return recusa(c, acao, g.erro, g.campo);
  switch (g.operacao) {
    case "inserir": {
      const { data, error } = await c.comoPessoa.from(g.tabela).insert(g.valores).select(g.volta).single();
      if (error) return falha(c, acao, error);
      return { ok: true, linha: data };
    }
    case "editar": {
      const { data, error } = await c.comoPessoa.from(g.tabela).update(g.valores).eq("id", g.id).select(g.volta);
      if (error) return falha(c, acao, error);
      if (!data?.length) return naoEncontrado(c, acao, g.id);
      return { ok: true, linha: data[0] };
    }
    case "excluir_suave": {
      const { data, error } = await c.comoPessoa.from(g.tabela).update(g.valores).eq("id", g.id).select("id");
      if (error) return falha(c, acao, error);
      if (!data?.length) return naoEncontrado(c, acao, g.id);
      return { ok: true };
    }
  }
}

// ───────────────────────── as sementes do 1º acesso ─────────────────────────
async function garantirPadroes(c: ContextoPessoa): Promise<Resposta> {
  const acao = "padroes_garantir";
  const p = lerPadroes(c.corpo);
  if (!p.ok) return recusa(c, acao, p.erro, p.campo);
  // o papel da pessoa NA conta escolhe o texto do modelo (a nutricionista recebe o do Nutri): 1 leitura simples, como ela — quem não é
  // membro sai sem papel e a RPC recusa (sem_acesso)
  const { data: membro, error: em } = await c.comoPessoa.from("conta_membros").select("papeis").eq("conta_id", p.contaId).eq("user_id", c.userId)
    .eq("status", "ativo").maybeSingle();
  if (em) return falha(c, acao, em);
  const papeis = Array.isArray((membro as { papeis?: unknown } | null)?.papeis) ? (membro as { papeis: string[] }).papeis : [];
  const { data, error } = await c.comoPessoa.rpc("financeiro_garantir_padroes", {
    p_conta: p.contaId, p_categorias: CATEGORIAS_PADRAO, p_modelo: modeloPadraoDoRecibo(papeis),
  });
  if (error) return falha(c, acao, error);
  const r = (data ?? {}) as { criados?: { categorias?: unknown; modelos?: unknown }; categorias?: unknown; modelos?: unknown };
  const criados = { categorias: Number(r.criados?.categorias) || 0, modelos: Number(r.criados?.modelos) || 0 };
  if (criados.categorias + criados.modelos > 0) c.log.info({ codigo: "padroes_criados", schema: c.schema, acao, n: criados.categorias + criados.modelos });
  return { ok: true, criados, categorias: Array.isArray(r.categorias) ? r.categorias : [], modelos: Array.isArray(r.modelos) ? r.modelos : [] };
}

// ───────────────────────── recibos ─────────────────────────
/** O recibo + a movimentação ligada + o texto com o número real numa chamada; a volta relida com o MESMO select da tela de hoje. */
async function emitirRecibo(c: ContextoPessoa): Promise<Resposta> {
  const acao = "recibo_emitir";
  const r = lerReciboEmitir(c.corpo);
  if (!r.ok) return recusa(c, acao, r.erro, r.campo);
  const { data: id, error } = await c.comoPessoa.rpc("financeiro_emitir_recibo", { p_recibo: r.recibo });
  if (error) return falha(c, acao, error);
  if (typeof id !== "string" || !id) return naoEncontrado(c, acao, null);
  const { data: linha, error: el } = await c.comoPessoa.from("recibos").select(VOLTA_RECIBO).eq("id", id).maybeSingle();
  if (el) return falha(c, acao, el);
  if (!linha) return naoEncontrado(c, acao, id);
  return { ok: true, linha };
}

async function excluirRecibo(c: ContextoPessoa): Promise<Resposta> {
  const acao = "recibo_excluir";
  const r = lerReciboExcluir(c.corpo);
  if (!r.ok) return recusa(c, acao, r.erro, r.campo);
  const { data, error } = await c.comoPessoa.rpc("financeiro_excluir_recibo", { p_recibo: r.id });
  if (error) return falha(c, acao, error);
  return { ok: true, movimentacoes: Number(data) || 0 };
}

// ───────────────────────── as tags do aluno ─────────────────────────
async function salvarTags(c: ContextoPessoa): Promise<Resposta> {
  const acao = "tags_salvar";
  const t = lerTags(c.corpo);
  if (!t.ok) return recusa(c, acao, t.erro, t.campo);
  const { data, error } = await c.comoPessoa.from("pacientes").update({ tags: t.tags }).eq("id", t.pacienteId).select("id");
  if (error) return falha(c, acao, error);
  if (!data?.length) return naoEncontrado(c, acao, t.pacienteId);
  return { ok: true };
}

servirComoPessoa("financeiro", { freio: 240 }, async (c) => {
  // hml-20d: o `ler` vai ao módulo das leituras ANTES da lista das gravações (o acaoDoFinanceiro não o conhece; as 14 de antes seguem o
  // caminho de antes)
  if (c.corpo.acao === "ler") {
    const r = await atenderLeitura(c);
    return json(r, r.ok ? 200 : statusDoErroFinanceiro(r.erro), c.origin);
  }
  const acao = acaoDoFinanceiro(c.corpo.acao);
  if (!acao) {
    c.log.aviso({ codigo: "acao_invalida", schema: c.schema });
    return json({ ok: false, erro: "acao_invalida" }, 400, c.origin);
  }
  const r = await atender(c, acao);
  return json(r, r.ok ? 200 : statusDoErroFinanceiro(r.erro), c.origin);
});
