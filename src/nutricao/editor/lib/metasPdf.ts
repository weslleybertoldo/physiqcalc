// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/metasPdf.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { format } from "date-fns";
import { DIAS_SEMANA, nomeArquivoPDFMetas, normalizarDias, textoDias } from "@/nutricao/editor/lib/metasUtil";

// PDF da prescrição de metas (jspdf + jspdf-autotable, A4): cabeçalho PHYSIQNUTRI · PRESCRIÇÃO DE METAS, paciente + data,
// tabela com as metas ATIVAS — colunas Meta · Como · Seg Ter Qua Qui Sex Sáb Dom (bolinha cheia no dia em que a meta vale,
// desenhada com `circle` no `didDrawCell`: as fontes padrão do jspdf são Latin-1 e não têm o caractere de bolinha) —,
// resumo em texto ("Caminhar 30 minutos: Seg, Qua e Sex"), assinatura com o nome da nutricionista e rodapé com páginas.
// Carregado em chunk separado (`pdf-*.js`), como os demais PDFs.

export type MetaPDF = { titulo: string; descricao: string | null; dias_semana: number[] | null };
export type DadosPDFMetas = {
  paciente: string;
  /** só as metas ativas — a tela desabilita o botão sem nenhuma */
  metas: MetaPDF[];
  nutricionista: string | null;
  emitidoEm: Date;
};

const MARGEM = 20;
const LARGURA = 210 - MARGEM * 2;
const DIREITA = 210 - MARGEM;
const RODAPE = 285;
type Cor = [number, number, number];
type Estilo = "normal" | "bold" | "italic";
const ESCURO: Cor = [38, 38, 38];

export function montarPDFMetas(d: DadosPDFMetas): jsPDF {
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

  const metas = d.metas.map((m) => ({ titulo: m.titulo, descricao: (m.descricao ?? "").trim(), dias: normalizarDias(m.dias_semana) }));
  const total = metas.length;

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQNUTRI · PRESCRIÇÃO DE METAS", MARGEM, y);
  fonte(9, "normal", [120, 120, 120]);
  doc.text(`Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}`, DIREITA, y, { align: "right" });
  y += 11;
  paragrafo("Prescrição de metas", 18, "bold");
  y += 2;
  paragrafo(
    `Paciente: ${d.paciente}   ·   Data: ${format(d.emitidoEm, "dd/MM/yyyy")}   ·   ${total === 0 ? "nenhuma meta ativa" : total === 1 ? "1 meta ativa" : `${total} metas ativas`}`,
    9.5,
    "normal",
    [60, 60, 60],
  );
  y += 3;
  separador();
  y += 7;

  // ---- Tabela (Meta · Como · 7 dias) ----
  if (total === 0) {
    paragrafo("Nenhuma meta ativa.", 11, "italic", [140, 140, 140]);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEM, right: MARGEM, top: MARGEM, bottom: 18 },
      head: [["Meta", "Como", ...DIAS_SEMANA.map((x) => x.curto)]],
      body: metas.map((m) => [m.titulo, m.descricao || "—", ...DIAS_SEMANA.map(() => "")]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2, textColor: [30, 30, 30], lineColor: [205, 205, 205], lineWidth: 0.2, valign: "middle" },
      headStyles: { fillColor: ESCURO, textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 44, fontStyle: "bold", halign: "left" },
        1: { cellWidth: 63, halign: "left" },
        2: { cellWidth: 9 }, 3: { cellWidth: 9 }, 4: { cellWidth: 9 }, 5: { cellWidth: 9 }, 6: { cellWidth: 9 }, 7: { cellWidth: 9 }, 8: { cellWidth: 9 },
      },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index < 2) return;
        const dia = data.column.index - 1; // colunas 2..8 = dias 1..7
        const marcado = metas[data.row.index]?.dias.includes(dia) ?? false;
        const cx = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2;
        if (marcado) {
          doc.setFillColor(...ESCURO);
          doc.circle(cx, cy, 1.7, "F");
        } else {
          doc.setDrawColor(215, 215, 215);
          doc.setLineWidth(0.2);
          doc.circle(cx, cy, 1.2, "S");
        }
      },
      didDrawPage: (data) => {
        if (data.cursor) y = data.cursor.y;
      },
    });
    y += 7;

    // ---- Resumo em texto (legível sem a grade) ----
    quebrar(12);
    fonte(8.5, "bold", [120, 120, 120]);
    doc.text("EM RESUMO", MARGEM, y);
    y += 5;
    for (const m of metas) {
      paragrafo(`${m.titulo}: ${textoDias(m.dias)}`, 9.5, "normal", [50, 50, 50]);
      y += 1;
    }
    y += 2;
    fonte(8, "italic", [140, 140, 140]);
    quebrar(5);
    doc.setFillColor(...ESCURO);
    doc.circle(MARGEM + 1.5, y - 1.2, 1.3, "F");
    doc.text("= dia em que a meta vale", MARGEM + 4.5, y);
    y += 4;
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
    doc.text("Nutricionista", centro, y, { align: "center" });
  }

  // ---- Rodapé ----
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(`${d.paciente} · Prescrição de metas · ${format(d.emitidoEm, "dd/MM/yyyy")}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${paginas}`, DIREITA, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF; devolve o nome do arquivo (`metas-<paciente>-<yyyyMMdd>.pdf`). */
export function baixarPDFMetas(d: DadosPDFMetas): string {
  const nome = nomeArquivoPDFMetas(d.paciente, d.emitidoEm);
  montarPDFMetas(d).save(nome);
  return nome;
}
