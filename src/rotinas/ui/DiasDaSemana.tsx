// Physiq W-A P3 — os dias da rotina: Seg…Dom (liga/desliga) e os atalhos das metas "Todos os dias · Seg a Sex · Fim de semana" (spec §4.3).
import { cn } from "@/lib/utils";
import { ATALHOS_DIAS, DIAS_SEMANA, normalizarDias, textoDias } from "@/nutricao/app/metasUtil";
import { alternarDia, atalhoDosDias } from "../regras";

export function DiasDaSemana({ dias, aoMudar, erro }: { dias: readonly number[]; aoMudar: (dias: number[]) => void; erro?: string }) {
  const d = normalizarDias(dias);
  const atalho = atalhoDosDias(d);
  return (
    <div className="flex flex-col gap-2" data-rotina-dias={d.join(",")}>
      <span className="text-[12.5px] font-semibold text-texto-2">Dias</span>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Dias da semana">
        {DIAS_SEMANA.map((x) => {
          const ligado = d.includes(x.n);
          return (
            <button key={x.n} type="button" aria-pressed={ligado} title={x.nome} onClick={() => aoMudar(alternarDia(d, x.n))} data-rotina-dia={x.n}
              className={cn("h-9 min-w-0 rounded-[10px] border text-[12px] font-semibold transition-colors",
                ligado ? "border-violeta/60 bg-violeta text-white" : "border-linha-2 bg-superficie text-texto-2 hover:text-texto")}>
              {x.curto}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {ATALHOS_DIAS.map((a) => (
          <button key={a.atalho} type="button" aria-pressed={atalho === a.atalho} onClick={() => aoMudar([...a.dias])} data-rotina-atalho={a.atalho}
            className={cn("inline-flex h-7 items-center rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
              atalho === a.atalho ? "border-verde bg-[rgba(16,185,129,.1)] text-verde-3" : "border-linha-2 text-texto-2 hover:text-texto")}>
            {a.rotulo}
          </button>
        ))}
        <span className="ml-auto text-[11.5px] text-texto-3" data-rotina-dias-texto>{textoDias(d)}</span>
      </div>
      {erro && <span role="alert" className="text-[12.5px] font-medium text-rosa-3" data-erro-campo>{erro}</span>}
    </div>
  );
}
