// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/orientacaoPdf.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { blocosDoMarkdown, nomeArquivoPDF, textoSemMarcas, trechosInline, type Bloco } from "@/nutricao/editor/lib/orientacoesUtil";

// PDF das orientações nutricionais (jspdf, A4): cabeçalho com título/paciente/data/nutricionista e o conteúdo em
// blocos — títulos e subtítulos em negrito, listas com marcador, parágrafos com quebra de linha e `**negrito**`
// inline montado palavra a palavra. Fonte padrão (Helvetica, Latin-1). Carregado em chunk separado (`pdf-*.js`).

export type DadosPDFOrientacao = {
  titulo: string;
  data: Date;
  paciente: string;
  nutricionista: string | null;
  conteudo: string;
};

const MARGEM = 18;
const LARGURA = 210 - MARGEM * 2;
const RODAPE = 285;
type Cor = [number, number, number];
type Estilo = "normal" | "bold" | "italic";

export function montarPDFOrientacao(d: DadosPDFOrientacao): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGEM;

  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 6) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const fonte = (tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20]) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const paragrafo = (texto: string, tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20], recuo = 0) => {
    fonte(tamanho, estilo, cor);
    const linhas = doc.splitTextToSize(texto || "—", LARGURA - recuo) as string[];
    const passo = tamanho * 0.45;
    for (const linha of linhas) {
      quebrar(passo);
      doc.text(linha, MARGEM + recuo, y);
      y += passo;
    }
  };
  /** Texto corrido com `**negrito**`: monta palavra a palavra e quebra a linha quando não cabe. */
  const rico = (texto: string, tamanho: number, recuo = 0, cor: Cor = [20, 20, 20]) => {
    const passo = tamanho * 0.45;
    const xIni = MARGEM + recuo;
    const xFim = MARGEM + LARGURA;
    const pecas: { t: string; negrito: boolean }[] = [];
    for (const tr of trechosInline(texto)) {
      for (const p of tr.texto.split(/(\s+)/)) if (p) pecas.push({ t: p, negrito: tr.negrito });
    }
    if (!pecas.length) return;
    quebrar(passo);
    let x = xIni;
    for (const p of pecas) {
      fonte(tamanho, p.negrito ? "bold" : "normal", cor);
      const larg = doc.getTextWidth(p.t);
      if (x > xIni && x + larg > xFim) {
        y += passo;
        quebrar(passo);
        x = xIni;
        if (/^\s+$/.test(p.t)) continue; // espaço no começo da linha nova não conta
      }
      doc.text(p.t, x, y);
      x += larg;
    }
    y += passo;
  };
  const bloco = (b: Bloco) => {
    if (b.tipo === "titulo") {
      y += 2;
      quebrar(12);
      paragrafo(textoSemMarcas(b.texto), 13, "bold");
      y += 1;
      return;
    }
    if (b.tipo === "subtitulo") {
      y += 1.5;
      quebrar(10);
      paragrafo(textoSemMarcas(b.texto).toUpperCase(), 9.5, "bold", [90, 90, 90]);
      y += 0.5;
      return;
    }
    if (b.tipo === "lista") {
      for (const item of b.itens) {
        quebrar(6);
        fonte(10.5, "normal");
        doc.text("•", MARGEM + 1.5, y);
        rico(item, 10.5, 6);
        y += 0.8;
      }
      y += 1.2;
      return;
    }
    rico(b.texto, 10.5);
    y += 2;
  };

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQNUTRI · ORIENTAÇÕES NUTRICIONAIS", MARGEM, y);
  y += 7;
  paragrafo(d.titulo, 16, "bold");
  y += 1;
  paragrafo(`Paciente: ${d.paciente}`, 10.5, "normal", [60, 60, 60]);
  paragrafo(`Data: ${format(d.data, "dd/MM/yyyy")}${d.nutricionista ? `   ·   Nutricionista: ${d.nutricionista}` : ""}`, 10.5, "normal", [60, 60, 60]);
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGEM, y, 210 - MARGEM, y);
  y += 6;

  // ---- Conteúdo ----
  const blocos = blocosDoMarkdown(d.conteudo);
  if (!blocos.length) paragrafo("Sem conteúdo.", 10.5, "italic", [140, 140, 140]);
  for (const b of blocos) bloco(b);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(`${d.paciente} · ${format(d.data, "dd/MM/yyyy")}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF; devolve o nome do arquivo. */
export function baixarPDFOrientacao(d: DadosPDFOrientacao): string {
  const nome = nomeArquivoPDF(d.paciente, d.data);
  montarPDFOrientacao(d).save(nome);
  return nome;
}
