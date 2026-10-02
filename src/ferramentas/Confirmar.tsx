import type { ReactNode } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Physiq W26 — a confirmação das Ferramentas ("Apagar de vez", "Limpar tudo") no visual premium (spec 4.9): os botões são os do
 * premium (vidro e o de perigo em rosa), direto nos primitivos do Radix — o AlertDialogAction do shadcn põe o fundo violeta do botão
 * padrão por cima das classes do premium.
 */
export function ConfirmarPerigo({
  aberto,
  aoMudar,
  titulo,
  texto,
  rotulo,
  ocupado,
  aoConfirmar,
  ...dados
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  titulo: string;
  texto: ReactNode;
  rotulo: string;
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
          <AlertDialogPrimitive.Cancel className="pq-botao pq-botao-g pq-botao-sm" data-confirmar-cancelar>Cancelar</AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action
            className="pq-botao pq-botao-g pq-botao-sm !border-[rgba(244,63,94,.4)] !text-rosa-3 hover:!bg-[rgba(244,63,94,.08)]"
            onClick={(e) => {
              e.preventDefault();
              aoConfirmar();
            }}
            disabled={ocupado}
            data-confirmar-ok
          >
            {ocupado ? "Um instante…" : rotulo}
          </AlertDialogPrimitive.Action>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
