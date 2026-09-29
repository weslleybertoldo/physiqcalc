// Foto do Perfil do profissional (W5): Storage do BANCO PRINCIPAL, bucket público fotos-perfil (fotos-perfil-staging no
// staging), cada pessoa na própria pasta (<uid>/foto-<data>.<ext>) — regra de escrita da migração 20260929120000_w05_equipe.
import { PRINCIPAL_SCHEMA, principal } from "@/integrations/principal/client";
import { caminhoFoto, validarFoto } from "@/lib/fotoProfessor";

export const BUCKET_FOTOS_PERFIL = PRINCIPAL_SCHEMA === "staging" ? "fotos-perfil-staging" : "fotos-perfil";
export { validarFoto };

/** Sobe a foto e devolve a URL pública (o endereço é o do domínio próprio do principal, api-principal.physiqcalc.com.br). */
export async function enviarFotoPerfil(uid: string, arquivo: File): Promise<string> {
  const caminho = caminhoFoto(uid, arquivo);
  const { error } = await principal.storage.from(BUCKET_FOTOS_PERFIL).upload(caminho, arquivo, {
    upsert: false,
    contentType: arquivo.type,
    cacheControl: "31536000",
  });
  if (error) throw error;
  return principal.storage.from(BUCKET_FOTOS_PERFIL).getPublicUrl(caminho).data.publicUrl;
}
