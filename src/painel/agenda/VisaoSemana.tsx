// Physiq W20 — visão SEMANA (porta da VisaoSemana do PhysiqNutri): colunas dom–sáb, linha "dia inteiro" e as linhas de hora.
// Novo: a grade em SLOTS (a duração do seu calendário padrão; clicar num slot = novo agendamento ali), o que fica fora do horário
// ou do dia de atendimento apagado, as travas recorrentes e os bloqueios hachurados, e a linha do "agora".
import { differenceInMinutes, isSameDay, startOfDay } from "date-fns";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { minutosDe, travasDoDia, type RegrasAgenda, type TravaRecorrente } from "@/agenda/regras";
import ChipEvento from "./ChipEvento";
import {
  bloqueiosDoDia, chaveDia, combinarDataHora, diasDaSemana, distribuirColunas, eventosDoDia, horasDaFaixa, minutosDoDia, minutosParaHora,
  nomeDoDiaCurto, posicaoNoDia, type BloqueioPainel, type EventoPainel,
} from "./visao";

interface Props {
  ancora: Date;
  eventos: EventoPainel[];
  bloqueios: BloqueioPainel[];
  travas: TravaRecorrente[];
  regras: RegrasAgenda;
  slot: number;
  faixa: { inicio: string; fim: string };
  hoje?: Date;
  onNovo: (inicio: Date) => void;
  onAbrir: (ev: EventoPainel) => void;
}

const ALTURA_HORA = 60; // px por hora
const HACHURA = "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(255,255,255,.07)_6px,rgba(255,255,255,.07)_7px)]";
const GRID = "grid grid-cols-[52px_repeat(7,minmax(0,1fr))]";

