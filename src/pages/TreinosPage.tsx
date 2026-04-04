import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// lastLocalEditRef: protege contra buildSeries sobrescrever estado otimista
import { ClipboardList, LogOut, History, Settings, RefreshCw, Check, Download, X } from "lucide-react";
import TimerDescanso from "@/components/treinos/TimerDescanso";
import WorkoutReminder from "@/components/treinos/WorkoutReminder";
import WorkoutTimer from "@/components/treinos/WorkoutTimer";
import HistoricoTreinos from "@/components/treinos/HistoricoTreinos";
import PWAInstallButton from "@/components/PWAInstallButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import TabelaSemanal from "@/components/treinos/TabelaSemanal";
import TreinoDoDia from "@/components/treinos/TreinoDoDia";
import ModalAlterarGrupo from "@/components/treinos/ModalAlterarGrupo";
import UpdateChecker, { CURRENT_VERSION } from "@/components/UpdateChecker";
import { useNavigate } from "react-router-dom";
import { usePowerSync, useQuery } from "@powersync/react";
import { SyncStatusIndicator } from "@/components/treinos/SyncStatusIndicator";

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
  grupo_id: string | null;
  grupo_usuario_id: string | null;
}

export interface SerieComMemoria {
  id?: string;
  exercicio_id: string;
  exercicio_usuario_id?: string; // preenchido quando é exercício pessoal
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
  const lastLocalEditRef = useRef(0);
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

