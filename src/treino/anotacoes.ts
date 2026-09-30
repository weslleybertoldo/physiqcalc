/**
 * Anotações do exercício (C68) — as mesmas de hoje em `tb_exercicio_comentarios`, pelo PowerSync (funciona sem internet).
 * O id pode ser de exercício do catálogo (`exercicio_id`) ou pessoal do aluno (`exercicio_usuario_id`): gravar com a coluna
 * errada fazia a FK recusar o envio e a anotação sumir — por isso a coluna é descoberta pelo catálogo local.
 */

interface BancoLocal {
  getAll<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

async function coluna(db: BancoLocal, exercicioId: string): Promise<"exercicio_id" | "exercicio_usuario_id"> {
  const cat = await db.getAll("SELECT 1 FROM tb_exercicios WHERE id = ? LIMIT 1", [exercicioId]);
  return cat.length > 0 ? "exercicio_id" : "exercicio_usuario_id";
}

export async function carregarAnotacao(db: BancoLocal | null | undefined, userId: string, exercicioId: string): Promise<string> {
  if (!db) return "";
  const c = await coluna(db, exercicioId);
  const rows = await db.getAll<{ comentario: string | null }>(`SELECT comentario FROM tb_exercicio_comentarios WHERE user_id = ? AND ${c} = ?`, [userId, exercicioId]);
  return rows[0]?.comentario ?? "";
}

/** Texto vazio apaga a anotação. */
export async function salvarAnotacao(db: BancoLocal, userId: string, exercicioId: string, texto: string): Promise<void> {
  const c = await coluna(db, exercicioId);
  const onde = `user_id = ? AND ${c} = ?`;
  if (!texto.trim()) {
    await db.execute(`DELETE FROM tb_exercicio_comentarios WHERE ${onde}`, [userId, exercicioId]);
    return;
  }
  const existe = await db.getAll<{ id: string }>(`SELECT id FROM tb_exercicio_comentarios WHERE ${onde}`, [userId, exercicioId]);
  const exId = c === "exercicio_id" ? exercicioId : null;
  const exUsuarioId = c === "exercicio_usuario_id" ? exercicioId : null;
  const agora = new Date().toISOString();
  if (existe[0]?.id) {
    await db.execute(
      `INSERT OR REPLACE INTO tb_exercicio_comentarios (id, user_id, exercicio_id, exercicio_usuario_id, comentario, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [existe[0].id, userId, exId, exUsuarioId, texto.trim(), agora, agora],
    );
  } else {
    await db.execute(
      `INSERT INTO tb_exercicio_comentarios (id, user_id, exercicio_id, exercicio_usuario_id, comentario, updated_at, created_at)
       VALUES (uuid(), ?, ?, ?, ?, ?, ?)`,
      [userId, exId, exUsuarioId, texto.trim(), agora, agora],
    );
  }
}
