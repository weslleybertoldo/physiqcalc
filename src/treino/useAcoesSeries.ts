import { useCallback, useEffect, useState } from "react";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import { calcularPace } from "@/lib/corrida";
import { clampSeries } from "@/lib/seriesPadrao";
import type { Academia, GrupoExercicio, SerieComMemoria } from "./tipos";

type Atualizar = (acao: SerieComMemoria[] | ((antes: SerieComMemoria[]) => SerieComMemoria[])) => void;

export interface OpcoesAcoes {
  userId: string;
  dateKey: string;
  slotIdx: number;
  grupoId: string;
  grupoPessoal: boolean;
  /** cadeado do profissional: o aluno não adiciona nem tira série */
  seriesTravadas: boolean;
  exercicios: GrupoExercicio[];
  /** séries do slot */
  series: SerieComMemoria[];
  concluido: boolean;
  academia: Academia | null;
  atualizar: Atualizar;
  /** `ultimaDoTreino` = com este OK todas as séries do treino ficaram concluídas (não abre descanso) */
  aoConcluirSerie: (exercicioNome: string, numeroSerie: number, exercicioId: string, ultimaDoTreino: boolean) => void;
  aoMudarConcluido: (concluido: boolean) => void;
}

const doExercicio = (s: SerieComMemoria, exId: string) => s.exercicio_id === exId || s.exercicio_usuario_id === exId;

/**
 * As séries do treino do dia (C64–C66, porte do TreinoDoDia): peso × repetições ou corrida (tempo, distância, pace), OK,
 * Refazer, adicionar/tirar série (menos com o cadeado do profissional) e "Marcar como concluído". Tudo pelo PowerSync:
 * grava no aparelho na hora (sem internet também) e sobe para o Banco do Treino quando a conexão voltar.
 */
