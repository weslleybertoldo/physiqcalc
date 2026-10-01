// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/examesPdf.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { DadosProfissionais } from "@/nutricao/prontuario/lib/documentosUtil";
import { formatarDataExame, lerExames, nomeArquivoPDFPedido, textoContagemExames } from "@/nutricao/prontuario/lib/examesUtil";

// PDF do PEDIDO de exames (jspdf, A4): cabeçalho PHYSIQ · PEDIDO DE EXAMES, paciente + data do pedido (+ CRN/telefone/
// endereço da nutricionista quando existirem — W15), lista NUMERADA dos exames (uma linha cada), observação, assinatura com o
// nome (+ CRN) e rodapé com páginas. Carregado em chunk separado (`pdf-*.js`). Mesmo desenho do PDF das fórmulas (W17).

export type PedidoPDF = { data: string; exames: unknown; observacao: string | null };
export type DadosPDFPedido = { paciente: string; pedido: PedidoPDF; nutricionista: string | null; profissional: DadosProfissionais | null; emitidoEm: Date };

const MARGEM = 20;
const LARGURA = 210 - MARGEM * 2;
const DIREITA = 210 - MARGEM;
const RODAPE = 285;
type Cor = [number, number, number];
type Estilo = "normal" | "bold" | "italic";

const fonte = (doc: jsPDF, tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20]) => {
  doc.setFont("helvetica", estilo);
  doc.setFontSize(tamanho);
  doc.setTextColor(...cor);
};

/** Desenha o pedido a partir do topo da página atual (cabeçalho, dados, lista numerada, observação, assinatura). */
export function desenharPedido(doc: jsPDF, d: DadosPDFPedido): void {
  let y = MARGEM;
  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 8) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const paragrafo = (texto: string, tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20], x = MARGEM, largura = LARGURA) => {
    fonte(doc, tamanho, estilo, cor);
    const linhas = doc.splitTextToSize(texto || "—", largura) as string[];
    const passo = tamanho * 0.5;
    for (const linha of linhas) {
      quebrar(passo);
      doc.text(linha, x, y);
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

  const p = d.pedido;
  const exames = lerExames(p.exames);

  // ---- Cabeçalho ----
  fonte(doc, 9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · PEDIDO DE EXAMES", MARGEM, y);
  fonte(doc, 9, "normal", [120, 120, 120]);
  doc.text(`Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}`, DIREITA, y, { align: "right" });
  y += 11;
  paragrafo("Pedido de exames laboratoriais", 18, "bold");
  y += 2;
  paragrafo(`Paciente: ${d.paciente}   ·   Data: ${formatarDataExame(p.data)}   ·   ${textoContagemExames(exames.length)}`, 9.5, "normal", [60, 60, 60]);
  const prof = d.profissional;
  const linhaProf = prof ? [prof.crn ? `CRN ${prof.crn}` : null, prof.telefone, prof.endereco].filter(Boolean).join("   ·   ") : "";
  if (linhaProf) paragrafo(linhaProf, 8.5, "normal", [110, 110, 110]);
  y += 3;
  separador();
  y += 9;

  // ---- Exames solicitados (lista numerada, uma linha cada) ----
  secao("EXAMES SOLICITADOS");
  if (!exames.length) {
    paragrafo("Nenhum exame informado.", 11, "italic", [140, 140, 140]);
  } else {
    exames.forEach((nome, i) => {
      quebrar(7);
      fonte(doc, 11, "bold", [90, 90, 90]);
      doc.text(`${i + 1}.`, MARGEM, y);
      paragrafo(nome, 11, "normal", [20, 20, 20], MARGEM + 9, LARGURA - 9);
      y += 1.5;
    });
  }
  y += 4;

  // ---- Observações ----
  if ((p.observacao ?? "").trim()) {
    secao("OBSERVAÇÕES");
    blocoTexto(p.observacao ?? "");
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

export function montarPDFPedido(d: DadosPDFPedido): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  desenharPedido(doc, d);
  rodape(doc, `${d.paciente} · Pedido de exames · ${formatarDataExame(d.pedido.data)}`);
  return doc;
}

/** Gera e baixa o PDF do pedido; devolve o nome (`pedido-exames-<paciente>-<yyyyMMdd>.pdf`, data = data do pedido). */
export function baixarPDFPedido(d: DadosPDFPedido): string {
  const nome = nomeArquivoPDFPedido(d.paciente, d.pedido.data);
  montarPDFPedido(d).save(nome);
  return nome;
}
