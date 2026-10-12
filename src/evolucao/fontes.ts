/**
 * De onde vem a Evolução do PRÓPRIO aluno (W10):
 *   · Banco do Treino, pelo REST (como a tela antiga): o perfil (`physiq_profiles` — a composição atual que o personal gravou),
 *     as avaliações (`physiq_avaliacoes`) e as fotos mensais (`physiq_registros_fotos`, bucket privado `registros`), todas
 *     com a regra de hoje (o aluno lê as próprias linhas e a própria pasta);
 *   · banco principal, pela `minha_evolucao()` (W10): as antropometrias e as fotos de evolução da nutricionista, de todas as matrículas
 *     dele, com o nome de quem fez; o arquivo da foto sai por URL assinada do bucket privado `evolucao`.
 * Nada é copiado de um banco para o outro — a série é somada no aparelho (`serie.ts`).
 *
 * hml-20a (H-42 · jeito 2, etapa 2): a parte do PRINCIPAL sai do servidor, com a sessão do aluno — a função nutricao, ação `ler`, consulta
 * `aluno_evolucao` (a `minha_evolucao()` + a assinatura das fotos na mesma ida), no lote da tela (src/nutricao/leitura.ts); a URL vem
 * RELATIVA ao projeto e é montada aqui com o domínio do cliente (a mesma URL de hoje).
 * DESVIO 23 (docs/desvios.md — o gate J da hml-20a, 12/10/2026): a parte do TREINO FICA no navegador, IGUAL ao 637363f — pela função
 * (admin-avaliacoes › minha_evolucao) o card do peso do Início ficava ~1,5 s mais lento na 1ª abertura (a função ociosa no Treino
 * pequeno, H-80). A ação minha_evolucao fica publicada (só lê o próprio), sem uso aqui; a volta dela é a condição do desvio.
 * As formas (`ParteTreino`, `PartePrincipal`), o useEvolucaoDoAluno e o Cache Storage não mudam.
 */
import { PRINCIPAL_URL, principalConfigurado } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_REGISTROS } from "@/lib/registrosFotos";
import { ErroLeitura, lerNutricao } from "@/nutricao/leitura";
import type { AntropometriaPrincipal, FotoPrincipal, LinhaFotoTreino, LinhaTreino, ParteTreino, PartePrincipal } from "./tipos";

/**
 * Validade da URL assinada das fotos mensais do Treino (a mesma da tela antiga). As do principal — a Evolução do aluno (20a) e a casca/
 * Avaliação do painel (20b) — o servidor assina, com o mesmo prazo (o bucket `evolucao` saiu daqui: ninguém no navegador assina mais nele).
 */
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

/** O pedaço do Storage do supabase-js que a Evolução usa (o cliente do Treino). */
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

/** hml-14d (D30): quantas avaliações e fotos mensais a Evolução lê (as MAIS NOVAS). */
export const MAX_AVALIACOES = 200;
export const MAX_FOTOS = 200;

/** A parte do Banco do Treino (o usuário do Treino é o da troca de token) — no navegador (o desvio do gate J, acima). */
export async function carregarTreino(treinoId: string, assinador: Assinador = assinarTreino): Promise<ParteTreino> {
  const [perfil, avaliacoes, fotos] = await Promise.all([
    supabase.from("physiq_profiles").select(COLUNAS_PERFIL).eq("id", treinoId).maybeSingle(),
    // hml-14d (B21 · D30): as 200 MAIS NOVAS (antes, as 200 mais antigas: acima de 200 a avaliação nova sumia) — devolvidas em
    // ordem crescente, como antes (desempate pelo id)
    supabase.from("physiq_avaliacoes").select("*").eq("user_id", treinoId)
      .order("data_avaliacao", { ascending: false }).order("id", { ascending: false }).limit(MAX_AVALIACOES),
    supabase.from("physiq_registros_fotos").select("id, mes_ref, tipo, storage_path, created_at").eq("user_id", treinoId)
      .order("mes_ref", { ascending: false }).limit(MAX_FOTOS),
  ]);
  const erro = perfil.error ?? avaliacoes.error ?? fotos.error;
  if (erro) throw new ErroFonte("treino", erro.message);
  const linhasFotos = (fotos.data ?? []) as LinhaFotoTreino[];
  const urls = await assinador(linhasFotos.map((f) => f.storage_path));
  return {
    perfil: (perfil.data as unknown as LinhaTreino | null) ?? null,
    avaliacoes: [...((avaliacoes.data ?? []) as unknown as LinhaTreino[])].reverse(),
    fotos: linhasFotos.map((f) => ({ ...f, url: urls[f.storage_path] ?? null })),
  };
}

const PREFIXO_ASSINADA = "/storage/v1/object/sign/";

/** A URL assinada que o servidor devolve (relativa ao projeto) montada com o domínio do cliente; fora do formato → null. */
export function urlDoServidor(base: string, relativa: unknown): string | null {
  if (typeof relativa !== "string" || !relativa.startsWith(PREFIXO_ASSINADA) || !base) return null;
  return `${base.replace(/\/+$/, "")}${relativa}`;
}

/** A parte do banco principal: `minha_evolucao()` (só o que é do próprio aluno) + as URLs das fotos, na mesma ida (consulta aluno_evolucao). */
export async function carregarPrincipal(): Promise<PartePrincipal> {
  if (!principalConfigurado) throw new ErroFonte("principal", "principal_nao_configurado");
  let valor: unknown;
  try {
    valor = (await lerNutricao("aluno_evolucao")).valor;
  } catch (e) {
    throw new ErroFonte("principal", e instanceof ErroLeitura ? e.codigo : "erro_interno");
  }
  const d = (valor ?? {}) as { objetivo?: string | null; antropometrias?: AntropometriaPrincipal[]; fotos?: FotoPrincipal[] };
  const fotos = Array.isArray(d.fotos) ? d.fotos : [];
  return {
    objetivo: d.objetivo ?? null,
    antropometrias: Array.isArray(d.antropometrias) ? d.antropometrias : [],
    fotos: fotos.map((f) => ({ ...f, url: urlDoServidor(PRINCIPAL_URL, f.url) })),
  };
}
