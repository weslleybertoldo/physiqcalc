// Physiq hml-19c (H-41 · jeito 2, 11/10/2026) — o módulo da AVALIAÇÃO da função nutricao (Perfil do aluno › Avaliação, a parte do banco
// principal): a antropometria, as fotos de evolução (o arquivo no bucket evolucao pelo link assinado) e o aviso "avaliação nova" no sino
// do aluno. As ações estão em _shared/nutricao-regras.ts → ACOES_AVALIACAO. Tudo com o cliente "como a pessoa" (c.comoPessoa): o RLS de
// hoje decide; aqui a forma, o dono e a tradução do erro. (A avaliação física e a próxima avaliação são do Treino: admin-avaliacoes.)
//   antropometria  _criar (o dono = quem chama) · _editar (0 linha → 404) · _excluir (a Lixeira: deleted_at; 0 linha → 404)
//   foto           foto_evolucao_preparar: o caminho <quem chama>/<aluno>/<uuid>-<nome seguro> montado AQUI (o montarPath de hoje), o
//                  tipo e o tamanho com os limites da tela e do bucket (10 MB, JPEG/PNG/WebP) e o link assinado como a pessoa (o
//                  Storage confere a policy do bucket: subir na própria pasta) → o navegador sobe com uploadToSignedUrl →
//                  foto_evolucao_registrar: o arquivo existe NAQUELE caminho? (list com search, o molde do anexo_registrar da 19a) → a
//                  linha; a linha não entrou → o arquivo sai (o mesmo desfazer da tela de hoje, agora no servidor) ·
//                  foto_evolucao_editar (posição, data, observação) · foto_evolucao_excluir (decisão 8: a linha à Lixeira e DEPOIS o
//                  arquivo; falhou o remove → log arquivo_orfao, sem o caminho. Antes era o contrário — arquivo → linha —, e a linha
//                  podia ficar viva apontando para um arquivo apagado)
//   aviso          avaliacao_avisar { alunoId }: a RPC aluno_avisar_avaliacao de hoje, como a pessoa → { avisado, sem_login } (o
//                  "sem_permissao" que ela devolve vira 403 sem_acesso; a tela não desfaz nada se o aviso falhar, como hoje)
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import {
  ERROS_DO_AVISO, bucketDaEvolucao, caminhoDoAnexo, ehUuid, lerPedidoDeFotoEvolucao, lerRegistroDeFotoEvolucao, montarGravacaoAvaliacao,
  type AcaoAvaliacao,
} from "../_shared/nutricao-regras.ts";
import { falha, falhaStorage, naoEncontrado, recusa, removerArquivo, type Resposta } from "./comum.ts";

export async function atenderAvaliacao(c: ContextoPessoa, acao: AcaoAvaliacao): Promise<Resposta> {
  switch (acao) {
    case "foto_evolucao_preparar":
      return await prepararFoto(c);
    case "foto_evolucao_registrar":
      return await registrarFoto(c);
    case "foto_evolucao_excluir":
      return await excluirFoto(c);
    case "avaliacao_avisar":
      return await avisar(c);
    default:
      return await gravar(c, acao);
  }
}