export function useAcoesSeries(o: OpcoesAcoes) {
  const db = usePowerSync();
  const { userId, dateKey, slotIdx, academia } = o;
  // o estado tem as séries do DIA (todos os slots): o mesmo exercício pode estar em 2 treinos do dia
  const noSlot = (s: SerieComMemoria, exId: string) => doExercicio(s, exId) && (s.slot_idx ?? 0) === slotIdx;

  const seriesDe = useCallback(
    (exId: string) => o.series.filter((s) => doExercicio(s, exId)).sort((a, b) => a.numero_serie - b.numero_serie),
    [o.series],
  );

  // exercício pessoal grava em exercicio_usuario_id (exercicio_id fica nulo)
  const montar = (exId: string, base: Record<string, unknown>) => {
    const u = o.series.find((s) => doExercicio(s, exId))?.exercicio_usuario_id;
    return u ? { ...base, exercicio_id: null, exercicio_usuario_id: u } : { ...base, exercicio_id: exId };
  };

  const idExistente = async (exId: string, exUsuarioId: string | null | undefined, num: number): Promise<string | null> => {
    const campo = exUsuarioId ? "exercicio_usuario_id" : "exercicio_id";
    const rows = await db.getAll<{ id: string }>(
      `SELECT id FROM tb_treino_series WHERE user_id = ? AND ${campo} = ? AND data_treino = ? AND slot_idx = ? AND numero_serie = ?`,
      [userId, exUsuarioId || exId, dateKey, slotIdx, num],
    );
    return rows[0]?.id ?? null;
  };

  const gravar = async (exId: string, d: Record<string, unknown>) => {
    const exUsuarioId = (d.exercicio_usuario_id as string) || null;
    const exIdVal = (d.exercicio_id as string) || null;
    const id = await idExistente(exId, exUsuarioId, d.numero_serie as number);
    const quando = (d.updated_at as string) ?? new Date().toISOString();
    const valores = [
      userId, exIdVal, exUsuarioId, dateKey, slotIdx, d.numero_serie, d.peso ?? null, d.reps ?? null, d.tempo_segundos ?? null, d.distancia_km ?? null,
      d.pace_segundos_km ?? null, d.concluida ?? null, academia?.nome ?? null, quando,
    ];
    if (id) {
      await db.execute(
        `INSERT OR REPLACE INTO tb_treino_series (id, user_id, exercicio_id, exercicio_usuario_id, data_treino, slot_idx, numero_serie, peso, reps, tempo_segundos, distancia_km, pace_segundos_km, concluida, academia_nome, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ...valores],
      );
    } else {
      await db.execute(
        `INSERT INTO tb_treino_series (id, user_id, exercicio_id, exercicio_usuario_id, data_treino, slot_idx, numero_serie, peso, reps, tempo_segundos, distancia_km, pace_segundos_km, concluida, academia_nome, updated_at)
         VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        valores,
      );
    }
    // com academia, o peso da série vai AO VIVO para a academia (corrida não tem peso)
    if (academia && d.tempo_segundos == null) {
      const ref = await db.getAll<{ id: string }>(
        `SELECT id FROM tb_academia_pesos WHERE user_id = ? AND academia_id = ? AND ifnull(exercicio_id,'') = ? AND ifnull(exercicio_usuario_id,'') = ? AND numero_serie = ?`,
        [userId, academia.id, exIdVal || "", exUsuarioId || "", d.numero_serie],
      );
      if (ref.length > 0) await db.execute("UPDATE tb_academia_pesos SET peso = ?, updated_at = ? WHERE id = ?", [d.peso ?? 0, quando, ref[0].id]);
      else
        await db.execute(
          `INSERT INTO tb_academia_pesos (id, user_id, academia_id, exercicio_id, exercicio_usuario_id, numero_serie, peso, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)`,
          [userId, academia.id, exIdVal, exUsuarioId, d.numero_serie, d.peso ?? 0, quando],
        );
    }
  };

  const salvarSerie = async (exId: string, num: number, peso: number, reps: number, tempo?: number, dist?: number) => {
    const pace = tempo && dist ? calcularPace(tempo, dist) : undefined;
    await gravar(exId, montar(exId, {
      numero_serie: num, peso: tempo ? null : peso, reps: tempo ? null : reps, tempo_segundos: tempo ?? null, distancia_km: dist ?? null,
      pace_segundos_km: pace ?? null, updated_at: new Date().toISOString(),
    }));
    o.atualizar((antes) => antes.map((s) => (noSlot(s, exId) && s.numero_serie === num
      ? { ...s, peso, reps, tempo_segundos: tempo, distancia_km: dist, pace_segundos_km: pace, salva: true } : s)));
  };

  const concluirSerie = async (exId: string, nome: string, num: number, peso: number, reps: number, tempo?: number, dist?: number) => {
    const pace = tempo && dist ? calcularPace(tempo, dist) : undefined;
    const agora = new Date().toISOString();
    // grava ANTES as séries ainda não salvas do mesmo exercício
    for (const s of o.series.filter((x) => doExercicio(x, exId) && !x.salva && x.numero_serie !== num)) {
      try {
        await gravar(exId, montar(exId, { numero_serie: s.numero_serie, peso: s.peso ?? 0, reps: s.reps ?? 10, concluida: false, updated_at: agora }));
      } catch (e) {
        console.warn("[Treino] série ainda não salva:", s.numero_serie, e);
      }
    }
    await gravar(exId, montar(exId, {
      numero_serie: num, peso: tempo ? null : peso, reps: tempo ? null : reps, tempo_segundos: tempo ?? null, distancia_km: dist ?? null,
      pace_segundos_km: pace ?? null, concluida: true, updated_at: agora,
    }));
    o.atualizar((antes) => antes.map((s) => {
      if (noSlot(s, exId) && s.numero_serie === num) return { ...s, peso, reps, tempo_segundos: tempo, distancia_km: dist, pace_segundos_km: pace, concluida: true, salva: true };
      if (noSlot(s, exId) && !s.salva) return { ...s, salva: true };
      return s;
    }));
    // foi a última do treino? só contam os exercícios da lista (trocado/removido fica fora)
    const ativos = new Set(o.exercicios.map((ge) => ge.exercicio_id));
    const falta = o.series.some((s) =>
      (ativos.has(s.exercicio_id) || (!!s.exercicio_usuario_id && ativos.has(s.exercicio_usuario_id))) &&
      !s.concluida && !(doExercicio(s, exId) && s.numero_serie === num));
    o.aoConcluirSerie(nome, num, exId, !falta);
  };

  const desfazerSerie = async (exId: string, num: number) => {
    for (const s of o.series.filter((x) => doExercicio(x, exId) && !x.salva)) {
      if ((s.peso === undefined || s.peso === 0) && (s.reps === undefined || s.reps === 10)) continue; // nunca editada
      await gravar(exId, montar(exId, { numero_serie: s.numero_serie, peso: s.peso ?? 0, reps: s.reps ?? 10, concluida: false, updated_at: new Date().toISOString() }));
    }
    const u = o.series.find((s) => doExercicio(s, exId))?.exercicio_usuario_id;
    await db.execute(
      `UPDATE tb_treino_series SET concluida = ?, updated_at = ? WHERE user_id = ? AND ${u ? "exercicio_usuario_id" : "exercicio_id"} = ? AND data_treino = ? AND slot_idx = ? AND numero_serie = ?`,
      [false, new Date().toISOString(), userId, u || exId, dateKey, slotIdx, num],
    );
    o.atualizar((antes) => antes.map((s) => {
      if (noSlot(s, exId) && s.numero_serie === num) return { ...s, concluida: false };
      if (noSlot(s, exId) && !s.salva) return { ...s, salva: true };
      return s;
    }));
    // refazer uma série de treino já concluído desfaz também o "treino concluído"
    if (o.concluido) {
      await db.execute("DELETE FROM tb_treino_concluido WHERE user_id = ? AND data_treino = ? AND slot_idx = ?", [userId, dateKey, slotIdx]);
      o.aoMudarConcluido(false);
    }
  };

  /** Espelha o total de séries do exercício no nº configurado (o profissional vê ao vivo; os próximos dias abrem com ele). */
  const espelharSeriesPadrao = async (exId: string, exUsuarioId: string | undefined, total: number) => {
    try {
      const n = clampSeries(total);
      const gCol = o.grupoPessoal ? "grupo_usuario_id" : "grupo_id";
      const exCol = exUsuarioId ? "exercicio_usuario_id" : "exercicio_id";
      const existentes = await db.getAll<{ id: string; num_series: number }>(
        `SELECT id, num_series FROM tb_series_padrao_usuario WHERE user_id = ? AND ${gCol} = ? AND ${exCol} = ?`,
        [userId, o.grupoId, exUsuarioId || exId],
      );
      const agora = new Date().toISOString();
      if (existentes.length > 0) {
        if (Number(existentes[0].num_series) === n) return;
        await db.execute("UPDATE tb_series_padrao_usuario SET num_series = ?, updated_at = ? WHERE id = ? AND user_id = ?", [n, agora, existentes[0].id, userId]);
      } else {
        await db.execute(
          `INSERT INTO tb_series_padrao_usuario (id, user_id, grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series, updated_at)
           VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)`,
          [userId, o.grupoPessoal ? null : o.grupoId, o.grupoPessoal ? o.grupoId : null, exUsuarioId ? null : exId, exUsuarioId ?? null, n, agora],
        );
      }
    } catch (e) {
      console.error("[Treino] nº de séries do exercício:", e);
    }
  };

  const adicionarSerie = async (exId: string) => {
    if (o.seriesTravadas) return;
    const existentes = seriesDe(exId);
    const ultima = existentes[existentes.length - 1];
    const num = existentes.length > 0 ? Math.max(...existentes.map((s) => s.numero_serie)) + 1 : 1;
    const peso = ultima?.peso ?? 0;
    const reps = ultima?.reps ?? 10;
    const u = o.series.find((s) => doExercicio(s, exId))?.exercicio_usuario_id;
    await gravar(exId, montar(exId, { numero_serie: num, peso, reps, updated_at: new Date().toISOString() }));
    o.atualizar((antes) => [...antes, { exercicio_id: exId, exercicio_usuario_id: u, slot_idx: slotIdx, numero_serie: num, peso, reps, concluida: false, salva: true }]);
    void espelharSeriesPadrao(exId, u, existentes.length + 1);
  };

  const removerSerie = async (exId: string, num: number, salva: boolean) => {
    if (o.seriesTravadas) return;
    const antesTotal = seriesDe(exId).length;
    const u = o.series.find((s) => doExercicio(s, exId))?.exercicio_usuario_id;
    if (salva) {
      await db.execute(
        `DELETE FROM tb_treino_series WHERE user_id = ? AND ${u ? "exercicio_usuario_id" : "exercicio_id"} = ? AND data_treino = ? AND slot_idx = ? AND numero_serie = ?`,
        [userId, u || exId, dateKey, slotIdx, num],
      );
    }
    o.atualizar((antes) => {
      const prox = antes
        .filter((s) => !(noSlot(s, exId) && s.numero_serie === num))
        .map((s) => (noSlot(s, exId) && s.numero_serie > num ? { ...s, numero_serie: s.numero_serie - 1 } : s));
      // renumera no banco as que andaram
      const renumeradas = prox.filter((s) => noSlot(s, exId) && s.salva && s.numero_serie >= num);
      Promise.all(
        renumeradas.map((s) =>
          gravar(exId, montar(exId, { numero_serie: s.numero_serie, peso: s.peso ?? 0, reps: s.reps ?? 10, concluida: s.concluida ?? false, updated_at: new Date().toISOString() })),
        ),
      ).catch((e) => console.error("[Treino] renumerar séries:", e));
      return prox;
    });
    void espelharSeriesPadrao(exId, u, antesTotal - 1);
  };

  /** "Marcar como concluído" / desmarcar (sem o cronômetro). */
  const alternarConcluido = async () => {
    if (o.concluido) {
      await db.execute("DELETE FROM tb_treino_concluido WHERE user_id = ? AND data_treino = ? AND slot_idx = ?", [userId, dateKey, slotIdx]);
      o.aoMudarConcluido(false);
      return;
    }
    const existe = await db.getAll<{ id: string }>("SELECT id FROM tb_treino_concluido WHERE user_id = ? AND data_treino = ? AND slot_idx = ?", [userId, dateKey, slotIdx]);
    const agora = new Date().toISOString();
    if (existe.length > 0) {
      await db.execute("INSERT OR REPLACE INTO tb_treino_concluido (id, user_id, data_treino, slot_idx, concluido, created_at) VALUES (?, ?, ?, ?, ?, ?)", [existe[0].id, userId, dateKey, slotIdx, true, agora]);
    } else {
      await db.execute("INSERT INTO tb_treino_concluido (id, user_id, data_treino, slot_idx, concluido, created_at) VALUES (uuid(), ?, ?, ?, ?, ?)", [userId, dateKey, slotIdx, true, agora]);
    }
    o.aoMudarConcluido(true);
    toast.success("Treino concluído!");
  };

  return { seriesDe, salvarSerie, concluirSerie, desfazerSerie, adicionarSerie, removerSerie, alternarConcluido };
}

