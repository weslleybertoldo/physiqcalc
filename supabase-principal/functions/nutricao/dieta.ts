// Physiq hml-19b (H-41 · jeito 2, 11/10/2026) — o módulo da DIETA da função nutricao: Painel › Aluno › Dieta (plano, refeições, itens,
// acompanhamento, cálculo energético, suplementos, manipulados, metas, orientações) e Painel › Dietas (alimentos, receitas, grupos,
// diário). As ações estão em _shared/nutricao-regras.ts → ACOES_DIETA. Tudo com o cliente "como a pessoa" (c.comoPessoa): o RLS de
// hoje decide; aqui a forma, o dono e a tradução do erro.
//   CRUD          inserir (.select(volta).single()) · inserir_lote (os itens "Da receita") · editar (0 linha → 404) · excluir_suave
//                 (deleted_at; 0 linha → 404) · excluir (o DELETE físico de refeição e item, como hoje; 0 linha → 404). `vivos` filtra a
//                 Lixeira onde a lib de hoje já filtrava (receita, grupo, alimento do painel).
//   tudo ou nada  as RPCs INVOKER da migration 20261011110000_hml19b_dieta_atomicas.sql: plano_criar (dieta_criar_plano), plano_duplicar
//                 (dieta_duplicar_plano + a leitura do plano pela plano_alimentar da hml-17: a tela recebe o plano montado), receita_salvar
//                 (dieta_salvar_receita + a releitura com os ingredientes), alimento_salvar (dieta_salvar_alimento + a releitura com as
//                 medidas), dieta_ordenar, grupo_receita_excluir (dieta_excluir_grupo_receita) e plano_copiar_semana (dieta_copiar_semana).
//   registro      registro_diario_salvar: o vivo do dia vira edição; sem ele, insere; a corrida (23505 do índice único PARCIAL — o
//                 on_conflict do PostgREST não acha índice parcial) relê e edita. 1 chamada da tela no lugar de 2 a 4.
//   diário        diario_reagir (a reação com o "agora" do servidor) e diario_excluir (a linha à Lixeira e DEPOIS a foto; falhou o remove
//                 → log arquivo_orfao, sem o caminho). O caminho da foto vem da linha, nunca do corpo.
//   padrões       padroes_garantir { secao: formula | meta | orientacao }: a RPC nutricao_garantir_padroes da 19a e a lista da seção — a
//                 tela chama 1 vez por abertura (H-81). As 3 seções do Prontuário seguem no prontuario.ts.
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import {
  ERROS_DAS_RPCS_DA_DIETA, PADROES_DIETA, VOLTA_ALIMENTO, VOLTA_RECEITA, bucketDoDiario, ehUuid, lerAlimento, lerCopiarSemana, lerDuplicarPlano,
  lerOrdenar, lerPlanoNovo, lerReacao, lerReceita, lerRegistroDiario, montarGravacaoDieta, secaoDoPadraoDaDieta, type AcaoDieta,
} from "../_shared/nutricao-regras.ts";
import { itensPadraoDaDieta } from "../_shared/nutricao-padroes.ts";
import { falha, naoEncontrado, recusa, removerArquivo, type Resposta } from "./comum.ts";

export async function atenderDieta(c: ContextoPessoa, acao: AcaoDieta | "padroes_garantir"): Promise<Resposta> {
  switch (acao) {
    case "padroes_garantir":
      return await garantirPadroes(c);
    case "plano_criar":
      return await criarPlano(c);
    case "plano_duplicar":
      return await duplicarPlano(c);
    case "plano_copiar_semana":
      return await copiarSemana(c);
    case "dieta_ordenar":
      return await ordenar(c);
    case "receita_salvar":
      return await salvarReceita(c);
    case "alimento_salvar":
      return await salvarAlimento(c);
    case "grupo_receita_excluir":
      return await excluirGrupo(c);
    case "registro_diario_salvar":
      return await salvarRegistroDiario(c);
    case "diario_reagir":
      return await reagir(c);
    case "diario_excluir":
      return await excluirFoto(c);
    default:
      return await gravar(c, acao);
  }
}

