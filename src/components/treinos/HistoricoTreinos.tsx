import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ArrowLeft, Timer, Dumbbell, ChevronDown, ChevronUp, Trash2, MapPin, Share2 } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { formatarData } from "@/utils/formatDate";
import { toast } from "sonner";
import { buildTreinoResumo, formatDuracao, type TreinoResumo } from "@/lib/treinoResumo";
import CompartilharTreinoModal from "./CompartilharTreinoModal";

interface HistoricoItem {
  id: string;
  nome_treino: string;
  iniciado_em: string;
  concluido_em: string;
  duracao_segundos: number;
  exercicios_concluidos: any[] | null;
}

interface Props {
  userId: string;
  onBack: () => void;
}

const PAGE_SIZE = 5;

function formatTimer(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatHora(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

const DIAS_LABEL: Record<number, string> = {
  0: "DOM", 1: "SEG", 2: "TER", 3: "QUA", 4: "QUI", 5: "SEX", 6: "SAB",
};
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Parseia exercicios_concluidos que pode estar single ou double-encoded como JSON string */
function parseExercicios(raw: unknown): any[] {
  let parsed = raw;
  for (let i = 0; i < 3 && typeof parsed === "string"; i++) {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  return Array.isArray(parsed) ? parsed : [];
}

/** Chave de mês (YYYY-MM) a partir do início do treino. */
function mesKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function mesLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MESES[parseInt(m, 10) - 1]}/${y}`;
}

const HistoricoTreinos = ({ userId, onBack }: Props) => {
  const db = usePowerSync();
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mesFiltro, setMesFiltro] = useState<string>("todos");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [compartilhar, setCompartilhar] = useState<TreinoResumo | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const filtroInicializado = useRef(false);

  useEffect(() => { loadHistorico(); }, [userId, db]);

  const loadHistorico = async () => {
    setLoading(true);
    setErro(false);
    try {
      const rows = await db.getAll(
        "SELECT * FROM treino_historico WHERE user_id = ? ORDER BY concluido_em DESC LIMIT 500",
        [userId]
      );
      const parsed = (rows as any[]).map((r) => ({
        ...r,
        exercicios_concluidos: parseExercicios(r.exercicios_concluidos),
      }));
      setHistorico(parsed as HistoricoItem[]);
    } catch {
      setErro(true);
      toast.error("Erro ao carregar histórico.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await db.execute("DELETE FROM treino_historico WHERE id = ? AND user_id = ?", [id, userId]);
      setHistorico((prev) => prev.filter((h) => h.id !== id));
      toast.success("Treino excluído.");
    } catch {
      toast.error("Erro ao excluir treino.");
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  // Meses disponíveis (para o seletor)
  const meses = useMemo(() => {
    const set = new Set(historico.map((h) => mesKey(h.iniciado_em)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [historico]);

  // Pré-seleciona o mês atual quando há treinos nele (1x, após carregar).
  useEffect(() => {
    if (filtroInicializado.current || meses.length === 0) return;
    filtroInicializado.current = true;
    const atual = mesKey(new Date().toISOString());
    if (meses.includes(atual)) setMesFiltro(atual);
  }, [meses]);

  // Lista filtrada pelo mês
  const filtrados = useMemo(
    () => (mesFiltro === "todos" ? historico : historico.filter((h) => mesKey(h.iniciado_em) === mesFiltro)),
    [historico, mesFiltro]
  );

  // Reset da paginação ao trocar o filtro
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [mesFiltro]);

  const visiveis = filtrados.slice(0, visibleCount);
  const temMais = visibleCount < filtrados.length;

  // Scroll infinito: carrega +PAGE_SIZE quando o sentinel entra na viewport
  useEffect(() => {
    if (!temMais) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [temMais, visiveis.length]);

  // Cards de resumo (recalculados pelo filtro de mês)
  const totalTreinos = filtrados.length;
  const tempoTotal = filtrados.reduce((acc, h) => acc + h.duracao_segundos, 0);
  const mediaPorTreino = totalTreinos > 0 ? Math.round(tempoTotal / totalTreinos) : 0;

  const toResumo = useCallback((h: HistoricoItem): TreinoResumo => buildTreinoResumo(h), []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="font-heading text-xl text-foreground">HISTÓRICO DE TREINOS</h2>
      </div>

      {/* Filtro por mês */}
      {meses.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading shrink-0">Mês</span>
          <select
            value={mesFiltro}
            onChange={(e) => setMesFiltro(e.target.value)}
            className="input-underline text-sm py-1 flex-1"
          >
            <option value="todos" className="bg-background text-foreground">Todos os meses</option>
            {meses.map((m) => (
              <option key={m} value={m} className="bg-background text-foreground">{mesLabel(m)}</option>
            ))}
          </select>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="result-card border-primary/30">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Total</p>
          <p className="font-heading text-xl text-primary">{totalTreinos}</p>
        </div>
        <div className="result-card border-classify-green/30">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Tempo total</p>
          <p className="font-heading text-xl text-classify-green">{formatDuracao(tempoTotal)}</p>
        </div>
        <div className="result-card border-classify-blue/30">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Média</p>
          <p className="font-heading text-xl text-classify-blue">{formatDuracao(mediaPorTreino)}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground font-body text-sm">Carregando...</p>
      ) : erro ? (
        <p className="text-destructive font-body text-sm text-center py-8">Erro ao carregar histórico. Tente novamente.</p>
      ) : filtrados.length === 0 ? (
        <p className="text-muted-foreground font-body text-sm text-center py-8">Nenhum treino registrado ainda.</p>
      ) : (
        <div className="space-y-0">
          {visiveis.map((h) => {
            const resumo = toResumo(h);
            const d = new Date(h.iniciado_em);
            const dia = DIAS_LABEL[d.getDay()];
            const dataStr = formatarData(h.iniciado_em, { formato: "curto" });
            const hora = formatHora(h.iniciado_em);
            const horaFim = formatHora(h.concluido_em);
            const isExpanded = expandedId === h.id;
            const isConfirming = confirmDeleteId === h.id;

            return (
              <div key={h.id} className="border-b border-muted-foreground/20">
                <div className="flex items-center gap-2 py-4">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : h.id)}
                    className="flex-1 flex items-center justify-between text-left min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-heading">{dia} · {dataStr}</span>
                        <span className="text-[10px] text-muted-foreground/60 font-body">{hora} – {horaFim}</span>
                      </div>
                      <p className="font-heading text-sm text-foreground mt-0.5">{h.nome_treino}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                          <Timer size={10} /> {formatDuracao(h.duracao_segundos)}
                        </span>
                        {resumo.exercicios.length > 0 && (
                          <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                            <Dumbbell size={10} /> {resumo.exercicios.length} exercícios
                          </span>
                        )}
                        {resumo.academia_nome && (
                          <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                            <MapPin size={10} /> {resumo.academia_nome}
                          </span>
                        )}
                        <span className="text-[10px] text-classify-green font-heading">✓ Concluído</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-heading text-sm text-foreground tabular-nums">{formatTimer(h.duracao_segundos)}</span>
                      {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {isConfirming ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={deletingId === h.id}
                        onClick={() => handleDelete(h.id)}
                        className="text-[10px] px-2 py-1 bg-destructive text-destructive-foreground font-heading rounded transition-colors hover:bg-destructive/90"
                      >
                        {deletingId === h.id ? "..." : "Confirmar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[10px] px-2 py-1 text-muted-foreground font-heading hover:text-foreground transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(h.id)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Excluir treino"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="pb-4 pl-1 space-y-4">
                    {/* Info do treino */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-secondary/30 rounded px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Duração</p>
                        <p className="text-sm font-heading text-foreground">{formatTimer(h.duracao_segundos)}</p>
                      </div>
                      <div className="bg-secondary/30 rounded px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Academia</p>
                        <p className="text-sm font-heading text-foreground">{resumo.academia_nome || "—"}</p>
                      </div>
                      <div className="bg-secondary/30 rounded px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Volume total</p>
                        <p className="text-sm font-heading text-primary">{Math.round(resumo.volumeTotal).toLocaleString("pt-BR")} kg</p>
                      </div>
                      <div className="bg-secondary/30 rounded px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Média peso/rep</p>
                        <p className="text-sm font-heading text-primary">{resumo.mediaPesoRep != null ? `${resumo.mediaPesoRep.toFixed(1)} kg` : "—"}</p>
                      </div>
                    </div>

                    {resumo.exercicios.length > 0 && (
                      <div>
                        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-2">
                          Exercícios realizados
                        </p>
                        <div className="space-y-2">
                          {resumo.exercicios.map((ex, i) => (
                            <div key={i} className="py-2 px-3 bg-secondary/30 rounded">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-heading text-foreground">🏆 {ex.nome}</span>
                                {ex.mediaPesoRep != null && (
                                  <span className="text-[10px] text-primary font-heading">{ex.mediaPesoRep.toFixed(1)} kg/rep</span>
                                )}
                              </div>
                              {ex.series.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                                  {ex.series.map((s) => (
                                    <span key={s.numero_serie} className="text-[11px] text-muted-foreground font-body tabular-nums">
                                      {s.numero_serie}ª: <span className="text-foreground">{s.peso}kg × {s.reps}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-muted-foreground font-body mt-1">
                                  {ex.series_concluidas} série{ex.series_concluidas !== 1 ? "s" : ""}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setCompartilhar(resumo)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider transition-colors hover:bg-primary/90"
                    >
                      <Share2 size={14} /> Compartilhar treino
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Sentinel do scroll infinito */}
          {temMais && (
            <div ref={sentinelRef} className="py-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="text-xs text-muted-foreground hover:text-foreground font-heading uppercase tracking-wider transition-colors"
              >
                Carregar mais
              </button>
            </div>
          )}
        </div>
      )}

      {compartilhar && (
        <CompartilharTreinoModal resumo={compartilhar} onClose={() => setCompartilhar(null)} />
      )}
    </div>
  );
};

export default HistoricoTreinos;
