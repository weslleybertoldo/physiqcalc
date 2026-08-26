/**
 * Substituição / remoção de exercício no treino.
 *
 * `data_treino = null` → vale em qualquer data (DEFINITIVA).
 * `data_treino = "2026-08-11"` → vale SÓ naquele dia (e ganha da definitiva).
 *
 * Linha COM exercício novo = troca (o novo entra no lugar do original).
 * Linha SEM exercício novo (novo_id e novo_usuario_id nulos) = REMOÇÃO
 * (o original sai do treino naquele escopo).
 *
 * Grupo pessoal + definitiva é resolvido editando o grupo direto
 * (tb_grupos_exercicios_usuario); estas linhas cobrem o escopo "do dia" em
 * qualquer grupo e o definitivo em grupo do treinador (catálogo).
 */

export interface Substituicao {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
  grupo_id: string;
  slot_idx: number | null;
  exercicio_origem_id: string;
  exercicio_novo_id: string | null;
  exercicio_novo_usuario_id: string | null;
  data_treino: string | null;
}

export interface ExercicioAlvo {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  tipo?: string;
  imagem_url?: string | null;
  subgrupo?: string | null;
  dica?: string | null;
  isPessoal?: boolean;
}

export interface ItemTreino {
  exercicio_id: string;
  exercicio_usuario_id?: string;
  ordem: number;
  tb_exercicios: ExercicioAlvo;
  /** Preenchido quando o item veio de uma substituição */
  substituindo?: { id: string; nome: string; escopo: "dia" | "definitiva"; trocadoEm: string | null };
}

/** Exercício que saiu do treino por uma remoção (linha sem exercício novo) */
export interface ItemRemovido {
  /** Id do exercício de origem (o programado no grupo) */
  exercicio_id: string;
  nome: string;
  emoji: string;
  escopo: "dia" | "definitiva";
}

/** Linha sem exercício novo = remoção do exercício de origem */
export function ehRemocao(sub: Substituicao): boolean {
  return !sub.exercicio_novo_id && !sub.exercicio_novo_usuario_id;
}

/** Data (YYYY-MM-DD, fuso local) em que a troca foi feita — usada pro selo "trocado" */
export function dataDaTroca(sub: Substituicao): string | null {
  if (sub.data_treino) return sub.data_treino;
  const ts = sub.updated_at || sub.created_at;
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Mesmo alvo: grupo + exercício de origem. A troca/remoção DO DIA é do slot em que foi
 * feita; a DEFINITIVA vale no grupo inteiro ("vale para os próximos treinos"), em
 * qualquer slot em que o grupo apareça — mesma leitura da edge admin-semana-treinos.
 */
const mesmoAlvo = (s: Substituicao, grupoId: string, slotIdx: number, exercicioId: string) =>
  s.grupo_id === grupoId &&
  s.exercicio_origem_id === exercicioId &&
  (!s.data_treino || (s.slot_idx ?? 0) === slotIdx);

/** A substituição que vale para (grupo, slot, exercício, data) — a do dia ganha da definitiva */
export function resolverSubstituicao(
  subs: Substituicao[],
  alvo: { grupoId: string; slotIdx: number; exercicioId: string; dateKey: string },
): Substituicao | null {
  const candidatas = subs.filter((s) =>
    mesmoAlvo(s, alvo.grupoId, alvo.slotIdx, alvo.exercicioId),
  );
  return (
    candidatas.find((s) => s.data_treino === alvo.dateKey) ??
    candidatas.find((s) => !s.data_treino) ??
    null
  );
}

/**
 * Troca os exercícios do slot pelos substitutos que valem naquela data e
 * tira da lista os que foram removidos.
 * Substituição cujo exercício novo não está no catálogo local é ignorada
 * (mantém o original em vez de sumir com o exercício).
 */
export function aplicarSubstituicoes(
  itens: ItemTreino[],
  subs: Substituicao[],
  ctx: { grupoId: string; slotIdx: number; dateKey: string },
  exerciciosPorId: Map<string, ExercicioAlvo>,
): ItemTreino[] {
  if (subs.length === 0) return itens;

  return itens.flatMap((item) => {
    const sub = resolverSubstituicao(subs, {
      grupoId: ctx.grupoId,
      slotIdx: ctx.slotIdx,
      exercicioId: item.exercicio_id,
      dateKey: ctx.dateKey,
    });
    if (!sub) return [item];

    // Removido neste escopo: sai da lista
    if (ehRemocao(sub)) return [];

    const novoId = sub.exercicio_novo_usuario_id || sub.exercicio_novo_id;
    const novo = novoId ? exerciciosPorId.get(novoId) : undefined;
    if (!novo) return [item];

    return [{
      exercicio_id: novo.id,
      exercicio_usuario_id: novo.isPessoal ? novo.id : undefined,
      ordem: item.ordem,
      tb_exercicios: novo,
      substituindo: {
        id: item.exercicio_id,
        nome: item.tb_exercicios.nome,
        escopo: sub.data_treino ? "dia" : "definitiva",
        trocadoEm: dataDaTroca(sub),
      },
    }];
  });
}

/**
 * Exercícios do slot que estão REMOVIDOS na data (pra oferecer "restaurar").
 * Mesma regra de precedência do resolver: se a linha que vale na data é uma
 * remoção, o exercício conta como removido (do dia ou definitivo).
 */
export function exerciciosRemovidos(
  itens: ItemTreino[],
  subs: Substituicao[],
  ctx: { grupoId: string; slotIdx: number; dateKey: string },
): ItemRemovido[] {
  if (subs.length === 0) return [];
  const out: ItemRemovido[] = [];
  for (const item of itens) {
    const sub = resolverSubstituicao(subs, {
      grupoId: ctx.grupoId,
      slotIdx: ctx.slotIdx,
      exercicioId: item.exercicio_id,
      dateKey: ctx.dateKey,
    });
    if (!sub || !ehRemocao(sub)) continue;
    out.push({
      exercicio_id: item.exercicio_id,
      nome: item.tb_exercicios.nome,
      emoji: item.tb_exercicios.emoji,
      escopo: sub.data_treino ? "dia" : "definitiva",
    });
  }
  return out;
}
