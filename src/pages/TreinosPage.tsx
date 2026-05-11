import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// localEditsRef: timestamp por (exercicio|slot|numero_serie) da ultima edicao local.
// Substitui a janela fixa de 5s anterior — comparacao por chave evita race tanto em
// sync rapido (nao descarta builds validos) quanto em pausa longa (preserva edits
// nao sincronizados ate o PowerSync propagar updated_at >= timestamp local).
import { ClipboardList, LogOut, History, Settings, RefreshCw, Check, Download, X } from "lucide-react";
import TimerDescanso from "@/components/treinos/TimerDescanso";
import WorkoutReminder from "@/components/treinos/WorkoutReminder";
import WorkoutTimer from "@/components/treinos/WorkoutTimer";
import HistoricoTreinos from "@/components/treinos/HistoricoTreinos";
import PWAInstallButton from "@/components/PWAInstallButton";
import { useAuth } from "@/hooks/useAuth";
import TabelaSemanal from "@/components/treinos/TabelaSemanal";
import TreinoDoDia from "@/components/treinos/TreinoDoDia";
import ModalAlterarGrupo from "@/components/treinos/ModalAlterarGrupo";
import UpdateChecker, { CURRENT_VERSION } from "@/components/UpdateChecker";
import { useNavigate } from "react-router-dom";
import { usePowerSync, useQuery } from "@powersync/react";
import { SyncStatusIndicator } from "@/components/treinos/SyncStatusIndicator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

function getWeekDates(refDate: Date) {
  const d = new Date(refDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(dd);
  }
  return dates;
}

function getLocalDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthStart() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-01`;
}

interface GrupoTreino {
  id: string;
  nome: string;
}

interface GrupoExercicio {
  exercicio_id: string;
  exercicio_usuario_id?: string; // preenchido quando é exercício pessoal
  ordem: number;
  tb_exercicios: {
    id: string;
    nome: string;
    grupo_muscular: string;
    emoji: string;
    tipo?: string;
  };
}

interface SemanaConfig {
  dia_semana: string;
  grupo_id: string | null;
  tb_grupos_treino: GrupoTreino | null;
}

interface OverrideInfo {
  id: string;
  slot_idx: number;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
}

interface DiaSlot {
  slot_idx: number;
  override_id?: string;
  grupo: GrupoTreino | null;
  exercicios: GrupoExercicio[];
  overrideVazio: boolean;
  source: 'override' | 'semana' | 'placeholder';
}

export interface SerieComMemoria {
  id?: string;
  exercicio_id: string;
  exercicio_usuario_id?: string; // preenchido quando é exercício pessoal
  slot_idx?: number;
  numero_serie: number;
  peso: number;
  reps: number;
  concluida?: boolean;
  salva: boolean;
  tempo_segundos?: number;
  distancia_km?: number;
  pace_segundos_km?: number;
}

const TreinosPage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const db = usePowerSync();
  // Guarda posição do scroll para restaurar após updates silenciosos
  const scrollYRef = useRef(0);
  // Flag para não recarregar quando voltar do bloqueio/minimizar
  const isVisibleRef = useRef(true);

  const [series, setSeries] = useState<SerieComMemoria[]>([]);
  const localEditsRef = useRef<Map<string, number>>(new Map());
  const editKey = (exId: string, slot: number | undefined, num: number) =>
    `${exId}|${slot ?? 0}|${num}`;
  const buildSeriesIdRef = useRef(0);

  const [today, setToday] = useState(() => new Date());
  const [weekDates, setWeekDates] = useState(() => getWeekDates(new Date()));

  // Verifica a cada 60s se o dia mudou (após meia-noite)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      if (getLocalDateKey(now) !== getLocalDateKey(today)) {
        setToday(now);
        setWeekDates(getWeekDates(now));
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [today]);

  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey(new Date()));
  const [showAlterarGrupo, setShowAlterarGrupo] = useState(false);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(0);
  const [showHistorico, setShowHistorico] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<null | { hasUpdate: boolean; url?: string; version?: string }>(null);

  // Timer state
  // Inicializa timerAtivo verificando localStorage — persiste após reload
  const [timerAtivo, setTimerAtivo] = useState(() => {
    try {
      const raw = localStorage.getItem("physiq_rest_timer");
      if (!raw) return false;
      const saved = JSON.parse(raw);
      // Só considera ativo se o timer ainda tem tempo restante
      if (!saved || !saved.ativo) return false;
      const elapsed = Math.floor((Date.now() - saved.startedAt) / 1000);
      return saved.isPaused ? true : (saved.duracao - elapsed) > 0;
    } catch { return false; }
  });
  const [timerExercicio, setTimerExercicio] = useState(() => {
    try {
      const raw = localStorage.getItem("physiq_rest_timer");
      if (!raw) return "";
      const saved = JSON.parse(raw);
      return saved?.exercicioNome ?? "";
    } catch { return ""; }
  });
  const [timerSerie, setTimerSerie] = useState(() => {
    try {
      const raw = localStorage.getItem("physiq_rest_timer");
      if (!raw) return 0;
      const saved = JSON.parse(raw);
      return saved?.numeroSerie ?? 0;
    } catch { return 0; }
  });
  const [tempoPadrao, setTempoPadrao] = useState(120);
  const [timerSerieId, setTimerSerieId] = useState(() => {
    try {
      const raw = localStorage.getItem("physiq_rest_timer");
      if (!raw) return "";
      const saved = JSON.parse(raw);
      return saved?.serieId ?? "";
    } catch { return ""; }
  });

  // Limpa fila do offlineSync antigo (PowerSync cuida de tudo agora)
  useEffect(() => {
    try {
      const pending = localStorage.getItem("physiq_offline_pending");
      if (pending) {
        console.log("[Migration] Removendo fila offlineSync antiga:", pending.length, "bytes");
        localStorage.removeItem("physiq_offline_pending");
      }
      localStorage.removeItem("physiq_offline_cache");
    } catch {}
  }, []);

  // Cleanup séries com mais de 12 meses via PowerSync
  useEffect(() => {
    if (!user?.id) return;
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 12);
    const dataLimite = limite.toISOString().slice(0, 10);
    db.execute(
      "DELETE FROM tb_treino_series WHERE user_id = ? AND data_treino < ?",
      [user.id, dataLimite]
    ).catch(err => console.error("[Cleanup] Erro ao limpar séries antigas:", err));
  }, [user?.id]);

  // Salva posição do scroll continuamente
  useEffect(() => {
    const onScroll = () => { scrollYRef.current = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Controle de visibilidade — não recarrega quando tela bloqueia ou app vai para background
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        isVisibleRef.current = false;
        // Salva posição atual antes de sair
        scrollYRef.current = window.scrollY;
      } else {
        isVisibleRef.current = true;
        // Restaura posição do scroll ao voltar (sem reload)
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollYRef.current, behavior: 'instant' });
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // =====================================================
  // LEITURAS REATIVAS via PowerSync (SQLite local)
  // =====================================================
  const userId = user?.id ?? "";

  // Perfil do usuário
  const { data: profileRows, error: profileError } = useQuery(
    "SELECT nome, foto_url, user_code FROM physiq_profiles WHERE id = ?",
    [userId]
  );
  useEffect(() => {
    if (profileError) console.warn("[TreinosPage] Erro ao buscar perfil:", profileError);
  }, [profileError]);
  const profile = useMemo(() => {
    if (!profileRows || profileRows.length === 0) return null;
    const row = profileRows[0] as any;
    return { nome: row.nome, foto_url: row.foto_url, user_code: row.user_code };
  }, [profileRows]);

  // Grupos de treino (globais)
  const { data: gruposRows } = useQuery(
    "SELECT id, nome FROM tb_grupos_treino ORDER BY nome"
  );
  const grupos = useMemo<GrupoTreino[]>(
    () => (gruposRows as any[]) || [],
    [gruposRows]
  );

  // Grupos de treino do usuário (pessoais)
  const { data: gruposPessoaisRows } = useQuery(
    "SELECT id, nome FROM tb_grupos_treino_usuario WHERE user_id = ? ORDER BY nome",
    [userId]
  );
  const gruposPessoais = useMemo<GrupoTreino[]>(
    () => (gruposPessoaisRows as any[]) || [],
    [gruposPessoaisRows]
  );

  // Configuração da semana (com JOIN para pegar nome do grupo)
  const { data: semanaRows } = useQuery(
    `SELECT s.dia_semana, s.grupo_id, g.id as grupo_treino_id, g.nome as grupo_treino_nome
     FROM tb_semana_treinos s
     LEFT JOIN tb_grupos_treino g ON s.grupo_id = g.id`
  );
  const semanaConfig = useMemo<SemanaConfig[]>(() => {
    if (!semanaRows) return [];
    return (semanaRows as any[]).map((row) => ({
      dia_semana: String(row.dia_semana),
      grupo_id: row.grupo_id,
      tb_grupos_treino: row.grupo_treino_id
        ? { id: row.grupo_treino_id, nome: row.grupo_treino_nome }
        : null,
    }));
  }, [semanaRows]);

  // Overrides da semana atual
  const weekStart = useMemo(() => getLocalDateKey(weekDates[0]), [weekDates]);
  const weekEnd = useMemo(() => getLocalDateKey(weekDates[6]), [weekDates]);

  const { data: overridesRows } = useQuery(
    `SELECT id, data_treino, slot_idx, grupo_id, grupo_usuario_id
     FROM tb_treino_dia_override
     WHERE user_id = ? AND data_treino >= ? AND data_treino <= ?
     ORDER BY data_treino, slot_idx`,
    [userId, weekStart, weekEnd]
  );
  const overrides = useMemo<Record<string, OverrideInfo[]>>(() => {
    const map: Record<string, OverrideInfo[]> = {};
    if (overridesRows) {
      (overridesRows as any[]).forEach((o) => {
        const arr = map[o.data_treino] || (map[o.data_treino] = []);
        arr.push({ id: o.id, slot_idx: o.slot_idx ?? 0, grupo_id: o.grupo_id, grupo_usuario_id: o.grupo_usuario_id });
      });
      Object.values(map).forEach(arr => arr.sort((a, b) => a.slot_idx - b.slot_idx));
    }
    return map;
  }, [overridesRows]);

  // Treinos concluídos da semana (PowerSync + estado local)
  const { data: concluidosSemanaRows } = useQuery(
    `SELECT data_treino, slot_idx FROM tb_treino_concluido
     WHERE user_id = ? AND data_treino >= ? AND data_treino <= ?`,
    [userId, weekStart, weekEnd]
  );
  // Estado local: chave "date|slot"
  const [localConcluidos, setLocalConcluidos] = useState<Set<string>>(new Set());
  const [avatarBroken, setAvatarBroken] = useState(false);
  const concluidosSet = useMemo(() => {
    const set = new Set<string>();
    ((concluidosSemanaRows as any[]) || []).forEach((c: any) => set.add(`${c.data_treino}|${c.slot_idx ?? 0}`));
    localConcluidos.forEach(k => set.add(k));
    return set;
  }, [concluidosSemanaRows, localConcluidos]);
  // Conjunto de dateKeys com pelo menos 1 treino concluído (pra contagem semanal)
  const concluidosDates = useMemo(() => {
    const set = new Set<string>();
    concluidosSet.forEach(k => set.add(k.split('|')[0]));
    return set;
  }, [concluidosSet]);
  const treinosSemana = concluidosDates.size;

  // Treinos concluídos do mês (PowerSync + estado local) — conta total de slots concluídos
  const monthStart = useMemo(() => getMonthStart(), [today]);
  const { data: concluidosMesRows } = useQuery(
    `SELECT data_treino, slot_idx FROM tb_treino_concluido
     WHERE user_id = ? AND data_treino >= ?`,
    [userId, monthStart]
  );
  const treinosMes = useMemo(() => {
    const set = new Set<string>();
    ((concluidosMesRows as any[]) || []).forEach((c: any) => set.add(`${c.data_treino}|${c.slot_idx ?? 0}`));
    localConcluidos.forEach(k => {
      if (k.split('|')[0] >= monthStart) set.add(k);
    });
    return set.size;
  }, [concluidosMesRows, localConcluidos, monthStart]);

  // Exercícios dos grupos globais (com JOIN)
  const { data: gruposExerciciosRows } = useQuery(
    `SELECT ge.grupo_id, ge.exercicio_id, ge.ordem,
            e.id as ex_id, e.nome as ex_nome, e.grupo_muscular as ex_grupo_muscular, e.emoji as ex_emoji, e.tipo as ex_tipo
     FROM tb_grupos_exercicios ge
     LEFT JOIN tb_exercicios e ON ge.exercicio_id = e.id
     ORDER BY ge.ordem`
  );
  const gruposExercicios = useMemo<Record<string, GrupoExercicio[]>>(() => {
    const map: Record<string, GrupoExercicio[]> = {};
    if (gruposExerciciosRows) {
      (gruposExerciciosRows as any[]).forEach((ge) => {
        if (!ge.ex_id) return;
        if (!map[ge.grupo_id]) map[ge.grupo_id] = [];
        map[ge.grupo_id].push({
          exercicio_id: ge.exercicio_id,
          ordem: ge.ordem || 0,
          tb_exercicios: {
            id: ge.ex_id,
            nome: ge.ex_nome,
            grupo_muscular: ge.ex_grupo_muscular,
            emoji: ge.ex_emoji,
            tipo: ge.ex_tipo,
          },
        });
      });
    }
    return map;
  }, [gruposExerciciosRows]);

  // Exercícios dos grupos pessoais do usuário (com JOINs)
  const { data: gruposExerciciosUsuarioRows } = useQuery(
    `SELECT geu.grupo_usuario_id, geu.exercicio_id, geu.exercicio_usuario_id, geu.ordem,
            e.id as ex_id, e.nome as ex_nome, e.grupo_muscular as ex_grupo_muscular, e.emoji as ex_emoji, e.tipo as ex_tipo,
            eu.id as exu_id, eu.nome as exu_nome, eu.grupo_muscular as exu_grupo_muscular, eu.emoji as exu_emoji, eu.tipo as exu_tipo
     FROM tb_grupos_exercicios_usuario geu
     LEFT JOIN tb_exercicios e ON geu.exercicio_id = e.id
     LEFT JOIN tb_exercicios_usuario eu ON geu.exercicio_usuario_id = eu.id
     WHERE geu.user_id = ?
     ORDER BY geu.ordem`,
    [userId]
  );
  const gruposExerciciosPessoais = useMemo<Record<string, GrupoExercicio[]>>(() => {
    const map: Record<string, GrupoExercicio[]> = {};
    if (gruposExerciciosUsuarioRows) {
      (gruposExerciciosUsuarioRows as any[]).forEach((ge: any) => {
        const gid = ge.grupo_usuario_id;
        if (!map[gid]) map[gid] = [];
        const exData = ge.ex_id
          ? { id: ge.ex_id, nome: ge.ex_nome, grupo_muscular: ge.ex_grupo_muscular, emoji: ge.ex_emoji, tipo: ge.ex_tipo }
          : ge.exu_id
            ? { id: ge.exu_id, nome: ge.exu_nome, grupo_muscular: ge.exu_grupo_muscular, emoji: ge.exu_emoji, tipo: ge.exu_tipo }
            : null;
        const isPessoal = !ge.ex_id && !!ge.exu_id;
        if (exData) {
          map[gid].push({
            exercicio_id: exData.id,
            exercicio_usuario_id: isPessoal ? exData.id : undefined,
            ordem: ge.ordem || 0,
            tb_exercicios: exData,
          });
        }
      });
    }
    return map;
  }, [gruposExerciciosUsuarioRows]);

  // Séries do dia selecionado (reativo)
  const { data: seriesDoDiaRows } = useQuery(
    `SELECT * FROM tb_treino_series
     WHERE user_id = ? AND data_treino = ?
     ORDER BY slot_idx, numero_serie`,
    [userId, selectedDate]
  );

  // Helper: retorna a lista de slots de treino do dia
  const getSlotsForDate = useCallback((d: Date): DiaSlot[] => {
    const dk = getLocalDateKey(d);
    const diaSemana = DIAS_SEMANA[d.getDay()];
    const ovrList = overrides[dk];

    if (ovrList && ovrList.length > 0) {
      // Quando há overrides, eles substituem o treino padrão do dia
      return ovrList.map<DiaSlot>((o) => {
        if (!o.grupo_id && !o.grupo_usuario_id) {
          return { slot_idx: o.slot_idx, override_id: o.id, grupo: null, exercicios: [], overrideVazio: true, source: 'override' };
        }
        if (o.grupo_usuario_id) {
          const grupo = gruposPessoais.find((g) => g.id === o.grupo_usuario_id) || null;
          return { slot_idx: o.slot_idx, override_id: o.id, grupo, exercicios: gruposExerciciosPessoais[o.grupo_usuario_id] || [], overrideVazio: false, source: 'override' };
        }
        const grupo = grupos.find((g) => g.id === o.grupo_id!) || null;
        return { slot_idx: o.slot_idx, override_id: o.id, grupo, exercicios: gruposExercicios[o.grupo_id!] || [], overrideVazio: false, source: 'override' };
      });
    }

    const config = semanaConfig.find((s) => s.dia_semana === diaSemana);
    if (config?.grupo_id) {
      const grupo = config.tb_grupos_treino || grupos.find((g) => g.id === config.grupo_id) || null;
      return [{ slot_idx: 0, grupo, exercicios: gruposExercicios[config.grupo_id] || [], overrideVazio: false, source: 'semana' }];
    }

    return [];
  }, [overrides, gruposPessoais, gruposExerciciosPessoais, grupos, gruposExercicios, semanaConfig]);

  // Compatibilidade: primeiro slot (usado em UI antiga)
  const getGrupoForDate = useCallback((d: Date) => {
    const slots = getSlotsForDate(d);
    if (slots.length === 0) return { grupo: null, exercicios: [] as GrupoExercicio[], overrideVazio: false };
    const first = slots[0];
    return { grupo: first.grupo, exercicios: first.exercicios, overrideVazio: first.overrideVazio && slots.length === 1 };
  }, [getSlotsForDate]);

  // Buscar último treino de um exercício (leitura imperativa do SQLite local)
  const buscarUltimoTreino = useCallback(async (
    exId: string,
    dataAtual: string,
    isExercicioUsuario = false
  ) => {
    if (!userId) return null;
    try {
      const fieldName = isExercicioUsuario ? "exercicio_usuario_id" : "exercicio_id";
      // Limita busca a 90 dias para reduzir leitura do SQLite
      const limite90d = new Date();
      limite90d.setDate(limite90d.getDate() - 90);
      const dataLimite90 = limite90d.toISOString().slice(0, 10);
      const rows = await db.getAll(
        `SELECT numero_serie, peso, reps, data_treino
         FROM tb_treino_series
         WHERE user_id = ? AND ${fieldName} = ? AND concluida = 1 AND data_treino < ? AND data_treino >= ?
         ORDER BY data_treino DESC, numero_serie ASC
         LIMIT 20`,
        [userId, exId, dataAtual, dataLimite90]
      );
      if (!rows || rows.length === 0) return null;
      const ultimaData = (rows[0] as any).data_treino;
      return rows
        .filter((s: any) => s.data_treino === ultimaData)
        .sort((a: any, b: any) => a.numero_serie - b.numero_serie);
    } catch {
      return null;
    }
  }, [userId, db]);

  // Montar séries para o dia selecionado a partir dos dados reativos do PowerSync
  const selectedDateObj = useMemo(
    () => weekDates.find((d) => getLocalDateKey(d) === selectedDate) || today,
    [weekDates, selectedDate, today]
  );
  const selectedSlots = useMemo(() => getSlotsForDate(selectedDateObj), [getSlotsForDate, selectedDateObj]);
  const overrideVazio = selectedSlots.length === 1 && selectedSlots[0].overrideVazio;
  // Lista plana de todos os exercícios do dia (com slot_idx anexado)
  const selectedExercicios = useMemo(
    () => selectedSlots.flatMap((s) => s.exercicios.map((ex) => ({ ...ex, _slot_idx: s.slot_idx }))),
    [selectedSlots]
  ) as (GrupoExercicio & { _slot_idx: number })[];

  // Atualiza séries quando os dados reativos do PowerSync mudam
  useEffect(() => {
    if (!user || !seriesDoDiaRows) return;

    const currentBuildId = ++buildSeriesIdRef.current;

    const buildSeries = async () => {
      // Não sobrescreve se os exercícios ainda não carregaram
      if (selectedExercicios.length === 0) return;

      const savedSeries = (seriesDoDiaRows as any[]) || [];
      // Indexa por "key|slot"
      const seriesByExSlot: Record<string, any[]> = {};
      savedSeries.forEach((s) => {
        const key = s.exercicio_id || s.exercicio_usuario_id;
        if (!key) return;
        const k = `${key}|${s.slot_idx ?? 0}`;
        if (!seriesByExSlot[k]) seriesByExSlot[k] = [];
        seriesByExSlot[k].push(s);
      });

      const allSeries: SerieComMemoria[] = [];

      for (const ge of selectedExercicios) {
        const exId = ge.exercicio_id;
        const exUsuarioId = ge.exercicio_usuario_id;
        const slot = ge._slot_idx;
        const saved = seriesByExSlot[`${exId}|${slot}`] || (exUsuarioId ? seriesByExSlot[`${exUsuarioId}|${slot}`] : undefined);

        if (saved && saved.length > 0) {
          saved.forEach((s: any) => {
            allSeries.push({
              id: s.id,
              exercicio_id: s.exercicio_id || s.exercicio_usuario_id,
              exercicio_usuario_id: s.exercicio_usuario_id ?? exUsuarioId,
              slot_idx: s.slot_idx ?? 0,
              numero_serie: s.numero_serie,
              peso: s.peso ?? 0,
              reps: s.reps ?? 10,
              concluida: s.concluida === 1 || s.concluida === true,
              salva: true,
              tempo_segundos: s.tempo_segundos ?? undefined,
              distancia_km: s.distancia_km ?? undefined,
              pace_segundos_km: s.pace_segundos_km ?? undefined,
            });
          });
        } else {
          // Cancela se um buildSeries mais recente já iniciou
          if (currentBuildId !== buildSeriesIdRef.current) return;
          const ultimo = await buscarUltimoTreino(exId, selectedDate, !!exUsuarioId);
          if (currentBuildId !== buildSeriesIdRef.current) return;

          if (ultimo && ultimo.length > 0) {
            (ultimo as any[]).forEach((s) => {
              allSeries.push({
                exercicio_id: exId,
                exercicio_usuario_id: exUsuarioId,
                slot_idx: slot,
                numero_serie: s.numero_serie,
                peso: s.peso ?? 0,
                reps: s.reps ?? 10,
                concluida: false,
                salva: false,
              });
            });
          } else {
            for (let i = 1; i <= 3; i++) {
              allSeries.push({
                exercicio_id: exId,
                exercicio_usuario_id: exUsuarioId,
                slot_idx: slot,
                numero_serie: i,
                peso: 0,
                reps: 10,
                concluida: false,
                salva: false,
              });
            }
          }
        }
      }

      // Cancela se um buildSeries mais recente já iniciou
      if (currentBuildId !== buildSeriesIdRef.current) return;

      // Merge: preserva versao local quando edit local for mais novo que snapshot do banco
      setSeries(prev => {
        const now = Date.now();
        const merged = allSeries.map((s) => {
          const key = editKey(s.exercicio_id, s.slot_idx, s.numero_serie);
          const editedAt = localEditsRef.current.get(key);
          if (!editedAt) return s;
          // Se passou tempo demais (>30s) sem o PowerSync confirmar, descarta o lock
          if (now - editedAt > 30000) { localEditsRef.current.delete(key); return s; }
          // Procura versao local atual; se existir e for mais nova, mantem
          const local = prev.find(
            (p) => p.exercicio_id === s.exercicio_id && (p.slot_idx ?? 0) === (s.slot_idx ?? 0) && p.numero_serie === s.numero_serie
          );
          return local ?? s;
        });
        // Preserva séries não salvas do estado atual que não existem em allSeries
        const unsavedFromState = prev.filter(
          (p) => !p.salva && !merged.some(
            (s) => s.exercicio_id === p.exercicio_id && (s.slot_idx ?? 0) === (p.slot_idx ?? 0) && s.numero_serie === p.numero_serie
          )
        );
        return [...merged, ...unsavedFromState];
      });
    };

    buildSeries();
  }, [user, seriesDoDiaRows, selectedExercicios, selectedDate, buscarUltimoTreino]);

  const isSlotConcluido = useCallback(
    (dk: string, slot: number) => concluidosSet.has(`${dk}|${slot}`),
    [concluidosSet]
  );

  // Callback para atualizar estado local quando treino é concluído/desconcluído
  const handleTreinoConcluido = useCallback((dateKey: string, slotIdx: number, concluido: boolean) => {
    const key = `${dateKey}|${slotIdx}`;
    setLocalConcluidos(prev => {
      const next = new Set(prev);
      if (concluido) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    // No-op: o PowerSync re-renderiza automaticamente quando dados mudam no SQLite
  }, []);

  // Logout handler — usa signOut do contexto (marca intentionalLogoutRef)
  const handleLogout = async () => {
    sessionStorage.clear();
    await signOut();
    navigate("/");
  };

  // Avatar/foto — computado antes do early return pra não violar regras de hooks
  const googleIdentity = (user as any)?.identities?.find((id: any) => id.provider === "google");
  const displayName = profile?.nome || user?.user_metadata?.full_name || user?.user_metadata?.name || googleIdentity?.identity_data?.full_name || user?.email || "";
  const avatarUrl = profile?.foto_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || googleIdentity?.identity_data?.picture || "";
  const freshGoogleUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || googleIdentity?.identity_data?.picture || "";
  const initial = displayName.charAt(0).toUpperCase();

  // Salva/atualiza foto do Google no perfil
  useEffect(() => {
    if (freshGoogleUrl && user?.id && freshGoogleUrl !== profile?.foto_url) {
      db.execute("UPDATE physiq_profiles SET foto_url = ? WHERE id = ?", [freshGoogleUrl, user.id])
        .catch((e: any) => console.warn("[TreinosPage] Erro ao salvar foto:", e));
    }
  }, [freshGoogleUrl, profile?.foto_url, user?.id]);

  if (!user) return null;

  const diasInfo = weekDates.map((d) => {
    const dk = getLocalDateKey(d);
    const diaSemana = DIAS_SEMANA[d.getDay()];
    const slots = getSlotsForDate(d);
    const treinos = slots
      .filter(s => s.grupo)
      .map(s => ({
        slot_idx: s.slot_idx,
        grupoNome: s.grupo!.nome,
        concluido: isSlotConcluido(dk, s.slot_idx),
      }));

    return {
      dateKey: dk,
      dateLabel: formatDateLabel(d),
      diaSemana,
      treinos,
      concluido: treinos.length > 0 && treinos.every(t => t.concluido),
      isToday: dk === getLocalDateKey(today),
    };
  });

  const [alterarTarget, setAlterarTarget] = useState<{ slot_idx: number; mode: 'replace' | 'add' } | null>(null);

  const handleOverride = async (grupoId: string | null, isPessoal: boolean) => {
    try {
      const target = alterarTarget;
      const ovrList = overrides[selectedDate] || [];

      // Materializar base: se ainda não há override pro dia mas existe treino padrão da semana,
      // o usuário só vai conseguir "alterar" se materializarmos o slot 0 com o grupo padrão atual.
      // Mas como o ModalAlterarGrupo sempre passa o grupoId escolhido, basta usar ele.

      const grupoIdVal = grupoId === null ? null : (isPessoal ? null : grupoId);
      const grupoUsuarioIdVal = grupoId === null ? null : (isPessoal ? grupoId : null);
      const now = new Date().toISOString();

      const mode = target?.mode ?? 'replace';

      if (mode === 'add') {
        // Determina próximo slot_idx
        const usedSlots = new Set(ovrList.map(o => o.slot_idx));
        // Se não há overrides ainda mas há treino padrão da semana, o slot 0 está "tomado" implicitamente
        // → materializa também o slot 0 com o grupo padrão pra coexistir
        if (ovrList.length === 0) {
          const baseSlots = getSlotsForDate(selectedDateObj).filter(s => s.grupo);
          for (const bs of baseSlots) {
            const baseGrupoId = bs.source === 'override' ? null : (bs.grupo?.id || null);
            // se vem da semana (não-override), materializa
            if (bs.source === 'semana' && baseGrupoId) {
              await db.execute(
                "INSERT INTO tb_treino_dia_override (id, user_id, data_treino, slot_idx, grupo_id, grupo_usuario_id, created_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)",
                [user.id, selectedDate, 0, baseGrupoId, null, now]
              );
              usedSlots.add(0);
            }
          }
        }
        let nextSlot = 0;
        while (usedSlots.has(nextSlot)) nextSlot++;
        await db.execute(
          "INSERT INTO tb_treino_dia_override (id, user_id, data_treino, slot_idx, grupo_id, grupo_usuario_id, created_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)",
          [user.id, selectedDate, nextSlot, grupoIdVal, grupoUsuarioIdVal, now]
        );
        console.log("[Override] Adicionado slot", nextSlot, { grupoIdVal, grupoUsuarioIdVal });
      } else {
        // mode === 'replace'
        const slot = target?.slot_idx ?? 0;
        const existing = ovrList.find(o => o.slot_idx === slot);
        if (existing) {
          await db.execute(
            "UPDATE tb_treino_dia_override SET grupo_id = ?, grupo_usuario_id = ?, created_at = ? WHERE id = ?",
            [grupoIdVal, grupoUsuarioIdVal, now, existing.id]
          );
        } else {
          await db.execute(
            "INSERT INTO tb_treino_dia_override (id, user_id, data_treino, slot_idx, grupo_id, grupo_usuario_id, created_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)",
            [user.id, selectedDate, slot, grupoIdVal, grupoUsuarioIdVal, now]
          );
        }
        console.log("[Override] Salvo slot", slot, { grupoIdVal, grupoUsuarioIdVal });
      }
    } catch (e) {
      console.error("[Override] Erro ao salvar:", e);
      toast.error("Erro ao alterar treino. Tente novamente.");
    } finally {
      setAlterarTarget(null);
    }
  };

  const handleRemoverSlot = async (overrideId: string | undefined, slotIdx: number) => {
    try {
      if (overrideId) {
        await db.execute("DELETE FROM tb_treino_dia_override WHERE id = ?", [overrideId]);
      }
      // Também limpa séries/conclusão daquele slot
      await db.execute(
        "DELETE FROM tb_treino_series WHERE user_id = ? AND data_treino = ? AND slot_idx = ?",
        [user.id, selectedDate, slotIdx]
      );
      await db.execute(
        "DELETE FROM tb_treino_concluido WHERE user_id = ? AND data_treino = ? AND slot_idx = ?",
        [user.id, selectedDate, slotIdx]
      );
      setLocalConcluidos(prev => {
        const next = new Set(prev);
        next.delete(`${selectedDate}|${slotIdx}`);
        return next;
      });
    } catch (e) {
      console.error("[Remover slot] Erro:", e);
      toast.error("Erro ao remover treino.");
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateResult(null);
    try {
      const res = await fetch("https://api.github.com/repos/weslleybertoldo/physiqcalc/releases/latest", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const release = await res.json();
      const remoteVersion = (release.tag_name || "").replace(/^v/, "");
      const remote = remoteVersion.split(".").map(Number);
      const local = CURRENT_VERSION.split(".").map(Number);
      const isNewer =
        remote[0] > local[0] ||
        (remote[0] === local[0] && remote[1] > local[1]) ||
        (remote[0] === local[0] && remote[1] === local[1] && remote[2] > local[2]);
      if (isNewer) {
        const apkAsset = (release.assets || []).find((a: any) => a.name.endsWith(".apk"));
        setUpdateResult({ hasUpdate: true, url: apkAsset?.browser_download_url || release.html_url, version: remoteVersion });
      } else {
        setUpdateResult({ hasUpdate: false });
      }
    } catch {
      setUpdateResult({ hasUpdate: false });
    } finally {
      setCheckingUpdate(false);
    }
  };

  // ── LGPD: export user data + self-delete ──────────────────────────
  const handleExportarDados = async () => {
    if (!user?.id) return;
    try {
      toast.info("Coletando seus dados...");
      const tables = [
        "physiq_profiles", "physiq_avaliacoes", "tb_treino_series",
        "tb_treino_concluido", "tb_treino_dia_override", "treino_historico",
        "exercicio_ordem_usuario", "tb_grupos_treino_usuario",
        "tb_exercicios_usuario", "tb_grupos_exercicios_usuario",
        "tb_exercicio_comentarios",
      ];
      const dump: Record<string, unknown[]> = {};
      for (const t of tables) {
        // physiq_profiles usa coluna `id` em vez de `user_id`
        const idCol = t === "physiq_profiles" ? "id" : "user_id";
        const rows = await db.getAll(`SELECT * FROM ${t} WHERE ${idCol} = ?`, [user.id]);
        dump[t] = rows || [];
      }
      const payload = {
        exportado_em: new Date().toISOString(),
        user_id: user.id,
        email: user.email,
        nome: profile?.nome,
        tables: dump,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `physiqcalc-export-${(user.email || "user").replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download iniciado.");
    } catch (e) {
      console.error("[Export] erro:", e);
      toast.error("Erro ao exportar dados.");
    }
  };

  const handleExcluirConta = async () => {
    const conf = window.prompt(
      "Esta acao e IRREVERSIVEL. Apaga seu perfil, treinos, avaliacoes e desativa o login.\n\nDigite DELETAR para confirmar:"
    );
    if (conf !== "DELETAR") return;
    try {
      toast.info("Excluindo conta...");
      const { data, error } = await supabase.functions.invoke("delete-my-account", {
        body: { confirm: "DELETE_MY_ACCOUNT" },
      });
      if (error || !data?.ok) {
        toast.error("Erro ao excluir conta. Tente novamente.");
        return;
      }
      toast.success("Conta excluida.");
      await signOut();
      navigate("/");
    } catch (e) {
      console.error("[Delete] erro:", e);
      toast.error("Erro ao excluir conta.");
    }
  };

  // Nunca bloqueia a tela — PowerSync carrega dados em background
  // O perfil pode ser null no primeiro sync, mas o app funciona sem ele

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 sm:px-8">
        <header className="pt-6 sm:pt-12 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {avatarUrl && !avatarBroken ? (
              <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" onError={() => setAvatarBroken(true)} referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-heading text-sm">
                {initial}
              </div>
            )}
            <div>
              <p className="font-heading text-sm text-foreground">{displayName}</p>
              <div className="flex items-center gap-2">
                {profile?.user_code && (
                  <p className="text-[10px] text-muted-foreground font-body">ID: {profile.user_code}</p>
                )}
                <SyncStatusIndicator />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowHistorico(true)} className="p-2 text-muted-foreground hover:text-primary transition-colors" title="Histórico de Treinos">
              <History size={16} />
            </button>
            <WorkoutReminder
              grupoNome={selectedSlots.filter(s => s.grupo).map(s => s.grupo!.nome).join(' + ') || null}
              dateLabel={`${DIAS_SEMANA[selectedDateObj.getDay()]} ${formatDateLabel(selectedDateObj)}`}
            />
            <button type="button" onClick={() => navigate("/avaliacao")} className="p-2 text-muted-foreground hover:text-primary transition-colors" title="Avaliação">
              <ClipboardList size={16} />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Sair"
              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {showHistorico ? (
          <HistoricoTreinos userId={user.id} onBack={() => setShowHistorico(false)} />
        ) : (
          <>
            {/* Indicador offline / sincronização */}

            <h1 className="font-heading text-2xl sm:text-3xl text-foreground tracking-tight mb-6">
              PHYSIQ<span className="text-primary">CALC</span>{" "}
              <span className="text-muted-foreground text-lg">TREINOS</span>
            </h1>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="result-card border-classify-green/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Treinos na semana</p>
                <p className="font-heading text-2xl text-classify-green">{treinosSemana}<span className="text-sm text-muted-foreground">/7</span></p>
              </div>
              <div className="result-card border-classify-blue/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Treinos no mês</p>
                <p className="font-heading text-2xl text-classify-blue">{treinosMes}</p>
              </div>
            </div>

            <div className="mb-8">
              <TabelaSemanal dias={diasInfo} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            </div>

            {(() => {
              const slotsComTreino = selectedSlots.filter(s => s.grupo);
              const dateLabel = `${DIAS_SEMANA[selectedDateObj.getDay()]} ${formatDateLabel(selectedDateObj)}`;

              if (slotsComTreino.length === 0) {
                return (
                  <div className="result-card border-muted-foreground/20 text-center py-12">
                    <p className="text-muted-foreground font-body text-sm">
                      {overrideVazio
                        ? "Dia marcado como descanso. Nenhum treino para este dia."
                        : "Nenhum treino programado para este dia."}
                    </p>
                    <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
                      <button
                        type="button"
                        onClick={() => { setAlterarTarget({ slot_idx: 0, mode: 'replace' }); setShowAlterarGrupo(true); }}
                        className="text-xs text-primary hover:text-primary/80 font-heading uppercase tracking-wider transition-colors"
                      >
                        + Adicionar treino
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {slotsComTreino.map((slot) => {
                    const slotConcluido = isSlotConcluido(selectedDate, slot.slot_idx);
                    const isOpen = expandedSlot === slot.slot_idx;
                    const slotSeries = series.filter(s => (s.slot_idx ?? 0) === slot.slot_idx);
                    return (
                      <div key={slot.slot_idx} className="border border-muted-foreground/20">
                        <button
                          type="button"
                          onClick={() => setExpandedSlot(isOpen ? null : slot.slot_idx)}
                          className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors ${
                            slotConcluido ? 'bg-classify-green/10' : 'hover:bg-muted/30'
                          }`}
                        >
                          <span className="font-heading text-sm text-foreground">
                            TREINO DO DIA — {dateLabel}: <span className="text-primary">{slot.grupo!.nome}</span>
                          </span>
                          {slotConcluido && <Check size={14} className="text-classify-green" />}
                        </button>
                        {isOpen && (
                          <div className="px-4 py-4 border-t border-muted-foreground/20">
                            <WorkoutTimer
                              userId={user.id}
                              grupoNome={slot.grupo!.nome}
                              dateKey={selectedDate}
                              series={slotSeries}
                              exerciciosMap={Object.fromEntries(
                                slot.exercicios.map(e => [e.exercicio_id, { nome: e.tb_exercicios.nome, emoji: e.tb_exercicios.emoji }])
                              )}
                              onTreinoConcluido={handleRefresh}
                            />
                            <TreinoDoDia
                              userId={user.id}
                              dateKey={selectedDate}
                              dateLabel={dateLabel}
                              grupoNome={slot.grupo!.nome}
                              grupoId={slot.grupo!.id}
                              slotIdx={slot.slot_idx}
                              treinoId={slot.override_id}
                              exercicios={slot.exercicios}
                              series={slotSeries}
                              concluido={slotConcluido}
                              onRefresh={handleRefresh}
                              onTreinoConcluido={handleTreinoConcluido}
                              onAlterarGrupo={() => { setAlterarTarget({ slot_idx: slot.slot_idx, mode: 'replace' }); setShowAlterarGrupo(true); }}
                              onRemoverTreino={slotsComTreino.length > 1 || slot.source === 'override' ? () => handleRemoverSlot(slot.override_id, slot.slot_idx) : undefined}
                              onSeriesUpdate={(action) => {
                                const now = Date.now();
                                setSeries(prev => {
                                  const next = typeof action === "function" ? action(prev) : action;
                                  // marca series que mudaram nesta atualizacao com timestamp local
                                  for (const s of next) {
                                    if ((s.slot_idx ?? 0) !== slot.slot_idx) continue;
                                    const before = prev.find(
                                      (p) => p.exercicio_id === s.exercicio_id && (p.slot_idx ?? 0) === (s.slot_idx ?? 0) && p.numero_serie === s.numero_serie
                                    );
                                    const changed =
                                      !before ||
                                      before.peso !== s.peso ||
                                      before.reps !== s.reps ||
                                      before.concluida !== s.concluida ||
                                      before.tempo_segundos !== s.tempo_segundos ||
                                      before.distancia_km !== s.distancia_km;
                                    if (changed) localEditsRef.current.set(editKey(s.exercicio_id, s.slot_idx, s.numero_serie), now);
                                  }
                                  return next;
                                });
                              }}
                              onSerieConcluida={(nome, num, exId) => {
                                setTimerExercicio(nome);
                                setTimerSerie(num);
                                setTimerSerieId(`${exId}-${num}-${Date.now()}`);
                                setTimerAtivo(true);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => { setAlterarTarget({ slot_idx: -1, mode: 'add' }); setShowAlterarGrupo(true); }}
                    className="w-full py-3 border border-dashed border-muted-foreground/30 text-xs text-primary hover:bg-primary/5 font-heading uppercase tracking-wider transition-colors"
                  >
                    + Adicionar outro treino
                  </button>
                </div>
              );
            })()}
          </>
        )}

        <ModalAlterarGrupo
          gruposGlobais={grupos}
          gruposPessoais={gruposPessoais}
          userId={user.id}
          open={showAlterarGrupo}
          onOpenChange={(o) => { setShowAlterarGrupo(o); if (!o) setAlterarTarget(null); }}
          onSelect={handleOverride}
          onRefresh={handleRefresh}
        />

        <footer className="py-12 text-center space-y-4 relative">
          <PWAInstallButton />
          <p className="text-xs text-muted-foreground font-body italic">By Weslley Bertoldo</p>
          <p className="text-[10px] text-muted-foreground/50 font-body">v{CURRENT_VERSION}</p>
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="flex items-center justify-center gap-1 mx-auto text-[10px] text-muted-foreground/50 hover:text-primary font-body transition-colors"
          >
            <RefreshCw size={10} className={checkingUpdate ? "animate-spin" : ""} />
            Verificar atualizações
          </button>
          {updateResult && !showSettings && (
            <div className="mt-1">
              {updateResult.hasUpdate ? (
                <a
                  href={updateResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[10px] font-heading uppercase tracking-wider hover:bg-primary/90 transition-colors"
                >
                  <Download size={10} />
                  Baixar v{updateResult.version}
                </a>
              ) : (
                <p className="text-[10px] text-classify-green font-body flex items-center justify-center gap-1">
                  <Check size={10} />
                  Versão mais recente
                </p>
              )}
            </div>
          )}

          {/* Engrenagem no canto inferior direito */}
          <button
            type="button"
            onClick={() => { setShowSettings(true); setUpdateResult(null); }}
            className="absolute bottom-0 right-0 p-2 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
          >
            <Settings size={16} />
          </button>
        </footer>

        {/* Modal de configurações */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSettings(false)}>
            <div className="bg-card border border-border rounded-xl p-6 mx-4 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-sm text-foreground uppercase tracking-wider">Configurações</h3>
                <button type="button" onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="text-center space-y-3">
                <p className="text-[10px] text-muted-foreground/50 font-body">Versão atual: v{CURRENT_VERSION}</p>

                {((user as any)?.app_metadata?.role === "admin") && (
                  <button
                    type="button"
                    onClick={() => navigate("/admin")}
                    className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-xs font-heading uppercase tracking-wider text-primary border border-primary/40 rounded-lg hover:bg-primary/10 transition-colors"
                  >
                    <Settings size={12} />
                    Painel Admin
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-xs font-heading uppercase tracking-wider text-muted-foreground hover:text-primary border border-border rounded-lg transition-colors"
                >
                  <RefreshCw size={12} className={checkingUpdate ? "animate-spin" : ""} />
                  Verificar atualizações
                </button>

                <button
                  type="button"
                  onClick={handleExportarDados}
                  className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-xs font-heading uppercase tracking-wider text-muted-foreground hover:text-primary border border-border rounded-lg transition-colors"
                >
                  <Download size={12} />
                  Exportar meus dados
                </button>

                <a
                  href="/privacidade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 mx-auto px-4 py-2 text-xs font-heading uppercase tracking-wider text-muted-foreground hover:text-primary border border-border rounded-lg transition-colors"
                >
                  Privacidade & Termos
                </a>

                <button
                  type="button"
                  onClick={handleExcluirConta}
                  className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-xs font-heading uppercase tracking-wider text-destructive border border-destructive/40 rounded-lg hover:bg-destructive/10 transition-colors"
                >
                  Excluir minha conta
                </button>

                {updateResult && (
                  <div className="mt-2">
                    {updateResult.hasUpdate ? (
                      <a
                        href={updateResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/90 transition-colors"
                      >
                        <Download size={12} />
                        Baixar v{updateResult.version}
                      </a>
                    ) : (
                      <p className="text-xs text-classify-green font-body flex items-center justify-center gap-1">
                        <Check size={12} />
                        Você está usando a versão mais recente
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <UpdateChecker />
      </div>

      <TimerDescanso
        ativo={timerAtivo}
        exercicioNome={timerExercicio}
        numeroSerie={timerSerie}
        duracaoSegundos={tempoPadrao}
        serieId={timerSerieId}
        onFechado={() => setTimerAtivo(false)}
        onTempoAlterado={(seg) => setTempoPadrao(seg)}
      />
    </div>
  );
};

export default TreinosPage;
