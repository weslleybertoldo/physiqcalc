// Physiq W7b — acesso a dados do aluno SEM profissional: o plano do app e os pratos prontos no banco principal (funções
// entrar_sem_profissional, meu_plano_app, mudar_objetivo_app, pratos_prontos_do_app; trocar o plano pela pagamentos-aluno, que
// acompanha a cobrança automática no cartão) e o catálogo dos treinos prontos no Banco do Treino (lido com internet e guardado
// no aparelho — escolher o treino funciona sem internet depois de aberto 1 vez).
// hml-21a (H-43 · jeito 2): as 4 do banco principal vão pela função conta, com a sessão da pessoa — as leituras pelo `ler`
// (meu_plano_app, pratos_prontos_do_app) e as gravações pelas ações (entrar_sem_profissional, mudar_objetivo_app), com os MESMOS
// argumentos; o { ok, erro } das RPCs chega como hoje e vira o ErroApp com o código. Sem internet → sem_internet sem chamar. Os treinos
// prontos (Banco do Treino) seguem como estão até a hml-21d.
import { acaoConta, codigoDaGravacao, resultadoDaAcao } from "@/conta/gravar";
import { codigoDaLeitura, lerConta } from "@/conta/ler";
import { acaoFinanceiro, invalidarResumo } from "@/financeiro/api";
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

/** Uma leitura pela conta (o valor da RPC de hoje); o erro vira ErroApp com o código. */
async function lerDoApp(q: "meu_plano_app" | "pratos_prontos_do_app", params?: Record<string, unknown>): Promise<unknown> {
  if (semInternet()) throw new ErroApp("sem_internet");
  try {
    return (await lerConta(q, params)).valor ?? null;
  } catch (e) {
    throw new ErroApp(codigoDaLeitura(e));
  }
}

/** Uma gravação pela conta (o { ok, erro } da RPC de hoje no resultado); a falha da chamada vira ErroApp com o código. */
async function gravarDoApp(acao: "entrar_sem_profissional" | "mudar_objetivo_app", corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (semInternet()) throw new ErroApp("sem_internet");
  try {
    return resultadoDaAcao(await acaoConta<{ resultado?: unknown }>(acao, corpo));
  } catch (e) {
    throw new ErroApp(codigoDaGravacao(e));
  }
}

/**
 * hml-12 (H-30, P4): o que a tela manda junto (em todo build desde a virada, 29/10/2026) — a data de nascimento (18+) e o consentimento
 * de saúde: a versão do texto que a pessoa leu (VERSAO_TEXTOS) e de onde veio (site, apk ou loja).
 */
export interface ExtraSemProfissional {
  nascimento: string;
  consentimento: string;
  origem: string;
}

/**
 * Boas-vindas › "Treinar sem profissional": matrícula no app com os dias grátis começando agora. hml-12: com `extra` vai a sobrecarga
 * de 5 argumentos (o banco confere a idade e grava o consentimento); sem ele, a de 2 de sempre — que, depois da virada (versão dos
 * textos ligada no banco), responde atualize_o_app.
 */
export async function entrarSemProfissional(
  objetivo: Objetivo,
  plano: string,
  extra?: ExtraSemProfissional,
): Promise<{ paciente_id: string; teste_ate: string | null; ja_era: boolean }> {
  const corpo = extra
    ? { objetivo, plano, nascimento: extra.nascimento, consentimento: extra.consentimento, origem: extra.origem }
    : { objetivo, plano };
  const r = (await gravarDoApp("entrar_sem_profissional", corpo)) as { ok?: boolean; erro?: string; paciente_id?: string; teste_ate?: string | null; ja_era?: boolean };
  if (!r?.ok || !r.paciente_id) throw new ErroApp(r?.erro ?? "erro_interno");
  invalidarResumo();
  return { paciente_id: r.paciente_id, teste_ate: r.teste_ate ?? null, ja_era: r.ja_era === true };
}

export async function buscarMeuPlano(): Promise<MeuPlanoApp> {
  return normalizarMeuPlano(await lerDoApp("meu_plano_app"));
}

export async function mudarObjetivo(objetivo: Objetivo): Promise<void> {
  const r = (await gravarDoApp("mudar_objetivo_app", { objetivo })) as { ok?: boolean; erro?: string };
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
  const r = normalizarPratos(await lerDoApp("pratos_prontos_do_app", objetivo ? { objetivo } : {}));
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
