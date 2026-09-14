// src/lib/fotoProfessor.ts — foto do professor por upload (Admin › Configurações › Perfil, pedido 13/09/2026)
import { DB_SCHEMA, supabase } from "@/integrations/supabase/client";

export const BUCKET_FOTOS_PROFESSORES = DB_SCHEMA === "staging" ? "fotos-professores-staging" : "fotos-professores";
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/** Valida o arquivo escolhido. null = ok; senão a mensagem pro toast. */
export function validarFoto(file: { type: string; size: number }): string | null {
  if (!TIPOS.includes(file.type)) return "Use uma imagem JPG, PNG ou WebP.";
  if (file.size > MAX_BYTES) return "A imagem precisa ter até 5 MB.";
  return null;
}

/** Caminho no bucket: <uid>/foto-<timestamp>.<ext> — a pasta é do próprio professor (regra de escrita do Storage). */
export function caminhoFoto(uid: string, file: { type: string }, agora = Date.now()): string {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  return `${uid}/foto-${agora}.${ext}`;
}

/** Sobe a foto e devolve a URL pública. */
export async function uploadFotoProfessor(uid: string, file: File): Promise<string> {
  const path = caminhoFoto(uid, file);
  const { error } = await supabase.storage.from(BUCKET_FOTOS_PROFESSORES).upload(path, file, { upsert: true, contentType: file.type, cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from(BUCKET_FOTOS_PROFESSORES).getPublicUrl(path).data.publicUrl;
}
