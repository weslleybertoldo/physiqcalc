// Physiq W7b — acesso a dados do aluno SEM profissional: o plano do app e os pratos prontos no banco principal (funções
// entrar_sem_profissional, meu_plano_app, mudar_objetivo_app, pratos_prontos_do_app; trocar o plano pela pagamentos-aluno, que
// acompanha a cobrança automática no cartão) e o catálogo dos treinos prontos no Banco do Treino (lido com internet e guardado
// no aparelho — escolher o treino funciona sem internet depois de aberto 1 vez).
import { acaoFinanceiro, invalidarResumo } from "@/financeiro/api";
import { principal } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import { normalizarMeuPlano, normalizarPratos, ordenarTreino, type MeuPlanoApp, type Objetivo, type RespostaPratos, type TreinoPronto } from "./regras";

export class ErroApp extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

function semInternet(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function rpc<T>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  if (semInternet()) throw new ErroApp("sem_internet");
  const { data, error } = await principal.rpc(nome as never, args as never);
  if (error) throw new ErroApp(error.message?.includes("Failed to fetch") ? "sem_internet" : "erro_interno");
  return data as T;
}

/** Boas-vindas › "Treinar sem profissional": matrícula no app com os dias grátis começando agora. */
export async function entrarSemProfissional(objetivo: Objetivo, plano: string): Promise<{ paciente_id: string; teste_ate: string | null; ja_era: boolean }> {
  const r = await rpc<{ ok?: boolean; erro?: string; paciente_id?: string; teste_ate?: string | null; ja_era?: boolean }>("entrar_sem_profissional", {
    p_objetivo: objetivo,
    p_plano: plano,
  });
  if (!r?.ok || !r.paciente_id) throw new ErroApp(r?.erro ?? "erro_interno");
  invalidarResumo();
  return { paciente_id: r.paciente_id, teste_ate: r.teste_ate ?? null, ja_era: r.ja_era === true };
}

export async function buscarMeuPlano(): Promise<MeuPlanoApp> {
  return normalizarMeuPlano(await rpc("meu_plano_app"));
}

export async function mudarObjetivo(objetivo: Objetivo): Promise<void> {
  const r = await rpc<{ ok?: boolean; erro?: string }>("mudar_objetivo_app", { p_objetivo: objetivo });
  if (!r?.ok) throw new ErroApp(r?.erro ?? "erro_interno");
}

/** Troca de plano (Treino ⇄ Treino + Alimentação): vale a partir do próximo pagamento; a cobrança automática acompanha. */
export async function trocarPlano(pacienteId: string, plano: string): Promise<{ mudou: boolean; valor: number; nome: string | null; assinatura: string | null }> {
  const r = await acaoFinanceiro<{ mudou: boolean; valor: number; nome: string | null; assinatura: string | null }>("aluno_app_plano", {
    paciente_id: pacienteId,
    plano,
  });
  invalidarResumo();
  return r;
}

export async function buscarPratos(objetivo: Objetivo | null): Promise<RespostaPratos> {
  const r = normalizarPratos(await rpc("pratos_prontos_do_app", objetivo ? { p_objetivo: objetivo } : {}));
  if (!r.ok) throw new ErroApp(r.erro ?? "erro_interno");
  return r;
}

// ───────────────────────── treinos prontos (Banco do Treino) ─────────────────────────

const CHAVE_CATALOGO = "physiq_treinos_prontos_v1";
const COLUNAS =
  "id, codigo, nome, objetivo, nivel, dias_por_semana, divisao, descricao, ordem, " +
  "grupos:physiq_treinos_prontos_grupos(id, letra, nome, dias, ordem, " +
  "exercicios:physiq_treinos_prontos_exercicios(exercicio_id, ordem, series, reps, descanso_segundos, observacao, " +
  "exercicio:tb_exercicios(id, nome, grupo_muscular, imagem_url, tipo)))";

interface Resposta {
  data: unknown;
  error: { message?: string } | null;
}
type Consulta = { select: (c: string) => { eq: (c: string, v: unknown) => { order: (c: string) => PromiseLike<Resposta> } } };

export function catalogoGuardado(): TreinoPronto[] | null {
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE_CATALOGO) || "null") as { lista?: TreinoPronto[] } | null;
    return Array.isArray(g?.lista) && g!.lista.length ? g!.lista : null;
  } catch {
    return null;
  }
}

/** O catálogo (com internet; sem ela, o guardado da última vez). */
export async function buscarTreinosProntos(): Promise<TreinoPronto[]> {
  if (semInternet()) {
    const g = catalogoGuardado();
    if (g) return g;
    throw new ErroApp("sem_internet");
  }
  const cliente = supabase as unknown as { from: (t: string) => Consulta };
  const { data, error } = await cliente.from("physiq_treinos_prontos").select(COLUNAS).eq("ativo", true).order("ordem");
  if (error) {
    const g = catalogoGuardado();
    if (g) return g;
    throw new ErroApp("erro_interno");
  }
  const lista = ((data ?? []) as TreinoPronto[]).map(ordenarTreino);
  try {
    localStorage.setItem(CHAVE_CATALOGO, JSON.stringify({ em: Date.now(), lista }));
  } catch {
    /* sem armazenamento: busca de novo na próxima */
  }
  return lista;
}
