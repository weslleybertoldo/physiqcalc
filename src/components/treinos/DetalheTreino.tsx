import { Timer, Dumbbell, MapPin } from "lucide-react";
import { formatarData } from "@/utils/formatDate";
import { buildTreinoResumo, formatDuracao, type TreinoResumo } from "@/lib/treinoResumo";

/** Linha de treino_historico (ou reconstruída das séries pela edge admin-relatorio). */
export interface TreinoRow {
  id: string;
  nome_treino: string;
  iniciado_em: string;
  concluido_em: string;
  duracao_segundos: number;
  exercicios_concluidos: any[] | null;
  /** Reconstruído das séries: não passou pelo cronômetro, não tem duração nem horários. */
  sem_cronometro?: boolean;
}

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

export function formatTimer(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatHora(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** As 4 caixas: Duração, Academia, Volume total, Média peso/rep. */
export function CaixasResumo({ resumo, duracaoSegundos, semCronometro }: {
  resumo: TreinoResumo;
  duracaoSegundos: number;
  semCronometro?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-secondary/30 rounded px-3 py-2">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Duração</p>
        <p className="text-sm font-heading text-foreground">
          {semCronometro ? "—" : formatTimer(duracaoSegundos)}
        </p>
      </div>
      <div className="bg-secondary/30 rounded px-3 py-2">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Academia</p>
        <p className="text-sm font-heading text-foreground">{resumo.academia_nome || "—"}</p>
      </div>
      <div className="bg-secondary/30 rounded px-3 py-2">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Volume total</p>
        <p className="text-sm font-heading text-primary">
          {Math.round(resumo.volumeTotal).toLocaleString("pt-BR")} kg
        </p>
      </div>
      <div className="bg-secondary/30 rounded px-3 py-2">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading">Média peso/rep</p>
        <p className="text-sm font-heading text-primary">
          {resumo.mediaPesoRep != null ? `${resumo.mediaPesoRep.toFixed(1)} kg` : "—"}
        </p>
      </div>
    </div>
  );
}

/** "Exercícios realizados": nome, kg/rep médio e cada série. */
export function ListaExercicios({ resumo }: { resumo: TreinoResumo }) {
  if (resumo.exercicios.length === 0) return null;
  return (
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
  );
}

/** Um treino inteiro, já aberto: cabeçalho + caixas + exercícios. */
const DetalheTreino = ({ treino }: { treino: TreinoRow }) => {
  const resumo = buildTreinoResumo(treino);
  const semCron = !!treino.sem_cronometro;
  const d = new Date(treino.iniciado_em);
  const dia = DIAS_LABEL[d.getDay()];
  const dataStr = formatarData(treino.iniciado_em, { formato: "curto" });

  return (
    <div className="space-y-4">
      <div className="border-b border-muted-foreground/20 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-heading">{dia} · {dataStr}</span>
          {!semCron && (
            <span className="text-[10px] text-muted-foreground/60 font-body">
              {formatHora(treino.iniciado_em)} – {formatHora(treino.concluido_em)}
            </span>
          )}
        </div>
        <p className="font-heading text-base text-foreground mt-1">{treino.nome_treino}</p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {semCron ? (
            <span className="text-[10px] text-muted-foreground/60 font-body italic">sem cronômetro</span>
          ) : (
            <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
              <Timer size={10} /> {formatDuracao(treino.duracao_segundos)}
            </span>
          )}
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
          {!semCron && (
            <span className="font-heading text-sm text-foreground tabular-nums ml-auto">
              {formatTimer(treino.duracao_segundos)}
            </span>
          )}
        </div>
      </div>

      <CaixasResumo resumo={resumo} duracaoSegundos={treino.duracao_segundos} semCronometro={semCron} />
      <ListaExercicios resumo={resumo} />
    </div>
  );
};

export default DetalheTreino;
