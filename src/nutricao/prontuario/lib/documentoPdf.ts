// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/documentoPdf.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import {
  CARIMBO_PLACEHOLDER, formatarCPF, formatarDataDocumento, infoTipo, nomeArquivoPDFDocumento, type DadosProfissionais, type TipoDocumento,
} from "@/nutricao/prontuario/lib/documentosUtil";

// PDF do documento do paciente (jspdf, A4): cabeçalho PHYSIQ · <TIPO>, título, linha paciente/CPF/data, dados
// profissionais da nutricionista quando já existirem (CRN, telefone, endereço — preenchidos na W35), o TEXTO final em
// parágrafos (as tags já foram substituídas na emissão — o PDF reproduz o que está gravado; "[carimbo]" sai em itálico até a
// W35 guardar a imagem), assinatura com o nome da nutricionista (+ CRN) e rodapé com páginas. Fonte padrão (Helvetica,
// Latin-1). Carregado em chunk separado (`pdf-*.js`), como os demais PDFs.

export type DadosPDFDocumento = {
  tipo: TipoDocumento;
  titulo: string;
  texto: string;
  /** `yyyy-MM-dd` */
  data: string;
  paciente: string;
  cpf: string | null | undefined;
  nutricionista: string | null;
  profissional: DadosProfissionais | null;
  emitidoEm: Date;
};

const MARGEM = 20;
const LARGURA = 210 - MARGEM * 2;
const DIREITA = 210 - MARGEM;
const RODAPE = 285;
type Cor = [number, number, number];
type Estilo = "normal" | "bold" | "italic";

export function montarPDFDocumento(d: DadosPDFDocumento): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const rotulo = infoTipo(d.tipo).rotulo;
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
  doc.text(`PHYSIQ · ${rotulo.toUpperCase()}`, MARGEM, y);
  fonte(9, "normal", [120, 120, 120]);
  doc.text(`Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}`, DIREITA, y, { align: "right" });
  y += 11;
  paragrafo(d.titulo || rotulo, 18, "bold");
  y += 2;
  paragrafo(`Paciente: ${d.paciente}   ·   CPF: ${formatarCPF(d.cpf)}   ·   Data: ${formatarDataDocumento(d.data)}`, 9.5, "normal", [60, 60, 60]);
  const prof = d.profissional;
  const linhaProf = prof ? [prof.crn ? `CRN ${prof.crn}` : null, prof.telefone, prof.endereco].filter(Boolean).join("   ·   ") : "";
  if (linhaProf) paragrafo(linhaProf, 8.5, "normal", [110, 110, 110]);
  y += 3;
  separador();
  y += 9;

  // ---- Texto do documento (cada linha é um parágrafo; linha em branco = espaço) ----
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
  const nome = (d.nutricionista ?? "").trim();
  fonte(10, "bold");
  doc.text(nome || "Assinatura", centro, y, { align: "center" });
  if (nome) {
    y += 4.5;
    fonte(8.5, "normal", [120, 120, 120]);
    doc.text(prof?.crn ? `Nutricionista · CRN ${prof.crn}` : "Nutricionista", centro, y, { align: "center" });
  }

  // ---- Rodapé ----
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(`${d.paciente} · ${rotulo} · ${formatarDataDocumento(d.data)}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, DIREITA, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF do documento; devolve o nome do arquivo (`<tipo>-<paciente>-<yyyyMMdd>.pdf`). */
export function baixarPDFDocumento(d: DadosPDFDocumento): string {
  const nome = nomeArquivoPDFDocumento(d.tipo, d.paciente, d.data);
  montarPDFDocumento(d).save(nome);
  return nome;
}
