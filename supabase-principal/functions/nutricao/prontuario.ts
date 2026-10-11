// Physiq hml-19a (H-41 · H-81 · jeito 2, 11/10/2026) — o módulo do PRONTUÁRIO da função nutricao: as ações das 18 tabelas (declaradas
// em _shared/nutricao-regras.ts → ACOES), os anexos pelo link assinado e os padrões do 1º acesso. Tudo com o cliente "como a pessoa"
// (c.comoPessoa): o RLS de hoje decide; aqui a forma, o dono e a tradução do erro.
//   CRUD          inserir (.select("*").single()) · inserir_lote (os resultados de exame da mesma data) · editar (0 linha → 404) ·
//                 excluir_suave (deleted_at; 0 linha → 404 — antes a tela dizia "excluído" quando o RLS recusava calado, §1.11 item 6)
//   gestacional   registro_gestacional_salvar: o vivo do dia vira edição; sem ele, insere; a corrida (23505 do índice único PARCIAL —
//                 o on_conflict do PostgREST não acha índice parcial) relê e edita. 1 chamada da tela no lugar de 2 a 4.
//   anexos        anexo_preparar (o caminho montado AQUI + pode_subir_anexo + createSignedUploadUrl como a pessoa) → o navegador sobe
//                 com uploadToSignedUrl → anexo_registrar (o arquivo existe NAQUELE caminho? list com search, o molde do comprovante
//                 da pagamentos-aluno; a linha não entrou → o arquivo sai) · anexo_excluir (a linha vai à Lixeira e DEPOIS o arquivo
//                 sai; falhou o remove → log arquivo_orfao, sem o caminho)
//   padrões       padroes_garantir { secao }: a RPC nutricao_garantir_padroes (INVOKER, trava por pessoa e seção, grava só se a pessoa
//                 não tem nenhum próprio vivo) e a lista da seção — a tela chama 1 vez por abertura (H-81).
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import {
  ANEXO_NOME_MAX, PADROES, bucketDosAnexos, caminhoDoAnexo, ehUuid, erroDoBanco, lerPedidoDeAnexo, lerRegistroDeAnexo, lerRegistroGestacional,
  montarGravacao, secaoDoPadrao, type AcaoNutricao,
} from "../_shared/nutricao-regras.ts";
import { itensPadrao } from "../_shared/nutricao-padroes.ts";

export type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

/** Recusa esperada (dado fora da forma, sem acesso pela regra, seção inválida…): só o código ao log, como aviso. */
function recusa(c: ContextoPessoa, acao: string, erro: string, campo?: string): Resposta {
  c.log.aviso({ codigo: erro, schema: c.schema, acao, resultado: campo ?? null });
  return { ok: false, erro };
}

/** 0 linha: não existe, está na Lixeira ou o RLS não deixa (a mesma resposta nos 3 casos). */
function naoEncontrado(c: ContextoPessoa, acao: string, ref: string): Resposta {
  c.log.aviso({ codigo: "nao_encontrado", schema: c.schema, acao, ref });
  return { ok: false, erro: "nao_encontrado" };
}

/** O erro do banco vira o código da resposta; o inesperado avisa o Weslley (log.excecao: só nome, código e mensagem limpa). */
function falha(c: ContextoPessoa, acao: string, e: { code?: unknown; message?: unknown }): Resposta {
  const t = erroDoBanco(e);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof e.code === "string" ? e.code : null });
  return { ok: false, erro: t.erro };
}

/** O Storage não respondeu como devia (link assinado, lista): 502, com o status dele no log. */
function falhaStorage(c: ContextoPessoa, acao: string, e: unknown): Resposta {
  const o = (e ?? {}) as { status?: unknown; statusCode?: unknown };
  const status = typeof o.status === "number" ? o.status : Number(o.statusCode) || 0;
  c.log.erro({ codigo: "storage_falhou", schema: c.schema, acao, status });
  return { ok: false, erro: "storage_falhou" };
}

export async function atenderProntuario(c: ContextoPessoa, acao: AcaoNutricao): Promise<Resposta> {
  switch (acao) {
    case "padroes_garantir":
      return await garantirPadroes(c);
    case "anexo_preparar":
      return await prepararAnexo(c);
    case "anexo_registrar":
      return await registrarAnexo(c);
    case "anexo_excluir":
      return await excluirAnexo(c);
    case "registro_gestacional_salvar":
      return await salvarRegistroGestacional(c);
    default:
      return await gravar(c, acao);
  }
}

