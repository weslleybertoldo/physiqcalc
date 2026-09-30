import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePowerSync, useQuery } from "@powersync/react";
import { toast } from "sonner";
import { chaveParaConcluido, contarDiasTreinados, diasTreinados } from "@/lib/contagemTreinos";
import {
  SERIES_PADRAO_DEFAULT,
  chaveTreino,
  clampSeries,
  estruturaSeriesPadrao,
  mapaSeriesPadrao,
  numSeriesPadrao,
  numerosParaCompletar,
  type SeriePadraoRow,
} from "@/lib/seriesPadrao";
import { chavesExerciciosAtivos, serieDeExercicioAtivo } from "@/lib/seriesAtivas";
import { resolverTreinosDoDia, type DiaAlternadoConfig } from "@/lib/semanaSlots";
import { aplicarSubstituicoes, exerciciosRemovidos, type ExercicioAlvo, type Substituicao } from "@/lib/substituicaoExercicio";
import { DIAS_SEMANA, chaveData, datasDaSemana, inicioDoMes } from "./datas";
import { mapaPrescricao, prescricaoDoExercicio, repsIniciais, type LinhaPrescricao } from "./prescricao";
import type { Academia, DiaSlot, GrupoExercicio, GrupoTreino, OverrideInfo, SemanaConfig, SerieComMemoria } from "./tipos";

const LS_ACADEMIA = "physiq_academia_atual";

type Linha = Record<string, unknown>;

/** Um exercício da lista do dia, com o slot e a chave do treino (séries padrão / prescrição). */
export type ExercicioDoDia = GrupoExercicio & { _slot_idx: number; _grupo_key: string | null };

export interface PerfilTreino {
  nome: string | null;
  foto_url: string | null;
  tempo_descanso_segundos: number | null;
  series_padrao_qtd: number | null;
  series_travadas: boolean;
}

/**
 * Tudo o que a aba Treino lê do SQLite local (PowerSync — funciona sem internet) e as regras que a TreinosPage antiga
 * aplicava: semana (padrão, treino alternado, trocas do dia), treinos do profissional e os próprios, trocas e remoções de
 * exercício, séries do dia (salvas + as que faltam até o nº configurado, com peso/reps do último treino ou da academia),
 * treinos feitos na semana e no mês, academias (cargas por academia) e a prescrição opcional (NF1).
 */
