import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { format } from "date-fns";
import { fmtQtd } from "@/nutricao/editor/lib/alimentosUtil";
import type { Totais } from "@/nutricao/editor/lib/dietaUtil";
import { fmtKcal } from "@/nutricao/editor/lib/energeticoUtil";
import { blocosDoMarkdown, textoSemMarcas, trechosInline, type Bloco } from "@/nutricao/editor/lib/orientacoesUtil";
import type { DadosProfissionais } from "@/nutricao/editor/lib/profissional";
import {
  calcularReceita, descricaoQuantidadeIngrediente, macrosDoIngrediente, nomeArquivoPDFReceita, textoDadosReceita, type IngredienteCalc,
} from "@/nutricao/editor/lib/receitasUtil";

// Physiq W24 — porta do PhysiqNutri (src/lib/receitasPdf.ts) com a marca do Physiq (como a W18/W19).
// PDF da receita culinária (jspdf, A4; modelo das W26/W27): cabeçalho PHYSIQ · RECEITA com o nome, grupo, 'N porções ·
// rendimento N g · N min', nutricionista (+ CRN) e emissão; tabela Ingrediente · Quantidade (gramas + medida quando houver) · kcal
// (jspdf-autotable como a W18/W19); tabela 'Valor nutricional' por porção × receita inteira (kcal, P, C, L, fibra, sódio, peso);
// 'Modo de preparo' nos blocos do markdown simples da W10; observação; rodapé com página. Fonte padrão (Helvetica, Latin-1).

export type DadosPDFReceita = {
  nutricionista: string | null;
  profissional: DadosProfissionais | null;
  emitidoEm: Date;
  receita: {
    nome: string;
    grupo: string | null;
    porcoes: number;
    rendimento_g: number | null;
    tempo_preparo_min: number | null;
    modo_preparo: string;
    observacao: string;
    ingredientes: (IngredienteCalc & { observacao?: string | null })[];
  };
};

const MARGEM = 18;
const LARGURA = 210 - MARGEM * 2;
const RODAPE = 285;
type Cor = [number, number, number];
type Estilo = "normal" | "bold" | "italic";
const PRETO: Cor = [20, 20, 20];
const CINZA: Cor = [60, 60, 60];
const CINZA_CLARO: Cor = [90, 90, 90];
const APAGADO: Cor = [140, 140, 140];
const ESCURO: Cor = [40, 40, 40];
/** Helvetica padrão é Latin-1: ≤/≥/–/—/→/× não existem lá. */
const latin = (s: string): string => s.replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/[–—]/g, "-").replace(/→/g, "->").replace(/×/g, "x");

const g = (n: number | null | undefined): string => `${fmtQtd(n ?? 0)} g`;
const mg = (n: number | null | undefined): string => `${fmtQtd(n ?? 0)} mg`;

