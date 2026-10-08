/**
 * De onde vem a Evolução do PRÓPRIO aluno (W10):
 *   · Banco do Treino, pelo REST (como a tela antiga): o perfil (`physiq_profiles` — a composição atual que o personal gravou),
 *     as avaliações (`physiq_avaliacoes`) e as fotos mensais (`physiq_registros_fotos`, bucket privado `registros`), todas
 *     com a regra de hoje (o aluno lê as próprias linhas e a própria pasta);
 *   · banco principal, pela função `minha_evolucao()` (W10): as antropometrias e as fotos de evolução da nutricionista, de
 *     todas as matrículas dele, com o nome de quem fez; o arquivo da foto sai por URL assinada do bucket privado `evolucao`
 *     (a política de Storage da W10 deixa o aluno dono assinar a própria foto).
 * Nada é copiado de um banco para o outro — a série é somada no aparelho (`serie.ts`).
 */
import { bucketDoAmbiente } from "@/integrations/principal/buckets";
import { principal, principalConfigurado } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_REGISTROS } from "@/lib/registrosFotos";
import type { AntropometriaPrincipal, FotoPrincipal, LinhaFotoTreino, LinhaTreino, ParteTreino, PartePrincipal } from "./tipos";

export const BUCKET_EVOLUCAO = bucketDoAmbiente("evolucao");
/** Validade da URL assinada das fotos (a mesma da tela antiga). */
export const VALIDADE_URL_S = 3600;

/** As colunas do perfil que a Evolução mostra (a composição atual). */
export const COLUNAS_PERFIL = [
  "id", "sexo", "idade", "peso", "altura", "metodo_avaliacao", "percentual_gordura", "massa_gorda", "massa_magra",
  "massa_muscular", "agua_corporal", "gordura_visceral", "tmb_mifflin", "tmb_katch", "tmb_balanca", "tmb_metodo",
  "dobra_1", "dobra_2", "dobra_3", "dobra_4", "dobra_5", "dobra_6", "dobra_7",
  "medida_pescoco", "medida_ombro", "medida_peitoral", "medida_cintura", "medida_abdomen", "medida_quadril",
  "medida_braco_d", "medida_braco_e", "medida_antebraco_d", "medida_antebraco_e", "medida_coxa_d", "medida_coxa_e",
  "medida_panturrilha_d", "medida_panturrilha_e",
].join(", ");

export class ErroFonte extends Error {
  constructor(public parte: "treino" | "principal", mensagem: string) {
    super(mensagem);
  }
}

type Assinador = (caminhos: string[]) => Promise<Record<string, string>>;

/** O pedaço do Storage do supabase-js que a Evolução usa (os 2 clientes têm). */
interface BucketAssinavel {
  createSignedUrls(
    caminhos: string[],
    validade: number,
  ): Promise<{ data: { path: string | null; signedUrl: string; error: string | null }[] | null; error: { message: string } | null }>;
}

/** Assina de uma vez (1 pedido) as URLs das fotos; o que falhar fica sem URL (a tela mostra "Foto indisponível"). */
async function assinar(bucket: BucketAssinavel, caminhos: string[]): Promise<Record<string, string>> {
  if (caminhos.length === 0) return {};
  const { data, error } = await bucket.createSignedUrls(caminhos, VALIDADE_URL_S);
  if (error || !data) {
    console.warn("[evolucao] não deu para assinar as fotos:", error?.message);
    return {};
  }
  const mapa: Record<string, string> = {};
  for (const item of data) if (item.path && item.signedUrl && !item.error) mapa[item.path] = item.signedUrl;
  return mapa;
}

const assinarTreino: Assinador = (c) => assinar(supabase.storage.from(BUCKET_REGISTROS), c);
const assinarPrincipal: Assinador = (c) => assinar(principal.storage.from(BUCKET_EVOLUCAO), c);

/** A parte do Banco do Treino (o usuário do Treino é o da troca de token). */
export async function carregarTreino(treinoId: string, assinador: Assinador = assinarTreino): Promise<ParteTreino> {
  const [perfil, avaliacoes, fotos] = await Promise.all([
    supabase.from("physiq_profiles").select(COLUNAS_PERFIL).eq("id", treinoId).maybeSingle(),
    supabase.from("physiq_avaliacoes").select("*").eq("user_id", treinoId).order("data_avaliacao", { ascending: true }).limit(200),
    supabase.from("physiq_registros_fotos").select("id, mes_ref, tipo, storage_path, created_at").eq("user_id", treinoId).order("mes_ref", { ascending: false }),
  ]);
  const erro = perfil.error ?? avaliacoes.error ?? fotos.error;
  if (erro) throw new ErroFonte("treino", erro.message);
  const linhasFotos = (fotos.data ?? []) as LinhaFotoTreino[];
  const urls = await assinador(linhasFotos.map((f) => f.storage_path));
  return {
    perfil: (perfil.data as unknown as LinhaTreino | null) ?? null,
    avaliacoes: (avaliacoes.data ?? []) as unknown as LinhaTreino[],
    fotos: linhasFotos.map((f) => ({ ...f, url: urls[f.storage_path] ?? null })),
  };
}

/** A parte do banco principal: `minha_evolucao()` (só o que é do próprio aluno) + as URLs assinadas das fotos. */
export async function carregarPrincipal(assinador: Assinador = assinarPrincipal): Promise<PartePrincipal> {
  if (!principalConfigurado) throw new ErroFonte("principal", "principal_nao_configurado");
  const { data, error } = await principal.rpc("minha_evolucao" as never);
  if (error) throw new ErroFonte("principal", error.message);
  const d = (data ?? {}) as { objetivo?: string | null; antropometrias?: AntropometriaPrincipal[]; fotos?: FotoPrincipal[] };
  const fotos = Array.isArray(d.fotos) ? d.fotos : [];
  const urls = await assinador(fotos.map((f) => f.path));
  return {
    objetivo: d.objetivo ?? null,
    antropometrias: Array.isArray(d.antropometrias) ? d.antropometrias : [],
    fotos: fotos.map((f) => ({ ...f, url: urls[f.path] ?? null })),
  };
}
