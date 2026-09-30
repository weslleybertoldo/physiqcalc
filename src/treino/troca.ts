/**
 * Trocar exercício, só hoje ou de vez, com "Restaurar" (C67 — a MESMA gravação da troca de hoje, que morava no
 * ModalTrocarExercicio e agora é do TrocarExercicio da W9):
 *  - só neste dia → linha em `exercicio_substituicao_usuario` com `data_treino` (a do dia ganha da de vez);
 *  - de vez, treino próprio do aluno → o exercício do grupo é trocado de verdade (`tb_grupos_exercicios_usuario`);
 *  - de vez, treino do profissional → linha com `data_treino` NULL (o treino dele não muda), valendo de hoje em diante:
 *    as trocas/remoções do dia desse exercício de hoje em diante saem (senão a do dia escondia a de vez); dias passados ficam
 *    como foram treinados.
 * Tudo no SQLite do PowerSync: funciona sem internet e sobe depois.
 */
export type EscopoTroca = "dia" | "definitiva";

interface BancoLocal {
  getAll<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface AlvoTroca {
  userId: string;
  /** id do exercício na programação do grupo (o original quando o item mostrado já é uma troca) */
  origemId: string;
  grupoId: string;
  grupoPessoal: boolean;
  slotIdx: number;
  dateKey: string;
}

export interface ExercicioQueEntra {
  id: string;
  /** exercício próprio do aluno (tb_exercicios_usuario) */
  isPessoal?: boolean;
}

/** O exercício novo já está no treino próprio (de vez não deixa repetir). */
export class JaEstaNoTreino extends Error {}

export async function trocarExercicio(db: BancoLocal, a: AlvoTroca, novo: ExercicioQueEntra, escopo: EscopoTroca): Promise<void> {
  const agora = new Date().toISOString();
  const novoGlobalId = novo.isPessoal ? null : novo.id;
  const novoPessoalId = novo.isPessoal ? novo.id : null;

  if (escopo === "definitiva" && a.grupoPessoal) {
    const linhas = await db.getAll<{ id: string }>(
      `SELECT id FROM tb_grupos_exercicios_usuario WHERE user_id = ? AND grupo_usuario_id = ? AND (exercicio_id = ? OR exercicio_usuario_id = ?)`,
      [a.userId, a.grupoId, a.origemId, a.origemId],
    );
    if (linhas.length === 0) throw new Error("exercício não encontrado no grupo");
    const jaNoGrupo = await db.getAll<{ id: string }>(
      `SELECT id FROM tb_grupos_exercicios_usuario WHERE user_id = ? AND grupo_usuario_id = ? AND (exercicio_id = ? OR exercicio_usuario_id = ?)`,
      [a.userId, a.grupoId, novo.id, novo.id],
    );
    if (jaNoGrupo.length > 0) throw new JaEstaNoTreino("o exercício novo já está no treino");
    for (const l of linhas) {
      await db.execute("UPDATE tb_grupos_exercicios_usuario SET exercicio_id = ?, exercicio_usuario_id = ? WHERE id = ? AND user_id = ?", [
        novoGlobalId,
        novoPessoalId,
        l.id,
        a.userId,
      ]);
    }
    // trocas e remoções pendentes do exercício antigo neste grupo perdem o sentido
    await db.execute("DELETE FROM exercicio_substituicao_usuario WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ?", [a.userId, a.grupoId, a.origemId]);
    return;
  }

  const dataTreino = escopo === "dia" ? a.dateKey : null;
  if (!dataTreino) {
    await db.execute(
      `DELETE FROM exercicio_substituicao_usuario
       WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ? AND (data_treino IS NULL OR data_treino >= ?)`,
      [a.userId, a.grupoId, a.origemId, a.dateKey],
    );
  }
  const existentes = dataTreino
    ? await db.getAll<{ id: string }>(
        `SELECT id FROM exercicio_substituicao_usuario
         WHERE user_id = ? AND grupo_id = ? AND slot_idx = ? AND exercicio_origem_id = ? AND data_treino = ?`,
        [a.userId, a.grupoId, a.slotIdx, a.origemId, dataTreino],
      )
    : [];
  if (existentes[0]) {
    await db.execute(
      "UPDATE exercicio_substituicao_usuario SET exercicio_novo_id = ?, exercicio_novo_usuario_id = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [novoGlobalId, novoPessoalId, agora, existentes[0].id, a.userId],
    );
    return;
  }
  await db.execute(
    `INSERT INTO exercicio_substituicao_usuario
       (id, user_id, grupo_id, slot_idx, exercicio_origem_id, exercicio_novo_id, exercicio_novo_usuario_id, data_treino, created_at, updated_at)
     VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.userId, a.grupoId, a.slotIdx, a.origemId, novoGlobalId, novoPessoalId, dataTreino, agora, agora],
  );
}

/**
 * Restaurar (desfazer a troca): a do dia sai só neste dia e neste treino (volta a de vez, se houver); a de vez sai do grupo
 * de hoje em diante (com as do dia desse exercício daqui para a frente) — os dias passados ficam como foram treinados.
 */
export async function restaurarTroca(db: BancoLocal, a: Omit<AlvoTroca, "grupoPessoal">, escopo: EscopoTroca): Promise<void> {
  if (escopo === "dia") {
    await db.execute(
      `DELETE FROM exercicio_substituicao_usuario
       WHERE user_id = ? AND grupo_id = ? AND slot_idx = ? AND exercicio_origem_id = ? AND data_treino = ?`,
      [a.userId, a.grupoId, a.slotIdx, a.origemId, a.dateKey],
    );
    return;
  }
  await db.execute(
    `DELETE FROM exercicio_substituicao_usuario
     WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ? AND (data_treino IS NULL OR data_treino >= ?)`,
    [a.userId, a.grupoId, a.origemId, a.dateKey],
  );
}
