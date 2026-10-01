import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Campo de formulário do visual premium (tela 8: rótulo pequeno, caixa de vidro, raio 14). `erro` (W16b) = mensagem vermelha logo
 * embaixo do campo (borda rosa + aria-invalid), no lugar da dica.
 */
export const Campo = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { rotulo: string; dica?: ReactNode; erro?: ReactNode }>(
  function Campo({ rotulo, dica, erro, className, type, id, ...props }, ref) {
    const idGerado = useId();
    const idCampo = id ?? idGerado;
    const idErro = `${idCampo}-erro`;
    const [ver, setVer] = useState(false);
    const senha = type === "password";
    return (
      <label htmlFor={idCampo} className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-texto-2">{rotulo}</span>
        <span className="relative">
          <input
            ref={ref}
            id={idCampo}
            type={senha && ver ? "text" : type}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? idErro : undefined}
            className={cn(
              "h-12 w-full rounded-[14px] border border-linha-2 bg-superficie px-4 text-[15px] text-texto outline-none transition-colors",
              "placeholder:text-texto-4 focus:border-violeta/60 focus:bg-superficie-2 disabled:opacity-60",
              erro && "border-rosa focus:border-rosa",
              senha && "pr-12",
              className,
            )}
            {...props}
          />
          {senha && (
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              aria-label={ver ? "Esconder a senha" : "Mostrar a senha"}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-texto-3 hover:text-texto"
            >
              {ver ? <EyeOff aria-hidden className="h-[18px] w-[18px]" /> : <Eye aria-hidden className="h-[18px] w-[18px]" />}
            </button>
          )}
        </span>
        {erro ? (
          <span id={idErro} role="alert" className="text-[12.5px] font-medium leading-snug text-rosa-3" data-erro-campo>
            {erro}
          </span>
        ) : (
          dica && <span className="text-[12px] text-texto-3">{dica}</span>
        )}
      </label>
    );
  },
);

/** Mensagem de erro/aviso do formulário (rosa = erro, âmbar = aviso). */
export function MensagemForm({ tom = "erro", children, ...props }: { tom?: "erro" | "aviso" | "ok"; children: ReactNode } & React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      role={tom === "erro" ? "alert" : "status"}
      className={cn("text-[13px] font-medium", tom === "erro" ? "text-rosa-3" : tom === "aviso" ? "text-ambar-3" : "text-verde-3")}
      {...props}
    >
      {children}
    </p>
  );
}
