import { cn } from "@/lib/utils";

/** Interruptor liga/desliga no visual premium (trilho de vidro; ligado = violeta). */
export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  desligado,
  ...props
}: {
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: string;
  desligado?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "role">) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desligado}
      onClick={() => aoMudar(!ligado)}
      className={cn(
        "relative inline-flex h-[30px] w-[52px] flex-none items-center rounded-full border transition-colors disabled:opacity-50",
        ligado ? "border-violeta/60 bg-violeta" : "border-linha-2 bg-superficie-2",
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.35)] transition-[left]",
          ligado ? "left-[26px]" : "left-[3px]",
        )}
      />
    </button>
  );
}
