// Physiq hml-21a (H-43 · jeito 2, etapa 3) — as GRAVAÇÕES do app do aluno pela função conta, COMO A PESSOA (c.comoPessoa — o token de quem
// chama; nenhuma chave secreta). As ações estão em _shared/conta-regras.ts → ACOES_DO_APP:
//   perfil_nome           profiles.nome de quem chama (id = user); 0 linha → nao_encontrado
//   perfil_foto_preparar  o caminho <user>/foto-<agora>.<ext> nasce AQUI (o tipo e o tamanho com os limites da tela) + createSignedUploadUrl
//                         como a pessoa (a policy de escrita da pasta própria confere de novo) → { bucket, caminho, token }; o app sobe com o
//                         uploadToSignedUrl (o PUT do arquivo)
//   perfil_foto_salvar    o caminho tem de ser EXATAMENTE o formato do preparar na pasta de quem chama (fora → dados_invalidos, N8) e o
//                         arquivo tem de ESTAR lá (list com search); o dados_profissionais de quem chama ganha a URL pública (como hoje) e a
//                         foto ANTERIOR (a da URL de antes, se é da pasta dele neste bucket) sai do bucket (achado 2) → { url }
//   perfil_foto_tirar     o foto_url sai do dados_profissionais (como hoje) e o arquivo de antes também sai do bucket (a mesma regra)
//   mudar_objetivo_app    mudar_objetivo_app(p_objetivo) → { resultado } (o { ok, erro } da RPC como veio)
// Apagar a foto anterior é o melhor esforço: o perfil já foi gravado; não saiu → aviso arquivo_orfao no log (sem o caminho).
import {
  bucketDasFotos, caminhoDaFoto, caminhoDaFotoAnterior, caminhoDaPropriaPasta, dadosComFoto, fotoDoPerfil, lerCorpoDaAcao, urlPublicaDaFoto,
  type AcaoDoApp,
} from "../_shared/conta-regras.ts";
import { falha, falhaStorage, naoEncontrado, recusa, type ContextoConta, type Resposta } from "./comum.ts";

export async function atenderApp(c: ContextoConta, acao: AcaoDoApp): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "perfil_nome":
      return await salvarNome(c, v.nome as string);
    case "perfil_foto_preparar":
      return await prepararFoto(c, v.tipo as string);
    case "perfil_foto_salvar":
      return await salvarFoto(c, v.caminho as string);
    case "perfil_foto_tirar":
      return await trocarFoto(c, acao, null, null);
    case "mudar_objetivo_app": {
      const { data, error } = await c.comoPessoa.rpc("mudar_objetivo_app", { p_objetivo: v.objetivo });
      if (error) return falha(c, acao, error);
      return { ok: true, resultado: data ?? null };
    }
  }
}

async function salvarNome(c: ContextoConta, nome: string): Promise<Resposta> {
  const acao = "perfil_nome";
  const { data, error } = await c.comoPessoa.from("profiles").update({ nome }).eq("id", c.userId).select("id");
  if (error) return falha(c, acao, error);
  if (!Array.isArray(data) || data.length === 0) return naoEncontrado(c, acao);
  return { ok: true };
}

async function prepararFoto(c: ContextoConta, tipo: string): Promise<Resposta> {
  const acao = "perfil_foto_preparar";
  const bucket = bucketDasFotos(c.schema);
  const caminho = caminhoDaFoto(c.userId, tipo, Date.now());
  // o link assinado sai COMO A PESSOA: o Storage confere de novo o INSERT dela (a pasta própria) antes de assinar
  const { data, error } = await c.comoPessoa.storage.from(bucket).createSignedUploadUrl(caminho);
  if (error || !data?.token) return falhaStorage(c, acao, error);
  return { ok: true, bucket, caminho, token: data.token };
}

async function salvarFoto(c: ContextoConta, caminho: string): Promise<Resposta> {
  const acao = "perfil_foto_salvar";
  if (!caminhoDaPropriaPasta(caminho, c.userId)) return recusa(c, acao, "dados_invalidos", "caminho");
  const bucket = bucketDasFotos(c.schema);
  const corte = caminho.indexOf("/");
  const arquivo = caminho.slice(corte + 1);
  // o arquivo chegou NAQUELE caminho? (a pessoa lê a própria pasta)
  const { data: achados, error: el } = await c.comoPessoa.storage.from(bucket).list(caminho.slice(0, corte), { search: arquivo, limit: 10 });
  if (el) return falhaStorage(c, acao, el);
  if (!(achados ?? []).some((f) => f.name === arquivo)) return naoEncontrado(c, acao);
  return await trocarFoto(c, acao, urlPublicaDaFoto(bucket, caminho), caminho);
}

/**
 * Grava a foto do perfil (a URL nova ou null) no dados_profissionais de quem chama — o resto do JSON fica, como o comFoto da tela — e tira
 * do bucket a foto de antes (a da URL que estava lá, se é da pasta de quem chama e não é a nova).
 */
async function trocarFoto(c: ContextoConta, acao: AcaoDoApp, url: string | null, caminhoNovo: string | null): Promise<Resposta> {
  const { data: perfil, error: ep } = await c.comoPessoa.from("profiles").select("dados_profissionais").eq("id", c.userId).maybeSingle();
  if (ep) return falha(c, acao, ep);
  if (!perfil) return naoEncontrado(c, acao);
  const dados = (perfil as { dados_profissionais?: unknown }).dados_profissionais ?? null;
  const { data, error } = await c.comoPessoa.from("profiles").update({ dados_profissionais: dadosComFoto(dados, url) }).eq("id", c.userId).select("id");
  if (error) return falha(c, acao, error);
  if (!Array.isArray(data) || data.length === 0) return naoEncontrado(c, acao);
  const bucket = bucketDasFotos(c.schema);
  const anterior = caminhoDaFotoAnterior(fotoDoPerfil(dados), bucket, c.userId);
  if (anterior && anterior !== caminhoNovo) {
    const { data: saiu, error: er } = await c.comoPessoa.storage.from(bucket).remove([anterior]);
    if (er || !saiu?.length) c.log.aviso({ codigo: "arquivo_orfao", schema: c.schema, acao });
  }
  return url === null ? { ok: true } : { ok: true, url };
}
