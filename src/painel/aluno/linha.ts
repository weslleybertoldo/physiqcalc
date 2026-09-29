/** Campos do perfil (Banco do Treino) que a linha do cabeçalho usa. */
export interface CamposLinhaAluno {
  idade: number | null;
  altura: number | null;
  created_at: string | null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "28 anos · 1,78 m · aluno desde mar/2026" (só o que existe). */
export function linhaDoAluno(p: CamposLinhaAluno): string {
  const partes: string[] = [];
  if (p.idade) partes.push(`${p.idade} anos`);
  if (p.altura) partes.push(`${(p.altura / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`);
  if (p.created_at) {
    const d = new Date(p.created_at);
    if (!Number.isNaN(d.getTime())) partes.push(`aluno desde ${MESES[d.getMonth()]}/${d.getFullYear()}`);
  }
  return partes.join(" · ");
}