/**
 * Ordem dos exercícios do aluno (C71: reordenar arrastando) — a de hoje em `exercicio_ordem_usuario` (por aluno e grupo).
 */
export function useOrdemExercicios(userId: string, grupoId: string, exercicios: GrupoExercicio[]) {
  const db = usePowerSync();
  const [itens, setItens] = useState<GrupoExercicio[]>([]);
  const chave = exercicios.map((e) => `${e.exercicio_id}:${e.ordem}:${e.substituindo?.id ?? ""}`).join("|");

  useEffect(() => {
    let vivo = true;
    const padrao = [...exercicios].sort((a, b) => a.ordem - b.ordem);
    (async () => {
      try {
        const ordem = await db.getAll<{ exercicio_id: string; posicao: number }>(
          "SELECT exercicio_id, posicao FROM exercicio_ordem_usuario WHERE user_id = ? AND grupo_id = ?",
          [userId, grupoId],
        );
        if (!vivo) return;
        if (!ordem.length) return setItens(padrao);
        const pos = Object.fromEntries(ordem.map((x) => [x.exercicio_id, x.posicao]));
        setItens([...padrao].sort((a, b) => (pos[a.exercicio_id] ?? 999) - (pos[b.exercicio_id] ?? 999)));
      } catch {
        if (vivo) setItens(padrao);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume a lista (o array muda de identidade a cada render do pai)
  }, [chave, userId, grupoId, db]);

  const salvarOrdem = async (nova: GrupoExercicio[]) => {
    setItens(nova);
    const agora = new Date().toISOString();
    for (let posicao = 0; posicao < nova.length; posicao++) {
      const ex = nova[posicao];
      const existe = await db.getAll<{ id: string }>("SELECT id FROM exercicio_ordem_usuario WHERE user_id = ? AND grupo_id = ? AND exercicio_id = ?", [userId, grupoId, ex.exercicio_id]);
      if (existe.length > 0) {
        await db.execute(
          "INSERT OR REPLACE INTO exercicio_ordem_usuario (id, user_id, grupo_id, exercicio_id, posicao, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [existe[0].id, userId, grupoId, ex.exercicio_id, posicao, agora],
        );
      } else {
        await db.execute(
          "INSERT INTO exercicio_ordem_usuario (id, user_id, grupo_id, exercicio_id, posicao, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?)",
          [userId, grupoId, ex.exercicio_id, posicao, agora],
        );
      }
    }
  };

  const voltarOrdemPadrao = async () => {
    try {
      await db.execute("DELETE FROM exercicio_ordem_usuario WHERE user_id = ? AND grupo_id = ?", [userId, grupoId]);
      setItens([...exercicios].sort((a, b) => a.ordem - b.ordem));
      toast.success("Ordem do profissional de volta.");
    } catch (e) {
      toast.error(`Não deu para voltar a ordem: ${(e as Error)?.message || "erro"}`);
    }
  };

  return { itens, salvarOrdem, voltarOrdemPadrao };
}