// ───────────────────────── CRUD declarativo ─────────────────────────
async function gravar(c: ContextoPessoa, acao: AcaoDieta): Promise<Resposta> {
  const g = montarGravacaoDieta(acao, c.corpo, c.userId);
  if (!g.ok) return recusa(c, acao, g.erro, g.campo);
  switch (g.operacao) {
    case "inserir": {
      const { data, error } = await c.comoPessoa.from(g.tabela).insert(g.valores).select(g.volta).single();
      if (error) return falha(c, acao, error);
      return { ok: true, linha: data };
    }
    case "inserir_lote": {
      const { data, error } = await c.comoPessoa.from(g.tabela).insert(g.linhas).select(g.volta);
      if (error) return falha(c, acao, error);
      return { ok: true, linhas: data ?? [] };
    }
    case "editar": {
      const base = c.comoPessoa.from(g.tabela).update(g.valores).eq("id", g.id);
      const { data, error } = await (g.vivos ? base.is("deleted_at", null) : base).select(g.volta);
      if (error) return falha(c, acao, error);
      if (!data?.length) return naoEncontrado(c, acao, g.id);
      return { ok: true, linha: data[0] };
    }
    case "excluir_suave": {
      const base = c.comoPessoa.from(g.tabela).update(g.valores).eq("id", g.id);
      const { data, error } = await (g.vivos ? base.is("deleted_at", null) : base).select("id");
      if (error) return falha(c, acao, error);
      if (!data?.length) return naoEncontrado(c, acao, g.id);
      return { ok: true };
    }
    case "excluir": {
      const { data, error } = await c.comoPessoa.from(g.tabela).delete().eq("id", g.id).select("id");
      if (error) return falha(c, acao, error);
      if (!data?.length) return naoEncontrado(c, acao, g.id);
      return { ok: true };
    }
  }
}

// ───────────────────────── tudo ou nada (as RPCs da hml-19b) ─────────────────────────
async function criarPlano(c: ContextoPessoa): Promise<Resposta> {
  const acao = "plano_criar";
  const p = lerPlanoNovo(c.corpo);
  if (!p.ok) return recusa(c, acao, p.erro, p.campo);
  const { data, error } = await c.comoPessoa.rpc("dieta_criar_plano", { p_paciente: p.pacienteId, p_plano: p.plano, p_refeicoes: p.refeicoes });
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_DIETA);
  const r = (data ?? {}) as { plano?: unknown; refeicoes?: unknown };
  return { ok: true, plano: r.plano ?? null, refeicoes: Array.isArray(r.refeicoes) ? r.refeicoes : [] };
}

/** A cópia (o dono é quem chama) e o plano montado pela plano_alimentar (hml-17): a tela troca para ele sem outro pedido. */
async function duplicarPlano(c: ContextoPessoa): Promise<Resposta> {
  const acao = "plano_duplicar";
  const d = lerDuplicarPlano(c.corpo);
  if (!d.ok) return recusa(c, acao, d.erro, d.campo);
  const { data: novo, error } = await c.comoPessoa.rpc("dieta_duplicar_plano", { p_plano: d.planoId, p_titulo: d.titulo, p_paciente: d.pacienteId });
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_DIETA);
  if (!ehUuid(novo)) return naoEncontrado(c, acao, d.planoId);
  const { data: plano, error: el } = await c.comoPessoa.rpc("plano_alimentar", { p_plano: novo });
  if (el) return falha(c, acao, el);
  if (!plano || typeof plano !== "object") return naoEncontrado(c, acao, novo);
  return { ok: true, plano };
}

async function copiarSemana(c: ContextoPessoa): Promise<Resposta> {
  const acao = "plano_copiar_semana";
  const s = lerCopiarSemana(c.corpo);
  if (!s.ok) return recusa(c, acao, s.erro, s.campo);
  const { data, error } = await c.comoPessoa.rpc("dieta_copiar_semana", { p_para_todos: s.paraTodos, p_para_apagar: s.paraApagar });
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_DIETA);
  const r = (data ?? {}) as { atualizadas?: unknown; apagadas?: unknown };
  return { ok: true, atualizadas: Number(r.atualizadas) || 0, apagadas: Number(r.apagadas) || 0 };
}

