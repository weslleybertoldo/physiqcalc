// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/anexos.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { bucketDoAmbiente } from "@/integrations/principal/buckets";
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { NOME_MAX, mimeDoArquivo, montarPath, normalizarDescricao } from "@/nutricao/editor/lib/anexosUtil";

// Acesso aos anexos (W14): o ARQUIVO fica no bucket privado `anexos` do Storage (path <nutri>/<paciente>/<uuid>-<nome>) e
// os METADADOS na tabela `anexos` (RLS: a nutricionista só vê os dela; master vê tudo; criar exige enxergar o paciente).
// Baixar/ver = URL assinada de curta duração (a sessão dela passa pela RLS do Storage). Excluir = remove o objeto de
// verdade e faz soft delete na tabela (deleted_at → Lixeira, W32).

export type Anexo = Database["public"]["Tables"]["anexos"]["Row"];
export const BUCKET_ANEXOS = bucketDoAmbiente("anexos");

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

/** Anexos vivos do paciente, mais recente primeiro. */
export async function listarAnexosDoPaciente(pacienteId: string): Promise<Anexo[]> {
  const { data, error } = await supabase
    .from("anexos")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Anexo[];
}

/** Sobe o arquivo no bucket e grava a linha; se a linha falhar, apaga o objeto pra não deixar órfão. */
export async function enviarAnexo(nutricionistaId: string, pacienteId: string, arquivo: File, descricao?: string): Promise<Anexo> {
  const mime = mimeDoArquivo(arquivo.name, arquivo.type);
  const path = montarPath(nutricionistaId, pacienteId, arquivo.name);
  const up = await supabase.storage.from(BUCKET_ANEXOS).upload(path, arquivo, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await supabase
    .from("anexos")
    .insert({
      nutricionista_id: nutricionistaId,
      paciente_id: pacienteId,
      nome: arquivo.name.trim().slice(0, NOME_MAX) || "arquivo",
      path,
      tamanho: arquivo.size,
      mime,
      descricao: normalizarDescricao(descricao) || null,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET_ANEXOS).remove([path]);
    throw new Error(error.message);
  }
  return data as Anexo;
}

/** URL assinada (padrão 60 s). Com `download` o navegador baixa com o nome original; sem, abre inline (imagem/PDF no modal). */
export async function urlAssinada(anexo: Pick<Anexo, "path" | "nome">, segundos = 60, download = true): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrl(anexo.path, segundos, download ? { download: anexo.nome } : undefined);
  falhou(error);
  if (!data?.signedUrl) throw new Error("Não foi possível gerar o link do arquivo");
  return data.signedUrl;
}

export async function atualizarDescricao(id: string, descricao: string): Promise<Anexo> {
  const { data, error } = await supabase
    .from("anexos")
    .update({ descricao: normalizarDescricao(descricao) || null })
    .eq("id", id)
    .select("*")
    .single();
  falhou(error);
  return data as Anexo;
}

/** Remove o objeto do bucket de verdade e faz soft delete na tabela. */
export async function excluirAnexo(anexo: Pick<Anexo, "id" | "path">): Promise<void> {
  const { error: e1 } = await supabase.storage.from(BUCKET_ANEXOS).remove([anexo.path]);
  if (e1) throw new Error(e1.message);
  const { error } = await supabase.from("anexos").update({ deleted_at: new Date().toISOString() }).eq("id", anexo.id);
  falhou(error);
}
