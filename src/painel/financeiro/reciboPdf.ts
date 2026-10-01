// Physiq W19 — PDF do recibo (N-59/N-60): porta do PhysiqNutri (main ca9f66f, src/lib/reciboPdf.ts), o MESMO documento de hoje com a
// marca Physiq (como o PDF do prontuário da W18): cabeçalho PHYSIQ · RECIBO com "Emitido em", o número (0001) e o valor em destaque
// (mais o extenso), "referente a" + data + paciente, o TEXTO final gravado na emissão (as tags já substituídas), assinatura com o nome
// de quem EMITIU o recibo e o título dele, e o rodapé com as páginas. Novo (equipe — P6): quando quem gera o PDF não é quem emitiu
// o recibo, o autor aparece ao lado da data ("Data: 19/09/2026 · Camila Rocha (nutricionista)"); o de quem gera sai igual ao de hoje.
// Para quem não é nutricionista, os rótulos viram os do Physiq ("Aluno", "Personal trainer"). Fonte padrão (Helvetica, Latin-1).
// Carregue este módulo sob demanda (import()) — o jsPDF fica num pedaço separado do app.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { CARIMBO_PLACEHOLDER, formatarDataRecibo, formatarNumeroRecibo, nomeArquivoPDFRecibo, valorPorExtenso } from "@/financeiro/recibos";
import { salvarPdf } from "@/lib/salvarPdf";
import { fmtBRL } from "./financeiroUtil";

export type DadosPDFRecibo = {
  numero: number;
  valor: number;
  /** `yyyy-MM-dd` */
  data: string;
  descricao: string;
  texto: string;
  /** nome de quem recebeu o atendimento (paciente/aluno) */
  paciente: string;
  /** nome de quem EMITIU o recibo (a assinatura) */
  profissional: string | null;
  /** título embaixo da assinatura (padrão "Nutricionista", o de hoje) */
  rotuloProfissional?: string;
  /** rótulo da pessoa na linha "Referente a" (padrão "Paciente", o de hoje) */
  rotuloPaciente?: string;
  /** quem emitiu, quando não é quem gera o PDF (sai "Data: dd/mm/aaaa · autor") */
  autor?: string | null;
  emitidoEm: Date;
};

const MARGEM = 20;
const LARGURA = 210 - MARGEM * 2;
const DIREITA = 210 - MARGEM;
const RODAPE = 285;
type Cor = [number, number, number];
type Estilo = "normal" | "bold" | "italic";

export function montarPDFRecibo(d: DadosPDFRecibo): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGEM;

  const fonte = (tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20]) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 8) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const paragrafo = (texto: string, tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20], recuo = 0) => {
    fonte(tamanho, estilo, cor);
    const linhas = doc.splitTextToSize(texto || "—", LARGURA - recuo) as string[];
    const passo = tamanho * 0.5;
    for (const linha of linhas) {
      quebrar(passo);
      doc.text(linha, MARGEM + recuo, y);
      y += passo;
    }
  };
  const separador = (cor: Cor = [200, 200, 200]) => {
    doc.setDrawColor(...cor);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, y, DIREITA, y);
  };

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · RECIBO", MARGEM, y);
  fonte(9, "normal", [120, 120, 120]);
  doc.text(`Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}`, DIREITA, y, { align: "right" });
  y += 11;
  fonte(20, "bold");
  doc.text(`RECIBO Nº ${formatarNumeroRecibo(d.numero)}`, MARGEM, y);
  // valor em destaque numa caixa à direita
  const valorTexto = fmtBRL(d.valor);
  fonte(16, "bold");
  const larguraValor = doc.getTextWidth(valorTexto) + 10;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.5);
  doc.rect(DIREITA - larguraValor, y - 9.5, larguraValor, 13);
  doc.text(valorTexto, DIREITA - 5, y, { align: "right" });
  y += 8;
  paragrafo(`(${valorPorExtenso(d.valor)})`, 9.5, "italic", [90, 90, 90]);
  y += 2;
  const data = d.autor ? `${formatarDataRecibo(d.data)} · ${d.autor}` : formatarDataRecibo(d.data);
  paragrafo(`Referente a: ${d.descricao}   ·   Data: ${data}   ·   ${d.rotuloPaciente ?? "Paciente"}: ${d.paciente}`, 9.5, "normal", [60, 60, 60]);
  y += 3;
  separador();
  y += 9;

  // ---- Texto do recibo (cada linha é um parágrafo; linha em branco = espaço) ----
  const linhas = (d.texto ?? "").replace(/\r\n?/g, "\n").split("\n");
  if (!linhas.some((l) => l.trim())) paragrafo("Sem texto.", 11, "italic", [140, 140, 140]);
  for (const l of linhas) {
    const t = l.trim();
    if (!t) {
      y += 3;
      continue;
    }
    if (t === CARIMBO_PLACEHOLDER) {
      paragrafo(t, 10, "italic", [150, 150, 150]);
      continue;
    }
    paragrafo(t, 11.5, "normal");
    y += 1;
  }

  // ---- Assinatura ----
  y += 16;
  quebrar(26);
  const xIni = DIREITA - 80;
  const centro = (xIni + DIREITA) / 2;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.4);
  doc.line(xIni, y, DIREITA, y);
  y += 5;
  const nome = (d.profissional ?? "").trim();
  fonte(10, "bold");
  doc.text(nome || "Assinatura", centro, y, { align: "center" });
  if (nome) {
    y += 4.5;
    fonte(8.5, "normal", [120, 120, 120]);
    doc.text(d.rotuloProfissional ?? "Nutricionista", centro, y, { align: "center" });
  }

  // ---- Rodapé ----
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(`${d.paciente} · Recibo nº ${formatarNumeroRecibo(d.numero)} · ${formatarDataRecibo(d.data)}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, DIREITA, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa (no APK: abre o compartilhar) o PDF do recibo; devolve o nome do arquivo (`recibo-0001-<pessoa>.pdf`). */
export async function baixarPDFRecibo(d: DadosPDFRecibo): Promise<string> {
  const nome = nomeArquivoPDFRecibo(d.numero, d.paciente);
  await salvarPdf(montarPDFRecibo(d), nome);
  return nome;
}
