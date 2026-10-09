import { useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { formatPace, formatTempo } from "@/lib/corrida";
import { formatarDataCurta } from "@/utils/formatDate";
import { Botao } from "@/ui/premium/Botao";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { DIAS_POR_PAGINA, lerPaginaDoHistorico, type DiaDoHistorico } from "./historicoExercicio";

/** Histórico do exercício (C70): as séries feitas, por dia, com a academia — do SQLite local (sem internet também).
 * hml-14b (H-73): 20 dias por vez, com o total de dias e "Ver mais dias" (o dia nunca é partido). */
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
  const [dias, setDias] = useState<DiaDoHistorico[]>([]);
  const [totalDias, setTotalDias] = useState(0);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [mais, setMais] = useState<"parado" | "carregando" | "erro">("parado");
  // número do pedido: resposta de um exercício anterior (ou de um "ver mais" antigo) não entra na lista atual
  const pedido = useRef(0);

  useEffect(() => {
    if (!exercicio) return;
    const meu = ++pedido.current;
    setEstado("carregando");
    setMais("parado");
    lerPaginaDoHistorico(db, userId, exercicio.id)
      .then((r) => {
        if (meu !== pedido.current) return;
        setDias(r.dias);
        setTotalDias(r.totalDias);
        setEstado("ok");
      })
      .catch(() => meu === pedido.current && setEstado("erro"));
  }, [exercicio, userId, db]);

  const verMais = () => {
    const maisAntigo = dias[dias.length - 1]?.dia;
    if (!exercicio || !maisAntigo) return;
    const meu = ++pedido.current;
    setMais("carregando");
    lerPaginaDoHistorico(db, userId, exercicio.id, maisAntigo)
      .then((r) => {
        if (meu !== pedido.current) return;
        setDias((atuais) => [...atuais, ...r.dias.filter((d) => !atuais.some((a) => a.dia === d.dia))]);
        setTotalDias(r.totalDias);
        setMais("parado");
      })
      .catch(() => meu === pedido.current && setMais("erro"));
  };

  const faltam = Math.max(0, totalDias - dias.length);

  return (
    <PainelDeslizante aberto={!!exercicio} aoMudar={(v) => !v && aoFechar()} titulo="Histórico" descricao={exercicio?.nome}>
      <div className="flex flex-col gap-3 pt-1" data-historico-exercicio={exercicio?.id} data-historico-total-dias={totalDias}>
        {estado === "carregando" ? (
          <EstadoCarregando linhas={2} rotulo="Carregando o histórico" />
        ) : estado === "erro" ? (
          <EstadoErro texto="Não deu para ler o histórico agora." />
        ) : dias.length === 0 ? (
          <EstadoVazio icone={History} titulo="Nenhum registro ainda" texto="As séries com OK aparecem aqui." />
        ) : (
          <>
            {totalDias > DIAS_POR_PAGINA && (
              <p className="text-[12px] text-texto-3" data-historico-contagem>
                {dias.length} de {totalDias} dias
              </p>
            )}
            {dias.map(({ dia, series }) => (
              <section key={dia} className="rounded-2xl border border-linha bg-superficie px-3.5 py-2.5" data-historico-dia={dia}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-violeta-3">{formatarDataCurta(dia)}</span>
                  {series[0]?.academia_nome && <span className="truncate text-[11.5px] text-texto-3">{series[0].academia_nome}</span>}
                </div>
                <ul className="flex flex-col gap-1">
                  {series.map((s, i) => (
                    <li key={`${s.numero_serie}-${i}`} className="flex items-center gap-3 text-[13.5px] tabular-nums text-texto">
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
            ))}
            {mais === "erro" && <EstadoErro texto="Não deu para ler os dias mais antigos agora." />}
            {faltam > 0 && (
              <Botao tamanho="sm" onClick={verMais} disabled={mais === "carregando"} data-ver-mais-dias>
                {mais === "carregando" ? "Carregando…" : `Ver mais dias (${faltam})`}
              </Botao>
            )}
          </>
        )}
      </div>
    </PainelDeslizante>
  );
}
