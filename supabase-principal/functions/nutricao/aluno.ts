// Physiq hml-19b (H-41 · jeito 2 · decisão 14, 11/10/2026) — o módulo do APP DO ALUNO da função nutricao (aba Dieta e card Metas de
// hoje): as MESMAS RPCs de hoje, chamadas COMO A PESSOA (c.comoPessoa — o token do aluno; nenhuma chave secreta). As ações estão em
// _shared/nutricao-regras.ts → ACOES_ALUNO.
//   aluno_marcar_refeicao  paciente_marcar_refeicao (definer: o aluno do login, hoje ± 1, só refeição com alimento)
//   aluno_marcar_meta      aluno_marcar_meta (definer: a meta viva do aluno, ativa e do dia)
//   aluno_diario_preparar  o caminho <nutricionista>/<aluno>/<uuid>.<ext> montado AQUI + diario_pasta_valida (a regra da policy de INSERT
//                          do bucket: aluno vivo da nutri, diário ligado, o próprio login) + createSignedUploadUrl como a pessoa
//                          → { bucket, caminho, token }; o app sobe com uploadToSignedUrl
//   aluno_diario_enviar    o caminho tem de ser da pasta daquela matrícula (N9) e o arquivo tem de ESTAR lá (list com search, como o
//                          anexo_registrar da 19a); depois a diario_enviar de hoje (o código do link confere o aluno e a pasta de novo;
//                          a migration 20261011110000, seção 9, tira o aluno DONO do limite por IP — aqui o IP seria o da função, comum
//                          a todos; o limite por aluno segue). Falhou → tenta tirar o arquivo (o aluno não pode apagar no bucket: sobra o
//                          órfão — log arquivo_orfao, sem o caminho; spec §1.11 item 5)
// Os códigos que as RPCs devolvem de propósito (sem_alimentos, meta_pausada, diario_desligado, muitos_envios…) vão ao app como estão: a
// tela do app já tem o texto de cada um (refeicaoConcluidaUtil, metasUtil, diarioUtil).
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import {
  ERROS_DA_MARCACAO, ERROS_DO_DIARIO, bucketDoDiario, caminhoDoDiario, lerEnvioDoDiario, lerMarcacao, lerPedidoDeFotoDoDiario, type AcaoAluno,
} from "../_shared/nutricao-regras.ts";
import { falha, falhaStorage, recusa, removerArquivo, type Resposta } from "./comum.ts";

export async function atenderAluno(c: ContextoPessoa, acao: AcaoAluno): Promise<Resposta> {
  switch (acao) {
    case "aluno_marcar_refeicao":
      return await marcar(c, acao, "refeicao_id", "paciente_marcar_refeicao", "p_refeicao_id");
    case "aluno_marcar_meta":
      return await marcar(c, acao, "meta_id", "aluno_marcar_meta", "p_meta_id");
    case "aluno_diario_preparar":
      return await prepararFoto(c);
    case "aluno_diario_enviar":
      return await enviarFoto(c);
  }
}

/** ✓ (concluida = true) ou desmarcar; devolve o estado gravado, como a RPC de hoje. */
async function marcar(c: ContextoPessoa, acao: AcaoAluno, campoId: "refeicao_id" | "meta_id", rpc: string, parametro: string): Promise<Resposta> {
  const m = lerMarcacao(c.corpo, campoId);
  if (!m.ok) return recusa(c, acao, m.erro, m.campo);
  const { data, error } = await c.comoPessoa.rpc(rpc, { [parametro]: m.id, p_data: m.dia, p_concluida: m.concluida });
  if (error) return falha(c, acao, error, ERROS_DA_MARCACAO);
  return { ok: true, concluida: Boolean(data) };
}

async function prepararFoto(c: ContextoPessoa): Promise<Resposta> {
  const acao = "aluno_diario_preparar";
  const p = lerPedidoDeFotoDoDiario(c.corpo);
  if (!p.ok) return recusa(c, acao, p.erro, p.campo);
  const caminho = caminhoDoDiario(p.nutriId, p.pacienteId, p.mime, crypto.randomUUID());
  // a pasta é de um aluno vivo daquela nutri, com o diário ligado, e é o próprio login? (a regra da policy de INSERT do bucket)
  const { data: pode, error: ep } = await c.comoPessoa.rpc("diario_pasta_valida", { p_name: caminho });
  if (ep) return falha(c, acao, ep);
  if (pode !== true) return recusa(c, acao, "sem_acesso");
  const bucket = bucketDoDiario(c.schema);
  // o link assinado sai COMO A PESSOA: o Storage confere de novo o INSERT dela (as policies do bucket) antes de assinar
  const { data, error } = await c.comoPessoa.storage.from(bucket).createSignedUploadUrl(caminho);
  if (error || !data?.token) return falhaStorage(c, acao, error);
  return { ok: true, bucket, caminho, token: data.token };
}

async function enviarFoto(c: ContextoPessoa): Promise<Resposta> {
  const acao = "aluno_diario_enviar";
  const e = lerEnvioDoDiario(c.corpo);
  if (!e.ok) return recusa(c, acao, e.erro, e.campo);
  const bucket = bucketDoDiario(c.schema);
  const corte = e.caminho.lastIndexOf("/");
  const pasta = e.caminho.slice(0, corte);
  const arquivo = e.caminho.slice(corte + 1);
  // o arquivo chegou NAQUELE caminho? (o aluno lê a própria foto ainda sem registro: diario_foto_permitida 'ler', o paciente do login)
  const { data: achados, error: el } = await c.comoPessoa.storage.from(bucket).list(pasta, { search: arquivo, limit: 10 });
  if (el) return falhaStorage(c, acao, el);
  const objeto = (achados ?? []).find((f) => f.name === arquivo);
  if (!objeto) return recusa(c, acao, "arquivo_nao_encontrado");
  // o tamanho que vale é o do arquivo que chegou (o declarado só serve se o Storage não disser)
  const real = Number((objeto.metadata as Record<string, unknown> | null)?.size);
  const { data, error } = await c.comoPessoa.rpc("diario_enviar", {
    p_codigo: e.codigo,
    p_path: e.caminho,
    p_mime: e.mime,
    p_tamanho: Number.isInteger(real) && real > 0 ? real : e.tamanho,
    p_refeicao: e.refeicao,
    p_comentario: e.comentario,
    p_data_hora: e.dataHora,
  });
  if (error) {
    // a linha não entrou: tenta tirar o arquivo (o mesmo desfazer de antes; o aluno não tem permissão → órfão no log)
    await removerArquivo(c, acao, bucket, e.caminho, null);
    return falha(c, acao, error, ERROS_DO_DIARIO);
  }
  const r = (data ?? {}) as { id?: unknown; data_hora?: unknown };
  return { ok: true, registro: { id: r.id ?? null, data_hora: r.data_hora ?? null } };
}
