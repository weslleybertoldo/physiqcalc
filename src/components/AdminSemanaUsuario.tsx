import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, DB_SCHEMA } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminVolumeSemanal from "./AdminVolumeSemanal";
import { indiceRotacao, segundaDaSemana } from "@/lib/semanaSlots";
import ModalSeriesTreino from "./admin/ModalSeriesTreino";
import {
  SERIES_PADRAO_DEFAULT, chaveExercicio, chaveTreino, clampSeries, mapaSeriesPadrao, numSeriesPadrao, temSeriesProprias,
  type ExercicioTreino, type SeriePadraoRow,
} from "@/lib/seriesPadrao";

interface Props { userId: string }

interface GrupoDisp { id: string; nome: string; tipo: "catalogo" | "pessoal" }
interface SemanaRow {
  dia_semana: string;
  slot_idx: number | null;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
  extra?: boolean | number | null;
  extra_atrelado_grupo_id?: string | null;
  extra_atrelado_grupo_usuario_id?: string | null;
}
interface DiaConfigRow { dia_semana: string; alternado: boolean | number | null; alternado_inicio: string | null }
/** extra do alternado: treino (key) + atrelamento (key de um rotativo, ou null = todos) */
interface ExtraInfo { key: string; atrelado: string | null }

// chave única por grupo (catálogo usa grupo_id, pessoal usa grupo_usuario_id)
const keyOf = (g: { id: string; tipo: string }) => `${g.tipo}:${g.id}`;
const keyOfRow = (r: SemanaRow) => r.grupo_usuario_id ? `pessoal:${r.grupo_usuario_id}` : `catalogo:${r.grupo_id}`;
const idsFromKey = (k: string): { grupo_id?: string; grupo_usuario_id?: string } => {
  const [tipo, id] = k.split(":");
  return tipo === "pessoal" ? { grupo_usuario_id: id } : { grupo_id: id };
};

const hojeISO = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const DIAS: { code: string; label: string }[] = [
  { code: "SEG", label: "Segunda" }, { code: "TER", label: "Terça" },
  { code: "QUA", label: "Quarta" }, { code: "QUI", label: "Quinta" },
  { code: "SEX", label: "Sexta" }, { code: "SAB", label: "Sábado" },
  { code: "DOM", label: "Domingo" },
];

const SUB_TABS: { key: string; label: string }[] = [
  { key: "semana", label: "Treino Diário" },
  { key: "volume", label: "Volume Semanal" },
];

