// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/manipuladosPdf.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo. W26: marca PHYSIQ no cabeçalho (N-60, como a W18/W19/W24).
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { format } from "date-fns";
import type { DadosProfissionais } from "@/nutricao/editor/lib/profissional";
import { formatarDataFormula, lerAtivos, nomeArquivoPDFFormula, nomeArquivoPDFFormulas, textoContagemAtivos, textoDose } from "@/nutricao/editor/lib/manipuladosUtil";

// PDF da prescrição de manipulado (jspdf + jspdf-autotable, A4): cabeçalho PHYSIQ · PRESCRIÇÃO DE MANIPULADO, título da
// fórmula, paciente + data da prescrição (+ CRN/telefone/endereço da nutricionista quando existirem — W15), tabela Ativo · Dose
// (uma linha por ativo), Posologia, Quantidade, Observações, assinatura com o nome (+ CRN) e rodapé com páginas. O "PDF global"
// desenha TODAS as fórmulas vivas do paciente, uma por página, com o mesmo cabeçalho. Carregado em chunk separado (`pdf-*.js`).

export type FormulaPDF = { titulo: string; ativos: unknown; posologia: string | null; quantidade: string | null; observacao: string | null; prescrita_em: string };
type Base = { paciente: string; nutricionista: string | null; profissional: DadosProfissionais | null; emitidoEm: Date };
export type DadosPDFFormula = Base & { formula: FormulaPDF };
export type DadosPDFFormulas = Base & { formulas: FormulaPDF[] };

const MARGEM = 20;
const LARGURA = 210 - MARGEM * 2;
const DIREITA = 210 - MARGEM;
const RODAPE = 285;
type Cor = [number, number, number];
type Estilo = "normal" | "bold" | "italic";
const ESCURO: Cor = [38, 38, 38];

const fonte = (doc: jsPDF, tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20]) => {
  doc.setFont("helvetica", estilo);
  doc.setFontSize(tamanho);
  doc.setTextColor(...cor);
};

/** Desenha UMA fórmula a partir do topo da página atual (título, dados, tabela de ativos, posologia, quantidade, observações, assinatura). */
export function desenharFormula(doc: jsPDF, d: DadosPDFFormula, rotulo = "PRESCRIÇÃO DE MANIPULADO"): void {
  let y = MARGEM;
  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 8) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const paragrafo = (texto: string, tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20]) => {
    fonte(doc, tamanho, estilo, cor);
    const linhas = doc.splitTextToSize(texto || "—", LARGURA) as string[];
    const passo = tamanho * 0.5;
    for (const linha of linhas) {
      quebrar(passo);
      doc.text(linha, MARGEM, y);
      y += passo;
    }
  };
  /** Texto livre: cada linha é um parágrafo; linha em branco = espaço. */
  const blocoTexto = (texto: string) => {
    const linhas = (texto ?? "").replace(/\r\n?/g, "\n").split("\n");
    if (!linhas.some((l) => l.trim())) return paragrafo("—", 11, "normal", [120, 120, 120]);
    for (const l of linhas) {
      const t = l.trim();
      if (!t) {
        y += 2.5;
        continue;
      }
      paragrafo(t, 11, "normal");
      y += 0.5;
    }
  };
  const secao = (nome: string) => {
    quebrar(14);
    fonte(doc, 8.5, "bold", [120, 120, 120]);
    doc.text(nome, MARGEM, y);
    y += 5;
  };
  const separador = (cor: Cor = [200, 200, 200]) => {
    doc.setDrawColor(...cor);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, y, DIREITA, y);
  };

  const f = d.formula;
  const ativos = lerAtivos(f.ativos).filter((a) => a.ativo);

  // ---- Cabeçalho ----
  fonte(doc, 9, "bold", [120, 120, 120]);
  doc.text(`PHYSIQ · ${rotulo}`, MARGEM, y);
  fonte(doc, 9, "normal", [120, 120, 120]);
  doc.text(`Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}`, DIREITA, y, { align: "right" });
  y += 11;
  paragrafo(f.titulo || "Fórmula manipulada", 18, "bold");
  y += 2;
  paragrafo(`Paciente: ${d.paciente}   ·   Data: ${formatarDataFormula(f.prescrita_em)}   ·   ${textoContagemAtivos(ativos.length)}`, 9.5, "normal", [60, 60, 60]);
  const prof = d.profissional;
  const linhaProf = prof ? [prof.crn ? `CRN ${prof.crn}` : null, prof.telefone, prof.endereco].filter(Boolean).join("   ·   ") : "";
  if (linhaProf) paragrafo(linhaProf, 8.5, "normal", [110, 110, 110]);
  y += 3;
  separador();
  y += 9;

  // ---- Composição (tabela Ativo · Dose) ----
  secao("COMPOSIÇÃO");
  if (!ativos.length) {
    paragrafo("Nenhum ativo informado.", 11, "italic", [140, 140, 140]);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEM, right: MARGEM, top: MARGEM, bottom: 18 },
      head: [["Ativo", "Dose"]],
      body: ativos.map((a) => [a.ativo, textoDose(a) || "—"]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 2.2, textColor: [30, 30, 30], lineColor: [205, 205, 205], lineWidth: 0.2, valign: "middle" },
      headStyles: { fillColor: ESCURO, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 122, halign: "left" }, 1: { cellWidth: 48, halign: "center" } },
      didDrawPage: (data) => {
        if (data.cursor) y = data.cursor.y;
      },
    });
    y += 8;
  }

  // ---- Posologia / Quantidade / Observações ----
  secao("POSOLOGIA");
  blocoTexto(f.posologia ?? "");
  y += 4;
  secao("QUANTIDADE");
  blocoTexto(f.quantidade ?? "");
  y += 4;
  if ((f.observacao ?? "").trim()) {
    secao("OBSERVAÇÕES");
    blocoTexto(f.observacao ?? "");
    y += 4;
  }

  // ---- Assinatura ----
  y += 14;
  quebrar(26);
  const xIni = DIREITA - 80;
  const centro = (xIni + DIREITA) / 2;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.4);
  doc.line(xIni, y, DIREITA, y);
  y += 5;
  const nome = (d.nutricionista ?? "").trim();
  fonte(doc, 10, "bold");
  doc.text(nome || "Assinatura", centro, y, { align: "center" });
  if (nome) {
    y += 4.5;
    fonte(doc, 8.5, "normal", [120, 120, 120]);
    doc.text(prof?.crn ? `Nutricionista · CRN ${prof.crn}` : "Nutricionista", centro, y, { align: "center" });
  }
}

