/**
 * Peças das telas do painel master (W27) no visual premium (spec 4.9, tela 6): abas com o traço de luz, filtros com número,
 * campos, a janela dos formulários e os chips de uma conta. Só o master usa (as páginas ficam em src/master/paginas).
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Chip } from "@/ui/premium/Chip";
import { LEGADA, ROTULO_MODULO, ROTULO_ORIGEM, ROTULO_SITUACAO, TOM_MODULO, TOM_SITUACAO } from "../regras";
import type { ContaLinha } from "../tipos";

export const INPUT =
  "h-10 w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 font-body text-[14px] text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-violeta/60 disabled:opacity-50";
export const SELECT = `${INPUT} [&>option]:bg-tela`;
export const TEXTAREA =
  "min-h-[76px] w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 py-2.5 font-body text-[13.5px] leading-relaxed text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-violeta/60";

export function Campo({ rotulo, dica, erro, children }: { rotulo: string; dica?: ReactNode; erro?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-texto-2">{rotulo}</span>
      {children}
      {erro ? <span role="alert" className="text-[11.5px] font-medium text-rosa-3" data-erro-campo>{erro}</span> : dica ? <span className="text-[11.5px] text-texto-3">{dica}</span> : null}
    </label>
  );
}

export function CampoBusca({ valor, aoMudar, placeholder, ...dados }: { valor: string; aoMudar: (v: string) => void; placeholder: string } & Record<`data-${string}`, unknown>) {
  return (
    <span className="relative flex min-w-[220px] flex-1 items-center sm:max-w-[340px]">
      <Search aria-hidden className="pointer-events-none absolute left-3.5 h-4 w-4 text-texto-3" />
      <input value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className={cn(INPUT, "h-[42px] rounded-[14px] pl-10")} {...dados} />
    </span>
  );
}

/** Abas de uma página (o traço violeta → verde da tela 6 na aba ativa). */
export function Abas<T extends string>({ abas, ativa, aoMudar, rotulo }: {
  abas: Array<{ id: T; rotulo: string; icone?: LucideIcon; numero?: number }>;
  ativa: T;
  aoMudar: (id: T) => void;
  rotulo: string;
}) {
  return (
    <nav aria-label={rotulo} data-abas-master className="pq-sem-barra flex gap-1 overflow-x-auto border-b border-linha">
      {abas.map((a) => {
        const sel = a.id === ativa;
        const Icone = a.icone;
        return (
          <button key={a.id} type="button" role="tab" aria-selected={sel} onClick={() => aoMudar(a.id)} data-aba-master={a.id}
            className={cn("relative flex h-[42px] flex-none items-center gap-2 px-3.5 text-[13.5px] font-semibold transition-colors", sel ? "text-texto" : "text-texto-3 hover:text-texto-2")}>
            {Icone && <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />}
            {a.rotulo}
            {typeof a.numero === "number" && (
              <span className={cn("rounded-full px-1.5 text-[11px] font-bold", sel ? "bg-violeta/25 text-violeta-3" : "bg-superficie-3 text-texto-3")}>{a.numero}</span>
            )}
            {sel && (
              <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-sm"
                style={{ background: "linear-gradient(90deg,var(--p-violeta-2),var(--p-verde-2))", boxShadow: "0 0 12px rgba(167,139,250,.9)" }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}

/** Filtros em pílulas com o número de cada um (Todas 18 · Vencidas 2 …). */
export function Filtros<T extends string>({ opcoes, valor, aoMudar, rotulo }: {
  opcoes: Array<{ valor: T; rotulo: string; numero?: number }>;
  valor: T;
  aoMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5" data-filtros-master>
      {opcoes.map((o) => {
        const sel = o.valor === valor;
        return (
          <button key={o.valor} type="button" role="radio" aria-checked={sel} onClick={() => aoMudar(o.valor)} data-filtro={o.valor}
            className={cn("flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-semibold transition-colors",
              sel ? "border-transparent text-[var(--p-botao-w-texto)]" : "border-linha bg-superficie text-texto-2 hover:text-texto")}
            style={sel ? { background: "var(--p-botao-w-fundo)" } : undefined}>
            {o.rotulo}
            {typeof o.numero === "number" && <span className={cn("tabular-nums", sel ? "opacity-70" : "text-texto-3")}>{o.numero}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ChipSituacao({ conta }: { conta: Pick<ContaLinha, "situacao_efetiva" | "cobranca_legada"> }) {
  return <Chip tom={TOM_SITUACAO[conta.situacao_efetiva] ?? "g"} data-chip-situacao={conta.situacao_efetiva}>{ROTULO_SITUACAO[conta.situacao_efetiva] ?? conta.situacao_efetiva}</Chip>;
}

export function ChipsModulos({ modulos }: { modulos: ContaLinha["modulos"] }) {
  return (
    <span className="flex flex-nowrap gap-1 whitespace-nowrap">
      {modulos.map((m) => <Chip key={m} tom={TOM_MODULO[m]}>{ROTULO_MODULO[m]}</Chip>)}
    </span>
  );
}

export function ChipOrigem({ origem }: { origem: ContaLinha["origem"] }) {
  return <Chip tom={origem === "nova" ? "c" : origem === "app" ? "t" : "g"} data-chip-origem={origem}>{ROTULO_ORIGEM[origem]}</Chip>;
}

export function ChipLegada() {
  return <Chip tom="a" data-chip-legada>{LEGADA}</Chip>;
}

/** Janela dos formulários do master (Dialog no visual premium). */
export function Janela({ aberta, aoMudar, titulo, descricao, children, rodape, largura = "sm:max-w-lg", ...dados }: {
  aberta: boolean;
  aoMudar: (a: boolean) => void;
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
} & Record<`data-${string}`, unknown>) {
  return (
    <Dialog open={aberta} onOpenChange={aoMudar}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto border-linha-2 bg-tela text-texto shadow-[0_30px_80px_-20px_rgba(0,0,0,.85)] sm:rounded-[24px]", largura)} {...dados}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{titulo}</DialogTitle>
          {descricao ? <DialogDescription className="font-body text-[13px] leading-relaxed text-texto-2">{descricao}</DialogDescription>
            : <DialogDescription className="sr-only">{titulo}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col gap-3.5">{children}</div>
        {rodape && <div className="mt-1 flex flex-wrap justify-end gap-2">{rodape}</div>}
      </DialogContent>
    </Dialog>
  );
}

/** Linha "rótulo · valor" dos detalhes (grade de 2 colunas). */
export function Info({ rotulo, children, ...dados }: { rotulo: string; children: ReactNode } & Record<`data-${string}`, unknown>) {
  return (
    <div className="min-w-0 rounded-2xl border border-linha bg-superficie-3 px-3.5 py-2.5" {...dados}>
      <div className="text-[11.5px] font-medium text-texto-3">{rotulo}</div>
      <div className="mt-0.5 truncate text-[13.5px] font-semibold text-texto">{children}</div>
    </div>
  );
}
