import { useMemo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { blocoDoGrupoMuscular, getBloco } from "@/lib/gruposMusculares";
import { cn } from "@/lib/utils";
import { EQUIPAMENTOS, PADROES, type CamposEquivalencia } from "../equivalencia";

const CAMPO = "h-10 w-full rounded-xl border border-linha-2 bg-tela px-3 text-[13.5px] text-texto outline-none focus:border-violeta/60 disabled:opacity-60";

/**
 * Movimento, equipamento e variação do exercício (W9 — R9, C43, C61): um componente só para a biblioteca global (master), a do
 * profissional e a W23. É o que faz a troca por equivalente no app do aluno (mesmo movimento e músculo, outro equipamento).
 * Os 3 são opcionais; o movimento é da lista fixa (agrupada por grupo muscular, o do exercício primeiro).
 */
export function FormExercicioBiblioteca({
  valor,
  aoMudar,
  grupoMuscular,
  somenteLeitura,
  className,
}: {
  valor: CamposEquivalencia;
  aoMudar: (v: CamposEquivalencia) => void;
  /** grupo muscular do exercício: os movimentos desse grupo aparecem primeiro */
  grupoMuscular?: string | null;
  somenteLeitura?: boolean;
  className?: string;
}) {
  const grupos = useMemo(() => {
    const doExercicio = grupoMuscular ? blocoDoGrupoMuscular(grupoMuscular) : null;
    const porBloco = new Map<string, { chave: string; rotulo: string }[]>();
    for (const p of PADROES) {
      const lista = porBloco.get(p.bloco) ?? [];
      lista.push({ chave: p.chave, rotulo: p.rotulo });
      porBloco.set(p.bloco, lista);
    }
    const blocos = [...porBloco.keys()];
    if (doExercicio && porBloco.has(doExercicio)) blocos.sort((a, b) => Number(b === doExercicio) - Number(a === doExercicio));
    return blocos.map((b) => ({ bloco: b, nome: getBloco(b).nome, padroes: porBloco.get(b)! }));
  }, [grupoMuscular]);

  const mudar = (parcial: Partial<CamposEquivalencia>) => aoMudar({ ...valor, ...parcial });

  return (
    <fieldset className={cn("flex flex-col gap-2.5 rounded-2xl border border-linha bg-superficie-3 p-3.5", className)} data-form-equivalencia disabled={somenteLeitura}>
      <legend className="sr-only">Equivalência do exercício</legend>
      <div className="flex items-center gap-2">
        <ArrowLeftRight aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
        <span className="text-[13px] font-semibold text-texto">Troca por equivalente</span>
      </div>
      <p className="text-[12px] leading-snug text-texto-3">
        No app do aluno, o "Trocar" sugere primeiro os exercícios com o mesmo movimento e músculo, em outro equipamento.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="pq-eyebrow">Movimento</span>
          <select value={valor.padrao_movimento ?? ""} onChange={(e) => mudar({ padrao_movimento: e.target.value || null })} className={CAMPO} data-campo-movimento>
            <option value="" className="bg-tela text-texto">Sem movimento</option>
            {grupos.map((g) => (
              <optgroup key={g.bloco} label={g.nome} className="bg-tela text-texto">
                {g.padroes.map((p) => (
                  <option key={p.chave} value={p.chave} className="bg-tela text-texto">{p.rotulo}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="pq-eyebrow">Equipamento</span>
          <select value={valor.equipamento ?? ""} onChange={(e) => mudar({ equipamento: e.target.value || null })} className={CAMPO} data-campo-equipamento>
            <option value="" className="bg-tela text-texto">Sem equipamento</option>
            {EQUIPAMENTOS.map((e) => (
              <option key={e.chave} value={e.chave} className="bg-tela text-texto">{e.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="pq-eyebrow">Variação</span>
          <input
            value={valor.variacao ?? ""}
            onChange={(e) => mudar({ variacao: e.target.value || null })}
            placeholder="Ex.: pegada aberta"
            maxLength={80}
            className={cn(CAMPO, "placeholder:text-texto-4")}
            data-campo-variacao
          />
        </label>
      </div>
    </fieldset>
  );
}
