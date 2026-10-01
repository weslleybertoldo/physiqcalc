// Physiq W20 — escolher 1 slot (o aluno só marca 1 — pedido dele): os dias com horário livre e, no dia escolhido, os horários. Os
// horários vêm do banco (aluno_agenda_horarios: dentro do atendimento, sem travas, bloqueios nem consultas, e na janela das regras).
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DIAS_CURTOS, MESES_CURTOS, diaSP } from "@/agenda/regras";
import { Esqueleto } from "@/ui/premium/Estados";
import type { HorarioLivre } from "./api";

const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const horaSP = (iso: string): string => FMT_HORA.format(new Date(iso));

function rotuloDia(dia: string): { semana: string; numero: string; mes: string } {
  const d = new Date(`${dia}T12:00:00-03:00`);
  return { semana: DIAS_CURTOS[d.getUTCDay()], numero: dia.slice(8, 10), mes: MESES_CURTOS[Number(dia.slice(5, 7)) - 1] };
}

export function EscolherHorario({ horarios, carregando, erro, valor, aoEscolher }: {
  horarios: HorarioLivre[];
  carregando: boolean;
  erro: string | null;
  valor: string | null;
  aoEscolher: (inicio: string | null) => void;
}) {
  const porDia = useMemo(() => {
    const m = new Map<string, HorarioLivre[]>();
    for (const h of horarios) {
      const d = diaSP(h.inicio);
      m.set(d, [...(m.get(d) ?? []), h]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [horarios]);
  const [dia, setDia] = useState<string | null>(null);
  useEffect(() => {
    if (!porDia.length) setDia(null);
    else if (!dia || !porDia.some(([d]) => d === dia)) setDia(porDia[0][0]);
  }, [porDia]); // eslint-disable-line react-hooks/exhaustive-deps -- o 1º dia livre quando a lista chega

  if (carregando) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label="Carregando os horários">
        <Esqueleto className="h-[64px] w-full" />
        <Esqueleto className="h-[84px] w-full" />
      </div>
    );
  }
  if (erro) return <p className="text-[12.5px] text-rosa-3" data-horarios-erro>{erro}</p>;
  if (!porDia.length) {
    return <p className="rounded-2xl border border-dashed border-linha-2 p-4 text-center text-[12.5px] text-texto-3" data-sem-horarios>Nenhum horário livre no prazo. Fale com o seu profissional.</p>;
  }
  const doDia = porDia.find(([d]) => d === dia)?.[1] ?? [];
  return (
    <div className="flex flex-col gap-3" data-escolher-horario data-dias-livres={porDia.length}>
      <div>
        <span className="pq-eyebrow">Dia</span>
        <div className="pq-sem-barra -mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1" data-dias>
          {porDia.map(([d, hs]) => {
            const r = rotuloDia(d);
            const ativo = d === dia;
            return (
              <button key={d} type="button" onClick={() => { setDia(d); aoEscolher(null); }}
                className={cn("flex w-[58px] flex-none flex-col items-center rounded-2xl border py-2 transition-colors",
                  ativo ? "border-transparent text-[var(--p-botao-w-texto)]" : "border-linha bg-superficie text-texto")}
                style={ativo ? { background: "var(--p-botao-w-fundo)" } : undefined} data-dia-livre={d} data-horarios-no-dia={hs.length}>
                <span className={cn("text-[10.5px] font-semibold uppercase", ativo ? "" : "text-texto-3")}>{r.semana}</span>
                <b className="text-[18px] font-bold tabular-nums leading-tight">{r.numero}</b>
                <span className={cn("text-[10.5px]", ativo ? "" : "text-texto-3")}>{r.mes}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <span className="pq-eyebrow">Horários livres</span>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5" data-horarios>
          {doDia.map((h) => {
            const ativo = valor === h.inicio;
            return (
              <button key={h.inicio} type="button" onClick={() => aoEscolher(h.inicio)}
                className={cn("h-10 rounded-xl border text-[13.5px] font-semibold tabular-nums transition-colors",
                  ativo ? "border-violeta-2 bg-[rgba(139,92,246,.22)] text-texto" : "border-linha-2 bg-[rgba(255,255,255,.04)] text-texto")}
                data-horario-livre={horaSP(h.inicio)}>
                {horaSP(h.inicio)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
