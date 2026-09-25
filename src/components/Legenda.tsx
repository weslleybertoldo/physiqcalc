import { useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Ícone ⓘ com pra que serve um campo (mesmo comportamento da Legenda do Nativo OS): abre ao passar o mouse E ao
 * tocar — celular não tem mouse. Aberto pelo mouse, o clique em cima confirma a leitura em vez de fechar; toque
 * fora ou Esc fecha. Fica FORA do <label>, senão o toque também focaria o campo.
 */
export default function Legenda({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  const [aberto, setAberto] = useState(false);
  const porMouse = useRef(false);

  return (
    <Popover
      open={aberto}
      onOpenChange={(proximo) => {
        if (proximo) return; // abrir é com o nosso clique/hover; o Radix só avisa aqui o toque fora e o Esc
        porMouse.current = false;
        setAberto(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Pra que serve: ${rotulo}`}
          data-legenda
          onPointerEnter={(e) => {
            if (e.pointerType !== "mouse" || aberto) return;
            porMouse.current = true;
            setAberto(true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== "mouse" || !porMouse.current) return;
            porMouse.current = false;
            setAberto(false);
          }}
          onClick={(e) => {
            e.preventDefault(); // o toggle é nosso (o do Radix fecharia o que o mouse acabou de abrir)
            if (porMouse.current) {
              porMouse.current = false;
              return;
            }
            setAberto((v) => !v);
          }}
          className={cn(
            "inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50",
            className,
          )}
        >
          <Info size={14} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        data-legenda-texto
        className="w-auto max-w-72 border-0 bg-foreground px-3 py-2 text-xs leading-snug text-background font-body"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