async function ordenar(c: ContextoPessoa): Promise<Resposta> {
  const acao = "dieta_ordenar";
  const o = lerOrdenar(c.corpo);
  if (!o.ok) return recusa(c, acao, o.erro, o.campo);
  const { data, error } = await c.comoPessoa.rpc("dieta_ordenar", { p_tabela: o.tabela, p_ids: o.ids, p_ordens: o.ordens });
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_DIETA);
  return { ok: true, n: Number(data) || 0 };
}

/** A receita gravada e relida com os ingredientes (o MESMO select da tela de hoje). */
async function salvarReceita(c: ContextoPessoa): Promise<Resposta> {
  const acao = "receita_salvar";
  const r = lerReceita(c.corpo);
  if (!r.ok) return recusa(c, acao, r.erro, r.campo);
  const { data: id, error } = await c.comoPessoa.rpc("dieta_salvar_receita", { p_receita: r.id ? { ...r.receita, id: r.id } : r.receita, p_ingredientes: r.ingredientes });
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_DIETA);
  if (!ehUuid(id)) return naoEncontrado(c, acao, r.id);
  const { data: linha, error: el } = await c.comoPessoa.from("receitas").select(VOLTA_RECEITA).eq("id", id).is("deleted_at", null).maybeSingle();
  if (el) return falha(c, acao, el);
  if (!linha) return naoEncontrado(c, acao, id);
  return { ok: true, linha };
}

/** O alimento gravado e relido com as medidas caseiras. */
async function salvarAlimento(c: ContextoPessoa): Promise<Resposta> {
  const acao = "alimento_salvar";
  const a = lerAlimento(c.corpo);
  if (!a.ok) return recusa(c, acao, a.erro, a.campo);
  const { data: id, error } = await c.comoPessoa.rpc("dieta_salvar_alimento", { p_alimento: a.id ? { ...a.alimento, id: a.id } : a.alimento, p_medidas: a.medidas });
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_DIETA);
  if (!ehUuid(id)) return naoEncontrado(c, acao, a.id);
  const { data: linha, error: el } = await c.comoPessoa.from("alimentos").select(VOLTA_ALIMENTO).eq("id", id).maybeSingle();
  if (el) return falha(c, acao, el);
  if (!linha) return naoEncontrado(c, acao, id);
  return { ok: true, linha };
}

async function excluirGrupo(c: ContextoPessoa): Promise<Resposta> {
  const acao = "grupo_receita_excluir";
  const id = c.corpo.id;
  if (!ehUuid(id)) return recusa(c, acao, "dados_invalidos", "id");
  const { data, error } = await c.comoPessoa.rpc("dieta_excluir_grupo_receita", { p_grupo: id.toLowerCase() });
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_DIETA);
  return { ok: true, receitas: Number(data) || 0 };
}

// ───────────────────────── acompanhamento: o registro do dia ─────────────────────────
const SALVAR_REGISTRO = "registro_diario_salvar";

async function registroVivoDoDia(c: ContextoPessoa, pacienteId: string, dia: string): Promise<{ ok: true; id: string | null } | Resposta> {
  const { data, error } = await c.comoPessoa.from("registros_diarios").select("id").eq("paciente_id", pacienteId).eq("data", dia)
    .is("deleted_at", null).order("created_at", { ascending: false }).limit(1);
  if (error) return falha(c, SALVAR_REGISTRO, error);
  const id = (data ?? [])[0]?.id;
  return { ok: true, id: typeof id === "string" ? id : null };
}

async function editarRegistroDoDia(c: ContextoPessoa, id: string, valores: Record<string, unknown>): Promise<Resposta> {
  const { data, error } = await c.comoPessoa.from("registros_diarios").update(valores).eq("id", id).select("*");
  if (error) return falha(c, SALVAR_REGISTRO, error);
  if (!data?.length) return naoEncontrado(c, SALVAR_REGISTRO, id);
  return { ok: true, registro: data[0], criado: false };
}

