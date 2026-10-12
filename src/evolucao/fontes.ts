/**
 * De onde vem a Evolução do PRÓPRIO aluno (W10):
 *   · Banco do Treino: o perfil (`physiq_profiles` — a composição atual que o personal gravou), as avaliações (`physiq_avaliacoes`) e
 *     as fotos mensais (`physiq_registros_fotos`, bucket privado `registros`);
 *   · banco principal, pela `minha_evolucao()` (W10): as antropometrias e as fotos de evolução da nutricionista, de todas as matrículas
 *     dele, com o nome de quem fez; o arquivo da foto sai por URL assinada do bucket privado `evolucao`.
 * Nada é copiado de um banco para o outro — a série é somada no aparelho (`serie.ts`).
 *
 * hml-20a (H-42 · jeito 2, etapa 2): as 2 partes saem do SERVIDOR, com a sessão do aluno, e a URL assinada das fotos também:
 *   · Treino → a função admin-avaliacoes, ação `minha_evolucao` (1 ida: as 3 leituras em paralelo + a assinatura em lote, como a pessoa;
 *     o dono é o `sub` do token — o corpo não leva id nenhum);
 *   · principal → a função nutricao, ação `ler`, consulta `aluno_evolucao` (a `minha_evolucao()` + a assinatura das fotos na mesma ida),
 *     no lote da tela (src/nutricao/leitura.ts).
 * A URL vem RELATIVA ao projeto (/storage/v1/object/sign/…?token=…) e é montada aqui com o domínio do cliente de cada banco — a mesma
 * URL de hoje. As formas (`ParteTreino`, `PartePrincipal`), o useEvolucaoDoAluno e o Cache Storage não mudam. O que falha vira
 * ErroFonte(parte, código) — a tela avisa pela parte, como antes.
 */
import { bucketDoAmbiente } from "@/integrations/principal/buckets";
import { PRINCIPAL_URL, principalConfigurado } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import { foiPrazo } from "@/integrations/leituraEmLote";
import { ErroLeitura, lerNutricao } from "@/nutricao/leitura";
import type { AntropometriaPrincipal, FotoPrincipal, LinhaFotoTreino, LinhaTreino, ParteTreino, PartePrincipal } from "./tipos";

/** O bucket das fotos de evolução no ambiente (o painel ainda assina com ele: src/painel/aluno/avaliacao/fontes.ts — 20b). */
export const BUCKET_EVOLUCAO = bucketDoAmbiente("evolucao");
/** Validade da URL assinada das fotos (a mesma da tela antiga; agora o servidor assina com ela). */
export const VALIDADE_URL_S = 3600;

/** O domínio do Banco do Treino que o app usa (o mesmo do cliente: src/integrations/supabase/client.ts). */
const URL_TREINO = String(import.meta.env.VITE_SUPABASE_URL ?? "");

export class ErroFonte extends Error {
  constructor(public parte: "treino" | "principal", mensagem: string) {
    super(mensagem);
  }
}

const PREFIXO_ASSINADA = "/storage/v1/object/sign/";

/** A URL assinada que o servidor devolve (relativa ao projeto) montada com o domínio do cliente; fora do formato → null. */
export function urlDoServidor(base: string, relativa: unknown): string | null {
  if (typeof relativa !== "string" || !relativa.startsWith(PREFIXO_ASSINADA) || !base) return null;
  return `${base.replace(/\/+$/, "")}${relativa}`;
}

/**
 * O código do erro da admin-avaliacoes ({ error: <código> }); sem resposta: o prazo (o AbortError do relógio do fetch) → tempo_esgotado,
 * a rede que caiu → "rede"; o resto → erro_interno. (A tela decide "sem conexão" × "erro" pelo navigator.onLine, como antes.)
 */
async function codigoDoTreino(erro: unknown): Promise<string> {
  const contexto = (erro as { context?: unknown } | null)?.context;
  if (contexto && typeof (contexto as Response).clone === "function") {
    try {
      const corpo = (await (contexto as Response).clone().json()) as { error?: unknown } | null;
      if (typeof corpo?.error === "string") return corpo.error;
    } catch {
      // corpo que não é JSON: segue
    }
  }
  if ((erro as { name?: unknown } | null)?.name !== "FunctionsFetchError") return "erro_interno";
  return foiPrazo((erro as { context?: unknown }).context) ? "tempo_esgotado" : "rede";
}

/**
 * A parte do Banco do Treino (o usuário do Treino é o da troca de token): a admin-avaliacoes › minha_evolucao lê as 3 como o aluno
 * (as 200 avaliações mais novas, devolvidas em ordem crescente; as 200 fotos mais novas) e assina as fotos.
 */
export async function carregarTreino(treinoId: string): Promise<ParteTreino> {
  const { data, error } = await supabase.functions.invoke("admin-avaliacoes", { body: { action: "minha_evolucao" } });
  if (error) throw new ErroFonte("treino", await codigoDoTreino(error));
  const d = (data ?? null) as { perfil?: unknown; avaliacoes?: unknown; fotos?: unknown } | null;
  if (!d || !Array.isArray(d.avaliacoes) || !Array.isArray(d.fotos)) throw new ErroFonte("treino", "resposta_invalida");
  const perfil = d.perfil && typeof d.perfil === "object" && !Array.isArray(d.perfil) ? (d.perfil as LinhaTreino) : null;
  // o servidor lê pelo token da sessão do Treino, que é a do treinoId pedido: se a sessão trocou no meio, a resposta de outra pessoa
  // não entra na tela nem no aparelho
  if (perfil && typeof perfil.id === "string" && perfil.id.toLowerCase() !== treinoId.toLowerCase()) throw new ErroFonte("treino", "sessao_trocada");
  return {
    perfil,
    avaliacoes: d.avaliacoes as LinhaTreino[],
    fotos: (d.fotos as LinhaFotoTreino[]).map((f) => ({ ...f, url: urlDoServidor(URL_TREINO, f.url) })),
  };
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
