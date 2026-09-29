import { useId } from "react";
import { caminhoSuave, pontosDaSerie } from "./grafico";

/**
 * Gráfico de área (`area()` do gerador): linha com brilho, preenchimento que some pra baixo, grade
 * tracejada opcional, rótulos embaixo e o ponto atual destacado. Largura em px ou "100%" (viewBox).
 */
export function Area({
  valores,
  largura = 150,
  altura = 60,
  cor = "var(--p-violeta-2)",
  pad = 4,
  min,
  max,
  pontoFinal = false,
  grade = 0,
  rotulos,
  responsivo = false,
  className,
  rotulo,
}: {
  valores: number[];
  largura?: number;
  altura?: number;
  cor?: string;
  pad?: number;
  min?: number;
  max?: number;
  pontoFinal?: boolean;
  grade?: number;
  rotulos?: string[];
  /** Ocupa a largura do contêiner (mantém a proporção do viewBox). */
  responsivo?: boolean;
  className?: string;
  rotulo?: string;
}) {
  const id = useId().replace(/:/g, "");
  const baseAltura = altura - (rotulos?.length ? 18 : 0);
  const pts = pontosDaSerie(valores, largura, baseAltura, pad, min, max);
  if (pts.length < 2) return null;
  const d = caminhoSuave(pts);
  const ult = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      width={responsivo ? "100%" : largura}
      height={responsivo ? undefined : altura}
      preserveAspectRatio={responsivo ? "none" : undefined}
      className={className}
      role="img"
      aria-label={rotulo ?? "Gráfico"}
      style={responsivo ? { aspectRatio: `${largura} / ${altura}` } : undefined}
    >
      <defs>
        <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={cor} stopOpacity={0.35} />
          <stop offset="1" stopColor={cor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {grade > 0 &&
        Array.from({ length: grade + 1 }, (_, k) => {
          const y = pad + (k * (baseAltura - 2 * pad)) / grade;
          return <line key={k} x1={0} x2={largura} y1={y} y2={y} stroke="var(--p-linha-3)" strokeDasharray="2 5" />;
        })}
      <path d={`${d} L${ult[0].toFixed(1)},${baseAltura} L${pts[0][0].toFixed(1)},${baseAltura} Z`} fill={`url(#area-${id})`} />
      <path d={d} fill="none" stroke={cor} strokeWidth={2.4} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${cor})` }} vectorEffect="non-scaling-stroke" />
      {pontoFinal && (
        <>
          <circle cx={ult[0]} cy={ult[1]} r={10} fill={cor} opacity={0.18} />
          <circle cx={ult[0]} cy={ult[1]} r={4.5} fill="#fff" stroke={cor} strokeWidth={2.5} />
        </>
      )}
      {rotulos?.map((t, i) => (
        <text
          key={`${t}-${i}`}
          x={16 + (i * (largura - 32)) / Math.max(1, rotulos.length - 1)}
          y={altura - 2}
          textAnchor="middle"
          fontSize={10.5}
          fill="var(--p-texto-3)"
          fontFamily="Geist, sans-serif"
        >
          {t}
        </text>
      ))}
    </svg>
  );
}

/** Mini gráfico dos KPIs (`spark()` do gerador): 92 × 40, sem grade nem rótulos. */
export function Sparkline({ valores, cor, largura = 92, altura = 40 }: { valores: number[]; cor?: string; largura?: number; altura?: number }) {
  return <Area valores={valores} cor={cor} largura={largura} altura={altura} pad={3} rotulo="Tendência" />;
}
