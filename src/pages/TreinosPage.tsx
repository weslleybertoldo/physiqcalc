import { useState, useEffect, useCallback, useRef } from "react";
import { ClipboardList, LogOut, History, WifiOff, Loader2 } from "lucide-react";
import TimerDescanso from "@/components/treinos/TimerDescanso";
import WorkoutReminder from "@/components/treinos/WorkoutReminder";
import WorkoutTimer from "@/components/treinos/WorkoutTimer";
import HistoricoTreinos from "@/components/treinos/HistoricoTreinos";
import PWAInstallButton from "@/components/PWAInstallButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { setCacheData, getCacheData } from "@/lib/offlineSync";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import TabelaSemanal from "@/components/treinos/TabelaSemanal";
import TreinoDoDia from "@/components/treinos/TreinoDoDia";
import ModalAlterarGrupo from "@/components/treinos/ModalAlterarGrupo";
import UpdateChecker, { CURRENT_VERSION } from "@/components/UpdateChecker";
import { useNavigate } from "react-router-dom";

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
  ordem: number;
  tb_exercicios: {
    id: string;
    nome: string;
    grupo_muscular: string;
    emoji: string;
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
  numero_serie: number;
  peso: number;
  reps: number;
  concluida?: boolean;
  salva: boolean;
  // Campos de corrida (opcionais)
  tempo_segundos?: number;
  distancia_km?: number;
  pace_segundos_km?: number;
}

// Fetch last workout data for a specific exercise
async function buscarUltimoTreino(
  userId: string,
  exercicioId: string,
  dataAtual: string
) {
  const { data } = await supabase
    .from("tb_treino_series")
    .select("numero_serie, peso, reps, data_treino")
    .eq("user_id", userId)
    .eq("exercicio_id", exercicioId)
    .eq("concluida", true)
    .lt("data_treino", dataAtual)
    .order("data_treino", { ascending: false })
    .order("numero_serie", { ascending: true })
    .limit(20);

  if (!data || data.length === 0) return null;

  const ultimaData = data[0].data_treino;
  return data
    .filter((s) => s.data_treino === ultimaData)
    .sort((a, b) => a.numero_serie - b.numero_serie);
}

const TreinosPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isOnline, pendingCount, syncing } = useOfflineSync();
  const [profile, setProfile] = useState<{ nome: string | null; foto_url: string | null; user_code: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  // Guarda posição do scroll para restaurar após updates silenciosos
  const scrollYRef = useRef(0);
  // Flag para não recarregar quando voltar do bloqueio/minimizar
  const isVisibleRef = useRef(true);
  // Flag para garantir que a primeira carga (com loading=true) só acontece uma vez
  const initialLoadDoneRef = useRef(false);

  const [grupos, setGrupos] = useState<GrupoTreino[]>([]);
  const [gruposPessoais, setGruposPessoais] = useState<GrupoTreino[]>([]);
  const [semanaConfig, setSemanaConfig] = useState<SemanaConfig[]>([]);
  const [gruposExercicios, setGruposExercicios] = useState<Record<string, GrupoExercicio[]>>({});
  const [gruposExerciciosPessoais, setGruposExerciciosPessoais] = useState<Record<string, GrupoExercicio[]>>({});
  const [overrides, setOverrides] = useState<Record<string, OverrideInfo>>({});
  const [series, setSeries] = useState<SerieComMemoria[]>([]);
  const [concluidos, setConcluidos] = useState<string[]>([]);
  const [treinosSemana, setTreinosSemana] = useState(0);
  const [treinosMes, setTreinosMes] = useState(0);

  // Memoized so that re-renders don't create new Date objects and cause downstream recalculations
  const today = useState(() => new Date())[0];
  const weekDates = useState(() => getWeekDates(today))[0];
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey(today));
  const [showAlterarGrupo, setShowAlterarGrupo] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);

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

  // Cleanup old series on mount
  useEffect(() => {
    // Limpa séries com mais de 6 meses — mantém histórico completo dos últimos 6 meses
    if (user?.id) {
      const seisLimite = new Date();
      seisLimite.setMonth(seisLimite.getMonth() - 6);
      const dataLimite = seisLimite.toISOString().slice(0, 10);
      supabase
        .from("tb_treino_series")
        .delete()
        .eq("user_id", user.id)
        .lt("data_treino", dataLimite)
        .then(() => {});
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

  // Load base data (groups, config, overrides, concluidos)
  // refreshOnly=true → atualiza dados em background sem mostrar tela de "Carregando"
  const loadBaseData = useCallback(async (refreshOnly = false) => {
    if (!user) return;
    // Não recarrega quando o app está em background (bloqueio de tela, minimizado)
    if (refreshOnly && !isVisibleRef.current) return;
    if (!refreshOnly) setLoading(true);

    const cacheKey = `baseData_${user.id}`;

    // Se estiver offline, tenta carregar do cache
    if (!navigator.onLine) {
      const cached = getCacheData<any>(cacheKey);
      if (cached) {
        setProfile(cached.profile);
        setGrupos(cached.grupos);
        setGruposPessoais(cached.gruposPessoais);
        setSemanaConfig(cached.semanaConfig);
        setGruposExercicios(cached.gruposExercicios);
        setGruposExerciciosPessoais(cached.gruposExerciciosPessoais);
        setOverrides(cached.overrides);
        setConcluidos(cached.concluidos);
        setTreinosSemana(cached.treinosSemana);
        setTreinosMes(cached.treinosMes);
        if (!refreshOnly) setLoading(false);
        return;
      }
      // Sem cache e sem internet — nada a fazer
      if (!refreshOnly) setLoading(false);
      return;
    }

    // Compute fresh dates inside the callback to avoid stale closure
    const freshToday = new Date();
    const freshWeek = getWeekDates(freshToday);
    const weekStart = getLocalDateKey(freshWeek[0]);
    const weekEnd = getLocalDateKey(freshWeek[6]);
    const monthStart = getMonthStart();

    const [profileRes, gruposRes, gruposPessoaisRes, semanaRes, overridesRes, concluidosSemanaRes, concluidosMesRes] =
      await Promise.all([
        supabase.from("physiq_profiles").select("nome, foto_url, user_code").eq("id", user.id).single(),
        supabase.from("tb_grupos_treino").select("*").order("nome"),
        supabase.from("tb_grupos_treino_usuario").select("*").eq("user_id", user.id).order("nome"),
        supabase.from("tb_semana_treinos").select("dia_semana, grupo_id, tb_grupos_treino(id, nome)"),
        supabase.from("tb_treino_dia_override").select("data_treino, grupo_id, grupo_usuario_id").eq("user_id", user.id).gte("data_treino", weekStart).lte("data_treino", weekEnd),
        supabase.from("tb_treino_concluido").select("data_treino").eq("user_id", user.id).gte("data_treino", weekStart).lte("data_treino", weekEnd),
        supabase.from("tb_treino_concluido").select("data_treino").eq("user_id", user.id).gte("data_treino", monthStart),
      ]);

    if (profileRes.data) setProfile(profileRes.data as any);
    const gruposList = (gruposRes.data as GrupoTreino[]) || [];
    setGrupos(gruposList);
    setGruposPessoais((gruposPessoaisRes.data as GrupoTreino[]) || []);
    setSemanaConfig((semanaRes.data as any[]) || []);

    // Load exercises for global groups
    const geMap: Record<string, GrupoExercicio[]> = {};
    if (gruposList.length > 0) {
      const { data: geData } = await supabase
        .from("tb_grupos_exercicios")
        .select("grupo_id, exercicio_id, ordem, tb_exercicios(id, nome, grupo_muscular, emoji, tipo)")
        .order("ordem");
      if (geData) {
        (geData as any[]).forEach((ge) => {
          if (!geMap[ge.grupo_id]) geMap[ge.grupo_id] = [];
          geMap[ge.grupo_id].push(ge);
        });
      }
    }
    setGruposExercicios(geMap);

    // Load exercises for personal groups
    const gePessoalMap: Record<string, GrupoExercicio[]> = {};
    const pessoaisList = (gruposPessoaisRes.data as any[]) || [];
    if (pessoaisList.length > 0) {
      const { data: geuData } = await supabase
        .from("tb_grupos_exercicios_usuario")
        .select("grupo_usuario_id, exercicio_id, exercicio_usuario_id, ordem, tb_exercicios(id, nome, grupo_muscular, emoji, tipo), tb_exercicios_usuario(id, nome, grupo_muscular, emoji, tipo)")
        .eq("user_id", user.id)
        .order("ordem");
      if (geuData) {
        (geuData as any[]).forEach((ge: any) => {
          const gid = ge.grupo_usuario_id;
          if (!gePessoalMap[gid]) gePessoalMap[gid] = [];
          const exData = ge.tb_exercicios || ge.tb_exercicios_usuario;
          if (exData) {
            gePessoalMap[gid].push({
              exercicio_id: exData.id,
              ordem: ge.ordem || 0,
              tb_exercicios: exData,
            });
          }
        });
      }
    }
    setGruposExerciciosPessoais(gePessoalMap);

    // Overrides
    const ovMap: Record<string, OverrideInfo> = {};
    ((overridesRes.data as any[]) || []).forEach((o) => {
      ovMap[o.data_treino] = { grupo_id: o.grupo_id, grupo_usuario_id: o.grupo_usuario_id };
    });
    setOverrides(ovMap);

    const concluidosDates = ((concluidosSemanaRes.data as any[]) || []).map((c: any) => c.data_treino);
    setConcluidos(concluidosDates);
    setTreinosSemana(concluidosDates.length);
    setTreinosMes(((concluidosMesRes.data as any[]) || []).length);

    // Salva tudo no cache para uso offline
    setCacheData(cacheKey, {
      profile: profileRes.data,
      grupos: gruposList,
      gruposPessoais: (gruposPessoaisRes.data as GrupoTreino[]) || [],
      semanaConfig: (semanaRes.data as any[]) || [],
      gruposExercicios: geMap,
      gruposExerciciosPessoais: gePessoalMap,
      overrides: ovMap,
      concluidos: concluidosDates,
      treinosSemana: concluidosDates.length,
      treinosMes: ((concluidosMesRes.data as any[]) || []).length,
    });

    if (!refreshOnly) setLoading(false);
  }, [user]);

  useEffect(() => {
    // Primeira carga: mostra loading — só roda uma vez na vida do componente
    if (initialLoadDoneRef.current) {
      // Recargas subsequentes (ex: mudança de user) — silenciosas, sem loading
      loadBaseData(true);
      return;
    }
    initialLoadDoneRef.current = true;
    loadBaseData(false);
  }, [loadBaseData]);

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

  // Load series for the selected date (with weight memory)
  const loadSeriesForDate = useCallback(async (dateKey: string, exerciciosList: GrupoExercicio[]) => {
    if (!user) return;

    const seriesCacheKey = `series_${user.id}_${dateKey}`;

    // Se offline, usa cache
    if (!navigator.onLine) {
      const cached = getCacheData<SerieComMemoria[]>(seriesCacheKey);
      if (cached) {
        setSeries(cached);
        return;
      }
      // Sem cache — cria séries placeholder para os exercícios
      const placeholders: SerieComMemoria[] = [];
      for (const ge of exerciciosList) {
        for (let i = 1; i <= 3; i++) {
          placeholders.push({
            exercicio_id: ge.exercicio_id,
            numero_serie: i,
            peso: 0,
            reps: 10,
            concluida: false,
            salva: false,
          });
        }
      }
      setSeries(placeholders);
      return;
    }

    // 1. Load saved series for this exact date
    const { data: seriesDoDia } = await supabase
      .from("tb_treino_series")
      .select("*")
      .eq("user_id", user.id)
      .eq("data_treino", dateKey)
      .order("numero_serie");

    const savedSeries = (seriesDoDia as any[]) || [];

    // 2. Group saved series by exercise
    const seriesByExercicio: Record<string, any[]> = {};
    savedSeries.forEach((s) => {
      const key = s.exercicio_id;
      if (!seriesByExercicio[key]) seriesByExercicio[key] = [];
      seriesByExercicio[key].push(s);
    });

    // 3. For exercises without saved series, fetch last workout data
    const allSeries: SerieComMemoria[] = [];

    for (const ge of exerciciosList) {
      const exId = ge.exercicio_id;
      const saved = seriesByExercicio[exId];

      if (saved && saved.length > 0) {
        // Has saved data for this date
        saved.forEach((s: any) => {
          allSeries.push({
            id: s.id,
            exercicio_id: s.exercicio_id,
            numero_serie: s.numero_serie,
            peso: s.peso ?? 0,
            reps: s.reps ?? 10,
            concluida: s.concluida ?? false,
            salva: true,
            // Campos de corrida
            tempo_segundos: s.tempo_segundos ?? undefined,
            distancia_km: s.distancia_km ?? undefined,
            pace_segundos_km: s.pace_segundos_km ?? undefined,
          });
        });
      } else {
        // No saved data — try to get from last workout
        const ultimo = await buscarUltimoTreino(user.id, exId, dateKey);

        if (ultimo && ultimo.length > 0) {
          ultimo.forEach((s) => {
            allSeries.push({
              exercicio_id: exId,
              numero_serie: s.numero_serie,
              peso: s.peso ?? 0,
              reps: s.reps ?? 10,
              concluida: false,
              salva: false,
            });
          });
        } else {
          // Never done this exercise — 3 empty placeholder series
          for (let i = 1; i <= 3; i++) {
            allSeries.push({
              exercicio_id: exId,
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

    // Salva no cache para uso offline
    setCacheData(seriesCacheKey, allSeries);
    setSeries(allSeries);
  }, [user]);

  // Reload series when selectedDate changes
  useEffect(() => {
    if (!user || loading) return;
    // Não recarrega séries quando app volta do background
    if (!isVisibleRef.current) return;
    const selectedDateObj = weekDates.find((d) => getLocalDateKey(d) === selectedDate) || today;
    const { exercicios } = getGrupoForDate(selectedDateObj);
    loadSeriesForDate(selectedDate, exercicios);
  }, [selectedDate, user, loading, getGrupoForDate, loadSeriesForDate]);

  const handleRefresh = useCallback(async () => {
    // refreshOnly=true: atualiza dados em background sem mostrar "Carregando"
    await loadBaseData(true);
    // Series will reload via the selectedDate useEffect
  }, [loadBaseData]);

  // Logout handler
  const handleLogout = async () => {
    sessionStorage.clear();
    await supabase.auth.signOut();
    navigate("/");
  };

  if (!user) return null;

  const displayName = profile?.nome || user?.user_metadata?.full_name || user?.email || "";
  const avatarUrl = profile?.foto_url || user?.user_metadata?.avatar_url || "";
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

  const selectedDateObj = weekDates.find((d) => getLocalDateKey(d) === selectedDate) || today;
  const { grupo: selectedGrupo, exercicios: selectedExercicios, overrideVazio } = getGrupoForDate(selectedDateObj);
  const selectedConcluido = concluidos.includes(selectedDate);

  const handleOverride = async (grupoId: string | null, isPessoal: boolean) => {
    const { offlineUpsert } = await import("@/lib/offlineSync");
    if (grupoId === null) {
      await offlineUpsert(
        "tb_treino_dia_override",
        {
          user_id: user.id,
          data_treino: selectedDate,
          grupo_id: null,
          grupo_usuario_id: null,
        },
        "user_id,data_treino"
      );
    } else {
      await offlineUpsert(
        "tb_treino_dia_override",
        {
          user_id: user.id,
          data_treino: selectedDate,
          grupo_id: isPessoal ? null : grupoId,
          grupo_usuario_id: isPessoal ? grupoId : null,
        },
        "user_id,data_treino"
      );
    }
    handleRefresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

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
              {profile?.user_code && (
                <p className="text-[10px] text-muted-foreground font-body">ID: {profile.user_code}</p>
              )}
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
            {(!isOnline || pendingCount > 0) && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-xs font-heading ${
                !isOnline
                  ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-500"
                  : "bg-primary/10 border border-primary/30 text-primary"
              }`}>
                {!isOnline ? (
                  <>
                    <WifiOff size={14} />
                    <span>Modo offline — seus dados serão sincronizados quando a internet voltar</span>
                  </>
                ) : syncing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Sincronizando {pendingCount} dado(s)...</span>
                  </>
                ) : (
                  <>
                    <Loader2 size={14} />
                    <span>{pendingCount} dado(s) pendente(s) de sincronização</span>
                  </>
                )}
              </div>
            )}

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
                  onAlterarGrupo={() => setShowAlterarGrupo(true)}
                  onSeriesUpdate={setSeries}
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

        <footer className="py-12 text-center space-y-4">
          <PWAInstallButton />
          <p className="text-xs text-muted-foreground font-body italic">By Weslley Bertoldo</p>
          <p className="text-[10px] text-muted-foreground/50 font-body">v{CURRENT_VERSION}</p>
        </footer>

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