export default function AdminSemanaUsuario({ userId }: Props) {
  const [grupos, setGrupos] = useState<GrupoDisp[]>([]);
  // keys dos treinos de cada dia NA ORDEM MARCADA (slot_idx) — define a rotação do alternado
  const [ordemDia, setOrdemDia] = useState<Record<string, string[]>>({});
  const [diasConfig, setDiasConfig] = useState<Record<string, DiaConfigRow>>({});
  const [extras, setExtras] = useState<Record<string, ExtraInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingDia, setSavingDia] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  // fluxo "adicionar treino extra" (por dia aberto)
  const [extraNovo, setExtraNovo] = useState<{ dia: string; key: string; atrelar: "todos" | "um"; atrelado: string } | null>(null);
  // séries por treino/exercício (linhas da tabela; sem linha = padrão 3) + popup "Séries" do treino aberto
  const [seriesRows, setSeriesRows] = useState<SeriePadraoRow[]>([]);
  const [modalSeries, setModalSeries] = useState<GrupoDisp | null>(null);
  // exercícios de cada treino (vêm no get → popup abre na hora); key do treino → lista
  const [exerciciosPorTreino, setExerciciosPorTreino] = useState<Record<string, ExercicioTreino[]>>({});
  const [salvandoSeries, setSalvandoSeries] = useState(false);
  // gravação em voo + recarga do Realtime adiada (senão o evento da 1ª gravação sobrescreve o valor otimista da 2ª)
  const salvandoRef = useRef(false);
  const recargaPendenteRef = useRef(false);

  // sub-aba derivada da URL (?wt=) — F5 mantém a aba, padrão do AdminTreinos
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSub = searchParams.get("wt");
  const subTab = SUB_TABS.some((t) => t.key === rawSub) ? (rawSub as string) : "semana";
  const setSubTab = (key: string) =>
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("wt", key);
      return p;
    }, { replace: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-semana-treinos", { body: { action: "get", userId } });
      if (error) throw error;
      setGrupos((data?.gruposDisponiveis as GrupoDisp[]) || []);
      const map: Record<string, string[]> = {};
      const exMap: Record<string, ExtraInfo[]> = {};
      const rows = (((data?.semana as SemanaRow[]) || []) as SemanaRow[])
        .slice()
        .sort((a, b) => (a.slot_idx ?? 0) - (b.slot_idx ?? 0));
      rows.forEach((r) => {
        if (r.extra) {
          const atrelado = r.extra_atrelado_grupo_usuario_id
            ? `pessoal:${r.extra_atrelado_grupo_usuario_id}`
            : r.extra_atrelado_grupo_id
              ? `catalogo:${r.extra_atrelado_grupo_id}`
              : null;
          (exMap[r.dia_semana] ||= []).push({ key: keyOfRow(r), atrelado });
        } else {
          (map[r.dia_semana] ||= []).push(keyOfRow(r));
        }
      });
      setOrdemDia(map);
      setExtras(exMap);
      const cfg: Record<string, DiaConfigRow> = {};
      ((data?.diasConfig as DiaConfigRow[]) || []).forEach((c) => { cfg[c.dia_semana] = c; });
      setDiasConfig(cfg);
      setSeriesRows((data?.seriesPadrao as SeriePadraoRow[]) || []);
      setExerciciosPorTreino((data?.exerciciosPorTreino as Record<string, ExercicioTreino[]>) || {});
    } catch {
      toast.error("Erro ao carregar a semana do usuário.");
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Tempo real: o aluno adiciona/remove série no app → a linha dele muda → o popup "Séries"
  // atualiza sem recarregar (Realtime do Supabase, filtrado pelo aluno; RLS admin permite ler).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recarregar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (salvandoRef.current) { recargaPendenteRef.current = true; return; }
        const { data, error } = await supabase.functions.invoke("admin-semana-treinos", { body: { action: "get", userId } });
        if (!error && data?.seriesPadrao) setSeriesRows(data.seriesPadrao as SeriePadraoRow[]);
      }, 250);
    };
    const canal = supabase
      .channel(`series-padrao-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: DB_SCHEMA, table: "tb_series_padrao_usuario", filter: `user_id=eq.${userId}` },
        recarregar,
      )
      .subscribe((status, err) => {
        // visível no console: SUBSCRIBED = ao vivo; CHANNEL_ERROR/TIMED_OUT = sem tempo real (cai pro reload manual)
        console.info("[realtime series-padrao]", status, err?.message ?? "");
      });
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(canal);
    };
  }, [userId]);

  const toggle = async (dia: string, grupo: GrupoDisp) => {
    const k = keyOf(grupo);
    const atual = (ordemDia[dia] || []).slice();
    const i = atual.indexOf(k);
    if (i >= 0) atual.splice(i, 1); else atual.push(k); // novo entra no FIM da rotação
    setOrdemDia((prev) => ({ ...prev, [dia]: atual }));
    setSavingDia(dia);
    try {
      const payload = atual.map((key) => idsFromKey(key));
      const { error } = await supabase.functions.invoke("admin-semana-treinos", {
        body: { action: "setDia", userId, dia_semana: dia, grupos: payload },
      });
      if (error) throw error;
    } catch {
      toast.error("Erro ao salvar — recarregando.");
      await load();
    } finally { setSavingDia(null); }
  };

  const toggleAlternado = async (dia: string) => {
    const ativo = !!diasConfig[dia]?.alternado;
    const novo = !ativo;
    const inicio = segundaDaSemana(hojeISO());
    // otimista (igual ao toggle dos treinos); reverte recarregando se falhar
    setDiasConfig((prev) => ({ ...prev, [dia]: { dia_semana: dia, alternado: novo, alternado_inicio: novo ? inicio : null } }));
    if (!novo) setExtras((prev) => ({ ...prev, [dia]: [] }));
    setSavingDia(dia);
    try {
      const { error } = await supabase.functions.invoke("admin-semana-treinos", {
        body: { action: "setDiaConfig", userId, dia_semana: dia, alternado: novo, inicio },
      });
      if (error) throw error;
    } catch {
      toast.error("Erro ao salvar o alternado — recarregando.");
      await load();
    } finally { setSavingDia(null); }
  };

  const salvarExtras = async (dia: string, lista: ExtraInfo[]) => {
    setSavingDia(dia);
    try {
      const payload = lista.map((e) => ({
        ...idsFromKey(e.key),
        ...(e.atrelado
          ? (e.atrelado.startsWith("pessoal:")
              ? { atrelado_grupo_usuario_id: e.atrelado.split(":")[1] }
              : { atrelado_grupo_id: e.atrelado.split(":")[1] })
          : {}),
      }));
      const { error } = await supabase.functions.invoke("admin-semana-treinos", {
        body: { action: "setExtras", userId, dia_semana: dia, extras: payload },
      });
      if (error) throw error;
      setExtras((prev) => ({ ...prev, [dia]: lista }));
    } catch {
      toast.error("Erro ao salvar o treino extra.");
      await load();
    } finally { setSavingDia(null); }
  };

  const mapaSeries = useMemo(() => mapaSeriesPadrao(seriesRows), [seriesRows]);
  const geralDe = (g: GrupoDisp): number => numSeriesPadrao(mapaSeries, keyOf(g));
  const valorDe = (g: GrupoDisp, ex: ExercicioTreino): number =>
    numSeriesPadrao(mapaSeries, keyOf(g), ex.exercicio_id, ex.exercicio_usuario_id);
  const temProprio = (g: GrupoDisp, ex: ExercicioTreino): boolean =>
    temSeriesProprias(mapaSeries, keyOf(g), ex.exercicio_id, ex.exercicio_usuario_id);

  /** recarrega só as linhas de séries (usado pra reverter quando uma gravação falha) */
  const recarregarSeries = async () => {
    const { data, error } = await supabase.functions.invoke("admin-semana-treinos", { body: { action: "get", userId } });
    if (!error && data?.seriesPadrao) setSeriesRows(data.seriesPadrao as SeriePadraoRow[]);
  };

  /** abre o popup "Séries" — exercícios já vieram no get; busca só se faltarem (fallback) */
  const abrirSeries = async (g: GrupoDisp) => {
    setModalSeries(g);
    const k = keyOf(g);
    if (exerciciosPorTreino[k]) return;
    const { data, error } = await supabase.functions.invoke("admin-semana-treinos", {
      body: { action: "exerciciosTreino", userId, ...idsFromKey(k) },
    });
    if (error || data?.error) {
      toast.error("Erro ao carregar os exercícios do treino.");
      setExerciciosPorTreino((prev) => ({ ...prev, [k]: [] }));
      return;
    }
    setExerciciosPorTreino((prev) => ({ ...prev, [k]: (data?.exercicios as ExercicioTreino[]) || [] }));
  };

  const rowDoTreino = (r: SeriePadraoRow): string | null => chaveTreino(r.grupo_id, r.grupo_usuario_id);
  const rowDoExercicio = (r: SeriePadraoRow): string | null => chaveExercicio(r.exercicio_id, r.exercicio_usuario_id);

  /** grava na edge com estado otimista; se falhar, avisa e recarrega do servidor */
  const gravarSeries = async (body: Record<string, unknown>, otimista: (rows: SeriePadraoRow[]) => SeriePadraoRow[], erro: string) => {
    setSeriesRows(otimista);
    setSalvandoSeries(true);
    salvandoRef.current = true;
    try {
      const { data, error } = await supabase.functions.invoke("admin-semana-treinos", { body: { userId, ...body } });
      if (error || data?.error) throw error || new Error(String(data.error));
    } catch {
      toast.error(erro);
      await recarregarSeries();
    } finally {
      salvandoRef.current = false;
      setSalvandoSeries(false);
      if (recargaPendenteRef.current) {
        recargaPendenteRef.current = false;
        void recarregarSeries();
      }
    }
  };

  /** − / + de um exercício: número próprio dele (1 a 10) */
  const alterarSeriesExercicio = (g: GrupoDisp, ex: ExercicioTreino, delta: 1 | -1) => {
    const atual = valorDe(g, ex);
    const novo = clampSeries(atual + delta);
    if (novo === atual) return;
    const k = keyOf(g);
    const exKey = chaveExercicio(ex.exercicio_id, ex.exercicio_usuario_id);
    const ids = idsFromKey(k);
    void gravarSeries(
      { action: "setSeriesPadrao", ...ids, exercicio_id: ex.exercicio_id, exercicio_usuario_id: ex.exercicio_usuario_id, num_series: novo },
      (rows) => [
        ...rows.filter((r) => !(rowDoTreino(r) === k && rowDoExercicio(r) === exKey)),
        { grupo_id: ids.grupo_id ?? null, grupo_usuario_id: ids.grupo_usuario_id ?? null, exercicio_id: ex.exercicio_id, exercicio_usuario_id: ex.exercicio_usuario_id, num_series: novo },
      ],
      "Erro ao salvar o número de séries do exercício.",
    );
  };

  /** "Aplicar a todos": vira o geral do treino e apaga os números próprios */
  const aplicarSeriesTodos = (g: GrupoDisp, n: number) => {
    const k = keyOf(g);
    const ids = idsFromKey(k);
    const valor = clampSeries(n);
    void gravarSeries(
      { action: "aplicarSeriesTreino", ...ids, num_series: valor },
      (rows) => [
        ...rows.filter((r) => rowDoTreino(r) !== k),
        { grupo_id: ids.grupo_id ?? null, grupo_usuario_id: ids.grupo_usuario_id ?? null, exercicio_id: null, exercicio_usuario_id: null, num_series: valor },
      ],
      "Erro ao aplicar as séries ao treino.",
    );
  };

  /** badge "Séries" ao lado do treino — abre o popup com os exercícios dele */
  const BadgeSeries = ({ g }: { g: GrupoDisp }) => (
    <button
      type="button"
      onClick={() => void abrirSeries(g)}
      title="Séries de cada exercício deste treino"
      data-admin-series-treino={keyOf(g)}
      className="shrink-0 text-[10px] font-body uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
    >
      Séries
    </button>
  );

  const nomeDoKey = (k: string | null): string => {
    if (!k) return "";
    const g = grupos.find((x) => keyOf(x) === k);
    return g ? g.nome : "(treino)";
  };

  /** rotativos do dia na ordem marcada (mesma ordem enviada no setDia / slot_idx) */
  const rotativosDoDia = (dia: string): GrupoDisp[] =>
    (ordemDia[dia] || [])
      .map((k) => grupos.find((g) => keyOf(g) === k))
      .filter((g): g is GrupoDisp => !!g);

  const treinoDaSemanaAtual = (dia: string): GrupoDisp | null => {
    const cfg = diasConfig[dia];
    const rot = rotativosDoDia(dia);
    if (!cfg?.alternado || !cfg.alternado_inicio || rot.length === 0) return null;
    return rot[indiceRotacao(hojeISO(), cfg.alternado_inicio, rot.length)];
  };

  return (
    <section className="section-divider pt-10">
      <div className="flex gap-4 border-b border-border mb-4">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            className={`pb-2 text-sm font-heading uppercase tracking-wider border-b-2 -mb-px transition-colors ${
              subTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "volume" ? (
        <AdminVolumeSemanal userId={userId} />
      ) : (
      <>
      <p className="text-xs text-muted-foreground font-body mb-6">
        Marque os treinos que aparecem em cada dia. Repetem toda semana. Salva automaticamente.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground font-body">Carregando…</p>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body">
          Nenhum treino atribuído a este usuário. Atribua grupos em Gerenciar Treinos › Grupos.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {DIAS.map((d) => {
            const sel = rotativosDoDia(d.code);
            const isOpen = aberto === d.code;
            const cfg = diasConfig[d.code];
            const alternadoAtivo = !!cfg?.alternado;
            const extrasDia = extras[d.code] || [];
            const atual = treinoDaSemanaAtual(d.code);
            return (
              <div key={d.code} className="border border-border rounded-md p-3">
                <button
                  type="button"
                  onClick={() => { setAberto(isOpen ? null : d.code); setExtraNovo(null); }}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-heading uppercase tracking-wider text-foreground">{d.label}</span>
                    {alternadoAtivo && (
                      <span className="text-[10px] font-body uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary/10 text-primary">
                        alternado
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {savingDia === d.code && <span className="text-xs text-muted-foreground">salvando…</span>}
                    <span className="text-xs text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
                  </span>
                </button>

                {sel.length > 0 ? (
                  <div className="flex flex-col gap-0.5 pl-1 mt-1">
                    {alternadoAtivo ? (
                      <>
                        <span className="text-sm font-body text-foreground">
                          Alterna: {sel.map((g) => g.nome).join(" ⇄ ")}
                        </span>
                        {atual && (
                          <span className="text-xs font-body text-primary">Esta semana: {atual.nome}</span>
                        )}
                        {extrasDia.map((e, i) => (
                          <span key={i} className="text-xs font-body text-muted-foreground">
                            + Extra: {nomeDoKey(e.key)} {e.atrelado ? `(junto com ${nomeDoKey(e.atrelado)})` : "(toda semana)"}
                          </span>
                        ))}
                      </>
                    ) : (
                      sel.map((g) => (
                        <span key={g.id} className="flex items-center gap-2 text-sm font-body text-foreground">
                          <span className="truncate">{g.nome}{g.tipo === "pessoal" ? " (pessoal)" : ""}</span>
                          <BadgeSeries g={g} />
                        </span>
                      ))
                    )}
                  </div>
                ) : (
                  <span className="block text-xs text-muted-foreground font-body pl-1 mt-1">Descanso</span>
                )}

                {isOpen && (
                  <div className="flex flex-col gap-1 pl-1 mt-2 border-t border-border pt-2">
                    {grupos.map((g) => {
                      const checked = ordemDia[d.code]?.includes(keyOf(g)) ?? false;
                      return (
                        <div key={g.id} className="flex items-center gap-2 text-sm font-body">
                          <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                            <input type="checkbox" checked={checked} onChange={() => toggle(d.code, g)} className="accent-primary" />
                            <span className="truncate">{g.nome}{g.tipo === "pessoal" ? " (pessoal)" : ""}</span>
                          </label>
                          {checked && <BadgeSeries g={g} />}
                        </div>
                      );
                    })}

                    {/* ——— Treino alternado ——— */}
                    <div className="mt-2 border-t border-border pt-2">
                      <label
                        className={`flex items-center gap-2 text-sm font-body ${sel.length >= 2 || alternadoAtivo ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}
                        title={sel.length < 2 && !alternadoAtivo ? "Marque 2 ou mais treinos pra alternar" : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={alternadoAtivo}
                          disabled={sel.length < 2 && !alternadoAtivo}
                          onChange={() => toggleAlternado(d.code)}
                          className="accent-primary"
                        />
                        <span>Treino alternado</span>
                        <span className="text-[10px] text-muted-foreground">(um treino por semana, na ordem marcada)</span>
                      </label>

                      {alternadoAtivo && (
                        <div className="flex flex-col gap-1.5 pl-6 mt-1.5">
                          {atual && (
                            <span className="text-xs font-body text-primary">Esta semana: {atual.nome}</span>
                          )}

                          {extrasDia.map((e, i) => (
                            <span key={i} className="flex items-center gap-2 text-xs font-body text-foreground">
                              Extra: {nomeDoKey(e.key)} {e.atrelado ? `— junto com ${nomeDoKey(e.atrelado)}` : "— toda semana"}
                              <button
                                type="button"
                                onClick={() => salvarExtras(d.code, extrasDia.filter((_, j) => j !== i))}
                                className="text-muted-foreground hover:text-destructive"
                                title="Remover treino extra"
                              >
                                ✕
                              </button>
                            </span>
                          ))}

                          {extraNovo?.dia === d.code ? (
                            <div className="flex flex-col gap-1.5 border border-border rounded p-2">
                              <select
                                value={extraNovo.key}
                                onChange={(e) => setExtraNovo({ ...extraNovo, key: e.target.value })}
                                className="bg-transparent border-b border-muted-foreground text-foreground font-body text-xs py-1 outline-none focus:border-primary"
                              >
                                <option value="" className="bg-background text-foreground">Escolher o treino extra...</option>
                                {grupos.map((g) => (
                                  <option key={g.id} value={keyOf(g)} className="bg-background text-foreground">
                                    {g.nome}{g.tipo === "pessoal" ? " (pessoal)" : ""}
                                  </option>
                                ))}
                              </select>

                              <span className="text-xs font-body text-muted-foreground">Atrelar a um treino?</span>
                              <div className="flex gap-3">
                                <label className="flex items-center gap-1 text-xs font-body cursor-pointer">
                                  <input type="radio" checked={extraNovo.atrelar === "um"} onChange={() => setExtraNovo({ ...extraNovo, atrelar: "um" })} className="accent-primary" />
                                  Sim
                                </label>
                                <label className="flex items-center gap-1 text-xs font-body cursor-pointer">
                                  <input type="radio" checked={extraNovo.atrelar === "todos"} onChange={() => setExtraNovo({ ...extraNovo, atrelar: "todos", atrelado: "" })} className="accent-primary" />
                                  Não (vale pra todos)
                                </label>
                              </div>

                              {extraNovo.atrelar === "um" && (
                                <select
                                  value={extraNovo.atrelado}
                                  onChange={(e) => setExtraNovo({ ...extraNovo, atrelado: e.target.value })}
                                  className="bg-transparent border-b border-muted-foreground text-foreground font-body text-xs py-1 outline-none focus:border-primary"
                                >
                                  <option value="" className="bg-background text-foreground">Escolher o treino...</option>
                                  {sel.map((g) => (
                                    <option key={g.id} value={keyOf(g)} className="bg-background text-foreground">{g.nome}</option>
                                  ))}
                                </select>
                              )}

                              <div className="flex gap-2 mt-1">
                                <button
                                  type="button"
                                  disabled={!extraNovo.key || (extraNovo.atrelar === "um" && !extraNovo.atrelado)}
                                  onClick={() => {
                                    salvarExtras(d.code, [...extrasDia, { key: extraNovo.key, atrelado: extraNovo.atrelar === "um" ? extraNovo.atrelado : null }]);
                                    setExtraNovo(null);
                                  }}
                                  className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded disabled:opacity-40"
                                >
                                  Salvar extra
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExtraNovo(null)}
                                  className="px-2 py-1 border border-muted-foreground/20 text-muted-foreground text-[10px] font-bold uppercase rounded"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setExtraNovo({ dia: d.code, key: "", atrelar: "todos", atrelado: "" })}
                              className="self-start px-2 py-1 border border-muted-foreground/20 rounded text-[10px] font-bold uppercase tracking-wider text-primary hover:border-primary transition-colors"
                            >
                              + Adicionar treino extra
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
      <ModalSeriesTreino
        treino={modalSeries}
        exercicios={modalSeries ? exerciciosPorTreino[keyOf(modalSeries)] ?? null : null}
        geral={modalSeries ? geralDe(modalSeries) : SERIES_PADRAO_DEFAULT}
        valorDe={(ex) => (modalSeries ? valorDe(modalSeries, ex) : SERIES_PADRAO_DEFAULT)}
        temProprio={(ex) => (modalSeries ? temProprio(modalSeries, ex) : false)}
        onAlterarExercicio={(ex, delta) => { if (modalSeries) alterarSeriesExercicio(modalSeries, ex, delta); }}
        onAplicarTodos={(n) => { if (modalSeries) aplicarSeriesTodos(modalSeries, n); }}
        salvando={salvandoSeries}
        onOpenChange={(aberto) => { if (!aberto) setModalSeries(null); }}
      />
    </section>
  );
}
