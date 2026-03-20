import jsPDF from 'jspdf';

// ── Tema ──────────────────────────────────────────────────────────────────
export const TEMA = {
  fundo:        '#0a0a0a',
  fundoCard:    '#111111',
  fundoBorda:   '#1e1e1e',
  amarelo:      '#e9b44c',
  branco:       '#ffffff',
  cinzaClaro:   '#cccccc',
  cinzaMedio:   '#888888',
  cinzaEscuro:  '#444444',
  cinzaFundo:   '#1a1a1a',
  verde:        '#22c55e',
  vermelho:     '#ef4444',
  laranja:      '#f97316',
  amareloCls:   '#facc15',
  verdeClaro:   '#4ade80',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────
export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export function setFill(doc: jsPDF, hex: string) {
  doc.setFillColor(...hexToRgb(hex));
}
export function setTextColor(doc: jsPDF, hex: string) {
  doc.setTextColor(...hexToRgb(hex));
}
export function setDrawColor(doc: jsPDF, hex: string) {
  doc.setDrawColor(...hexToRgb(hex));
}

// ── Fundo da página ──────────────────────────────────────────────────────
export function pintarFundo(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  setFill(doc, TEMA.fundo);
  doc.rect(0, 0, W, H, 'F');
}

// ── Cabeçalho padrão ─────────────────────────────────────────────────────
export function desenharCabecalho(doc: jsPDF, titulo: string, subtitulo?: string): number {
  const W = doc.internal.pageSize.getWidth();

  pintarFundo(doc);

  // Barra superior amarela
  setFill(doc, TEMA.amarelo);
  doc.rect(0, 0, W, 14, 'F');

  // PHYSIQCALC
  setTextColor(doc, TEMA.fundo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PHYSIQCALC', 14, 9.5);

  // Título à direita
  doc.setFontSize(8);
  doc.text(titulo.toUpperCase(), W - 14, 9.5, { align: 'right' });

  // Subtítulo
  if (subtitulo) {
    setTextColor(doc, TEMA.cinzaMedio);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(subtitulo, 14, 20);
  }

  return subtitulo ? 26 : 20;
}

// ── Seção título ─────────────────────────────────────────────────────────
export function desenharTituloSecao(doc: jsPDF, titulo: string, y: number): number {
  const W = doc.internal.pageSize.getWidth();
  setFill(doc, TEMA.cinzaFundo);
  doc.rect(14, y, W - 28, 7, 'F');
  setTextColor(doc, TEMA.amarelo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(titulo.toUpperCase(), 17, y + 4.5);
  return y + 11;
}

// ── Card de métrica ───────────────────────────────────────────────────────
export function desenharCard(
  doc: jsPDF,
  label: string,
  valor: string,
  x: number, y: number, w: number, h: number,
  corValor: string = TEMA.branco
) {
  setFill(doc, TEMA.fundoCard);
  setDrawColor(doc, TEMA.fundoBorda);
  doc.roundedRect(x, y, w, h, 1, 1, 'FD');
  setTextColor(doc, TEMA.cinzaEscuro);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(label.toUpperCase(), x + 4, y + 5);
  setTextColor(doc, corValor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(valor, x + 4, y + 12);
}

// ── Delta badge ───────────────────────────────────────────────────────────
export function corDelta(delta: number, inverter = false): string {
  if (delta === 0) return TEMA.cinzaMedio;
  const positivo = inverter ? delta < 0 : delta > 0;
  return positivo ? TEMA.verde : TEMA.vermelho;
}

export function textoDelta(delta: number, dec = 1): string {
  if (delta === 0) return '= 0';
  return delta > 0 ? `+${delta.toFixed(dec)}` : `${delta.toFixed(dec)}`;
}

// ── Tabela autoTable tema escuro ─────────────────────────────────────────
export function estiloTabela() {
  return {
    theme: 'plain' as const,
    styles: {
      fillColor: hexToRgb(TEMA.fundo),
      textColor: hexToRgb(TEMA.cinzaClaro),
      fontSize: 8,
      cellPadding: 3,
      lineColor: hexToRgb(TEMA.fundoBorda),
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: hexToRgb(TEMA.cinzaFundo),
      textColor: hexToRgb(TEMA.cinzaEscuro),
      fontSize: 7,
      fontStyle: 'bold' as const,
    },
    alternateRowStyles: {
      fillColor: hexToRgb(TEMA.fundoCard),
    },
  };
}

// ── Rodapé ────────────────────────────────────────────────────────────────
export function desenharRodape(doc: jsPDF, textoEsquerda: string) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  setDrawColor(doc, TEMA.fundoBorda);
  doc.line(14, H - 12, W - 14, H - 12);
  setTextColor(doc, TEMA.cinzaEscuro);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(textoEsquerda, 14, H - 7);
  doc.text('PhysiqCalc - Bertoldo Performance', W - 14, H - 7, { align: 'right' });
}

// ── Nova página com fundo ────────────────────────────────────────────────
export function novaPagina(doc: jsPDF): number {
  doc.addPage();
  pintarFundo(doc);
  return 15;
}

// ── Limpar texto (emojis e unicode) ──────────────────────────────────────
export function limparTexto(texto: string): string {
  return texto
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27FF}]/gu, '')
    .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
    .replace(/\u200D/g, '')
    .replace(/[×→▲▼•·]/g, (c) => {
      if (c === '×') return 'x';
      if (c === '→') return '->';
      if (c === '▲') return '+';
      if (c === '▼') return '-';
      if (c === '•' || c === '·') return '-';
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}
