// src/lib/fotoProfessor.ts — foto do professor por upload (Admin › Configurações › Perfil, pedido 13/09/2026)
// hml-21a (decisão 21 da spec hml-21): saíram o uploadFotoProfessor (morto: 0 chamador) e o caminhoFoto (o caminho da foto do perfil nasce
// no servidor — supabase-principal/functions/_shared/conta-regras.ts, caminhoDaFoto, o MESMO formato <uid>/foto-<ms>.<ext>). Fica a
// validação da tela (Perfil › Conta do aluno e Configurações › Perfil) e o nome do bucket do Treino (desvio 9).
import { DB_SCHEMA } from "@/integrations/supabase/client";

export const BUCKET_FOTOS_PROFESSORES = DB_SCHEMA === "staging" ? "fotos-professores-staging" : "fotos-professores";
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/** Valida o arquivo escolhido. null = ok; senão a mensagem pro toast. */
export function validarFoto(file: { type: string; size: number }): string | null {
  if (!TIPOS.includes(file.type)) return "Use uma imagem JPG, PNG ou WebP.";
  if (file.size > MAX_BYTES) return "A imagem precisa ter até 5 MB.";
  return null;
}
