/**
 * Datas da aba Treino (W8). As chaves de dia da semana ("SEG", "TER"…) são as mesmas gravadas em
 * `tb_semana_treinos.dia_semana` e `tb_semana_dia_config.dia_semana` — não mudar.
 */

/** Índice = `Date.getDay()` (0 = domingo). Valor = o que o banco guarda. */
export const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"] as const;

/** Rótulos da faixa Seg–Dom (tela 2). Índice = `Date.getDay()`. */
export const ROTULO_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

/** As 7 datas (segunda → domingo) da semana que contém `ref`. */
export function datasDaSemana(ref: Date): Date[] {
  const d = new Date(ref);
  d.setHours(12, 0, 0, 0); // meio-dia: trocar de horário de verão não pula dia
  const segunda = new Date(d);
  segunda.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(segunda);
    x.setDate(segunda.getDate() + i);
    return x;
  });
}

/** "2026-09-29" no fuso do aparelho (a chave `data_treino` do banco). */
export function chaveData(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

/** "29/09" */
export function rotuloData(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "Ter 29/09" — o nome do dia no aviso de remoção, na troca e no lembrete. */
export function rotuloDiaCurto(d: Date): string {
  return `${ROTULO_DIA[d.getDay()]} ${rotuloData(d)}`;
}

/** "2026-09-01" do mês de `d`. */
export function inicioDoMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Data de uma chave "2026-09-29" (meio-dia local). */
export function dataDaChave(chave: string): Date {
  const [y, m, d] = chave.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/** "Esta semana" · "Semana passada" · "Próxima semana" · "+2 semanas" · "−3 semanas" */
export function rotuloDaSemana(deslocamento: number): string {
  if (deslocamento === 0) return "Esta semana";
  if (deslocamento === -1) return "Semana passada";
  if (deslocamento === 1) return "Próxima semana";
  return deslocamento > 0 ? `+${deslocamento} semanas` : `−${Math.abs(deslocamento)} semanas`;
}

/** "Setembro de 2026" */
export function rotuloMes(ano: number, mes0: number): string {
  return `${MESES[mes0]} de ${ano}`;
}

/** Chave "2026-09" do mês (histórico por mês). */
export function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Grade do calendário do mês (segunda na 1ª coluna): semanas × 7 células; `null` fora do mês.
 */
export function gradeDoMes(ano: number, mes0: number): (Date | null)[][] {
  const primeiro = new Date(ano, mes0, 1, 12);
  const ultimoDia = new Date(ano, mes0 + 1, 0, 12).getDate();
  const vazioAntes = (primeiro.getDay() + 6) % 7;
  const celulas: (Date | null)[] = Array.from({ length: vazioAntes }, () => null);
  for (let d = 1; d <= ultimoDia; d++) celulas.push(new Date(ano, mes0, d, 12));
  while (celulas.length % 7 !== 0) celulas.push(null);
  const semanas: (Date | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}
