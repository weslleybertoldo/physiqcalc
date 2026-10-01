// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/manipulados/AtivosEditor.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { Plus, Trash2 } from "lucide-react";
import { INPUT, SELECT } from "@/nutricao/editor/ui/estilos";
import { ATIVOS_MAX, ATIVO_NOME_MAX, DOSE_MAX, UNIDADES, adicionarAtivo, ativoVazio, atualizarAtivo, removerAtivo, type Ativo } from "@/nutricao/editor/lib/manipuladosUtil";

// Editor dos ativos da fórmula: linhas dinâmicas "ativo · dose · unidade · remover" + "Adicionar ativo" (até 30). Nunca fica
// sem linha (remover a última deixa 1 vazia). Usado no modal da fórmula e no de modelos — cada um passa o nome dos `data-*`
// pro E2E (mesmo desenho do DiasSemanaToggle da W16; o índice da linha vai no valor do atributo).
const BTN_ICONE = "inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-30";
const BTN_ADD = "inline-flex items-center gap-1 border border-verde/40 text-verde-3 font-semibold text-[10px] uppercase tracking-wider px-3 py-1.5 hover:bg-[rgba(16,185,129,.08)] transition-colors disabled:opacity-50";
const GRADE = "grid grid-cols-[1fr_4.5rem_4.5rem_2.25rem] sm:grid-cols-[1fr_5.5rem_5rem_2.25rem] gap-2 items-end";

interface Props {
  ativos: Ativo[];
  onChange: (ativos: Ativo[]) => void;
  /** nome do atributo `data-*` de cada linha (valor = índice) — ex.: "data-linha-ativo" */
  attrLinha: string;
  /** nome do `data-*` do input do nome (valor = índice) */
  attrNome: string;
  /** nome do `data-*` do input da dose (valor = índice) */
  attrDose: string;
  /** nome do `data-*` do select da unidade (valor = índice) */
  attrUnidade: string;
  /** nome do `data-*` do botão remover (valor = índice) */
  attrRemover: string;
  /** nome do `data-*` do botão "Adicionar ativo" */
  attrAdicionar: string;
}

export default function AtivosEditor({ ativos, onChange, attrLinha, attrNome, attrDose, attrUnidade, attrRemover, attrAdicionar }: Props) {
  const lista = ativos.length ? ativos : [ativoVazio()];
  return (
    <div className="space-y-2" data-ativos-editor data-ativos-total={lista.length}>
      <div className={`${GRADE} text-[10px] uppercase tracking-wider text-texto-2 font-body`}>
        <span>Ativo</span>
        <span>Dose</span>
        <span>Unidade</span>
        <span />
      </div>
      {lista.map((a, i) => (
        <div key={i} className={GRADE} {...{ [attrLinha]: i }}>
          <input
            className={INPUT}
            maxLength={ATIVO_NOME_MAX}
            placeholder="ex.: Magnésio dimalato"
            value={a.ativo}
            onChange={(e) => onChange(atualizarAtivo(lista, i, { ativo: e.target.value }))}
            aria-label={`Ativo ${i + 1}`}
            {...{ [attrNome]: i }}
          />
          <input
            className={INPUT}
            maxLength={DOSE_MAX}
            placeholder="300"
            inputMode="decimal"
            value={a.dose}
            onChange={(e) => onChange(atualizarAtivo(lista, i, { dose: e.target.value }))}
            aria-label={`Dose do ativo ${i + 1}`}
            {...{ [attrDose]: i }}
          />
          <select className={SELECT} value={a.unidade} onChange={(e) => onChange(atualizarAtivo(lista, i, { unidade: e.target.value }))} aria-label={`Unidade do ativo ${i + 1}`} {...{ [attrUnidade]: i }}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <button type="button" className={BTN_ICONE} onClick={() => onChange(removerAtivo(lista, i))} title="Remover ativo" aria-label={`Remover ativo ${i + 1}`} {...{ [attrRemover]: i }}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={BTN_ADD} onClick={() => onChange(adicionarAtivo(lista))} disabled={lista.length >= ATIVOS_MAX} {...{ [attrAdicionar]: "" }}>
          <Plus size={12} aria-hidden="true" /> Adicionar ativo
        </button>
        <span className="text-[11px] text-texto-2 font-body">{lista.length}/{ATIVOS_MAX}</span>
      </div>
    </div>
  );
}
