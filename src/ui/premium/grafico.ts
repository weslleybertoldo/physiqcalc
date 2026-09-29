// Desenho dos gráficos premium (porte de curva()/area() do gerador das telas aprovadas).
export type Ponto = [number, number];

/** Caminho suave pelos pontos (Catmull-Rom → Bézier), o mesmo `curva()` que desenhou as telas. */
export function caminhoSuave(pts: Ponto[]): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;
    const c1: Ponto = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Ponto = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Converte valores em pontos da área de desenho (y invertido: maior valor fica em cima). */
export function pontosDaSerie(valores: number[], largura: number, altura: number, pad = 4, min?: number, max?: number): Ponto[] {
  if (valores.length === 0) return [];
  const lo = min ?? Math.min(...valores);
  const hi = max ?? Math.max(...valores);
  const faixa = hi - lo || 1;
  const passo = valores.length > 1 ? (largura - 2 * pad) / (valores.length - 1) : 0;
  return valores.map((v, i) => [pad + i * passo, pad + (1 - (v - lo) / faixa) * (altura - 2 * pad)]);
}