  // Cleanup old series on mount — via Supabase diretamente
  useEffect(() => {
    if (user?.id && navigator.onLine) {
      try {
        const limite = new Date();
        limite.setMonth(limite.getMonth() - 12);
        const dataLimite = limite.toISOString().slice(0, 10);
        console.log(`[Cleanup] Removendo séries anteriores a ${dataLimite}`);
        (supabase.from as any)("tb_treino_series")
          .delete()
          .eq("user_id", user.id)
          .lt("data_treino", dataLimite)
          .then(({ error }: any) => {
            if (error) console.error("[Cleanup] Erro ao limpar séries antigas:", error.message);
          });
      } catch (err) {
        console.error("[Cleanup] Erro inesperado:", err);
      }
    }
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
    `SELECT data_treino, grupo_id, grupo_usuario_id
     FROM tb_treino_dia_override
     WHERE user_id = ? AND data_treino >= ? AND data_treino <= ?`,
    [userId, weekStart, weekEnd]
  );
  const overrides = useMemo<Record<string, OverrideInfo>>(() => {
    const map: Record<string, OverrideInfo> = {};
    if (overridesRows) {
      (overridesRows as any[]).forEach((o) => {
        map[o.data_treino] = { grupo_id: o.grupo_id, grupo_usuario_id: o.grupo_usuario_id };
      });
    }
    return map;
  }, [overridesRows]);

  // Treinos concluídos da semana (PowerSync + estado local)
  const { data: concluidosSemanaRows } = useQuery(
    `SELECT data_treino FROM tb_treino_concluido
     WHERE user_id = ? AND data_treino >= ? AND data_treino <= ?`,
    [userId, weekStart, weekEnd]
  );
  // Estado local para concluídos (atualizado imediatamente, sem esperar PowerSync)
  const [localConcluidos, setLocalConcluidos] = useState<Set<string>>(new Set());
  const concluidos = useMemo(() => {
    const fromDb = ((concluidosSemanaRows as any[]) || []).map((c: any) => c.data_treino);
    const result = [...new Set([...fromDb, ...localConcluidos])];
    return result;
  }, [concluidosSemanaRows, localConcluidos]);
  const treinosSemana = concluidos.length;

  // Treinos concluídos do mês (PowerSync + estado local)
  const monthStart = useMemo(() => getMonthStart(), [today]);
  const { data: concluidosMesRows } = useQuery(
    `SELECT data_treino FROM tb_treino_concluido
     WHERE user_id = ? AND data_treino >= ?`,
    [userId, monthStart]
  );
  const treinosMes = useMemo(() => {
    const fromDb = ((concluidosMesRows as any[]) || []).map((c: any) => c.data_treino);
    return [...new Set([...fromDb, ...Array.from(localConcluidos).filter(d => d >= monthStart)])].length;
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
     ORDER BY numero_serie`,
    [userId, selectedDate]
  );

  // Helper to get grupo for a date
  const getGrupoForDate = useCallback((d: Date): { grupo: GrupoTreino | null; exercicios: GrupoExercicio[]; overrideVazio: boolean } => {
    const dk = getLocalDateKey(d);
    const diaSemana = DIAS_SEMANA[d.getDay()];

    const override = overrides[dk];
    // Override existe mas ambos os campos são null → dia intencionalmente sem treino
    if (override && !override.grupo_id && !override.grupo_usuario_id) {
      return { grupo: null, exercicios: [], overrideVazio: true };
    }
    if (override?.grupo_usuario_id) {
      const grupo = gruposPessoais.find((g) => g.id === override.grupo_usuario_id) || null;
      return { grupo, exercicios: gruposExerciciosPessoais[override.grupo_usuario_id] || [], overrideVazio: false };
    }
    if (override?.grupo_id) {
      const grupo = grupos.find((g) => g.id === override.grupo_id) || null;
      return { grupo, exercicios: gruposExercicios[override.grupo_id] || [], overrideVazio: false };
    }

    const config = semanaConfig.find((s) => s.dia_semana === diaSemana);
    if (config?.grupo_id) {
      const grupo = config.tb_grupos_treino || grupos.find((g) => g.id === config.grupo_id) || null;
      return { grupo, exercicios: gruposExercicios[config.grupo_id] || [], overrideVazio: false };
    }

    return { grupo: null, exercicios: [], overrideVazio: false };
  }, [overrides, gruposPessoais, gruposExerciciosPessoais, grupos, gruposExercicios, semanaConfig]);

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
  const { exercicios: selectedExercicios, grupo: selectedGrupo, overrideVazio } = useMemo(
    () => getGrupoForDate(selectedDateObj),
    [getGrupoForDate, selectedDateObj]
  );

  // Atualiza séries quando os dados reativos do PowerSync mudam
  useEffect(() => {
    if (!user || !seriesDoDiaRows) return;

    const currentBuildId = ++buildSeriesIdRef.current;

    const buildSeries = async () => {
      // Não sobrescreve se os exercícios ainda não carregaram
      if (selectedExercicios.length === 0) return;

      const savedSeries = (seriesDoDiaRows as any[]) || [];
      const seriesByExercicio: Record<string, any[]> = {};
      savedSeries.forEach((s) => {
        const key = s.exercicio_id || s.exercicio_usuario_id;
        if (!key) return;
        if (!seriesByExercicio[key]) seriesByExercicio[key] = [];
        seriesByExercicio[key].push(s);
      });

      const allSeries: SerieComMemoria[] = [];

      for (const ge of selectedExercicios) {
        const exId = ge.exercicio_id;
        const exUsuarioId = ge.exercicio_usuario_id;
        const saved = seriesByExercicio[exId] || (exUsuarioId ? seriesByExercicio[exUsuarioId] : undefined);

        if (saved && saved.length > 0) {
          saved.forEach((s: any) => {
            allSeries.push({
              id: s.id,
              exercicio_id: s.exercicio_id || s.exercicio_usuario_id,
              exercicio_usuario_id: s.exercicio_usuario_id ?? exUsuarioId,
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

      // Se o usuário editou nos últimos 5s, não sobrescreve o estado otimista
      if (Date.now() - lastLocalEditRef.current < 5000) return;

      // Preserva séries não salvas do estado atual que não existem em allSeries
      setSeries(prev => {
        const unsavedFromState = prev.filter(
          (p) => !p.salva && !allSeries.some(
            (s) => s.exercicio_id === p.exercicio_id && s.numero_serie === p.numero_serie
          )
        );
        return [...allSeries, ...unsavedFromState];
      });
    };

    buildSeries();
  }, [user, seriesDoDiaRows, selectedExercicios, selectedDate, buscarUltimoTreino]);

  const selectedConcluido = concluidos.includes(selectedDate);

  // Callback para atualizar estado local quando treino é concluído/desconcluído
  const handleTreinoConcluido = useCallback((dateKey: string, concluido: boolean) => {
    setLocalConcluidos(prev => {
      const next = new Set(prev);
      if (concluido) next.add(dateKey);
      else next.delete(dateKey);
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

  if (!user) return null;

  const googleIdentity = (user as any)?.identities?.find((id: any) => id.provider === "google");
  const displayName = profile?.nome || googleIdentity?.identity_data?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "";
  const avatarUrl = profile?.foto_url || googleIdentity?.identity_data?.picture || googleIdentity?.identity_data?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";

  // Salva foto do Google no perfil na primeira vez que encontrar (para não depender de identities)
  useEffect(() => {
    if (avatarUrl && !profile?.foto_url && user?.id) {
      db.execute("UPDATE physiq_profiles SET foto_url = ? WHERE id = ?", [avatarUrl, user.id])
        .catch((e: any) => console.warn("[TreinosPage] Erro ao salvar foto:", e));
    }
  }, [avatarUrl, profile?.foto_url, user?.id]);
  const initial = displayName.charAt(0).toUpperCase();

  const diasInfo = weekDates.map((d) => {
    const dk = getLocalDateKey(d);
    const diaSemana = DIAS_SEMANA[d.getDay()];
    const { grupo, exercicios } = getGrupoForDate(d);

    return {
      dateKey: dk,
      dateLabel: formatDateLabel(d),
      diaSemana,
      grupoNome: grupo?.nome || null,
      exercicios: exercicios.map((e) => ({ nome: e.tb_exercicios.nome, emoji: e.tb_exercicios.emoji })),
      concluido: concluidos.includes(dk),
      isToday: dk === getLocalDateKey(today),
    };
  });

  const handleOverride = async (grupoId: string | null, isPessoal: boolean) => {
    // Verifica se já existe um override para este dia
    const existingRows = await db.getAll(
      "SELECT id FROM tb_treino_dia_override WHERE user_id = ? AND data_treino = ?",
      [user.id, selectedDate]
    );
    const existingId = (existingRows && existingRows.length > 0) ? (existingRows[0] as any).id : null;

    const grupoIdVal = grupoId === null ? null : (isPessoal ? null : grupoId);
    const grupoUsuarioIdVal = grupoId === null ? null : (isPessoal ? grupoId : null);
    const now = new Date().toISOString();

    if (existingId) {
      await db.execute(
        "INSERT OR REPLACE INTO tb_treino_dia_override (id, user_id, data_treino, grupo_id, grupo_usuario_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [existingId, user.id, selectedDate, grupoIdVal, grupoUsuarioIdVal, now]
      );
    } else {
      await db.execute(
        "INSERT INTO tb_treino_dia_override (id, user_id, data_treino, grupo_id, grupo_usuario_id, created_at) VALUES (uuid(), ?, ?, ?, ?, ?)",
        [user.id, selectedDate, grupoIdVal, grupoUsuarioIdVal, now]
      );
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

  // Nunca bloqueia a tela — PowerSync carrega dados em background
  // O perfil pode ser null no primeiro sync, mas o app funciona sem ele

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 sm:px-8">
        <header className="pt-6 sm:pt-12 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
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
              grupoNome={selectedGrupo?.nome || null}
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

            {selectedGrupo ? (
              <>
                <WorkoutTimer
                  userId={user.id}
                  grupoNome={selectedGrupo.nome}
                  dateKey={selectedDate}
                  series={series}
                  exerciciosMap={Object.fromEntries(
                    selectedExercicios.map(e => [e.exercicio_id, { nome: e.tb_exercicios.nome, emoji: e.tb_exercicios.emoji }])
                  )}
                  onTreinoConcluido={handleRefresh}
                />
                <TreinoDoDia
                  userId={user.id}
                  dateKey={selectedDate}
                  dateLabel={`${DIAS_SEMANA[selectedDateObj.getDay()]} ${formatDateLabel(selectedDateObj)}`}
                  grupoNome={selectedGrupo.nome}
                  grupoId={selectedGrupo.id}
                  exercicios={selectedExercicios}
                  series={series}
                  concluido={selectedConcluido}
                  onRefresh={handleRefresh}
                  onTreinoConcluido={handleTreinoConcluido}
                  onAlterarGrupo={() => setShowAlterarGrupo(true)}
                  onSeriesUpdate={(action) => {
                    lastLocalEditRef.current = Date.now();
                    setSeries(action);
                  }}
                  onSerieConcluida={(nome, num, exId) => {
                    setTimerExercicio(nome);
                    setTimerSerie(num);
                    // Cria um ID único para a série — só muda quando uma nova série é concluída
                    setTimerSerieId(`${exId}-${num}-${Date.now()}`);
                    setTimerAtivo(true);
                  }}
                />
              </>
            ) : (
              <div className="result-card border-muted-foreground/20 text-center py-12">
                <p className="text-muted-foreground font-body text-sm">
                  {overrideVazio
                    ? "Dia marcado como descanso. Nenhum treino para este dia."
                    : "Nenhum treino programado para este dia."}
                </p>
                <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowAlterarGrupo(true)}
                    className="text-xs text-primary hover:text-primary/80 font-heading uppercase tracking-wider transition-colors"
                  >
                    + {overrideVazio ? "Adicionar treino" : "Adicionar treino"}
                  </button>

                </div>
              </div>
            )}
          </>
        )}

        <ModalAlterarGrupo
          gruposGlobais={grupos}
          gruposPessoais={gruposPessoais}
          userId={user.id}
          open={showAlterarGrupo}
          onOpenChange={setShowAlterarGrupo}
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

                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-xs font-heading uppercase tracking-wider text-muted-foreground hover:text-primary border border-border rounded-lg transition-colors"
                >
                  <RefreshCw size={12} className={checkingUpdate ? "animate-spin" : ""} />
                  Verificar atualizações
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
