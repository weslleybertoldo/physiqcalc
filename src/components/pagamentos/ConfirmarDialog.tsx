import type { ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  titulo: ReactNode;
  descricao: ReactNode;
  confirmar: string;
  busy?: boolean;
  perigo?: boolean;
  onConfirmar: () => void | Promise<void>;
  onCancelar: () => void;
  testid?: string;
}

// Confirmação (mudar de plano, cancelar assinatura). O clique em confirmar NÃO fecha sozinho:
// quem chama fecha quando a ação terminar (assim dá pra mostrar "Aguarde...").
export function ConfirmarDialog({ open, titulo, descricao, confirmar, busy, perigo, onConfirmar, onCancelar, testid = "confirmar" }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancelar(); }}>
      <AlertDialogContent className="bg-card border-muted-foreground/30 rounded-xl max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-base text-foreground uppercase tracking-wider">{titulo}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm font-body text-muted-foreground">{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="font-heading text-xs uppercase tracking-wider">Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void onConfirmar(); }}
            disabled={busy}
            className={`font-heading text-xs uppercase tracking-widest ${perigo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
            data-plano-confirmar={testid}
          >
            {busy ? "Aguarde..." : confirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
