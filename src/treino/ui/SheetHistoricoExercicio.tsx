import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { formatPace, formatTempo } from "@/lib/corrida";
import { formatarDataCurta } from "@/utils/formatDate";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";

interface Registro {
  data_treino: string;
  numero_serie: number;
  peso: number | null;
  reps: number | null;
  tempo_segundos: number | null;
  distancia_km: number | null;
  pace_segundos_km: number | null;
  academia_nome: string | null;
}

/** Histórico do exercício (C70): as últimas séries feitas (50), por dia, com a academia — do SQLite local (sem internet também). */
export function SheetHistoricoExercicio({
  userId,
  exercicio,
  aoFechar,
}: {
  userId: string;
  exercicio: { id: string; nome: string } | null;
  aoFechar: () => void;
}) {
  const db = usePowerSync();
  const [linhas, setLinhas] = useState<Registro[]>([]);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");

  useEffect(() => {
    if (!exercicio) return;
    let vivo = true;
    setEstado("carregando");
    db.getAll<Registro>(
      `SELECT data_treino, numero_serie, peso, reps, tempo_segundos, distancia_km, pace_segundos_km, academia_nome
       FROM tb_treino_series
       WHERE user_id = ? AND concluida = 1 AND (exercicio_id = ? OR exercicio_usuario_id = ?) AND (peso > 0 OR tempo_segundos > 0)
       ORDER BY data_treino DESC LIMIT 50`,
      [userId, exercicio.id, exercicio.id],
    )
      .then((r) => vivo && (setLinhas(r), setEstado("ok")))
      .catch(() => vivo && setEstado("erro"));
    return () => {
      vivo = false;
    };
  }, [exercicio, userId, db]);

  const porDia = linhas.reduce<Record<string, Registro[]>>((acc, r) => ((acc[r.data_treino] ??= []).push(r), acc), {});
  const dias = Object.keys(porDia).sort((a, b) => b.localeCompare(a));

  return (
    <PainelDeslizante aberto={!!exercicio} aoMudar={(v) => !v && aoFechar()} titulo="Histórico" descricao={exercicio?.nome}>
      <div className="flex flex-col gap-3 pt-1" data-historico-exercicio={exercicio?.id}>
        {estado === "carregando" ? (
          <EstadoCarregando linhas={2} rotulo="Carregando o histórico" />
        ) : estado === "erro" ? (
          <EstadoErro texto="Não deu para ler o histórico agora." />
        ) : dias.length === 0 ? (
          <EstadoVazio icone={History} titulo="Nenhum registro ainda" texto="As séries com OK aparecem aqui." />
        ) : (
          dias.map((dia) => (
            <section key={dia} className="rounded-2xl border border-linha bg-superficie px-3.5 py-2.5" data-historico-dia={dia}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-violeta-3">{formatarDataCurta(dia)}</span>
                {porDia[dia][0]?.academia_nome && <span className="truncate text-[11.5px] text-texto-3">{porDia[dia][0].academia_nome}</span>}
              </div>
              <ul className="flex flex-col gap-1">
                {porDia[dia]
                  .sort((a, b) => a.numero_serie - b.numero_serie)
                  .map((s) => (
                    <li key={s.numero_serie} className="flex items-center gap-3 text-[13.5px] tabular-nums text-texto">
                      <span className="w-7 text-texto-3">S{s.numero_serie}</span>
                      {s.tempo_segundos && s.tempo_segundos > 0 ? (
                        <span>
                          {formatTempo(s.tempo_segundos)}
                          {s.distancia_km ? <span className="text-texto-2"> · {s.distancia_km} km</span> : null}
                          {s.pace_segundos_km ? <span className="text-violeta-3"> · pace {formatPace(s.pace_segundos_km)}</span> : null}
                        </span>
                      ) : (
                        <span>
                          {Number(s.peso).toFixed(1).replace(".", ",")} kg <span className="text-texto-3">×</span> {s.reps}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </PainelDeslizante>
  );
}
