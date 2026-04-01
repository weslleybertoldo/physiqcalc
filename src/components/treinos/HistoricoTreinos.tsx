import { useState, useEffect } from "react";
import { ArrowLeft, Timer, Dumbbell, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { formatarData } from "@/utils/formatDate";
import { toast } from "sonner";

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

function formatDuracao(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

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

const HistoricoTreinos = ({ userId, onBack }: Props) => {
  const db = usePowerSync();
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { loadHistorico(); }, [userId, db]);

  const loadHistorico = async () => {
    setLoading(true);
    setErro(false);
    try {
      const rows = await db.getAll(
        "SELECT * FROM treino_historico WHERE user_id = ? ORDER BY concluido_em DESC LIMIT 100",
        [userId]
      );
      // exercicios_concluidos é armazenado como JSON string no SQLite
      const parsed = (rows as any[]).map((r) => ({
        ...r,
        exercicios_concluidos: typeof r.exercicios_concluidos === "string"
          ? JSON.parse(r.exercicios_concluidos)
          : r.exercicios_concluidos,
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
      await db.execute(
        "DELETE FROM treino_historico WHERE id = ? AND user_id = ?",
        [id, userId]
      );
      setHistorico((prev) => prev.filter((h) => h.id !== id));
      toast.success("Treino excluído.");
    } catch {
      toast.error("Erro ao excluir treino.");
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  const totalTreinos = historico.length;
  const tempoTotal = historico.reduce((acc, h) => acc + h.duracao_segundos, 0);
  const mediaPorTreino = totalTreinos > 0 ? Math.round(tempoTotal / totalTreinos) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="font-heading text-xl text-foreground">HISTÓRICO DE TREINOS</h2>
      </div>

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
      ) : historico.length === 0 ? (
        <p className="text-muted-foreground font-body text-sm text-center py-8">Nenhum treino registrado ainda.</p>
      ) : (
        <div className="space-y-0">
          {historico.map((h) => {
            const d = new Date(h.iniciado_em); // dia que o treino foi iniciado
            const dia = DIAS_LABEL[d.getDay()];
            const dataStr = formatarData(h.iniciado_em, { formato: "curto" }); // data de início
            const hora = formatHora(h.iniciado_em);
            const horaFim = formatHora(h.concluido_em);
            const exercicios = (h.exercicios_concluidos as any[]) || [];
            const isExpanded = expandedId === h.id;
            const isConfirming = confirmDeleteId === h.id;

            return (
              <div key={h.id} className="border-b border-muted-foreground/20">
                <div className="flex items-center gap-2 py-4">
                  {/* Main button */}
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
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                          <Timer size={10} /> {formatDuracao(h.duracao_segundos)}
                        </span>
                        {exercicios.length > 0 && (
                          <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                            <Dumbbell size={10} /> {exercicios.length} exercícios
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

                  {/* Delete button */}
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
                  <div className="pb-4 pl-4 space-y-4">
                    {/* Info do treino */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-secondary/30 rounded px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Duração</p>
                        <p className="text-sm font-heading text-foreground">{formatTimer(h.duracao_segundos)}</p>
                      </div>
                      <div className="bg-secondary/30 rounded px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Data</p>
                        <p className="text-sm font-heading text-foreground">{dataStr}</p>
                      </div>
                      <div className="bg-secondary/30 rounded px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Início</p>
                        <p className="text-sm font-heading text-foreground">{hora}</p>
                      </div>
                      <div className="bg-secondary/30 rounded px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Fim</p>
                        <p className="text-sm font-heading text-foreground">{horaFim}</p>
                      </div>
                    </div>

                    {exercicios.length > 0 && (
                      <div>
                        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-2">
                          Exercícios realizados
                        </p>
                        <div className="space-y-1">
                          {exercicios.map((ex: any, i: number) => (
                            <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-secondary/30 rounded">
                              <span className="text-xs font-body text-foreground">🏆 {ex.nome}</span>
                              <span className="text-[10px] text-muted-foreground font-body">{ex.series_concluidas} série{ex.series_concluidas !== 1 ? "s" : ""}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HistoricoTreinos;
