// Physiq W16 — dados da nutricionista para os PDFs (nome, CRN, telefone, endereço), como o site antigo do Nutri lia de
// `profiles` (src/lib/anamneses.ts e src/lib/documentos.ts de lá). Só o que as seções da aba Dieta usam.
import { supabase } from "./banco";

/** Nome da nutricionista (cabeçalho do PDF). */
export async function nomeDaNutricionista(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase.from("profiles").select("nome").eq("id", userId).maybeSingle();
  if (error) return null;
  return (data as { nome: string | null } | null)?.nome ?? null;
}

export type DadosProfissionais = { crn: string | null; telefone: string | null; endereco: string | null };

/** Lê o jsonb com tolerância: só strings não vazias contam; nada preenchido → null. */
export function lerDadosProfissionais(v: unknown): DadosProfissionais | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const s = (k: string): string | null => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim() : null);
  const r = { crn: s("crn"), telefone: s("telefone"), endereco: s("endereco") };
  return r.crn || r.telefone || r.endereco ? r : null;
}

/** CRN/telefone/endereço guardados em `profiles.dados_profissionais`; nada preenchido → null. */
export async function dadosProfissionais(userId: string): Promise<DadosProfissionais | null> {
  if (!userId) return null;
  const { data, error } = await supabase.from("profiles").select("dados_profissionais").eq("id", userId).maybeSingle();
  if (error) return null;
  return lerDadosProfissionais((data as { dados_profissionais: unknown } | null)?.dados_profissionais);
}
