// Physiq W16 — dados da nutricionista para os PDFs (nome, CRN, telefone, endereço), como o site antigo do Nutri lia de
// `profiles` (src/lib/anamneses.ts e src/lib/documentos.ts de lá). Só o que as seções da aba Dieta usam.
// hml-20b (H-42 · jeito 2, etapa 2): a FONTE ÚNICA do nome e dos dados profissionais de quem está logado (o Prontuário, a Dieta, as
// Dietas e os Impressos — antes eram 3 implementações do nomeDaNutricionista e 2 do dadosProfissionais): a leitura sai do navegador e vai
// pela função nutricao, consulta `profissional` (o profiles de QUEM CHAMA — o id vem do token no servidor, nunca daqui), no lote da tela
// (src/nutricao/leitura.ts). O `userId` fica na assinatura (as telas não mudam): vazio → null, como antes; o erro → null, como antes.
// O nome e os dados profissionais pedidos juntos (o Promise.all das seções) viram 1 item no servidor (itens iguais rodam 1 vez).
import { lerNutricao } from "@/nutricao/leitura";

/** O profiles de quem está logado (o servidor lê o id = quem chama): nome e o jsonb dos dados profissionais. */
async function profissionalLogado(): Promise<{ nome?: unknown; dados_profissionais?: unknown } | null> {
  const r = await lerNutricao("profissional");
  const [linha] = (Array.isArray(r.linhas) ? r.linhas : []) as Array<{ nome?: unknown; dados_profissionais?: unknown }>;
  return linha ?? null;
}

/** Nome da nutricionista (cabeçalho do PDF). */
export async function nomeDaNutricionista(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const nome = (await profissionalLogado())?.nome;
    return typeof nome === "string" ? nome : null;
  } catch {
    return null;
  }
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
  try {
    return lerDadosProfissionais((await profissionalLogado())?.dados_profissionais);
  } catch {
    return null;
  }
}