// ───────────────────────── CRUD declarativo (antropometria; a foto de evolução no editar) ─────────────────────────
async function gravar(c: ContextoPessoa, acao: AcaoAvaliacao): Promise<Resposta> {
  const g = montarGravacaoAvaliacao(acao, c.corpo, c.userId);
  if (!g.ok) return recusa(c, acao, g.erro, g.campo);
  switch (g.operacao) {
    case "inserir": {
      const { data, error } = await c.comoPessoa.from(g.tabela).insert(g.valores).select("*").single();
      if (error) return falha(c, acao, error);
      return { ok: true, linha: data };
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

// ───────────────────────── fotos de evolução: o link assinado ─────────────────────────
async function prepararFoto(c: ContextoPessoa): Promise<Resposta> {
  const acao = "foto_evolucao_preparar";
  const p = lerPedidoDeFotoEvolucao(c.corpo);
  if (!p.ok) return recusa(c, acao, p.erro, p.campo);
  const caminho = caminhoDoAnexo(c.userId, p.pacienteId, p.nome, crypto.randomUUID());
  const bucket = bucketDaEvolucao(c.schema);
  // o link assinado sai COMO A PESSOA: o Storage confere a policy do bucket dela (subir na própria pasta, ou master) antes de assinar
  const { data, error } = await c.comoPessoa.storage.from(bucket).createSignedUploadUrl(caminho);
  if (error || !data?.token) return falhaStorage(c, acao, error);
  return { ok: true, bucket, caminho, token: data.token };
}

async function registrarFoto(c: ContextoPessoa): Promise<Resposta> {
  const acao = "foto_evolucao_registrar";
  const r = lerRegistroDeFotoEvolucao(c.corpo, c.userId);
  if (!r.ok) return recusa(c, acao, r.erro, r.campo);
  const bucket = bucketDaEvolucao(c.schema);
  const corte = r.caminho.lastIndexOf("/");
  const pasta = r.caminho.slice(0, corte);
  const arquivo = r.caminho.slice(corte + 1);
  // o arquivo chegou NAQUELE caminho? (quem subiu lê a própria pasta: "ler as proprias ou master")
  const { data: achados, error: el } = await c.comoPessoa.storage.from(bucket).list(pasta, { search: arquivo, limit: 10 });
  if (el) return falhaStorage(c, acao, el);
  const objeto = (achados ?? []).find((f) => f.name === arquivo);
  if (!objeto) return recusa(c, acao, "arquivo_nao_encontrado");
  // o tamanho que vale é o do arquivo que chegou (o declarado só serve se o Storage não disser)
  const real = Number((objeto.metadata as Record<string, unknown> | null)?.size);
  const { data, error } = await c.comoPessoa.from("fotos_evolucao").insert({
    ...r.valores,
    nutricionista_id: c.userId,
    paciente_id: r.pacienteId,
    path: r.caminho,
    tamanho: Number.isInteger(real) && real > 0 ? real : r.tamanho,
    mime: r.mime,
  }).select("*").single();
  if (error) {
    // a linha não entrou: o arquivo sai (o mesmo desfazer da tela de hoje, agora no servidor)
    await removerArquivo(c, acao, bucket, r.caminho, null);
    return falha(c, acao, error);
  }
  return { ok: true, linha: data };
}

/** 1º a linha (Lixeira), depois o arquivo: se o remove falhar, sobra o arquivo (log), nunca a linha viva sem o arquivo. */
async function excluirFoto(c: ContextoPessoa): Promise<Resposta> {
  const acao = "foto_evolucao_excluir";
  const id = c.corpo.id;
  if (!ehUuid(id)) return recusa(c, acao, "dados_invalidos", "id");
  const { data, error } = await c.comoPessoa.from("fotos_evolucao").update({ deleted_at: new Date().toISOString() }).eq("id", id.toLowerCase())
    .is("deleted_at", null).select("id, path");
  if (error) return falha(c, acao, error);
  const linha = (data ?? [])[0] as { path?: unknown } | undefined;
  if (!linha) return naoEncontrado(c, acao, id);
  // o caminho vem da LINHA, nunca do corpo; o Storage só deixa tirar o da própria pasta (ou o master) — outra nutri da conta → órfão no log
  if (typeof linha.path === "string" && linha.path) await removerArquivo(c, acao, bucketDaEvolucao(c.schema), linha.path, id);
  return { ok: true };
}

// ───────────────────────── o aviso "avaliação nova" no sino do aluno (NF9) ─────────────────────────
async function avisar(c: ContextoPessoa): Promise<Resposta> {
  const acao = "avaliacao_avisar";
  const alunoId = c.corpo.alunoId;
  if (!ehUuid(alunoId)) return recusa(c, acao, "dados_invalidos", "aluno_id");
  const { data, error } = await c.comoPessoa.rpc("aluno_avisar_avaliacao", { p_aluno: alunoId.toLowerCase() });
  if (error) return falha(c, acao, error, ERROS_DO_AVISO);
  const r = (data ?? {}) as { ok?: unknown; avisado?: unknown; sem_login?: unknown; erro?: unknown };
  if (r.ok === false) return recusa(c, acao, "sem_acesso", typeof r.erro === "string" ? r.erro : undefined);
  return { ok: true, avisado: r.avisado === true, sem_login: r.sem_login === true };
}
