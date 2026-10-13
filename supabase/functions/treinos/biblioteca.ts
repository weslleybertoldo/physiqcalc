// Physiq hml-21d (H-43 · jeito 2, etapa 3, 13/10/2026) — as GRAVAÇÕES da biblioteca (Painel › Treinos › Biblioteca e a Folha do exercício) e o
// espelho do perfil no Treino (Configurações › Perfil) pela função treinos, COMO A PESSOA (c.comoPessoa — o token do Treino de quem chama;
// nenhuma chave secreta). As ações estão em _shared/treinos-regras.ts → ACOES_DA_BIBLIOTECA; cada uma faz o MESMO de hoje
// (src/painel/treinos/api.ts e o espelharNoTreino de src/painel/configuracoes/Perfil.tsx no 7c1a637):
//   exercicio_criar          tb_exercicios { as colunas da Folha, emoji "🏋️", professor_id: o dono — o master cria no global } → { id }
//   exercicio_editar         as colunas que vieram, pelo id; a imagem_url SÓ: nenhuma (tirar), a que já estava na linha, ou a URL pública
//                            DESTE exercício neste bucket (<id>.<ext>, o caminho do preparar) com o arquivo lá (a conferência do
//                            perfil_foto_salvar da hml-21a) — outra → dados_invalidos (N8)
//   exercicio_excluir        o delete pelo id (o exercício num treino pronto → em_uso, a frase de hoje)
//   exercicio_foto_preparar  o caminho <id>.<ext> nasce AQUI (o tipo e o tamanho com os limites da tela) + createSignedUploadUrl COMO A PESSOA
//                            (upsert, como o upload de hoje: a policy do bucket confere que o exercício é de quem chama — exercicios_professor
//                            _write — ou que é o admin) → { bucket, caminho, token }; o app sobe com o uploadToSignedUrl (o PUT do arquivo)
//   grupo_muscular_criar     grupos_musculares { nome, professor_id: o dono } → { linha } · grupo_muscular_excluir: o delete pelo id
//   professor_perfil         physiq_professores: o nome e/ou a foto que vieram, SÓ na linha de quem chama (id = o sub do token)
import {
  COLUNAS_DO_EXERCICIO, URL_API_TREINO, bucketDosExercicios, caminhoDaFotoDoExercicio, caminhoDaUrlDaFoto, colunasDe, donoAoCriar, lerCorpoDaAcao,
  type AcaoDaBiblioteca,
} from "../_shared/treinos-regras.ts";
import { apagar, falha, falhaStorage, inserir, mudar, naoEncontrado, recusa, type ContextoTreinos, type Resposta } from "./comum.ts";

/** Os hosts da API do Treino que montam a URL pública da foto (o VITE_SUPABASE_URL: o domínio próprio; e o do projeto, o de antes). */
export function hostsDaApi(urlDoProjeto: string): string[] {
  return [URL_API_TREINO, urlDoProjeto].filter((h) => typeof h === "string" && h.startsWith("https://"));
}

export async function atenderBiblioteca(c: ContextoTreinos, acao: AcaoDaBiblioteca, urlDoProjeto: string): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "exercicio_criar": {
      const r = await inserir(c, acao, "tb_exercicios", { ...colunasDe(v, COLUNAS_DO_EXERCICIO), emoji: "🏋️", professor_id: donoAoCriar(c.userId, c.master) }, "id", { emUso: true });
      return r.ok ? { ok: true, id: r.linha.id ?? null } : r;
    }
    case "exercicio_editar":
      return await editarExercicio(c, v, urlDoProjeto);
    case "exercicio_excluir":
      return await apagar(c, acao, "tb_exercicios", [["id", v.id]]);
    case "exercicio_foto_preparar": {
      const bucket = bucketDosExercicios(c.schema);
      const caminho = caminhoDaFotoDoExercicio(v.exercicio as string, v.tipo as string);
      // o link assinado sai COMO A PESSOA: o Storage confere a policy do bucket (o exercício de quem chama) antes de assinar
      const { data, error } = await c.comoPessoa.storage.from(bucket).createSignedUploadUrl(caminho, { upsert: true });
      if (error || !data?.token) return falhaStorage(c, acao, error);
      return { ok: true, bucket, caminho, token: data.token };
    }
    case "grupo_muscular_criar": {
      const r = await inserir(c, acao, "grupos_musculares", { nome: v.nome, professor_id: donoAoCriar(c.userId, c.master) }, "id, nome, professor_id");
      return r.ok ? { ok: true, linha: r.linha } : r;
    }
    case "grupo_muscular_excluir":
      return await apagar(c, acao, "grupos_musculares", [["id", v.id]]);
    case "professor_perfil":
      return await mudar(c, acao, "physiq_professores", [["id", c.userId]], colunasDe(v, ["nome", "foto_url"]));
  }
}

/** O editar do exercício: as colunas que vieram; a foto nova só a DESTE exercício neste bucket (com o arquivo lá) ou a que já estava. */
async function editarExercicio(c: ContextoTreinos, v: Record<string, unknown>, urlDoProjeto: string): Promise<Resposta> {
  const acao = "exercicio_editar";
  const id = v.id as string;
  const patch = colunasDe(v, [...COLUNAS_DO_EXERCICIO, "imagem_url"]);
  const url = patch.imagem_url;
  if (typeof url === "string") {
    const { data, error } = await c.comoPessoa.from("tb_exercicios").select("imagem_url").eq("id", id).maybeSingle();
    if (error) return falha(c, acao, error);
    if (!data) return naoEncontrado(c, acao);
    if ((data as { imagem_url?: unknown }).imagem_url !== url) {
      const bucket = bucketDosExercicios(c.schema);
      const caminho = caminhoDaUrlDaFoto(url, bucket, id, hostsDaApi(urlDoProjeto));
      if (!caminho) return recusa(c, acao, "dados_invalidos", "imagem_url");
      // o arquivo chegou NAQUELE caminho? (o professor lê os arquivos dos exercícios dele — a policy do bucket)
      const { data: achados, error: el } = await c.comoPessoa.storage.from(bucket).list("", { search: caminho, limit: 10 });
      if (el) return falhaStorage(c, acao, el);
      if (!(achados ?? []).some((f) => f.name === caminho)) return naoEncontrado(c, acao);
    }
  }
  return await mudar(c, acao, "tb_exercicios", [["id", id]], patch);
}
