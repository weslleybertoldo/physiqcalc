import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatarDataCurta } from "@/utils/formatDate";

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
  const [records, setRecords] = useState<SerieRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !exercicioId) return;
    setLoading(true);
    // Busca tanto por exercicio_id (global) quanto por exercicio_usuario_id (personalizado)
    supabase
      .from("tb_treino_series")
      .select("data_treino, numero_serie, peso, reps, tempo_segundos, distancia_km, pace_segundos_km")
      .eq("user_id", userId)
      .eq("concluida", true)
      .or(`exercicio_id.eq.${exercicioId},exercicio_usuario_id.eq.${exercicioId}`)
      .or("peso.gt.0,tempo_segundos.gt.0")
      .order("data_treino", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRecords((data as unknown as SerieRecord[]) || []);
        setLoading(false);
      });
  }, [open, exercicioId, userId]);

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
