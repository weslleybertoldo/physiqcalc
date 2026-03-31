import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePowerSync } from "@powersync/react";
import { formatarDataCurta } from "@/utils/formatDate";
import { toast } from "sonner";

interface Props {
  exercicioId: string | null;
  exercicioNome: string;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SerieRecord {
  data_treino: string;
  numero_serie: number;
  peso: number | null;
  reps: number | null;
  tempo_segundos: number | null;
  distancia_km: number | null;
  pace_segundos_km: number | null;
}

function formatTempo(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatPace(paceSegundos: number): string {
  const m = Math.floor(paceSegundos / 60);
  const s = paceSegundos % 60;
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

const ModalHistorico = ({ exercicioId, exercicioNome, userId, open, onOpenChange }: Props) => {
  const db = usePowerSync();
  const [records, setRecords] = useState<SerieRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!open || !exercicioId) return;
    setLoading(true);
    setErro(false);
    // Busca tanto por exercicio_id (global) quanto por exercicio_usuario_id (personalizado)
    (async () => {
      try {
        const rows = await db.getAll(
          `SELECT data_treino, numero_serie, peso, reps, tempo_segundos, distancia_km, pace_segundos_km
           FROM tb_treino_series
           WHERE user_id = ? AND concluida = 1
             AND (exercicio_id = ? OR exercicio_usuario_id = ?)
             AND (peso > 0 OR tempo_segundos > 0)
           ORDER BY data_treino DESC
           LIMIT 50`,
          [userId, exercicioId, exercicioId]
        );
        setRecords((rows as unknown as SerieRecord[]) || []);
      } catch {
        setErro(true);
        toast.error("Erro ao carregar histórico.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, exercicioId, userId, db]);

  // Group by date
  const grouped = records.reduce<Record<string, SerieRecord[]>>((acc, r) => {
    if (!acc[r.data_treino]) acc[r.data_treino] = [];
    acc[r.data_treino].push(r);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const isCorrida = (s: SerieRecord) => s.tempo_segundos != null && s.tempo_segundos > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-muted-foreground/30 max-w-sm max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">
            🕐 Histórico — {exercicioNome}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground font-body text-sm py-4">Carregando...</p>
        ) : erro ? (
          <p className="text-destructive font-body text-sm py-4">Erro ao carregar histórico. Tente novamente.</p>
        ) : sortedDates.length === 0 ? (
          <p className="text-muted-foreground font-body text-sm py-4">Nenhum registro encontrado.</p>
        ) : (
          <div className="space-y-4 py-2">
            {sortedDates.map((date) => (
              <div key={date}>
                <p className="text-xs text-primary font-heading uppercase mb-2">
                  {formatarDataCurta(date)}
                </p>
                <div className="space-y-1">
                  {grouped[date]
                    .sort((a, b) => a.numero_serie - b.numero_serie)
                    .map((s) => (
                      <div key={s.numero_serie} className="flex items-center gap-3 text-sm font-body text-foreground">
                        <span className="text-muted-foreground w-8">S{s.numero_serie}</span>
                        {isCorrida(s) ? (
                          <>
                            <span>{formatTempo(s.tempo_segundos!)}</span>
                            {s.distancia_km && (
                              <span className="text-muted-foreground">· {s.distancia_km}km</span>
                            )}
                            {s.pace_segundos_km && (
                              <span className="text-primary text-xs">⚡ {formatPace(s.pace_segundos_km)}</span>
                            )}
                          </>
                        ) : (
                          <>
                            <span>{Number(s.peso).toFixed(1)}kg</span>
                            <span className="text-muted-foreground">×</span>
                            <span>{s.reps} reps</span>
                          </>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ModalHistorico;