export default function VisaoSemana({ ancora, eventos, bloqueios, travas, regras, slot, faixa, hoje = new Date(), onNovo, onAbrir }: Props) {
  const dias = diasDaSemana(ancora);
  const horas = horasDaFaixa(faixa.inicio, faixa.fim);
  const inicioFaixaMin = Math.floor(minutosDoDia(faixa.inicio) / 60) * 60;
  const totalMin = horas.length * 60;
  const alturaTotal = horas.length * ALTURA_HORA;
  const pxMin = ALTURA_HORA / 60;
  const agoraMin = differenceInMinutes(hoje, startOfDay(hoje));
  const agoraTopo = agoraMin >= inicioFaixaMin && agoraMin < inicioFaixaMin + totalMin ? (agoraMin - inicioFaixaMin) * pxMin : null;
  const atIni = minutosDe(regras.atende_inicio);
  const atFim = minutosDe(regras.atende_fim);
  const passo = Math.max(slot, 5);
  // os slots da faixa visível (a grade clicável); fora do atendimento ficam apagados
  const slots: number[] = [];
  for (let m = inicioFaixaMin; m < inicioFaixaMin + totalMin; m += passo) slots.push(m);

  return (
    <div className="pq-cartao overflow-x-auto p-0" data-visao="semana" data-slot={passo}>
      <div className="min-w-[660px]">
        <div className={cn(GRID, "border-b border-linha")}>
          <div />
          {dias.map((dia) => {
            const ehHoje = isSameDay(dia, hoje);
            const atende = regras.dias.includes(dia.getDay());
            return (
              <div key={chaveDia(dia)} className={cn("px-2 py-2.5 text-center text-[12px] font-semibold", ehHoje ? "text-violeta-3" : atende ? "text-texto-2" : "text-texto-4")}
                data-coluna-dia={chaveDia(dia)} data-hoje={ehHoje ? "1" : undefined} data-atende={atende ? "1" : "0"}>
                {nomeDoDiaCurto(dia)}
              </div>
            );
          })}
        </div>

        <div className={cn(GRID, "min-h-[34px] border-b border-linha")} data-dia-inteiro>
          <div className="px-1 py-1 text-[10px] leading-tight text-texto-4">dia inteiro</div>
          {dias.map((dia) => (
            <div key={chaveDia(dia)} className="space-y-0.5 border-l border-linha-3 p-0.5" data-dia={chaveDia(dia)}>
              {eventosDoDia(eventos, dia).filter((e) => e.diaInteiro).map((ev) => <ChipEvento key={ev.id} ev={ev} onAbrir={onAbrir} compacto />)}
            </div>
          ))}
        </div>

        <div className={GRID} style={{ height: alturaTotal }}>
          <div className="relative">
            {horas.map((h, i) => (
              <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10.5px] tabular-nums text-texto-4" style={{ top: i * ALTURA_HORA }} data-hora-linha={h}>
                {i === 0 ? "" : h}
              </div>
            ))}
            <div className="absolute right-1.5 top-0.5 text-[10.5px] tabular-nums text-texto-4">{horas[0]}</div>
          </div>
          {dias.map((dia) => {
            const chave = chaveDia(dia);
            const dow = dia.getDay();
            const atende = regras.dias.includes(dow);
            const evsHora = eventosDoDia(eventos, dia).filter((e) => !e.diaInteiro);
            const colunas = distribuirColunas(evsHora);
            const bls = bloqueiosDoDia(bloqueios, dia);
            const trs = travasDoDia(travas, dow);
            return (
              <div key={chave} className="relative border-l border-linha-3" data-coluna={chave}>
                {slots.map((m) => {
                  const fora = !atende || m < atIni || m + passo > atFim;
                  const h = minutosParaHora(m);
                  return (
                    <div
                      key={m}
                      role="button"
                      tabIndex={-1}
                      onClick={() => onNovo(combinarDataHora(chave, h))}
                      className={cn("absolute inset-x-0 cursor-pointer border-t transition-colors hover:bg-[rgba(167,139,250,.08)]",
                        m % 60 === 0 ? "border-linha-3" : "border-[rgba(255,255,255,.03)]", fora && "bg-[rgba(0,0,0,.28)]")}
                      style={{ top: (m - inicioFaixaMin) * pxMin, height: passo * pxMin }}
                      data-slot={`${chave}T${h}`}
                      data-fora={fora ? "1" : undefined}
                      aria-label={`Novo agendamento ${chave} ${h}`}
                    />
                  );
                })}
                {trs.map((t) => {
                  const a = Math.max(minutosDe(t.hora_inicio), inicioFaixaMin);
                  const b = Math.min(minutosDe(t.hora_fim), inicioFaixaMin + totalMin);
                  if (b <= a) return null;
                  return (
                    <div key={`${t.id}-${chave}`} className={cn("pointer-events-none absolute inset-x-0 z-[1] flex items-start gap-1 border-y border-linha-2 px-1 pt-0.5", HACHURA)}
                      style={{ top: (a - inicioFaixaMin) * pxMin, height: (b - a) * pxMin }} title={t.motivo ?? "Travado"} data-trava={t.id}>
                      <Lock aria-hidden className="mt-px h-2.5 w-2.5 flex-none text-texto-4" />
                      <span className="truncate text-[9.5px] font-semibold uppercase tracking-wide text-texto-4">{t.motivo ?? "travado"}</span>
                    </div>
                  );
                })}
                {bls.map((b) => {
                  const pos = posicaoNoDia(b, dia, faixa.inicio, faixa.fim);
                  if (!pos) return null;
                  return (
                    <div key={b.id} className={cn("pointer-events-none absolute inset-x-0 z-[1] border-y border-linha-2", HACHURA)}
                      style={{ top: `${pos.topo}%`, height: `${pos.altura}%` }} title={b.motivo ?? "Bloqueado"} data-bloqueio={b.id}>
                      <span className="px-1 text-[9.5px] font-semibold uppercase tracking-wide text-texto-4">{b.motivo ?? "bloqueado"}</span>
                    </div>
                  );
                })}
                {colunas.map(({ evento, coluna, total }) => {
                  const pos = posicaoNoDia(evento, dia, faixa.inicio, faixa.fim);
                  if (!pos) return null;
                  return (
                    <ChipEvento key={evento.id} ev={evento} onAbrir={onAbrir} className="absolute z-10 h-auto"
                      estilo={{ top: `${pos.topo}%`, height: `${pos.altura}%`, left: `calc(${(coluna / total) * 100}% + 2px)`, width: `calc(${100 / total}% - 4px)` }} />
                  );
                })}
                {isSameDay(dia, hoje) && agoraTopo !== null && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rosa" style={{ top: agoraTopo }} data-agora aria-hidden="true">
                    <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-rosa" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
