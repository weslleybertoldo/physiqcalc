// Physiq W7b — "Usar este treino": o treino pronto vira o treino DO ALUNO pelo PowerSync (grava no aparelho numa transação só:
// funciona sem internet e sobe para o Banco do Treino quando a conexão voltar). As regras do que é gravado estão em
// regras.ts (planoDeEscrita — testadas no Vitest).
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { planoDeEscrita, type TreinoPronto } from "./regras";

const MARCA = "physiq_treino_pronto_escolhido:";

export interface TreinoEscolhido {
  codigo: string;
  nome: string;
  em: string;
}

export function treinoEscolhido(userId: string | null | undefined): TreinoEscolhido | null {
  if (!userId) return null;
  try {
    return JSON.parse(localStorage.getItem(MARCA + userId) || "null") as TreinoEscolhido | null;
  } catch {
    return null;
  }
}

/** Quantos treinos próprios e dias na semana o aluno já tem (para o aviso "a sua semana vai ser trocada"). */
export async function semanaDoAluno(db: AbstractPowerSyncDatabase, userId: string): Promise<{ dias: number; proprios: number }> {
  const [s, g] = await Promise.all([
    db.getAll<{ n: number }>("SELECT count(*) AS n FROM tb_semana_treinos WHERE user_id = ?", [userId]),
    db.getAll<{ n: number }>("SELECT count(*) AS n FROM tb_grupos_treino_usuario WHERE user_id = ?", [userId]),
  ]);
  return { dias: Number(s[0]?.n ?? 0), proprios: Number(g[0]?.n ?? 0) };
}

export async function aplicarTreinoPronto(db: AbstractPowerSyncDatabase, t: TreinoPronto, userId: string): Promise<Array<{ id: string; nome: string; dias: string[] }>> {
  const agora = new Date().toISOString();
  const semana = await db.getAll<{ id: string }>("SELECT id FROM tb_semana_treinos WHERE user_id = ?", [userId]);
  const { operacoes, grupos } = planoDeEscrita(t, userId, semana, { novoId: () => crypto.randomUUID(), agora });
  await db.writeTransaction(async (tx) => {
    for (const op of operacoes) await tx.execute(op.sql, op.params);
  });
  try {
    localStorage.setItem(MARCA + userId, JSON.stringify({ codigo: t.codigo, nome: t.nome, em: agora } satisfies TreinoEscolhido));
  } catch {
    /* sem armazenamento: só a marca some */
  }
  return grupos;
}
