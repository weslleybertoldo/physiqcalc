/**
 * Busca do app do aluno (W12 — tela 1, NF10) — regras puras (testadas em regras.test.ts): o que a busca acha é SÓ o plano do
 * aluno — os exercícios dos treinos dele (os do profissional liberados + os próprios, no SQLite do PowerSync) e os alimentos do
 * plano alimentar atual (o mesmo `minha_dieta()` da aba Dieta).
 */
import { semAcento } from "@/nutricao/app/numeros";
import { refeicaoValeNoDia } from "@/nutricao/app/dia";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";

/** Uma linha da consulta dos exercícios (um exercício num treino). */
export interface LinhaExercicioBusca {
  id: string | null;
  nome: string | null;
  grupo_muscular: string | null;
  emoji?: string | null;
  tipo?: string | null;
  imagem_url?: string | null;
  subgrupo?: string | null;
  dica?: string | null;
  treino: string | null;
}

export interface ExercicioDaBusca {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  tipo: string | null;
  imagem_url: string | null;
  subgrupo: string | null;
  dica: string | null;
  /** os treinos do aluno em que o exercício aparece, na ordem alfabética */
  treinos: string[];
}

/** Os exercícios dos treinos do aluno, um por exercício (com os treinos em que aparece), em ordem alfabética. */
export function exerciciosDaBusca(linhas: readonly LinhaExercicioBusca[]): ExercicioDaBusca[] {
  const mapa = new Map<string, ExercicioDaBusca>();
  for (const l of linhas) {
    if (!l.id || !l.nome) continue;
    const e = mapa.get(l.id) ?? {
      id: l.id,
      nome: l.nome,
      grupo_muscular: l.grupo_muscular ?? "",
      emoji: l.emoji ?? "",
      tipo: l.tipo ?? null,
      imagem_url: l.imagem_url ?? null,
      subgrupo: l.subgrupo ?? null,
      dica: l.dica ?? null,
      treinos: [],
    };
    if (l.treino && !e.treinos.includes(l.treino)) e.treinos.push(l.treino);
    mapa.set(l.id, e);
  }
  const lista = [...mapa.values()];
  for (const e of lista) e.treinos.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface AlimentoDaBusca {
  /** o nome do alimento (a chave: o mesmo alimento em 2 refeições aparece 1 vez) */
  nome: string;
  /** as refeições do plano em que ele aparece (a 1ª que vale hoje primeiro) */
  refeicoes: { id: string; nome: string; valeHoje: boolean }[];
}

/** Os alimentos do plano atual (todas as refeições), um por nome, em ordem alfabética. */
export function alimentosDaBusca(plano: Pick<PlanoAlimentar, "refeicoes"> | null | undefined, hoje: string): AlimentoDaBusca[] {
  const mapa = new Map<string, AlimentoDaBusca>();
  for (const r of plano?.refeicoes ?? []) {
    const valeHoje = refeicaoValeNoDia(r, hoje);
    for (const it of r.itens ?? []) {
      const nome = it.alimento?.nome?.trim();
      if (!nome) continue;
      const a = mapa.get(nome) ?? { nome, refeicoes: [] };
      if (!a.refeicoes.some((x) => x.id === r.id)) a.refeicoes.push({ id: r.id, nome: r.nome, valeHoje });
      mapa.set(nome, a);
    }
  }
  const lista = [...mapa.values()];
  for (const a of lista) a.refeicoes.sort((x, y) => Number(y.valeHoje) - Number(x.valeHoje));
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Para onde vai o alimento escolhido: a folha da refeição de hoje na aba Dieta; se a refeição é de outro dia (NF3), o calendário dos dias. */
export function destinoDoAlimento(a: AlimentoDaBusca): string {
  const hoje = a.refeicoes.find((r) => r.valeHoje);
  return hoje ? `/dieta?ver=refeicao&r=${encodeURIComponent(hoje.id)}` : "/dieta?ver=dia";
}

/** Palavras extras para a busca achar sem acento ("triceps" acha "Tríceps"). */
export function palavrasSemAcento(...textos: (string | null | undefined)[]): string[] {
  return textos.filter((t): t is string => !!t).map((t) => semAcento(t).toLowerCase());
}

/** A busca só procura com pelo menos 2 letras (com 1, a lista inteira do plano não ajuda). */
export const MINIMO_BUSCA = 2;

const normal = (t: string): string => semAcento(t).toLowerCase();

/**
 * O item entra se CADA palavra digitada aparece (sem acento, sem caixa) em algum dos textos dele — o nome, o grupo muscular, o
 * treino ou a refeição. Sem isto a busca "aproximada" da paleta acharia letras soltas ("peito" achava "Leg Press · Pernas").
 */
export function combina(termo: string, textos: readonly (string | null | undefined)[]): boolean {
  const palavras = normal(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return false;
  const alvo = normal(textos.filter(Boolean).join(" "));
  return palavras.every((p) => alvo.includes(p));
}