export function useTreinoDoDia(userId: string) {
  const db = usePowerSync();

  // ── datas ──
  const [hoje, setHoje] = useState(() => new Date());
  const [deslocamento, setDeslocamento] = useState(0);
  const datas = useMemo(() => {
    const ref = new Date(hoje);
    ref.setDate(ref.getDate() + deslocamento * 7);
    return datasDaSemana(ref);
  }, [hoje, deslocamento]);
  const [selecionada, setSelecionada] = useState(() => chaveData(new Date()));
  const hojeChave = chaveData(hoje);

  // trocou de semana → seleciona hoje (semana atual) ou a segunda (outras)
  const semanaAnteriorRef = useRef(deslocamento);
  useEffect(() => {
    if (semanaAnteriorRef.current === deslocamento) return;
    semanaAnteriorRef.current = deslocamento;
    setSelecionada(deslocamento === 0 ? chaveData(hoje) : chaveData(datas[0]));
  }, [deslocamento, hoje, datas]);

  // virou o dia (depois da meia-noite com o app aberto)
  useEffect(() => {
    const id = setInterval(() => {
      const agora = new Date();
      if (chaveData(agora) !== chaveData(hoje)) setHoje(agora);
    }, 60_000);
    return () => clearInterval(id);
  }, [hoje]);

  const irParaHoje = useCallback(() => {
    setDeslocamento(0);
    semanaAnteriorRef.current = 0;
    setSelecionada(chaveData(new Date()));
  }, []);

  /** Abre um dia qualquer (ex.: o do treino que está com o cronômetro rodando). */
  const irParaData = useCallback((chave: string) => {
    const alvo = new Date(`${chave}T12:00:00`);
    const semanaAlvo = datasDaSemana(alvo)[0];
    const semanaHoje = datasDaSemana(new Date())[0];
    const desloc = Math.round((semanaAlvo.getTime() - semanaHoje.getTime()) / (7 * 86_400_000));
    semanaAnteriorRef.current = desloc;
    setDeslocamento(desloc);
    setSelecionada(chave);
  }, []);

  // ── manutenção de hoje (a TreinosPage fazia na abertura) ──
  useEffect(() => {
    try {
      localStorage.removeItem("physiq_offline_pending"); // fila do offlineSync antigo (o PowerSync cuida de tudo)
      localStorage.removeItem("physiq_offline_cache");
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    if (!userId) return;
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 12);
    db.execute("DELETE FROM tb_treino_series WHERE user_id = ? AND data_treino < ?", [userId, limite.toISOString().slice(0, 10)]).catch((e) =>
      console.error("[Treino] limpeza das séries com mais de 12 meses:", e),
    );
  }, [userId, db]);

  // ── perfil (descanso e séries do profissional — aba Configuração) ──
  const { data: perfilRows, isLoading: carregandoPerfil } = useQuery<Linha>(
    "SELECT nome, foto_url, tempo_descanso_segundos, series_padrao_qtd, series_travadas FROM physiq_profiles WHERE id = ?",
    [userId],
  );
  const perfil = useMemo<PerfilTreino | null>(() => {
    const r = perfilRows?.[0];
    if (!r) return null;
    return {
      nome: (r.nome as string) ?? null,
      foto_url: (r.foto_url as string) ?? null,
      tempo_descanso_segundos: r.tempo_descanso_segundos != null ? Number(r.tempo_descanso_segundos) : null,
      series_padrao_qtd: r.series_padrao_qtd != null ? Number(r.series_padrao_qtd) : null,
      series_travadas: r.series_travadas === 1 || r.series_travadas === true || r.series_travadas === "true",
    };
  }, [perfilRows]);
  const seriesPadraoAluno = clampSeries(perfil?.series_padrao_qtd ?? SERIES_PADRAO_DEFAULT);
  const seriesTravadas = !!perfil?.series_travadas;

  // descanso padrão = o do profissional (antes 120 s fixo); o ajuste do aluno no descanso vale na sessão
  const [descansoPadrao, setDescansoPadrao] = useState(120);
  useEffect(() => {
    const seg = perfil?.tempo_descanso_segundos;
    if (seg && seg > 0) setDescansoPadrao(Math.round(seg));
  }, [perfil?.tempo_descanso_segundos]);

  // ── grupos (do profissional e os próprios) ──
  const { data: gruposRows } = useQuery<GrupoTreino>("SELECT id, nome FROM tb_grupos_treino ORDER BY nome");
  const grupos = useMemo<GrupoTreino[]>(() => gruposRows || [], [gruposRows]);
  const { data: gruposPessoaisRows } = useQuery<GrupoTreino>("SELECT id, nome FROM tb_grupos_treino_usuario WHERE user_id = ? ORDER BY nome", [userId]);
  const gruposPessoais = useMemo<GrupoTreino[]>(() => gruposPessoaisRows || [], [gruposPessoaisRows]);

  // ── semana ──
  const { data: semanaRows } = useQuery<Linha>(
    `SELECT s.dia_semana, s.slot_idx, s.grupo_id, s.grupo_usuario_id, s.extra, s.extra_atrelado_grupo_id, s.extra_atrelado_grupo_usuario_id,
            g.id as grupo_treino_id, g.nome as grupo_treino_nome
     FROM tb_semana_treinos s LEFT JOIN tb_grupos_treino g ON s.grupo_id = g.id
     WHERE s.user_id = ?`,
    [userId],
  );
  const semana = useMemo<SemanaConfig[]>(
    () =>
      (semanaRows || []).map((r) => ({
        dia_semana: String(r.dia_semana),
        slot_idx: (r.slot_idx as number) ?? 0,
        grupo_id: (r.grupo_id as string) ?? null,
        grupo_usuario_id: (r.grupo_usuario_id as string) ?? null,
        extra: (r.extra as number) ?? 0,
        extra_atrelado_grupo_id: (r.extra_atrelado_grupo_id as string) ?? null,
        extra_atrelado_grupo_usuario_id: (r.extra_atrelado_grupo_usuario_id as string) ?? null,
        tb_grupos_treino: r.grupo_treino_id ? { id: r.grupo_treino_id as string, nome: r.grupo_treino_nome as string } : null,
      })),
    [semanaRows],
  );
  const { data: diaConfigRows } = useQuery<Linha>("SELECT dia_semana, alternado, alternado_inicio FROM tb_semana_dia_config WHERE user_id = ?", [userId]);
  const diasConfig = useMemo(() => {
    const m: Record<string, DiaAlternadoConfig> = {};
    for (const r of diaConfigRows || []) {
      m[r.dia_semana as string] = { dia_semana: r.dia_semana as string, alternado: r.alternado as number, alternado_inicio: r.alternado_inicio as string } as DiaAlternadoConfig;
    }
    return m;
  }, [diaConfigRows]);

  // ── trocas do dia (overrides) e treinos feitos na semana ──
  const inicioSemana = chaveData(datas[0]);
  const fimSemana = chaveData(datas[6]);
  const { data: overridesRows } = useQuery<Linha>(
    `SELECT id, data_treino, slot_idx, grupo_id, grupo_usuario_id FROM tb_treino_dia_override
     WHERE user_id = ? AND data_treino >= ? AND data_treino <= ? ORDER BY data_treino, slot_idx`,
    [userId, inicioSemana, fimSemana],
  );
  const overrides = useMemo(() => {
    const m: Record<string, OverrideInfo[]> = {};
    for (const o of overridesRows || []) {
      (m[o.data_treino as string] ??= []).push({
        id: o.id as string,
        slot_idx: (o.slot_idx as number) ?? 0,
        grupo_id: (o.grupo_id as string) ?? null,
        grupo_usuario_id: (o.grupo_usuario_id as string) ?? null,
      });
    }
    for (const lista of Object.values(m)) lista.sort((a, b) => a.slot_idx - b.slot_idx);
    return m;
  }, [overridesRows]);

  const { data: concluidosSemanaRows } = useQuery<Linha>(
    "SELECT data_treino, slot_idx FROM tb_treino_concluido WHERE user_id = ? AND data_treino >= ? AND data_treino <= ?",
    [userId, inicioSemana, fimSemana],
  );
  // estado local ("data|slot"): a marca aparece na hora, antes do watch do PowerSync re-emitir
  const [locais, setLocais] = useState<Set<string>>(new Set());
  const concluidos = useMemo(() => {
    const s = new Set<string>();
    for (const c of concluidosSemanaRows || []) s.add(`${c.data_treino}|${(c.slot_idx as number) ?? 0}`);
    locais.forEach((k) => s.add(k));
    return s;
  }, [concluidosSemanaRows, locais]);
  const diasFeitosSemana = useMemo(() => diasTreinados([...concluidos].map(chaveParaConcluido)), [concluidos]);

  const inicioMes = useMemo(() => inicioDoMes(hoje), [hoje]);
  const { data: concluidosMesRows } = useQuery<{ data_treino: string }>(
    "SELECT DISTINCT data_treino FROM tb_treino_concluido WHERE user_id = ? AND data_treino >= ?",
    [userId, inicioMes],
  );
  const treinosNoMes = useMemo(() => {
    const locaisMes = [...locais].map(chaveParaConcluido).filter((c) => c.data_treino >= inicioMes);
    return contarDiasTreinados([...(concluidosMesRows || []), ...locaisMes]);
  }, [concluidosMesRows, locais, inicioMes]);

  // ── exercícios dos grupos ──
  const { data: gruposExRows, isLoading: carregandoGrupos } = useQuery<Linha>(
    `SELECT ge.grupo_id, ge.exercicio_id, ge.ordem,
            e.id as ex_id, e.nome as ex_nome, e.grupo_muscular as ex_grupo_muscular, e.emoji as ex_emoji, e.tipo as ex_tipo,
            e.imagem_url as ex_imagem_url, e.subgrupo as ex_subgrupo, e.dica as ex_dica
     FROM tb_grupos_exercicios ge LEFT JOIN tb_exercicios e ON ge.exercicio_id = e.id
     ORDER BY ge.ordem`,
  );
  const gruposExercicios = useMemo(() => {
    const m: Record<string, GrupoExercicio[]> = {};
    for (const ge of gruposExRows || []) {
      if (!ge.ex_id) continue;
      (m[ge.grupo_id as string] ??= []).push({
        exercicio_id: ge.exercicio_id as string,
        ordem: (ge.ordem as number) || 0,
        tb_exercicios: {
          id: ge.ex_id as string,
          nome: ge.ex_nome as string,
          grupo_muscular: ge.ex_grupo_muscular as string,
          emoji: ge.ex_emoji as string,
          tipo: ge.ex_tipo as string,
          imagem_url: ge.ex_imagem_url as string,
          subgrupo: ge.ex_subgrupo as string,
          dica: ge.ex_dica as string,
        },
      });
    }
    return m;
  }, [gruposExRows]);

  const { data: gruposExUsuarioRows } = useQuery<Linha>(
    `SELECT geu.grupo_usuario_id, geu.exercicio_id, geu.exercicio_usuario_id, geu.ordem,
            e.id as ex_id, e.nome as ex_nome, e.grupo_muscular as ex_grupo_muscular, e.emoji as ex_emoji, e.tipo as ex_tipo,
            e.imagem_url as ex_imagem_url, e.subgrupo as ex_subgrupo, e.dica as ex_dica,
            eu.id as exu_id, eu.nome as exu_nome, eu.grupo_muscular as exu_grupo_muscular, eu.emoji as exu_emoji, eu.tipo as exu_tipo
     FROM tb_grupos_exercicios_usuario geu
     LEFT JOIN tb_exercicios e ON geu.exercicio_id = e.id
     LEFT JOIN tb_exercicios_usuario eu ON geu.exercicio_usuario_id = eu.id
     WHERE geu.user_id = ? ORDER BY geu.ordem`,
    [userId],
  );
  const gruposExerciciosPessoais = useMemo(() => {
    const m: Record<string, GrupoExercicio[]> = {};
    for (const ge of gruposExUsuarioRows || []) {
      const lista = (m[ge.grupo_usuario_id as string] ??= []);
      const ex = ge.ex_id
        ? { id: ge.ex_id as string, nome: ge.ex_nome as string, grupo_muscular: ge.ex_grupo_muscular as string, emoji: ge.ex_emoji as string, tipo: ge.ex_tipo as string,
            imagem_url: ge.ex_imagem_url as string, subgrupo: ge.ex_subgrupo as string, dica: ge.ex_dica as string }
        : ge.exu_id
          ? { id: ge.exu_id as string, nome: ge.exu_nome as string, grupo_muscular: ge.exu_grupo_muscular as string, emoji: ge.exu_emoji as string, tipo: ge.exu_tipo as string,
              imagem_url: null, subgrupo: null, dica: null }
          : null;
      if (!ex) continue;
      const pessoal = !ge.ex_id && !!ge.exu_id;
      lista.push({ exercicio_id: ex.id, exercicio_usuario_id: pessoal ? ex.id : undefined, ordem: (ge.ordem as number) || 0, tb_exercicios: ex });
    }
    return m;
  }, [gruposExUsuarioRows]);

  // catálogo (resolve o exercício novo de uma troca)
  const { data: catalogoRows } = useQuery<ExercicioAlvo>("SELECT id, nome, grupo_muscular, emoji, tipo, imagem_url, subgrupo, dica FROM tb_exercicios");
  const { data: pessoaisRows } = useQuery<ExercicioAlvo>("SELECT id, nome, grupo_muscular, emoji, tipo FROM tb_exercicios_usuario WHERE user_id = ?", [userId]);
  const exerciciosPorId = useMemo(() => {
    const m = new Map<string, ExercicioAlvo>();
    for (const e of catalogoRows || []) m.set(e.id, e);
    for (const e of pessoaisRows || []) m.set(e.id, { ...e, imagem_url: null, subgrupo: null, dica: null, isPessoal: true });
    return m;
  }, [catalogoRows, pessoaisRows]);

  const { data: substituicoesRows } = useQuery<Substituicao>("SELECT * FROM exercicio_substituicao_usuario WHERE user_id = ?", [userId]);
  const substituicoes = useMemo<Substituicao[]>(() => substituicoesRows || [], [substituicoesRows]);

  // ── séries padrão e prescrição (NF1) ──
  const { data: seriesPadraoRows } = useQuery<SeriePadraoRow & LinhaPrescricao>(
    `SELECT grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg, observacao
     FROM tb_series_padrao_usuario WHERE user_id = ?`,
    [userId],
  );
  const mapaSeries = useMemo(() => mapaSeriesPadrao(seriesPadraoRows), [seriesPadraoRows]);
  const mapaPresc = useMemo(() => mapaPrescricao(seriesPadraoRows), [seriesPadraoRows]);

  // ── academias ──
  const [academiaAtual, setAcademiaAtual] = useState<Academia | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_ACADEMIA) || "null");
    } catch {
      return null;
    }
  });
  const selecionarAcademia = useCallback((a: Academia) => {
    setAcademiaAtual(a);
    try {
      localStorage.setItem(LS_ACADEMIA, JSON.stringify(a));
    } catch {
      /* noop */
    }
  }, []);
  const { data: academiasRows } = useQuery<Academia>("SELECT id, nome FROM tb_academias WHERE user_id = ? ORDER BY nome", [userId]);

  // ── slots do dia ──
  const slotsDoDia = useCallback(
    (d: Date): DiaSlot[] => {
      const dk = chaveData(d);
      const diaSemana = DIAS_SEMANA[d.getDay()];
      const trocas = (exs: GrupoExercicio[], grupoId: string, slotIdx: number) =>
        aplicarSubstituicoes(exs, substituicoes, { grupoId, slotIdx, dateKey: dk }, exerciciosPorId) as GrupoExercicio[];
      const removidos = (exs: GrupoExercicio[], grupoId: string, slotIdx: number) => exerciciosRemovidos(exs, substituicoes, { grupoId, slotIdx, dateKey: dk });
      const lista = overrides[dk];
      if (lista && lista.length > 0) {
        return lista.map<DiaSlot>((o) => {
          if (!o.grupo_id && !o.grupo_usuario_id) return { slot_idx: o.slot_idx, override_id: o.id, grupo: null, exercicios: [], overrideVazio: true, source: "override" };
          if (o.grupo_usuario_id) {
            const exs = gruposExerciciosPessoais[o.grupo_usuario_id] || [];
            return { slot_idx: o.slot_idx, override_id: o.id, grupo: gruposPessoais.find((g) => g.id === o.grupo_usuario_id) || null, grupoPessoal: true,
              exercicios: trocas(exs, o.grupo_usuario_id, o.slot_idx), removidos: removidos(exs, o.grupo_usuario_id, o.slot_idx), overrideVazio: false, source: "override" };
          }
          const exs = gruposExercicios[o.grupo_id!] || [];
          return { slot_idx: o.slot_idx, override_id: o.id, grupo: grupos.find((g) => g.id === o.grupo_id) || null, grupoPessoal: false,
            exercicios: trocas(exs, o.grupo_id!, o.slot_idx), removidos: removidos(exs, o.grupo_id!, o.slot_idx), overrideVazio: false, source: "override" };
        });
      }
      const configs = resolverTreinosDoDia(semana, diaSemana, dk, diasConfig[diaSemana] ?? null);
      const slots: DiaSlot[] = [];
      for (const c of configs) {
        const slotIdx = c.slot_idx ?? 0;
        if (c.grupo_usuario_id) {
          const grupo = gruposPessoais.find((g) => g.id === c.grupo_usuario_id) || null;
          if (!grupo) continue;
          const exs = gruposExerciciosPessoais[c.grupo_usuario_id] || [];
          slots.push({ slot_idx: slotIdx, grupo, grupoPessoal: true, exercicios: trocas(exs, c.grupo_usuario_id, slotIdx), removidos: removidos(exs, c.grupo_usuario_id, slotIdx),
            overrideVazio: false, source: "semana" });
        } else if (c.grupo_id) {
          const grupo = c.tb_grupos_treino || grupos.find((g) => g.id === c.grupo_id) || null;
          const exs = gruposExercicios[c.grupo_id] || [];
          slots.push({ slot_idx: slotIdx, grupo, grupoPessoal: false, exercicios: trocas(exs, c.grupo_id, slotIdx), removidos: removidos(exs, c.grupo_id, slotIdx),
            overrideVazio: false, source: "semana" });
        }
      }
      return slots;
    },
    [overrides, gruposPessoais, gruposExerciciosPessoais, grupos, gruposExercicios, semana, diasConfig, substituicoes, exerciciosPorId],
  );

  const dataSelecionada = useMemo(() => datas.find((d) => chaveData(d) === selecionada) || hoje, [datas, selecionada, hoje]);
  const slots = useMemo(() => slotsDoDia(dataSelecionada), [slotsDoDia, dataSelecionada]);
  const slotsComTreino = useMemo(() => slots.filter((s) => s.grupo), [slots]);
  const diaDeDescanso = slots.length === 1 && slots[0].overrideVazio;
  const exerciciosDoDia = useMemo(
    () =>
      slots.flatMap((s) =>
        s.exercicios.map((ex) => ({
          ...ex,
          _slot_idx: s.slot_idx,
          _grupo_key: s.grupo ? chaveTreino(s.grupoPessoal ? null : s.grupo.id, s.grupoPessoal ? s.grupo.id : null) : null,
        })),
      ) as ExercicioDoDia[],
    [slots],
  );

  // academia do DIA: a carimbada nas séries do dia vence a última usada
  const [series, setSeriesBruto] = useState<SerieComMemoria[]>([]);
  const academiaDoDia = useMemo(() => {
    const nome = series.find((s) => s.academia_nome)?.academia_nome;
    return nome ? (academiasRows || []).find((a) => a.nome === nome) ?? null : null;
  }, [series, academiasRows]);
  const academia = academiaDoDia ?? academiaAtual;
  const academiaRef = useRef<Academia | null>(academia);
  useEffect(() => {
    academiaRef.current = academia;
  }, [academia]);

  // ── séries do dia ──
  const { data: seriesDoDiaRows } = useQuery<Linha>("SELECT * FROM tb_treino_series WHERE user_id = ? AND data_treino = ? ORDER BY slot_idx, numero_serie", [userId, selecionada]);

  // edição local ("exercício|slot|nº") → instante: segura a versão local até o PowerSync confirmar (sem janela fixa)
  const edicoesRef = useRef<Map<string, number>>(new Map());
  const chaveEdicao = (exId: string, slot: number | undefined, num: number) => `${exId}|${slot ?? 0}|${num}`;
  const montagemRef = useRef(0);

  const ultimoTreino = useCallback(
    async (exId: string, dataAtual: string, pessoal: boolean) => {
      if (!userId) return null;
      try {
        const campo = pessoal ? "exercicio_usuario_id" : "exercicio_id";
        const limite = new Date();
        limite.setDate(limite.getDate() - 90);
        const rows = await db.getAll<{ numero_serie: number; peso: number; reps: number; data_treino: string }>(
          `SELECT numero_serie, peso, reps, data_treino FROM tb_treino_series
           WHERE user_id = ? AND ${campo} = ? AND concluida = 1 AND data_treino < ? AND data_treino >= ?
           ORDER BY data_treino DESC, numero_serie ASC LIMIT 20`,
          [userId, exId, dataAtual, limite.toISOString().slice(0, 10)],
        );
        if (!rows.length) return null;
        const ultima = rows[0].data_treino;
        return rows.filter((s) => s.data_treino === ultima).sort((a, b) => a.numero_serie - b.numero_serie);
      } catch {
        return null;
      }
    },
    [userId, db],
  );

  // trocou de dia: não mostra as séries do dia anterior enquanto as novas montam (ANTES da montagem — os efeitos rodam em
  // ordem — e só na troca, não na abertura)
  const diaAnteriorRef = useRef(selecionada);
  useEffect(() => {
    if (diaAnteriorRef.current === selecionada) return;
    diaAnteriorRef.current = selecionada;
    setSeriesBruto([]);
    edicoesRef.current.clear();
  }, [selecionada]);

  useEffect(() => {
    if (!userId || !seriesDoDiaRows) return;
    const id = ++montagemRef.current;
    const montar = async () => {
      if (exerciciosDoDia.length === 0) return;
      // o watch do PowerSync segura o resultado do dia anterior até o novo chegar: só as linhas do dia na tela
      const salvas = seriesDoDiaRows.filter((s) => s.data_treino === selecionada);
      const porExSlot: Record<string, Linha[]> = {};
      for (const s of salvas) {
        const k = (s.exercicio_id || s.exercicio_usuario_id) as string;
        if (!k) continue;
        (porExSlot[`${k}|${(s.slot_idx as number) ?? 0}`] ??= []).push(s);
      }
      const todas: SerieComMemoria[] = [];
      for (const ge of exerciciosDoDia) {
        const exId = ge.exercicio_id;
        const exUsuarioId = ge.exercicio_usuario_id;
        const slot = ge._slot_idx;
        const presc = prescricaoDoExercicio(mapaPresc, ge._grupo_key, exUsuarioId ? null : exId, exUsuarioId ?? null);
        const salvasEx = porExSlot[`${exId}|${slot}`] || (exUsuarioId ? porExSlot[`${exUsuarioId}|${slot}`] : undefined);
        if (salvasEx && salvasEx.length > 0) {
          for (const s of salvasEx) {
            todas.push({
              id: s.id as string,
              exercicio_id: (s.exercicio_id || s.exercicio_usuario_id) as string,
              exercicio_usuario_id: (s.exercicio_usuario_id as string) ?? exUsuarioId,
              slot_idx: (s.slot_idx as number) ?? 0,
              numero_serie: s.numero_serie as number,
              peso: (s.peso as number) ?? 0,
              reps: (s.reps as number) ?? 10,
              concluida: s.concluida === 1 || s.concluida === true,
              salva: true,
              academia_nome: (s.academia_nome as string) ?? null,
              tempo_segundos: (s.tempo_segundos as number) ?? undefined,
              distancia_km: (s.distancia_km as number) ?? undefined,
              pace_segundos_km: (s.pace_segundos_km as number) ?? undefined,
            });
          }
          // o profissional subiu o nº hoje: completa até o alvo (série salva nunca some por redução)
          const alvo = numSeriesPadrao(mapaSeries, ge._grupo_key, exUsuarioId ? null : exId, exUsuarioId ?? null, seriesPadraoAluno);
          for (const n of numerosParaCompletar(salvasEx.map((s) => Number(s.numero_serie)), alvo)) {
            todas.push({ exercicio_id: exId, exercicio_usuario_id: exUsuarioId, slot_idx: slot, numero_serie: n, peso: presc.carga ?? 0, reps: repsIniciais(presc.reps), concluida: false, salva: false });
          }
        } else {
          if (id !== montagemRef.current) return;
          const ultimo = await ultimoTreino(exId, selecionada, !!exUsuarioId);
          // com academia: o peso vem SÓ dos pesos salvos nela (nunca do último treino, que pode ter sido em outra)
          let pesosAcademia: Map<number, number> | null = null;
          const ac = academiaRef.current;
          if (ac) {
            const refs = await db.getAll<{ numero_serie: number; peso: number }>(
              `SELECT numero_serie, peso FROM tb_academia_pesos
               WHERE user_id = ? AND academia_id = ? AND ifnull(exercicio_id,'') = ? AND ifnull(exercicio_usuario_id,'') = ?`,
              [userId, ac.id, exUsuarioId ? "" : exId, exUsuarioId || ""],
            );
            pesosAcademia = new Map(refs.map((r) => [r.numero_serie, r.peso]));
          }
          if (id !== montagemRef.current) return;
          // NF1: sem histórico, a carga sugerida e as repetições-alvo do profissional preenchem a série nova
          const peso = (n: number, doUltimo: number) =>
            pesosAcademia ? pesosAcademia.get(n) ?? presc.carga ?? 0 : doUltimo > 0 ? doUltimo : presc.carga ?? 0;
          const alvo = numSeriesPadrao(mapaSeries, ge._grupo_key, exUsuarioId ? null : exId, exUsuarioId ?? null, seriesPadraoAluno);
          const temHistorico = !!ultimo && ultimo.length > 0;
          for (const s of estruturaSeriesPadrao(alvo, ultimo || [])) {
            const doHistorico = temHistorico && ultimo!.some((u) => u.numero_serie === s.numero_serie);
            todas.push({
              exercicio_id: exId,
              exercicio_usuario_id: exUsuarioId,
              slot_idx: slot,
              numero_serie: s.numero_serie,
              peso: peso(s.numero_serie, s.pesoUltimo),
              reps: doHistorico ? s.reps : repsIniciais(presc.reps),
              concluida: false,
              salva: false,
            });
          }
        }
      }
      if (id !== montagemRef.current) return;
      setSeriesBruto((antes) => {
        const agora = Date.now();
        const juntas = todas.map((s) => {
          const k = chaveEdicao(s.exercicio_id, s.slot_idx, s.numero_serie);
          const quando = edicoesRef.current.get(k);
          if (!quando) return s;
          if (agora - quando > 30_000) {
            edicoesRef.current.delete(k);
            return s;
          }
          const local = antes.find((p) => p.exercicio_id === s.exercicio_id && (p.slot_idx ?? 0) === (s.slot_idx ?? 0) && p.numero_serie === s.numero_serie);
          return local ?? s;
        });
        // séries não salvas do estado — SÓ de exercícios que continuam no treino (trocado/removido no meio não fica órfão)
        const ativos = chavesExerciciosAtivos(exerciciosDoDia.map((ge) => ({ exercicio_id: ge.exercicio_id, exercicio_usuario_id: ge.exercicio_usuario_id, slot_idx: ge._slot_idx })));
        const soNoEstado = antes.filter(
          (p) =>
            !p.salva &&
            serieDeExercicioAtivo(p, ativos) &&
            !juntas.some((s) => s.exercicio_id === p.exercicio_id && (s.slot_idx ?? 0) === (p.slot_idx ?? 0) && s.numero_serie === p.numero_serie),
        );
        return [...juntas, ...soNoEstado];
      });
    };
    void montar();
  }, [userId, seriesDoDiaRows, exerciciosDoDia, selecionada, ultimoTreino, academia, db, mapaSeries, seriesPadraoAluno, mapaPresc]);

  /** Atualiza as séries de um slot marcando a edição local (a versão da tela vence até o banco confirmar). */
  const atualizarSeries = useCallback((slotIdx: number, acao: SerieComMemoria[] | ((antes: SerieComMemoria[]) => SerieComMemoria[])) => {
    const agora = Date.now();
    setSeriesBruto((antes) => {
      const prox = typeof acao === "function" ? acao(antes) : acao;
      for (const s of prox) {
        if ((s.slot_idx ?? 0) !== slotIdx) continue;
        const a = antes.find((p) => p.exercicio_id === s.exercicio_id && (p.slot_idx ?? 0) === (s.slot_idx ?? 0) && p.numero_serie === s.numero_serie);
        const mudou = !a || a.peso !== s.peso || a.reps !== s.reps || a.concluida !== s.concluida || a.tempo_segundos !== s.tempo_segundos || a.distancia_km !== s.distancia_km;
        if (mudou) edicoesRef.current.set(chaveEdicao(s.exercicio_id, s.slot_idx, s.numero_serie), agora);
      }
      return prox;
    });
  }, []);

  // ── treino concluído ──
  const slotConcluido = useCallback((dk: string, slot: number) => concluidos.has(`${dk}|${slot}`), [concluidos]);
  const marcarLocal = useCallback((dk: string, slot: number, feito: boolean) => {
    setLocais((antes) => {
      const prox = new Set(antes);
      if (feito) prox.add(`${dk}|${slot}`);
      else prox.delete(`${dk}|${slot}`);
      return prox;
    });
  }, []);

  const seriesComPeso = useCallback(() => series.filter((s) => s.tempo_segundos == null), [series]);

  /** "Salvar treino" da academia e a conclusão: guarda o peso de cada série do dia na academia. */
  const salvarPesosNaAcademia = useCallback(
    async (a: Academia, silencioso = false) => {
      if (!userId) return;
      const alvo = seriesComPeso();
      if (alvo.length === 0) {
        if (!silencioso) toast.error("Nenhuma série de musculação hoje para salvar.");
        return;
      }
      const agora = new Date().toISOString();
      for (const s of alvo) {
        const exId = s.exercicio_usuario_id ? null : s.exercicio_id;
        const exUsuId = s.exercicio_usuario_id || null;
        const existe = await db.getAll<{ id: string }>(
          `SELECT id FROM tb_academia_pesos WHERE user_id = ? AND academia_id = ? AND ifnull(exercicio_id,'') = ? AND ifnull(exercicio_usuario_id,'') = ? AND numero_serie = ?`,
          [userId, a.id, exId || "", exUsuId || "", s.numero_serie],
        );
        if (existe.length > 0) await db.execute("UPDATE tb_academia_pesos SET peso = ?, updated_at = ? WHERE id = ?", [s.peso ?? 0, agora, existe[0].id]);
        else
          await db.execute(
            `INSERT INTO tb_academia_pesos (id, user_id, academia_id, exercicio_id, exercicio_usuario_id, numero_serie, peso, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)`,
            [userId, a.id, exId, exUsuId, s.numero_serie, s.peso ?? 0, agora],
          );
      }
      await db.execute("UPDATE tb_treino_series SET academia_nome = ?, updated_at = ? WHERE user_id = ? AND data_treino = ?", [a.nome, agora, userId, selecionada]);
      if (!silencioso) toast.success(`Pesos salvos na academia ${a.nome}!`);
    },
    [db, userId, selecionada, seriesComPeso],
  );
  const salvarPesosRef = useRef(salvarPesosNaAcademia);
  useEffect(() => {
    salvarPesosRef.current = salvarPesosNaAcademia;
  }, [salvarPesosNaAcademia]);

  /** Grava o treino do dia como concluído (o cronômetro e o "Marcar como concluído"). */
  const marcarSlotConcluido = useCallback(
    async (dk: string, slot: number) => {
      if (!userId) return;
      const existe = await db.getAll<{ id: string }>("SELECT id FROM tb_treino_concluido WHERE user_id = ? AND data_treino = ? AND slot_idx = ?", [userId, dk, slot]);
      const agora = new Date().toISOString();
      if (existe.length > 0) {
        await db.execute("INSERT OR REPLACE INTO tb_treino_concluido (id, user_id, data_treino, slot_idx, concluido, created_at) VALUES (?, ?, ?, ?, ?, ?)", [existe[0].id, userId, dk, slot, true, agora]);
      } else {
        await db.execute("INSERT INTO tb_treino_concluido (id, user_id, data_treino, slot_idx, concluido, created_at) VALUES (uuid(), ?, ?, ?, ?, ?)", [userId, dk, slot, true, agora]);
      }
      marcarLocal(dk, slot, true);
      if (academiaRef.current) void salvarPesosRef.current(academiaRef.current, true);
    },
    [db, userId, marcarLocal],
  );

  const desmarcarSlotConcluido = useCallback(
    async (dk: string, slot: number) => {
      if (!userId) return;
      await db.execute("DELETE FROM tb_treino_concluido WHERE user_id = ? AND data_treino = ? AND slot_idx = ?", [userId, dk, slot]);
      marcarLocal(dk, slot, false);
    },
    [db, userId, marcarLocal],
  );

  /** Troca de academia confirmada: os pesos do dia viram os salvos na nova (sem referência = 0 kg). */
  const trocarAcademia = useCallback(
    async (a: Academia) => {
      if (!userId) return;
      const salvos = await db.getAll<{ exercicio_id: string | null; exercicio_usuario_id: string | null; numero_serie: number; peso: number }>(
        "SELECT exercicio_id, exercicio_usuario_id, numero_serie, peso FROM tb_academia_pesos WHERE user_id = ? AND academia_id = ?",
        [userId, a.id],
      );
      const mapa = new Map<string, number>();
      for (const r of salvos) mapa.set(`${r.exercicio_id || ""}|${r.exercicio_usuario_id || ""}|${r.numero_serie}`, r.peso);
      const agora = new Date().toISOString();
      for (const s of seriesComPeso()) {
        const exId = s.exercicio_usuario_id ? null : s.exercicio_id;
        const exUsuId = s.exercicio_usuario_id || null;
        const novoPeso = mapa.get(`${exId || ""}|${exUsuId || ""}|${s.numero_serie}`) ?? 0;
        const existe = await db.getAll<{ id: string }>(
          `SELECT id FROM tb_treino_series WHERE user_id = ? AND data_treino = ? AND ifnull(slot_idx, 0) = ? AND ifnull(exercicio_id,'') = ? AND ifnull(exercicio_usuario_id,'') = ? AND numero_serie = ?`,
          [userId, selecionada, s.slot_idx ?? 0, exId || "", exUsuId || "", s.numero_serie],
        );
        if (existe.length > 0) {
          await db.execute("UPDATE tb_treino_series SET peso = ?, academia_nome = ?, updated_at = ? WHERE id = ?", [novoPeso, a.nome, agora, existe[0].id]);
        } else {
          await db.execute(
            `INSERT INTO tb_treino_series (id, user_id, exercicio_id, exercicio_usuario_id, data_treino, slot_idx, numero_serie, peso, reps, concluida, academia_nome, updated_at)
             VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, exId, exUsuId, selecionada, s.slot_idx ?? 0, s.numero_serie, novoPeso, s.reps ?? 10, s.concluida ? 1 : 0, a.nome, agora],
          );
        }
      }
      // a troca manda: derruba as travas de edição local e atualiza a tela na hora
      edicoesRef.current.clear();
      setSeriesBruto((antes) =>
        antes.map((s) => {
          if (s.tempo_segundos != null) return s;
          const exId = s.exercicio_usuario_id ? null : s.exercicio_id;
          const exUsuId = s.exercicio_usuario_id || null;
          return { ...s, peso: mapa.get(`${exId || ""}|${exUsuId || ""}|${s.numero_serie}`) ?? 0, salva: true };
        }),
      );
      selecionarAcademia(a);
      toast.success(`Academia atual: ${a.nome}`);
    },
    [db, userId, selecionada, seriesComPeso, selecionarAcademia],
  );

  // ── trocar / adicionar / remover o treino do dia (tb_treino_dia_override) ──
  const alterarTreinoDoDia = useCallback(
    async (grupoId: string | null, pessoal: boolean, alvo: { slot_idx: number; modo: "trocar" | "adicionar" }) => {
      if (!userId) return;
      try {
        const lista = overrides[selecionada] || [];
        const gId = grupoId === null ? null : pessoal ? null : grupoId;
        const guId = grupoId === null ? null : pessoal ? grupoId : null;
        const agora = new Date().toISOString();
        if (alvo.modo === "adicionar") {
          const vazio = lista.find((o) => !o.grupo_id && !o.grupo_usuario_id);
          if (vazio) {
            await db.execute("UPDATE tb_treino_dia_override SET grupo_id = ?, grupo_usuario_id = ?, created_at = ? WHERE id = ?", [gId, guId, agora, vazio.id]);
          } else {
            const usados = new Set(lista.map((o) => o.slot_idx));
            if (lista.length === 0) {
              // sem troca no dia: materializa o treino da semana no slot 0 antes de somar o novo
              for (const bs of slotsDoDia(dataSelecionada).filter((s) => s.grupo)) {
                if (bs.source === "semana" && bs.grupo?.id) {
                  await db.execute(
                    "INSERT INTO tb_treino_dia_override (id, user_id, data_treino, slot_idx, grupo_id, grupo_usuario_id, created_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)",
                    [userId, selecionada, 0, bs.grupoPessoal ? null : bs.grupo.id, bs.grupoPessoal ? bs.grupo.id : null, agora],
                  );
                  usados.add(0);
                }
              }
            }
            let prox = 0;
            while (usados.has(prox)) prox++;
            await db.execute(
              "INSERT INTO tb_treino_dia_override (id, user_id, data_treino, slot_idx, grupo_id, grupo_usuario_id, created_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)",
              [userId, selecionada, prox, gId, guId, agora],
            );
          }
        } else {
          const existe = lista.find((o) => o.slot_idx === alvo.slot_idx);
          if (existe) await db.execute("UPDATE tb_treino_dia_override SET grupo_id = ?, grupo_usuario_id = ?, created_at = ? WHERE id = ?", [gId, guId, agora, existe.id]);
          else
            await db.execute(
              "INSERT INTO tb_treino_dia_override (id, user_id, data_treino, slot_idx, grupo_id, grupo_usuario_id, created_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)",
              [userId, selecionada, alvo.slot_idx, gId, guId, agora],
            );
        }
      } catch (e) {
        console.error("[Treino] alterar o treino do dia:", e);
        toast.error("Não deu para alterar o treino. Tente de novo.");
      }
    },
    [db, userId, overrides, selecionada, slotsDoDia, dataSelecionada],
  );

  /** Tira um treino do dia (o único vira dia de descanso — só apagar voltaria o treino da semana). */
  const removerTreinoDoDia = useCallback(
    async (overrideId: string | undefined, slotIdx: number) => {
      if (!userId) return;
      try {
        const lista = overrides[selecionada] || [];
        const unico = lista.length <= 1;
        const agora = new Date().toISOString();
        await db.execute("DELETE FROM tb_treino_series WHERE user_id = ? AND data_treino = ? AND slot_idx = ?", [userId, selecionada, slotIdx]);
        await db.execute("DELETE FROM tb_treino_concluido WHERE user_id = ? AND data_treino = ? AND slot_idx = ?", [userId, selecionada, slotIdx]);
        marcarLocal(selecionada, slotIdx, false);
        if (unico) {
          if (overrideId) await db.execute("UPDATE tb_treino_dia_override SET grupo_id = NULL, grupo_usuario_id = NULL, created_at = ? WHERE id = ?", [agora, overrideId]);
          else
            await db.execute(
              "INSERT INTO tb_treino_dia_override (id, user_id, data_treino, slot_idx, grupo_id, grupo_usuario_id, created_at) VALUES (uuid(), ?, ?, ?, NULL, NULL, ?)",
              [userId, selecionada, 0, agora],
            );
        } else if (overrideId) {
          await db.execute("DELETE FROM tb_treino_dia_override WHERE id = ?", [overrideId]);
        }
      } catch (e) {
        console.error("[Treino] remover o treino do dia:", e);
        toast.error("Não deu para remover o treino.");
      }
    },
    [db, userId, overrides, selecionada, marcarLocal],
  );

  // ── a semana na faixa Seg–Dom ──
  const dias = useMemo(
    () =>
      datas.map((d) => {
        const dk = chaveData(d);
        const treinos = slotsDoDia(d)
          .filter((s) => s.grupo)
          .map((s) => ({ slot_idx: s.slot_idx, nome: s.grupo!.nome, concluido: slotConcluido(dk, s.slot_idx) }));
        return { chave: dk, data: d, treinos, feito: treinos.length > 0 && treinos.every((t) => t.concluido), algumFeito: diasFeitosSemana.has(dk), hoje: dk === hojeChave };
      }),
    [datas, slotsDoDia, slotConcluido, diasFeitosSemana, hojeChave],
  );

  const nomeTreinoHoje = useMemo(() => {
    const nomes = slotsDoDia(hoje)
      .filter((s) => s.grupo)
      .map((s) => s.grupo!.nome);
    return nomes.length ? nomes.join(" + ") : null;
  }, [slotsDoDia, hoje]);

  return {
    hoje,
    hojeChave,
    deslocamento,
    setDeslocamento,
    datas,
    dias,
    selecionada,
    setSelecionada,
    dataSelecionada,
    irParaHoje,
    irParaData,
    perfil,
    seriesTravadas,
    descansoPadrao,
    setDescansoPadrao,
    grupos,
    gruposPessoais,
    semana,
    slots,
    slotsComTreino,
    diaDeDescanso,
    series,
    atualizarSeries,
    mapaPresc,
    treinosNaSemana: diasFeitosSemana.size,
    treinosNoMes,
    slotConcluido,
    marcarSlotConcluido,
    desmarcarSlotConcluido,
    marcarLocal,
    academia,
    academias: academiasRows || [],
    selecionarAcademia,
    trocarAcademia,
    salvarPesosNaAcademia,
    alterarTreinoDoDia,
    removerTreinoDoDia,
    nomeTreinoHoje,
    /** as leituras locais já responderam (o 1º sync do aparelho é à parte: `useStatus().hasSynced`) */
    carregado: !carregandoPerfil && !carregandoGrupos,
  };
}

export type TreinoDoDia = ReturnType<typeof useTreinoDoDia>;
