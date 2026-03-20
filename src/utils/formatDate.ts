export const FUSO = 'America/Maceio'; // UTC-3, sem horário de verão

/**
 * Formata uma data ISO do Supabase para exibição no fuso local.
 * Ex: "2025-03-22T22:30:00+00:00" → "22/03/2025 às 22:30"
 */
export function formatarData(isoString: string | null | undefined, opcoes?: {
  incluirHora?: boolean;
  formato?: 'curto' | 'longo';
}): string {
  if (!isoString) return '—';

  const { incluirHora = true, formato = 'curto' } = opcoes ?? {};

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '—';

  const partesData = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);

  if (!incluirHora) return partesData;

  const partesHora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return formato === 'longo'
    ? `${partesData} às ${partesHora}`
    : `${partesData} ${partesHora}`;
}

/**
 * Formata uma data no formato YYYY-MM-DD (date-only) para exibição local.
 * Adiciona T12:00:00 para evitar problemas de timezone.
 */
export function formatarDataCurta(dateStr: string | null | undefined, opcoes?: {
  weekday?: boolean;
}): string {
  if (!dateStr) return '—';

  const date = new Date(dateStr + 'T12:00:00');
  if (isNaN(date.getTime())) return '—';

  if (opcoes?.weekday) {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO,
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    }).format(date);
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Retorna a data/hora atual formatada para exibição.
 */
export function agoraFormatado(opcoes?: { incluirHora?: boolean; formato?: 'curto' | 'longo' }): string {
  return formatarData(new Date().toISOString(), opcoes);
}

/**
 * Calcula a idade a partir da data de nascimento (YYYY-MM-DD).
 */
export function calcularIdade(dataNascimento: string | null | undefined): number {
  if (!dataNascimento) return 0;
  const hoje = new Date();
  const nasc = new Date(dataNascimento + 'T12:00:00');
  if (isNaN(nasc.getTime())) return 0;
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const mesAtual = hoje.getMonth();
  const mesNasc = nasc.getMonth();
  if (mesAtual < mesNasc || (mesAtual === mesNasc && hoje.getDate() < nasc.getDate())) {
    idade--;
  }
  return Math.max(0, idade);
}