export function montarPDFReceita(d: DadosPDFReceita): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGEM;

  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 6) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const fonte = (tamanho: number, estilo: Estilo, cor: Cor = PRETO) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const paragrafo = (texto: string, tamanho: number, estilo: Estilo, cor: Cor = PRETO, recuo = 0) => {
    fonte(tamanho, estilo, cor);
    const linhas = doc.splitTextToSize(latin(texto) || "—", LARGURA - recuo) as string[];
    const passo = tamanho * 0.45;
    for (const linha of linhas) {
      quebrar(passo);
      doc.text(linha, MARGEM + recuo, y);
      y += passo;
    }
  };
  /** Texto com **negrito** inline, quebrando por palavra (modelo da W24). */
  const rico = (texto: string, tamanho: number, recuo = 0, cor: Cor = PRETO) => {
    const passo = tamanho * 0.45;
    const xIni = MARGEM + recuo;
    const xFim = MARGEM + LARGURA;
    const pecas: { t: string; negrito: boolean }[] = [];
    for (const tr of trechosInline(latin(texto))) {
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
        if (/^\s+$/.test(p.t)) continue;
      }
      doc.text(p.t, x, y);
      x += larg;
    }
    y += passo;
  };
  const bloco = (b: Bloco) => {
    if (b.tipo === "titulo") {
      y += 1.5;
      quebrar(11);
      paragrafo(textoSemMarcas(b.texto), 12, "bold");
      y += 0.8;
      return;
    }
    if (b.tipo === "subtitulo") {
      y += 1.2;
      quebrar(9);
      paragrafo(textoSemMarcas(b.texto).toUpperCase(), 9.5, "bold", CINZA_CLARO);
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
  const secao = (titulo: string, detalhe?: string) => {
    y += 2.5;
    quebrar(12);
    const rotulo = titulo.toUpperCase();
    fonte(9.5, "bold", CINZA_CLARO);
    doc.text(rotulo, MARGEM, y);
    if (detalhe) {
      const larg = doc.getTextWidth(rotulo);
      fonte(9.5, "normal", CINZA_CLARO);
      doc.text(latin(`· ${detalhe}`), MARGEM + larg + 2, y);
    }
    y += 1.5;
    doc.setDrawColor(215, 215, 215);
    doc.line(MARGEM, y, 210 - MARGEM, y);
    y += 5;
  };
  const tabela = (cabecalho: string[], linhas: string[][], larguras: number[], alinhamentos: ("left" | "right" | "center")[]) => {
    quebrar(20);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEM, right: MARGEM, top: MARGEM, bottom: 18 },
      head: [cabecalho.map(latin)],
      body: linhas.map((l) => l.map(latin)),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2, textColor: [30, 30, 30], lineColor: [205, 205, 205], lineWidth: 0.2, valign: "middle" },
      headStyles: { fillColor: ESCURO, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
      columnStyles: Object.fromEntries(larguras.map((w, k) => [k, { cellWidth: w, halign: alinhamentos[k] ?? "left" }])),
      didDrawPage: (data) => {
        if (data.cursor) y = data.cursor.y;
      },
    });
    y += 6;
  };

  const r = d.receita;
  const calc = calcularReceita({ porcoes: r.porcoes, rendimento_g: r.rendimento_g }, r.ingredientes);

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · RECEITA", MARGEM, y);
  y += 7;
  paragrafo(r.nome, 16, "bold");
  y += 1;
  paragrafo(`${r.grupo ? `Grupo: ${r.grupo}   ·   ` : ""}${textoDadosReceita(r)}`, 10.5, "normal", CINZA);
  const crn = d.profissional?.crn ? `CRN ${d.profissional.crn}` : "";
  const nutri = d.nutricionista ? `Nutricionista: ${d.nutricionista}${crn ? ` · ${crn}` : ""}` : crn;
  if (nutri) paragrafo(nutri, 10.5, "normal", CINZA);
  paragrafo(`Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}`, 10.5, "normal", CINZA);
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGEM, y, 210 - MARGEM, y);
  y += 4;

  // ---- Ingredientes ----
  secao("Ingredientes", `${r.ingredientes.length}`);
  if (!r.ingredientes.length) paragrafo("Nenhum ingrediente.", 10.5, "italic", APAGADO);
  else {
    tabela(
      ["Ingrediente", "Quantidade", "kcal"],
      r.ingredientes.map((i) => [
        `${i.alimento?.nome ?? "Alimento removido"}${i.observacao?.trim() ? ` — ${i.observacao.trim()}` : ""}`,
        descricaoQuantidadeIngrediente(i),
        fmtKcal(macrosDoIngrediente(i).energia_kcal ?? 0),
      ]),
      [96, 58, 20],
      ["left", "left", "right"],
    );
  }

  // ---- Valor nutricional ----
  secao("Valor nutricional", `por porção (${fmtQtd(calc.porcoes)}) × receita inteira`);
  const linhaNutri = (rotulo: string, f: (t: Totais) => string) => [rotulo, f(calc.porPorcao), f(calc.totais)];
  tabela(
    ["", `Por porção (${fmtQtd(calc.porcoes)})`, "Receita inteira"],
    [
      linhaNutri("Energia", (t) => `${fmtQtd(t.energia_kcal)} kcal`),
      linhaNutri("Proteínas", (t) => g(t.proteina_g)),
      linhaNutri("Carboidratos", (t) => g(t.carboidrato_g)),
      linhaNutri("Lipídios", (t) => g(t.lipidio_g)),
      linhaNutri("Fibras", (t) => g(t.fibra_g)),
      linhaNutri("Sódio", (t) => mg(t.sodio_mg)),
      ["Peso", g(calc.gramasPorcao), `${g(calc.peso)}${r.rendimento_g ? "" : " (soma dos ingredientes)"}`],
    ],
    [54, 60, 60],
    ["left", "right", "right"],
  );

  // ---- Modo de preparo ----
  secao("Modo de preparo", r.tempo_preparo_min !== null && r.tempo_preparo_min !== undefined ? `${r.tempo_preparo_min} min` : undefined);
  const blocos = blocosDoMarkdown(r.modo_preparo);
  if (!blocos.length) paragrafo("Sem modo de preparo.", 10.5, "italic", APAGADO);
  for (const b of blocos) bloco(b);

  // ---- Observação ----
  if (r.observacao.trim()) {
    secao("Observação");
    paragrafo(r.observacao.trim(), 10.5, "normal", CINZA);
  }

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(latin(`${r.nome} · Receita · ${format(d.emitidoEm, "dd/MM/yyyy")}`), MARGEM, RODAPE + 4);
    doc.text(`${p}/${paginas}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF; devolve o nome do arquivo ('<slug>-receita.pdf'). */
export function baixarPDFReceita(d: DadosPDFReceita): string {
  const nome = nomeArquivoPDFReceita(d.receita.nome);
  montarPDFReceita(d).save(nome);
  return nome;
}
