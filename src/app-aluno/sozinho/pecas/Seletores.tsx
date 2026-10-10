import { Check, Dumbbell, Flame, HeartPulse, Salad } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Esqueleto } from "@/ui/premium/Estados";
import { OBJETIVOS, precoMensal, type Objetivo, type PlanoApp } from "../regras";

const ICONE_OBJETIVO: Record<Objetivo, LucideIcon> = { emagrecer: Flame, manter: HeartPulse, ganhar_massa: Dumbbell };

/** Objetivo do aluno sem profissional (as listas de treinos e pratos prontos vêm dele) — as 3 opções da W7b. */
export function SeletorObjetivo({ valor, aoMudar, rotulo = "Seu objetivo" }: { valor: Objetivo | null; aoMudar: (o: Objetivo) => void; rotulo?: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[12.5px] font-semibold text-texto-2">{rotulo}</legend>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={rotulo}>
        {OBJETIVOS.map((o) => {
          const Icone = ICONE_OBJETIVO[o.id];
          const ativo = valor === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={ativo} onClick={() => aoMudar(o.id)} data-objetivo={o.id}
              className={cn(
                "flex min-h-[54px] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                ativo ? "border-violeta/60 bg-superficie-2" : "border-linha bg-superficie hover:border-linha-2",
              )}>
              <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-superficie-2", ativo ? "text-violeta-3" : "text-texto-3")}>
                <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-texto">{o.rotulo}</span>
                <span className="block text-[12px] text-texto-3">{o.dica}</span>
              </span>
              {ativo && <Check aria-hidden className="h-4 w-4 flex-none text-violeta-3" />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Planos do app (Treino · Treino + Alimentação) com o preço da tabela do banco. */
export function SeletorPlano({
  planos,
  valor,
  aoMudar,
  carregando,
  rotulo = "Seu plano",
}: {
  planos: PlanoApp[];
  valor: string | null;
  aoMudar: (codigo: string) => void;
  carregando?: boolean;
  rotulo?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[12.5px] font-semibold text-texto-2">{rotulo}</legend>
      {carregando && !planos.length ? (
        <div className="grid grid-cols-1 gap-2">
          <Esqueleto className="h-[76px] w-full rounded-2xl" />
          <Esqueleto className="h-[76px] w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label={rotulo}>
          {planos.map((p) => {
            const ativo = valor === p.codigo;
            const comAlimentacao = p.modulos.includes("nutricao");
            return (
              <button key={p.codigo} type="button" role="radio" aria-checked={ativo} onClick={() => aoMudar(p.codigo)} data-plano-app={p.codigo}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                  ativo ? "border-violeta/60 bg-superficie-2" : "border-linha bg-superficie hover:border-linha-2",
                )}>
                <span className={cn("mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-superficie-2", ativo ? "text-violeta-3" : "text-texto-3")}>
                  {comAlimentacao ? <Salad aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Dumbbell aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-[14px] font-semibold text-texto">{p.nome}</span>
                    <b className="whitespace-nowrap text-[14px] font-bold tabular-nums text-texto" data-preco-plano>{precoMensal(p.valor)}</b>
                  </span>
                  {p.descricao && <span className="mt-0.5 block text-[12px] leading-relaxed text-texto-3">{p.descricao}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
