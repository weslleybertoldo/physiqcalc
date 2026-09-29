import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Painel deslizante (Sheet) do visual premium: de baixo no celular (com a alça) ou da direita no
 * computador. Fundo da tela, linha clara, raio grande e o X no canto — mesmo padrão dos cartões.
 */
export function PainelDeslizante({
  aberto,
  aoMudar,
  titulo,
  descricao,
  lado = "baixo",
  children,
  className,
  rodape,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  lado?: "baixo" | "direita" | "esquerda";
  children: ReactNode;
  className?: string;
  rodape?: ReactNode;
}) {
  return (
    <Dialog.Root open={aberto} onOpenChange={aoMudar}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-painel-fundo
          className="fixed inset-0 z-50 bg-black/55 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <Dialog.Content
          data-painel={lado}
          className={cn(
            "fixed z-50 flex flex-col border border-linha-2 bg-tela text-texto shadow-[0_-20px_60px_-20px_rgba(0,0,0,.8)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
            lado === "baixo" &&
              "inset-x-0 bottom-0 max-h-[88vh] rounded-t-[28px] pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            lado === "direita" &&
              "inset-y-0 right-0 w-[min(420px,92vw)] rounded-l-[28px] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            lado === "esquerda" &&
              "inset-y-0 left-0 w-[min(320px,88vw)] rounded-r-[28px] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
            className,
          )}
        >
          {lado === "baixo" && <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 flex-none rounded-full bg-linha-2" />}
          <div className="flex flex-none items-center gap-3 px-5 pb-2 pt-4">
            <Dialog.Title className="min-w-0 flex-1 truncate font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{titulo}</Dialog.Title>
            <Dialog.Close className="pq-ibtn" style={{ width: 36, height: 36, borderRadius: 12 }} aria-label="Fechar">
              <X aria-hidden />
            </Dialog.Close>
          </div>
          {descricao ? (
            <Dialog.Description className="px-5 pb-2 text-[13px] text-texto-2">{descricao}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{typeof titulo === "string" ? titulo : "Painel"}</Dialog.Description>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {rodape && <div className="flex-none border-t border-linha px-5 py-3">{rodape}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