/** Rodapé em todas as páginas: texto à esquerda e "p/total" à direita. */
function rodape(doc: jsPDF, texto: string): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(doc, 8, "normal", [150, 150, 150]);
    doc.text(texto, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, DIREITA, RODAPE + 4, { align: "right" });
  }
}

export function montarPDFFormula(d: DadosPDFFormula): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  desenharFormula(doc, d);
  rodape(doc, `${d.paciente} · Prescrição de manipulado · ${formatarDataFormula(d.formula.prescrita_em)}`);
  return doc;
}

/** PDF global: todas as fórmulas vivas do paciente, uma por página. */
export function montarPDFFormulas(d: DadosPDFFormulas): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  if (!d.formulas.length) {
    fonte(doc, 9, "bold", [120, 120, 120]);
    doc.text("PHYSIQ · PRESCRIÇÕES DE MANIPULADOS", MARGEM, MARGEM);
    fonte(doc, 11, "italic", [140, 140, 140]);
    doc.text("Nenhuma fórmula prescrita.", MARGEM, MARGEM + 12);
  }
  d.formulas.forEach((f, i) => {
    if (i > 0) doc.addPage();
    desenharFormula(doc, { paciente: d.paciente, nutricionista: d.nutricionista, profissional: d.profissional, emitidoEm: d.emitidoEm, formula: f }, "PRESCRIÇÕES DE MANIPULADOS");
  });
  rodape(doc, `${d.paciente} · Prescrições de manipulados · ${format(d.emitidoEm, "dd/MM/yyyy")}`);
  return doc;
}

/** Gera e baixa o PDF de UMA fórmula; devolve o nome (`formula-<paciente>-<título>-<yyyyMMdd>.pdf`, data = prescrita_em). */
export function baixarPDFFormula(d: DadosPDFFormula): string {
  const nome = nomeArquivoPDFFormula(d.paciente, d.formula.titulo, d.formula.prescrita_em);
  montarPDFFormula(d).save(nome);
  return nome;
}

/** Gera e baixa o PDF global; devolve o nome (`formulas-<paciente>-<yyyyMMdd>.pdf`). */
export function baixarPDFFormulas(d: DadosPDFFormulas): string {
  const nome = nomeArquivoPDFFormulas(d.paciente, d.emitidoEm);
  montarPDFFormulas(d).save(nome);
  return nome;
}
