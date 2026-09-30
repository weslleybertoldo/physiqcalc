/**
 * Remover exercício do treino, só hoje ou de vez, com "Restaurar" (C67) — a MESMA gravação de hoje (modelo da troca):
 *  - só neste dia → linha em `exercicio_substituicao_usuario` com `data_treino` e SEM exercício novo;
 *  - de vez, grupo pessoal → sai de `tb_grupos_exercicios_usuario` (igual editar o grupo);
 *  - de vez, grupo do profissional → linha com `data_treino` NULL e SEM exercício novo (o grupo dele não muda).
 */
export type EscopoRemocao = "dia" | "definitiva";

interface BancoLocal {
  getAll<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface AlvoRemocao {
  userId: string;
  /** id do exercício na programação do grupo (o original quando o item mostrado já é uma troca) */
  origemId: string;
  grupoId: string;
  grupoPessoal: boolean;
  slotIdx: number;
  dateKey: string;
}

export async function removerExercicio(db: BancoLocal, a: AlvoRemocao, escopo: EscopoRemocao): Promise<void> {
  const agora = new Date().toISOString();
  if (escopo === "definitiva" && a.grupoPessoal) {
    const linhas = await db.getAll<{ id: string }>(
      `SELECT id FROM tb_grupos_exercicios_usuario WHERE user_id = ? AND grupo_usuario_id = ? AND (exercicio_id = ? OR exercicio_usuario_id = ?)`,
      [a.userId, a.grupoId, a.origemId, a.origemId],
    );
    if (linhas.length === 0) throw new Error("exercício não encontrado no grupo");
    for (const l of linhas) await db.execute("DELETE FROM tb_grupos_exercicios_usuario WHERE id = ? AND user_id = ?", [l.id, a.userId]);
    // trocas e remoções pendentes desse exercício neste grupo perdem o sentido
    await db.execute("DELETE FROM exercicio_substituicao_usuario WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ?", [a.userId, a.grupoId, a.origemId]);
    return;
  }
  if (escopo === "definitiva") {
    // grupo do profissional: vale no grupo inteiro (qualquer slot) e substitui troca/remoção anterior desse exercício
    await db.execute("DELETE FROM exercicio_substituicao_usuario WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ?", [a.userId, a.grupoId, a.origemId]);
    await db.execute(
      `INSERT INTO exercicio_substituicao_usuario
         (id, user_id, grupo_id, slot_idx, exercicio_origem_id, exercicio_novo_id, exercicio_novo_usuario_id, data_treino, created_at, updated_at)
       VALUES (uuid(), ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
      [a.userId, a.grupoId, a.slotIdx, a.origemId, agora, agora],
    );
    return;
  }
  // só neste dia: uma troca do dia que já existe vira remoção do dia
  const existentes = await db.getAll<{ id: string }>(
    `SELECT id FROM exercicio_substituicao_usuario WHERE user_id = ? AND grupo_id = ? AND slot_idx = ? AND exercicio_origem_id = ? AND data_treino = ?`,
    [a.userId, a.grupoId, a.slotIdx, a.origemId, a.dateKey],
  );
  if (existentes[0]) {
    await db.execute(
      "UPDATE exercicio_substituicao_usuario SET exercicio_novo_id = NULL, exercicio_novo_usuario_id = NULL, updated_at = ? WHERE id = ? AND user_id = ?",
      [agora, existentes[0].id, a.userId],
    );
  } else {
    await db.execute(
      `INSERT INTO exercicio_substituicao_usuario
         (id, user_id, grupo_id, slot_idx, exercicio_origem_id, exercicio_novo_id, exercicio_novo_usuario_id, data_treino, created_at, updated_at)
       VALUES (uuid(), ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      [a.userId, a.grupoId, a.slotIdx, a.origemId, a.dateKey, agora, agora],
    );
  }
}

/** Desfaz uma remoção (do dia neste slot; de vez em qualquer slot do grupo). */
export async function restaurarExercicio(db: BancoLocal, a: Omit<AlvoRemocao, "grupoPessoal">, escopo: EscopoRemocao): Promise<void> {
  if (escopo === "dia") {
    await db.execute(
      `DELETE FROM exercicio_substituicao_usuario
       WHERE user_id = ? AND grupo_id = ? AND slot_idx = ? AND exercicio_origem_id = ?
         AND data_treino = ? AND exercicio_novo_id IS NULL AND exercicio_novo_usuario_id IS NULL`,
      [a.userId, a.grupoId, a.slotIdx, a.origemId, a.dateKey],
    );
    return;
  }
  await db.execute(
    `DELETE FROM exercicio_substituicao_usuario
     WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ?
       AND data_treino IS NULL AND exercicio_novo_id IS NULL AND exercicio_novo_usuario_id IS NULL`,
    [a.userId, a.grupoId, a.origemId],
  );
}
