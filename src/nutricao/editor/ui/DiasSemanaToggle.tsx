// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/metas/DiasSemanaToggle.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { ATALHOS_DIAS, DIAS_SEMANA, alternarDia, atalhoDosDias, normalizarDias, textoDias } from "@/nutricao/editor/lib/metasUtil";

// Seletor dos dias da semana (Seg…Dom como botões de ligar/desligar) + atalhos "Todos os dias" / "Seg a Sex" / "Fim de
// semana" + texto do que ficou marcado. Usado no modal da meta e no de modelos — cada um passa o nome dos `data-*` pro E2E.
const DIA = "h-[30px] min-w-[44px] rounded-[9px] border px-2 text-[12px] font-semibold transition-colors";
const DIA_ON = `${DIA} border-[#FAFAFA] bg-[#FAFAFA] text-[#09090B]`;
const DIA_OFF = `${DIA} border-linha bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto`;
const ATALHO = "inline-flex h-7 items-center rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors";
const ATALHO_ON = `${ATALHO} border-verde text-verde-3 bg-[rgba(16,185,129,.1)]`;
const ATALHO_OFF = `${ATALHO} border-linha-2 text-texto-2 hover:text-texto hover:border-verde/50`;

interface Props {
  dias: number[];
  onChange: (dias: number[]) => void;
  /** nome do atributo `data-*` dos 7 botões (ex.: "data-dia-toggle") */
  attrDia: string;
  /** nome do atributo `data-*` dos atalhos (ex.: "data-atalho-dias") */
  attrAtalho: string;
  /** nome do atributo `data-*` do texto-resumo (ex.: "data-texto-dias") */
  attrTexto: string;
}

export default function DiasSemanaToggle({ dias, onChange, attrDia, attrAtalho, attrTexto }: Props) {
  const d = normalizarDias(dias);
  const atalho = atalhoDosDias(d);
  return (
    <div className="space-y-2" data-dias-toggle>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
        {DIAS_SEMANA.map((x) => {
          const on = d.includes(x.n);
          return (
            <button key={x.n} type="button" onClick={() => onChange(alternarDia(d, x.n))} aria-pressed={on} title={x.nome} className={on ? DIA_ON : DIA_OFF} {...{ [attrDia]: x.n }}>
              {x.curto}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {ATALHOS_DIAS.map((a) => (
          <button key={a.atalho} type="button" onClick={() => onChange([...a.dias])} aria-pressed={atalho === a.atalho} className={atalho === a.atalho ? ATALHO_ON : ATALHO_OFF} {...{ [attrAtalho]: a.atalho }}>
            {a.rotulo}
          </button>
        ))}
        <span className="text-[11px] text-texto-2 font-body sm:ml-auto" {...{ [attrTexto]: d.join(",") }}>
          {textoDias(d)}
        </span>
      </div>
    </div>
  );
}