// ───────────────────────── CRUD declarativo ─────────────────────────
async function gravar(c: ContextoPessoa, acao: AcaoNutricao): Promise<Resposta> {
  const g = montarGravacao(acao, c.corpo, c.userId);
  if (!g.ok) return recusa(c, acao, g.erro, g.campo);
  switch (g.operacao) {
    case "inserir": {
      const { data, error } = await c.comoPessoa.from(g.tabela).insert(g.valores).select("*").single();
      if (error) return falha(c, acao, error);
      return { ok: true, linha: data };
    }
    case "inserir_lote": {
      const { data, error } = await c.comoPessoa.from(g.tabela).insert(g.linhas).select("*");
      if (error) return falha(c, acao, error);
      return { ok: true, linhas: data ?? [] };
    }
    case "editar": {
      const { data, error } = await c.comoPessoa.from(g.tabela).update(g.valores).eq("id", g.id).select("*");
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

// ───────────────────────── gestacional: o registro do dia ─────────────────────────
const SALVAR_REGISTRO = "registro_gestacional_salvar";

async function registroVivoDoDia(c: ContextoPessoa, gestacaoId: string, dia: string): Promise<{ ok: true; id: string | null } | Resposta> {
  const { data, error } = await c.comoPessoa.from("registros_gestacionais").select("id").eq("gestacao_id", gestacaoId).eq("data", dia)
    .is("deleted_at", null).order("created_at", { ascending: false }).limit(1);
  if (error) return falha(c, SALVAR_REGISTRO, error);
  const id = (data ?? [])[0]?.id;
  return { ok: true, id: typeof id === "string" ? id : null };
}

async function editarRegistroDoDia(c: ContextoPessoa, id: string, valores: Record<string, unknown>): Promise<Resposta> {
  const { data, error } = await c.comoPessoa.from("registros_gestacionais").update(valores).eq("id", id).select("*");
  if (error) return falha(c, SALVAR_REGISTRO, error);
  if (!data?.length) return naoEncontrado(c, SALVAR_REGISTRO, id);
  return { ok: true, registro: data[0], criado: false };
}

async function salvarRegistroGestacional(c: ContextoPessoa): Promise<Resposta> {
  const r = lerRegistroGestacional(c.corpo, c.userId);
  if (!r.ok) return recusa(c, SALVAR_REGISTRO, r.erro, r.campo);
  const vivo = await registroVivoDoDia(c, r.gestacaoId, r.dia);
  if (!vivo.ok) return vivo;
  if (typeof vivo.id === "string") return await editarRegistroDoDia(c, vivo.id, r.valores);
  const { data, error } = await c.comoPessoa.from("registros_gestacionais")
    .insert({ ...r.valores, gestacao_id: r.gestacaoId, paciente_id: r.pacienteId, nutricionista_id: c.userId }).select("*").single();
  if (error?.code === "23505") {
    // corrida: o dia foi registrado no meio do caminho (índice único parcial) → vira edição do que chegou
    const denovo = await registroVivoDoDia(c, r.gestacaoId, r.dia);
    if (denovo.ok && typeof denovo.id === "string") return await editarRegistroDoDia(c, denovo.id, r.valores);
  }
  if (error) return falha(c, SALVAR_REGISTRO, error);
  return { ok: true, registro: data, criado: true };
}

// ───────────────────────── anexos: o link assinado ─────────────────────────
async function prepararAnexo(c: ContextoPessoa): Promise<Resposta> {
  const acao = "anexo_preparar";
  const p = lerPedidoDeAnexo(c.corpo);
  if (!p.ok) return recusa(c, acao, p.erro, p.campo);
  const caminho = caminhoDoAnexo(c.userId, p.pacienteId, p.nome, crypto.randomUUID());
  // quem chama sobe na pasta deste aluno? (a regra da policy restritiva do Storage: muda a nutrição do aluno)
  const { data: pode, error: ep } = await c.comoPessoa.rpc("pode_subir_anexo", { p_path: caminho });
  if (ep) return falha(c, acao, ep);
  if (pode !== true) return recusa(c, acao, "sem_acesso");
  const bucket = bucketDosAnexos(c.schema);
  // o link assinado sai COMO A PESSOA: o Storage confere de novo o INSERT dela (as policies do bucket) antes de assinar
  const { data, error } = await c.comoPessoa.storage.from(bucket).createSignedUploadUrl(caminho);
  if (error || !data?.token) return falhaStorage(c, acao, error);
  return { ok: true, bucket, caminho, token: data.token };
}

/** Tira o arquivo do bucket; não saiu (erro ou 0 objeto) → log arquivo_orfao (sem o caminho cru). */
async function removerArquivo(c: ContextoPessoa, acao: string, bucket: string, caminho: string, ref: string | null): Promise<boolean> {
  const { data, error } = await c.comoPessoa.storage.from(bucket).remove([caminho]);
  if (error || !data?.length) {
    c.log.aviso({ codigo: "arquivo_orfao", schema: c.schema, acao, ref });
    return false;
  }
  return true;
}

async function registrarAnexo(c: ContextoPessoa): Promise<Resposta> {
  const acao = "anexo_registrar";
  const r = lerRegistroDeAnexo(c.corpo, c.userId);
  if (!r.ok) return recusa(c, acao, r.erro, r.campo);
  const bucket = bucketDosAnexos(c.schema);
  const corte = r.caminho.lastIndexOf("/");
  const pasta = r.caminho.slice(0, corte);
  const arquivo = r.caminho.slice(corte + 1);
  const { data: achados, error: el } = await c.comoPessoa.storage.from(bucket).list(pasta, { search: arquivo, limit: 10 });
  if (el) return falhaStorage(c, acao, el);
  const objeto = (achados ?? []).find((f) => f.name === arquivo);
  if (!objeto) return recusa(c, acao, "anexo_nao_enviado");
  // o tamanho que vale é o do arquivo que chegou (o que a pessoa declarou só serve se o Storage não disser)
  const real = Number((objeto.metadata as Record<string, unknown> | null)?.size);
  const { data, error } = await c.comoPessoa.from("anexos").insert({
    nutricionista_id: c.userId,
    paciente_id: r.pacienteId,
    nome: r.nome.slice(0, ANEXO_NOME_MAX),
    path: r.caminho,
    tamanho: Number.isInteger(real) && real > 0 ? real : r.tamanho,
    mime: r.mime,
    descricao: r.descricao,
  }).select("*").single();
  if (error) {
    // a linha não entrou: o arquivo sai (o mesmo desfazer de antes, agora no servidor)
    await removerArquivo(c, acao, bucket, r.caminho, null);
    return falha(c, acao, error);
  }
  return { ok: true, linha: data };
}

async function excluirAnexo(c: ContextoPessoa): Promise<Resposta> {
  const acao = "anexo_excluir";
  const id = c.corpo.id;
  if (!ehUuid(id)) return recusa(c, acao, "dados_invalidos", "id");
  // 1º a linha (Lixeira), depois o arquivo: se o remove falhar, sobra o arquivo (log), nunca a linha viva sem o arquivo
  const { data, error } = await c.comoPessoa.from("anexos").update({ deleted_at: new Date().toISOString() }).eq("id", id.toLowerCase()).select("id, path");
  if (error) return falha(c, acao, error);
  const linha = (data ?? [])[0] as { path?: unknown } | undefined;
  if (!linha) return naoEncontrado(c, acao, id);
  if (typeof linha.path === "string" && linha.path) await removerArquivo(c, acao, bucketDosAnexos(c.schema), linha.path, id);
  return { ok: true };
}

// ───────────────────────── os padrões do 1º acesso (H-81) ─────────────────────────
async function garantirPadroes(c: ContextoPessoa): Promise<Resposta> {
  const acao = "padroes_garantir";
  const secao = secaoDoPadrao(c.corpo.secao);
  if (!secao) return recusa(c, acao, "secao_invalida");
  const { data: r, error } = await c.comoPessoa.rpc("nutricao_garantir_padroes", { p_secao: secao, p_itens: itensPadrao(secao) });
  if (error) return falha(c, acao, error);
  const { tabela, ordem } = PADROES[secao];
  const { data: lista, error: el } = await c.comoPessoa.from(tabela).select("*").is("deleted_at", null)
    .order("favorito", { ascending: false }).order(ordem, { ascending: true });
  if (el) return falha(c, acao, el);
  const criados = Number((r as Record<string, unknown> | null)?.criados) || 0;
  if (criados > 0) c.log.info({ codigo: "padroes_criados", schema: c.schema, acao, resultado: secao, n: criados });
  return { ok: true, criados, lista: lista ?? [] };
}
