// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/anexos.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { bucketDoAmbiente } from "@/integrations/principal/buckets";
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { NOME_MAX, mimeDoArquivo, normalizarDescricao } from "@/nutricao/editor/lib/anexosUtil";
import { ErroNutricao, acaoNutricao } from "@/nutricao/servidor";

// Acesso aos anexos (W14): o ARQUIVO fica no bucket privado `anexos` do Storage (path <nutri>/<paciente>/<uuid>-<nome>) e
// os METADADOS na tabela `anexos` (RLS: a nutricionista só vê os dela; master vê tudo; criar exige enxergar o paciente).
// Baixar/ver = URL assinada de curta duração (a sessão dela passa pela RLS do Storage). Excluir = remove o objeto de
// verdade e faz soft delete na tabela (deleted_at → Lixeira, W32).
// hml-19a (H-41 · jeito 2): ENVIAR = a função nutricao dá o link assinado (anexo_preparar: o caminho é montado NO SERVIDOR) → o
// arquivo sobe direto nele (uploadToSignedUrl) → anexo_registrar (o servidor confere que o arquivo chegou naquele caminho e grava a
// linha; se a linha falhar, ele mesmo tira o arquivo). Descrição e exclusão também pela função (excluir: a linha vai à Lixeira e
// depois o arquivo sai). O "ver/baixar" (URL assinada de leitura) segue aqui.

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

/**
 * Envia 1 arquivo: o link assinado vem do servidor (o caminho é dele), o arquivo sobe direto no Storage e o servidor registra a
 * linha. 3 pedidos (preparar → subir → registrar); o que falha vira ErroNutricao com a frase fixa.
 */
export async function enviarAnexo(nutricionistaId: string, pacienteId: string, arquivo: File, descricao?: string): Promise<Anexo> {
  const mime = mimeDoArquivo(arquivo.name, arquivo.type);
  const nome = arquivo.name.trim().slice(0, NOME_MAX) || "arquivo";
  const link = await acaoNutricao<{ bucket: string; caminho: string; token: string }>("anexo_preparar", {
    paciente_id: pacienteId, nome, tipo: mime, tamanho: arquivo.size,
  });
  const up = await supabase.storage.from(link.bucket).uploadToSignedUrl(link.caminho, link.token, arquivo, { contentType: mime, cacheControl: "3600" });
  if (up.error) throw new ErroNutricao("upload_falhou");
  const r = await acaoNutricao<{ linha: Anexo }>("anexo_registrar", {
    paciente_id: pacienteId, caminho: link.caminho, nome, tipo: mime, tamanho: arquivo.size, descricao: normalizarDescricao(descricao) || null,
  });
  return r.linha;
}

/** URL assinada (padrão 60 s). Com `download` o navegador baixa com o nome original; sem, abre inline (imagem/PDF no modal). */
export async function urlAssinada(anexo: Pick<Anexo, "path" | "nome">, segundos = 60, download = true): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrl(anexo.path, segundos, download ? { download: anexo.nome } : undefined);
  falhou(error);
  if (!data?.signedUrl) throw new Error("Não foi possível gerar o link do arquivo");
  return data.signedUrl;
}

export async function atualizarDescricao(id: string, descricao: string): Promise<Anexo> {
  const r = await acaoNutricao<{ linha: Anexo }>("anexo_editar", { id, descricao: normalizarDescricao(descricao) || null });
  return r.linha;
}

/** Soft delete na tabela (Lixeira, W32) e o objeto sai do bucket — os 2 no servidor (o caminho é lido lá, não vem daqui). */
export async function excluirAnexo(anexo: Pick<Anexo, "id" | "path">): Promise<void> {
  await acaoNutricao("anexo_excluir", { id: anexo.id });
}
