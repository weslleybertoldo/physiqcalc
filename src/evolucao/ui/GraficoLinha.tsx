import { useId } from "react";
import { caminhoSuave, type Ponto } from "@/ui/premium/grafico";
import { eixoDeMeses, posicaoNaJanela, type PontoSerie } from "../serie";

/**
 * Gráfico de área da tela 4 (o `area()` do gerador das telas: linha com brilho, preenchimento que some pra baixo, grade
 * tracejada, meses embaixo e o ponto atual destacado) — com os pontos na DATA de cada avaliação (a tela aprovada espaçava
 * igual; aqui avaliações irregulares não enganam o olho). viewBox fixo que escala por inteiro (os círculos não esticam).
 */
export function GraficoLinha({
  pontos,
  janela,
  largura = 326,
  altura = 150,
  cor = "var(--p-violeta-2)",
  pad = 6,
  grade = 3,
  rotulo = "Gráfico",
}: {
  pontos: PontoSerie[];
  janela: { inicio: string; fim: string };
  largura?: number;
  altura?: number;
  cor?: string;
  pad?: number;
  grade?: number;
  rotulo?: string;
}) {
  const id = useId().replace(/:/g, "");
  if (pontos.length < 2) return null;
  const base = altura - 18;
  const valores = pontos.map((p) => p.valor);
  const lo = Math.min(...valores);
  const hi = Math.max(...valores);
  const faixa = hi - lo || 1;
  const pts: Ponto[] = pontos.map((p) => [pad + posicaoNaJanela(p.data, janela) * (largura - 2 * pad), pad + (1 - (p.valor - lo) / faixa) * (base - 2 * pad)]);
  const d = caminhoSuave(pts);
  const ult = pts[pts.length - 1];
  const meses = eixoDeMeses(janela);
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" role="img" aria-label={rotulo} className="block overflow-visible" data-grafico-pontos={pontos.length}>
      <defs>
        <linearGradient id={`ev-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={cor} stopOpacity={0.35} />
          <stop offset="1" stopColor={cor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {grade > 0 &&
        Array.from({ length: grade + 1 }, (_, k) => {
          const y = pad + (k * (base - 2 * pad)) / grade;
          return <line key={k} x1={0} x2={largura} y1={y} y2={y} stroke="var(--p-linha-3)" strokeDasharray="2 5" />;
        })}
      <path d={`${d} L${ult[0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`} fill={`url(#ev-${id})`} />
      <path d={d} fill="none" stroke={cor} strokeWidth={2.4} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${cor})` }} />
      <circle cx={ult[0]} cy={ult[1]} r={10} fill={cor} opacity={0.18} />
      <circle cx={ult[0]} cy={ult[1]} r={4.5} fill="#fff" stroke={cor} strokeWidth={2.5} data-ponto-atual />
      {meses.map((m, i) => (
        <text key={`${m.rotulo}-${i}`} x={pad + m.x * (largura - 2 * pad)} y={altura - 2} textAnchor="middle" fontSize={10.5} fill="var(--p-texto-3)" fontFamily="Geist, sans-serif">
          {m.rotulo}
        </text>
      ))}
    </svg>
  );
}
