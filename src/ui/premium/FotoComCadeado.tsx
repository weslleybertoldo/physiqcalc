import { useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Foto de progresso protegida (`.ft` da tela 4): desfocada e escurecida, com cadeado e o nome
 * (Frente, Lado, Costas), até a pessoa tocar. Tocar de novo esconde.
 */
export function FotoComCadeado({ src, rotulo, alt, altura = 118, className }: { src: string; rotulo: string; alt?: string; altura?: number; className?: string }) {
  const [aberta, setAberta] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setAberta((v) => !v)}
      aria-pressed={aberta}
      aria-label={aberta ? `Esconder foto: ${rotulo}` : `Mostrar foto: ${rotulo}`}
      data-foto-cadeado={aberta ? "aberta" : "fechada"}
      className={cn("relative block w-full overflow-hidden rounded-2xl border border-linha-2", className)}
      style={{ height: altura }}
    >
      <img
        src={src}
        alt={alt ?? rotulo}
        className={cn("h-full w-full object-cover transition duration-300", !aberta && "scale-[1.15] blur-[7px] brightness-[.7] saturate-[.8]")}
        draggable={false}
      />
      {!aberta && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[11.5px] font-semibold text-white">
          <Lock aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
          {rotulo}
        </span>
      )}
    </button>
  );
}
