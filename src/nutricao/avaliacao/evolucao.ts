// Physiq W17 — porta do PhysiqNutri (main ca9f66f, src/lib/evolucao.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase, type Database } from "@/nutricao/editor/lib/banco";
import { montarPath } from "@/nutricao/editor/lib/anexosUtil";
import { OBSERVACAO_FOTO_MAX, mimeDaFoto, normalizarObservacao, type FormFoto, type Posicao } from "@/nutricao/editor/lib/evolucaoUtil";

// Acesso à evolução fotográfica (W22): a IMAGEM fica no bucket privado `evolucao` do Storage (path <nutri>/<paciente>/<uuid>-<nome>)
// e os METADADOS (posição, data, observação) na tabela `fotos_evolucao` (RLS: a nutricionista só vê as dela; master vê tudo; criar
// exige enxergar o paciente). Ver/baixar = URL assinada de curta duração (a sessão dela passa pela RLS do Storage). Excluir = remove
// o objeto de verdade e faz soft delete na tabela (deleted_at → Lixeira, W32). Mesmo padrão dos anexos da W14.

export type FotoEvolucao = Database["public"]["Tables"]["fotos_evolucao"]["Row"];
export const BUCKET_EVOLUCAO = "evolucao";

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

/** Sobe a imagem no bucket e grava a linha; se a linha falhar, apaga o objeto pra não deixar órfão. */
export async function enviarFoto(nutricionistaId: string, pacienteId: string, arquivo: File, form: FormFoto): Promise<FotoEvolucao> {
  const mime = mimeDaFoto(arquivo);
  const path = montarPath(nutricionistaId, pacienteId, arquivo.name);
  const up = await supabase.storage.from(BUCKET_EVOLUCAO).upload(path, arquivo, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await supabase
    .from("fotos_evolucao")
    .insert({
      nutricionista_id: nutricionistaId,
      paciente_id: pacienteId,
      posicao: form.posicao,
      data: form.data,
      path,
      tamanho: arquivo.size,
      mime,
      observacao: observacaoPraGravar(form.observacao),
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET_EVOLUCAO).remove([path]);
    throw new Error(error.message);
  }
  return data as FotoEvolucao;
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

/** Posição, data e/ou observação (a imagem não muda — pra trocar, exclui e envia outra). */
export async function atualizarFoto(id: string, patch: Partial<FormFoto>): Promise<FotoEvolucao> {
  const dados: { posicao?: Posicao; data?: string; observacao?: string | null } = {};
  if (patch.posicao) dados.posicao = patch.posicao;
  if (patch.data) dados.data = patch.data;
  if (patch.observacao !== undefined) dados.observacao = observacaoPraGravar(patch.observacao);
  const { data, error } = await supabase.from("fotos_evolucao").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as FotoEvolucao;
}

/** Remove o objeto do bucket de verdade e faz soft delete na tabela. */
export async function excluirFoto(foto: Pick<FotoEvolucao, "id" | "path">): Promise<void> {
  const { error: e1 } = await supabase.storage.from(BUCKET_EVOLUCAO).remove([foto.path]);
  if (e1) throw new Error(e1.message);
  const { error } = await supabase.from("fotos_evolucao").update({ deleted_at: new Date().toISOString() }).eq("id", foto.id);
  falhou(error);
}
