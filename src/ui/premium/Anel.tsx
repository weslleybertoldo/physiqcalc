import { useId, type ReactNode } from "react";

/** Anel de progresso (`anel()` do gerador): trilho + arco com ponta redonda e brilho. `pct` de 0 a 1. */
export function Anel({
  pct,
  tamanho = 86,
  espessura = 9,
  cor = "var(--p-verde-2)",
  gradiente,
  trilho = "var(--p-superficie-2)",
  children,
  className,
  rotulo,
}: {
  pct: number;
  tamanho?: number;
  espessura?: number;
  cor?: string;
  /** Duas cores do arco (início → fim), como o anel de kcal da tela 3. */
  gradiente?: [string, string];
  trilho?: string;
  children?: ReactNode;
  className?: string;
  rotulo?: string;
}) {
  const id = useId().replace(/:/g, "");
  const r = (tamanho - espessura) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, Number.isFinite(pct) ? pct : 0));
  const meio = tamanho / 2;
  return (
    <div className={`relative flex flex-none items-center justify-center ${className ?? ""}`} style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label={rotulo ?? `${Math.round(p * 100)}%`}>
        {gradiente && (
          <defs>
            <linearGradient id={`anel-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={gradiente[0]} />
              <stop offset="1" stopColor={gradiente[1]} />
            </linearGradient>
          </defs>
        )}
        <circle cx={meio} cy={meio} r={r} fill="none" stroke={trilho} strokeWidth={espessura} />
        <circle
          cx={meio}
          cy={meio}
          r={r}
          fill="none"
          stroke={gradiente ? `url(#anel-${id})` : cor}
          strokeWidth={espessura}
          strokeLinecap="round"
          strokeDasharray={`${(c * p).toFixed(2)} ${c.toFixed(2)}`}
          transform={`rotate(-90 ${meio} ${meio})`}
          style={{ filter: `drop-shadow(0 0 6px ${gradiente ? gradiente[1] : cor})`, opacity: p === 0 ? 0 : 1 }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}
