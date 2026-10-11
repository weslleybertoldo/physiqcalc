// Physiq W17 — porta do PhysiqNutri (main ca9f66f, src/lib/evolucao.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { bucketDoAmbiente } from "@/integrations/principal/buckets";
import { supabase, type Database } from "@/nutricao/editor/lib/banco";
import { NOME_MAX } from "@/nutricao/editor/lib/anexosUtil";
import {
  FOTO_TAMANHO_MAX_ROTULO, OBSERVACAO_FOTO_MAX, mimeDaFoto, normalizarObservacao, type FormFoto, type Posicao,
} from "@/nutricao/editor/lib/evolucaoUtil";
import { ErroNutricao, acaoNutricao, comFraseDoCodigo } from "@/nutricao/servidor";

// Acesso à evolução fotográfica (W22): a IMAGEM fica no bucket privado `evolucao` do Storage (path <nutri>/<paciente>/<uuid>-<nome>)
// e os METADADOS (posição, data, observação) na tabela `fotos_evolucao` (RLS: a nutricionista só vê as dela; master vê tudo; criar
// exige enxergar o paciente). Ver/baixar = URL assinada de curta duração (a sessão dela passa pela RLS do Storage). Excluir = remove
// o objeto de verdade e faz soft delete na tabela (deleted_at → Lixeira, W32). Mesmo padrão dos anexos da W14.
// hml-19c (H-41 · jeito 2): ENVIAR = a função nutricao dá o link assinado (foto_evolucao_preparar: o caminho — o mesmo formato do
// montarPath — é montado NO SERVIDOR) → a imagem sobe direto nele (uploadToSignedUrl) → foto_evolucao_registrar (o servidor confere
// que o arquivo chegou naquele caminho e grava a linha; se a linha falhar, ele mesmo tira o arquivo). Editar e excluir também pela
// função (excluir, decisão 8: a linha à Lixeira e DEPOIS o arquivo — antes era o contrário). As leituras (lista, URLs) seguem aqui.

export type FotoEvolucao = Database["public"]["Tables"]["fotos_evolucao"]["Row"];
export const BUCKET_EVOLUCAO = bucketDoAmbiente("evolucao");

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};
const observacaoPraGravar = (s: string | null | undefined): string | null => normalizarObservacao(s).slice(0, OBSERVACAO_FOTO_MAX) || null;

/** Fotos vivas do paciente: data mais recente primeiro; na mesma data, a enviada por último primeiro. */
export async function listarFotosDoPaciente(pacienteId: string): Promise<FotoEvolucao[]> {
  const { data, error } = await supabase
    .from("fotos_evolucao")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as FotoEvolucao[];
}

/** As frases de antes da tela (o validarImagem) para os 2 códigos do arquivo — o resto é a frase fixa do código. */
const FRASES_DA_FOTO = { tipo_invalido: "Use uma imagem JPG, PNG ou WebP", arquivo_grande: `Imagem acima de ${FOTO_TAMANHO_MAX_ROTULO}` };

/**
 * Sobe a imagem e grava a linha: o link assinado vem do servidor (o caminho é dele), a imagem sobe direto no Storage e o servidor
 * registra a linha (se a linha falhar, ele tira o arquivo — o órfão não fica). 3 pedidos; o erro vira ErroNutricao com a frase fixa.
 * `nutricionistaId` fica por compatibilidade (as telas não mudam): o dono e a pasta são de quem chama, no servidor.
 */
export async function enviarFoto(nutricionistaId: string, pacienteId: string, arquivo: File, form: FormFoto): Promise<FotoEvolucao> {
  const mime = mimeDaFoto(arquivo);
  const nome = arquivo.name.trim().slice(0, NOME_MAX) || "foto";
  try {
    const link = await acaoNutricao<{ bucket: string; caminho: string; token: string }>("foto_evolucao_preparar", {
      paciente_id: pacienteId, nome, tipo: mime, tamanho: arquivo.size,
    });
    const up = await supabase.storage.from(link.bucket).uploadToSignedUrl(link.caminho, link.token, arquivo, { contentType: mime, cacheControl: "3600" });
    if (up.error) throw new ErroNutricao("upload_falhou");
    const r = await acaoNutricao<{ linha: FotoEvolucao }>("foto_evolucao_registrar", {
      paciente_id: pacienteId, caminho: link.caminho, nome, tipo: mime, tamanho: arquivo.size,
      posicao: form.posicao, data: form.data, observacao: observacaoPraGravar(form.observacao),
    });
    return r.linha;
  } catch (e) {
    return comFraseDoCodigo(e, FRASES_DA_FOTO);
  }
}

/** URL assinada (padrão 5 min). `download` = nome do arquivo → o navegador baixa com esse nome; sem, abre inline (img). */
export async function urlAssinada(foto: Pick<FotoEvolucao, "path">, segundos = 300, download: string | false = false): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_EVOLUCAO).createSignedUrl(foto.path, segundos, download ? { download } : undefined);
  falhou(error);
  if (!data?.signedUrl) throw new Error("Não foi possível gerar o link da foto");
  return data.signedUrl;
}

/** URLs assinadas em lote (miniaturas da grade), por id da foto. As que falharem ficam de fora. */
export async function urlsAssinadas(fotos: Pick<FotoEvolucao, "id" | "path">[], segundos = 3600): Promise<Record<string, string>> {
  if (!fotos.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET_EVOLUCAO).createSignedUrls(fotos.map((f) => f.path), segundos);
  falhou(error);
  const porPath = new Map<string, string>();
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) porPath.set(d.path, d.signedUrl);
  }
  const saida: Record<string, string> = {};
  for (const f of fotos) {
    const u = porPath.get(f.path);
    if (u) saida[f.id] = u;
  }
  return saida;
}

/** Posição, data e/ou observação (a imagem não muda — pra trocar, exclui e envia outra). hml-19c: pela nutricao (foto_evolucao_editar). */
export async function atualizarFoto(id: string, patch: Partial<FormFoto>): Promise<FotoEvolucao> {
  const dados: { posicao?: Posicao; data?: string; observacao?: string | null } = {};
  if (patch.posicao) dados.posicao = patch.posicao;
  if (patch.data) dados.data = patch.data;
  if (patch.observacao !== undefined) dados.observacao = observacaoPraGravar(patch.observacao);
  const r = await acaoNutricao<{ linha: FotoEvolucao }>("foto_evolucao_editar", { ...dados, id });
  return r.linha;
}

/**
 * Soft delete na tabela (Lixeira, W32) e o objeto sai do bucket — os 2 no servidor, nessa ordem (decisão 8: se o arquivo não sair, ele
 * fica órfão no log; a linha nunca fica viva apontando para um arquivo apagado). O caminho é lido lá, da linha (não vai daqui).
 */
export async function excluirFoto(foto: Pick<FotoEvolucao, "id" | "path">): Promise<void> {
  await acaoNutricao("foto_evolucao_excluir", { id: foto.id });
}
