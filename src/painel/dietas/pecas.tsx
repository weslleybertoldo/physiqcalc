import type { ReactNode, SelectHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// Physiq W24 — peças das 3 abas do Painel › Dietas no visual premium (spec 4.9): busca, seletor com rótulo e a confirmação de
// excluir. hml-14b: o "Ver mais" (20 por vez) saiu — as listas são páginas do banco (Paginacao).

export const CLASSE_BUSCA =
  "h-11 w-full rounded-[14px] border border-linha-2 bg-superficie pl-10 pr-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-verde/60";

export function CampoBusca({ valor, aoMudar, placeholder, className, ...dados }: { valor: string; aoMudar: (v: string) => void; placeholder: string; className?: string } & Record<`data-${string}`, unknown>) {
  return (
    <label className={cn("relative flex min-w-[220px] flex-1 items-center", className)}>
      <Search aria-hidden className="pointer-events-none absolute left-3.5 h-4 w-4 text-texto-3" />
      <input type="search" value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder} className={CLASSE_BUSCA} {...dados} />
    </label>
  );
}

export function Filtro({ rotulo, largo, children, className, ...props }: { rotulo: string; largo?: boolean; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">{rotulo}</span>
      <select
        {...props}
        className={cn(
          "h-9 rounded-xl border border-linha-2 bg-superficie px-3 text-[13px] text-texto outline-none [color-scheme:dark] focus:border-verde/60 [&>option]:bg-tela",
          largo ? "min-w-[220px]" : "min-w-[150px]",
        )}
      >
        {children}
      </select>
    </label>
  );
}

/** Confirmação de excluir (AlertDialog no visual premium). */
export function ConfirmarExclusao({
  aberto,
  aoMudar,
  titulo,
  texto,
  rotulo = "Excluir",
  ocupado,
  aoConfirmar,
  ...dados
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  titulo: string;
  texto: ReactNode;
  rotulo?: string;
  ocupado?: boolean;
  aoConfirmar: () => void;
} & Record<`data-${string}`, unknown>) {
  return (
    <AlertDialog open={aberto} onOpenChange={aoMudar}>
      <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]" {...dados}>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{titulo}</AlertDialogTitle>
          <AlertDialogDescription className="font-body text-[13px] leading-relaxed text-texto-2">{texto}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          {/* W27 (herdado da W26): os botões do premium direto nos primitivos do Radix — o AlertDialogAction/Cancel do shadcn põe o
              violeta do botão padrão por cima (o mesmo conserto da Lixeira, src/ferramentas/Confirmar.tsx) */}
          <AlertDialogPrimitive.Cancel className="pq-botao pq-botao-g pq-botao-sm" data-confirmar-cancelar>Cancelar</AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action
            className="pq-botao pq-botao-g pq-botao-sm !border-[rgba(244,63,94,.35)] !text-rosa-3 hover:!bg-[rgba(244,63,94,.08)]"
            onClick={(e) => {
              e.preventDefault();
              aoConfirmar();
            }}
            disabled={ocupado}
            data-confirmar-excluir
          >
            {ocupado ? "Excluindo…" : rotulo}
          </AlertDialogPrimitive.Action>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Botão pequeno de ação na linha (Ver, Editar, PDF…). */
export function AcaoLinha({ icone: Icone, children, perigo, className, ...props }: { icone: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; children: ReactNode; perigo?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-40",
        perigo ? "border-[rgba(244,63,94,.3)] text-rosa-3 hover:bg-[rgba(244,63,94,.08)]" : "border-linha-2 text-texto-2 hover:border-linha hover:text-texto",
        className,
      )}
    >
      <Icone aria-hidden className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
