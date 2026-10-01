// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/energeticoPdf.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { rotuloSexo } from "@/nutricao/editor/lib/antropometriaUtil";
import {
  fmtAjuste, fmtKcal, fmtNum, gastoAtividade, gastoAtividades, lerAtividades, nomeArquivoPDF, rotuloFator, rotuloFormula, rotuloObjetivo,
} from "@/nutricao/editor/lib/energeticoUtil";

// PDF do cálculo energético (jspdf, A4): cabeçalho com paciente/data/nutricionista, dados usados, fórmula, atividades
// físicas (MET) em tabela, resultados (TMB, atividades, GET, ajuste, VET) e observações. Fonte padrão (Helvetica).

export type DadosPDFEnergetico = {
  paciente: string;
  nutricionista: string | null;
  data: Date;
  formula: string;
  peso: number | null;
  altura: number | null;
  idade: number | null;
  sexo: string | null;
  massa_magra: number | null;
  fator_atividade: number;
  atividades: unknown;
  tmb: number | null;
  get: number | null;
  ajuste_kcal: number;
  vet: number | null;
  objetivo: string;
  observacao: string | null;
};

const MARGEM = 18;
const LARGURA = 210 - MARGEM * 2;
const RODAPE = 285;
const COLUNA2 = MARGEM + LARGURA / 2;

export function montarPDFEnergetico(d: DadosPDFEnergetico): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGEM;

  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 6) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const fonte = (tamanho: number, estilo: "normal" | "bold" | "italic", cor: [number, number, number] = [20, 20, 20]) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const paragrafo = (texto: string, tamanho: number, estilo: "normal" | "bold" | "italic", cor: [number, number, number] = [20, 20, 20]) => {
    fonte(tamanho, estilo, cor);
    const linhas = doc.splitTextToSize(texto || "—", LARGURA) as string[];
    const passo = tamanho * 0.45;
    for (const linha of linhas) {
      quebrar(passo);
      doc.text(linha, MARGEM, y);
      y += passo;
    }
  };
  const titulo = (texto: string) => {
    quebrar(12);
    y += 2;
    fonte(9, "bold", [120, 120, 120]);
    doc.text(texto.toUpperCase(), MARGEM, y);
    y += 1.5;
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGEM, y, 210 - MARGEM, y);
    y += 5;
  };
  /** Pares rótulo/valor em duas colunas. */
  const tabelaDupla = (itens: [string, string][]) => {
    const passo = 5.2;
    for (let i = 0; i < itens.length; i += 2) {
      quebrar(passo);
      const par = [itens[i], itens[i + 1]];
      par.forEach((item, col) => {
        if (!item) return;
        const x = col === 0 ? MARGEM : COLUNA2;
        fonte(10, "normal", [90, 90, 90]);
        doc.text(item[0], x, y);
        fonte(10, "bold");
        doc.text(item[1], x + LARGURA / 2 - 4, y, { align: "right" });
      });
      y += passo;
    }
  };
  /** Tabela simples: cabeçalho + linhas; a 1ª coluna alinha à esquerda, as outras à direita. */
  const tabela = (cabecalho: string[], linhas: string[][], larguras: number[]) => {
    const passo = 5.2;
    const xs: number[] = [];
    let acc = MARGEM;
    for (const l of larguras) {
      xs.push(acc);
      acc += l;
    }
    const celula = (texto: string, col: number, negrito: boolean) => {
      fonte(9.5, negrito ? "bold" : "normal", negrito ? [90, 90, 90] : [20, 20, 20]);
      if (col === 0) doc.text(texto, xs[col], y);
      else doc.text(texto, xs[col] + larguras[col] - 2, y, { align: "right" });
    };
    quebrar(passo);
    cabecalho.forEach((c, i) => celula(c, i, true));
    y += passo;
    for (const linha of linhas) {
      quebrar(passo);
      linha.forEach((c, i) => celula(c, i, false));
      y += passo;
    }
  };

  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQNUTRI · CÁLCULO ENERGÉTICO", MARGEM, y);
  y += 7;
  paragrafo("Cálculo energético", 16, "bold");
  y += 1;
  paragrafo(`Paciente: ${d.paciente}`, 10.5, "normal", [60, 60, 60]);
  paragrafo(`Data: ${format(d.data, "dd/MM/yyyy HH:mm")}${d.nutricionista ? `   ·   Nutricionista: ${d.nutricionista}` : ""}`, 10.5, "normal", [60, 60, 60]);
  y += 2;

  titulo("Dados do cálculo");
  tabelaDupla([
    ["Fórmula", rotuloFormula(d.formula, false)],
    ["Objetivo", rotuloObjetivo(d.objetivo)],
    ["Peso", d.peso === null ? "—" : `${fmtNum(d.peso, 1)} kg`],
    ["Altura", d.altura === null ? "—" : `${fmtNum(d.altura, 1)} cm`],
    ["Idade", d.idade === null ? "—" : `${d.idade} anos`],
    ["Sexo", rotuloSexo(d.sexo)],
    ["Massa magra", d.massa_magra === null ? "—" : `${fmtNum(d.massa_magra, 1)} kg`],
    ["Fator de atividade", rotuloFator(d.fator_atividade)],
  ]);

  const ativ = lerAtividades(d.atividades);
  const extra = gastoAtividades(ativ, d.peso);
  if (ativ.length) {
    titulo("Atividades físicas (MET)");
    tabela(
      ["Atividade", "MET", "Min/dia", "kcal/dia"],
      ativ.map((a) => [a.descricao || "—", fmtNum(a.met, 1), String(a.minutos_por_dia), d.peso ? fmtKcal(gastoAtividade(a, d.peso)) : "—"]),
      [LARGURA - 78, 26, 26, 26],
    );
    y += 1;
  }

  titulo("Resultados (kcal/dia)");
  tabelaDupla([
    ["Taxa metabólica basal (TMB)", fmtKcal(d.tmb)],
    ["Gasto com atividades", extra === null ? "—" : `+${fmtKcal(extra)}`],
    ["Gasto energético total (GET)", fmtKcal(d.get)],
    ["Ajuste", fmtAjuste(d.ajuste_kcal)],
    ["Valor energético total (VET)", fmtKcal(d.vet)],
  ]);
  y += 1;
  paragrafo("GET = TMB × fator de atividade + gasto com atividades   ·   VET = GET + ajuste", 8.5, "italic", [120, 120, 120]);

  if (d.observacao?.trim()) {
    titulo("Observações");
    paragrafo(d.observacao.trim(), 10.5, "normal");
  }

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
export function baixarPDFEnergetico(d: DadosPDFEnergetico): string {
  const nome = nomeArquivoPDF(d.paciente, d.data);
  montarPDFEnergetico(d).save(nome);
  return nome;
}
