import { useState } from "react";
import { cn } from "@/lib/utils";
import { iniciais } from "./texto";

/** Foto redonda com aro (`.av`). Sem foto (ou se a imagem falhar), mostra as iniciais no mesmo tamanho. */
export function Avatar({
  src,
  nome,
  tamanho = 40,
  className,
}: {
  src?: string | null;
  nome?: string | null;
  tamanho?: number;
  className?: string;
}) {
  const [quebrou, setQuebrou] = useState(false);
  const estilo = { width: tamanho, height: tamanho };
  if (src && !quebrou) {
    return (
      <img
        src={src}
        alt=""
        width={tamanho}
        height={tamanho}
        referrerPolicy="no-referrer"
        onError={() => setQuebrou(true)}
        className={cn("pq-avatar", className)}
        style={estilo}
      />
    );
  }
  return (
    <span
      aria-hidden
      data-avatar-iniciais
      className={cn(
        "pq-avatar inline-flex items-center justify-center bg-linear-to-br from-violeta/35 to-verde/25 font-semibold text-texto",
        className,
      )}
      style={{ ...estilo, fontSize: Math.max(10, Math.round(tamanho * 0.36)) }}
    >
      {iniciais(nome)}
    </span>
  );
}