async function salvarRegistroDiario(c: ContextoPessoa): Promise<Resposta> {
  const r = lerRegistroDiario(c.corpo, c.userId);
  if (!r.ok) return recusa(c, SALVAR_REGISTRO, r.erro, r.campo);
  const vivo = await registroVivoDoDia(c, r.pacienteId, r.dia);
  if (!vivo.ok) return vivo;
  if (typeof vivo.id === "string") return await editarRegistroDoDia(c, vivo.id, r.valores);
  const { data, error } = await c.comoPessoa.from("registros_diarios")
    .insert({ ...r.valores, paciente_id: r.pacienteId, nutricionista_id: c.userId }).select("*").single();
  if (error?.code === "23505") {
    // corrida: o dia foi registrado no meio do caminho (índice único parcial) → vira edição do que chegou
    const denovo = await registroVivoDoDia(c, r.pacienteId, r.dia);
    if (denovo.ok && typeof denovo.id === "string") return await editarRegistroDoDia(c, denovo.id, r.valores);
  }
  if (error) return falha(c, SALVAR_REGISTRO, error);
  return { ok: true, registro: data, criado: true };
}

// ───────────────────────── Dietas › Diário (o lado da nutri) ─────────────────────────
async function reagir(c: ContextoPessoa): Promise<Resposta> {
  const acao = "diario_reagir";
  const r = lerReacao(c.corpo);
  if (!r.ok) return recusa(c, acao, r.erro, r.campo);
  const { data, error } = await c.comoPessoa.from("diario_alimentar").update(r.valores).eq("id", r.id).is("deleted_at", null).select("*");
  if (error) return falha(c, acao, error);
  if (!data?.length) return naoEncontrado(c, acao, r.id);
  return { ok: true, linha: data[0] };
}

/** 1º a linha (Lixeira), depois a foto: se o remove falhar, sobra o arquivo (log), nunca a linha viva sem a foto. */
async function excluirFoto(c: ContextoPessoa): Promise<Resposta> {
  const acao = "diario_excluir";
  const id = c.corpo.id;
  if (!ehUuid(id)) return recusa(c, acao, "dados_invalidos", "id");
  const { data, error } = await c.comoPessoa.from("diario_alimentar").update({ deleted_at: new Date().toISOString() }).eq("id", id.toLowerCase())
    .is("deleted_at", null).select("id, path");
  if (error) return falha(c, acao, error);
  const linha = (data ?? [])[0] as { path?: unknown } | undefined;
  if (!linha) return naoEncontrado(c, acao, id);
  if (typeof linha.path === "string" && linha.path) await removerArquivo(c, acao, bucketDoDiario(c.schema), linha.path, id);
  return { ok: true };
}

// ───────────────────────── os padrões do 1º acesso (H-81): Manipulados, Metas e Orientações ─────────────────────────
async function garantirPadroes(c: ContextoPessoa): Promise<Resposta> {
  const acao = "padroes_garantir";
  const secao = secaoDoPadraoDaDieta(c.corpo.secao);
  if (!secao) return recusa(c, acao, "secao_invalida");
  const { data: r, error } = await c.comoPessoa.rpc("nutricao_garantir_padroes", { p_secao: secao, p_itens: itensPadraoDaDieta(secao) });
  if (error) return falha(c, acao, error);
  const { tabela, ordem } = PADROES_DIETA[secao];
  const { data: lista, error: el } = await c.comoPessoa.from(tabela).select("*").is("deleted_at", null)
    .order("favorito", { ascending: false }).order(ordem, { ascending: true });
  if (el) return falha(c, acao, el);
  const criados = Number((r as Record<string, unknown> | null)?.criados) || 0;
  if (criados > 0) c.log.info({ codigo: "padroes_criados", schema: c.schema, acao, resultado: secao, n: criados });
  return { ok: true, criados, lista: lista ?? [] };
}
