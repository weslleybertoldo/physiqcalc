// Foto do Perfil do profissional (W5): Storage do BANCO PRINCIPAL, bucket público fotos-perfil (fotos-perfil-staging no
// staging), cada pessoa na própria pasta (<uid>/foto-<data>.<ext>) — regra de escrita da migração 20260929120000_w05_equipe.
// hml-21a (H-43 · jeito 2, §2.5): o upload pelo link que o SERVIDOR assina — a função conta (ação perfil_foto_preparar) decide o caminho
// na pasta de quem chama, confere o tipo e o tamanho (os limites desta tela) e devolve o token; o navegador só faz o PUT do arquivo
// (uploadToSignedUrl). A URL pública é a função pura urlPublica (o getPublicUrl sem o cliente: o mesmo endereço). O Perfil do aluno grava a
// foto pela conta (perfil_foto_salvar: a anterior sai do bucket); o do profissional segue gravando a URL (enviarFotoPerfil, a mesma
// assinatura de hoje) até a hml-21c.
import { acaoConta } from "@/conta/gravar";
import { PRINCIPAL_SCHEMA, PRINCIPAL_URL, principal } from "@/integrations/principal/client";
import { validarFoto } from "@/lib/fotoProfessor";

export const BUCKET_FOTOS_PERFIL = PRINCIPAL_SCHEMA === "staging" ? "fotos-perfil-staging" : "fotos-perfil";
export { validarFoto };

/** A URL pública de um arquivo (o getPublicUrl do supabase-js, sem o cliente): o domínio próprio do principal, o bucket e o caminho. */
export function urlPublica(bucket: string, caminho: string, base: string = PRINCIPAL_URL): string {
  return encodeURI(`${base.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${caminho}`);
}

/** Sobe a foto pelo link que o servidor assina (na pasta de quem está logado) e devolve o caminho e a URL pública. */
export async function subirFotoPerfil(arquivo: File): Promise<{ bucket: string; caminho: string; url: string }> {
  const p = await acaoConta<{ bucket: string; caminho: string; token: string }>("perfil_foto_preparar", { tipo: arquivo.type, tamanho: arquivo.size });
  const { error } = await principal.storage.from(p.bucket).uploadToSignedUrl(p.caminho, p.token, arquivo, {
    contentType: arquivo.type,
    cacheControl: "31536000",
  });
  if (error) throw error;
  return { bucket: p.bucket, caminho: p.caminho, url: urlPublica(p.bucket, p.caminho) };
}

/**
 * Sobe a foto e devolve a URL pública (o endereço é o do domínio próprio do principal, api-principal.physiqcalc.com.br). A mesma
 * assinatura de hoje: o `uid` não decide mais nada (o servidor põe a foto na pasta de quem está logado).
 */
export async function enviarFotoPerfil(_uid: string, arquivo: File): Promise<string> {
  return (await subirFotoPerfil(arquivo)).url;
}
