/** exercicios_concluidos pode vir como texto JSON (às vezes codificado 2 vezes). */
export function lerExercicios(bruto: unknown): unknown[] {
  let v = bruto;
  for (let i = 0; i < 3 && typeof v === "string"; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v : [];
}
