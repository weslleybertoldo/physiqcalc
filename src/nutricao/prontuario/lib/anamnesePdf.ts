// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/anamnesePdf.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { nomeArquivoPDF, type ItemAnamnese } from "@/nutricao/prontuario/lib/anamneseUtil";

// PDF da anamnese (jspdf, A4): cabeçalho com paciente/data/nutricionista, perguntas em negrito com as respostas
// embaixo e o texto livre no fim. Fonte padrão (Helvetica, Latin-1) — cobre os acentos do português.

export type DadosPDFAnamnese = {
  titulo: string;
  data: Date;
  paciente: string;
  nutricionista: string | null;
  conteudo: ItemAnamnese[];
  textoLivre: string | null;
};

const MARGEM = 18;
const LARGURA = 210 - MARGEM * 2;
const RODAPE = 285;

export function montarPDFAnamnese(d: DadosPDFAnamnese): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGEM;

  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 6) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const paragrafo = (texto: string, tamanho: number, estilo: "normal" | "bold" | "italic", cor: [number, number, number] = [20, 20, 20]) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
    const linhas = doc.splitTextToSize(texto || "—", LARGURA) as string[];
    const passo = tamanho * 0.45;
    for (const linha of linhas) {
      quebrar(passo);
      doc.text(linha, MARGEM, y);
      y += passo;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("PHYSIQ · ANAMNESE", MARGEM, y);
  y += 7;
  paragrafo(d.titulo, 16, "bold");
  y += 1;
  paragrafo(`Paciente: ${d.paciente}`, 10.5, "normal", [60, 60, 60]);
  paragrafo(`Data: ${format(d.data, "dd/MM/yyyy HH:mm")}${d.nutricionista ? `   ·   Nutricionista: ${d.nutricionista}` : ""}`, 10.5, "normal", [60, 60, 60]);
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGEM, y, 210 - MARGEM, y);
  y += 6;

  d.conteudo.forEach((item, i) => {
    quebrar(14);
    paragrafo(`${i + 1}. ${item.pergunta}`, 11, "bold");
    paragrafo(item.resposta.trim() || "—", 10.5, item.resposta.trim() ? "normal" : "italic", item.resposta.trim() ? [20, 20, 20] : [140, 140, 140]);
    y += 3;
  });

  if (d.textoLivre?.trim()) {
    quebrar(14);
    paragrafo(d.conteudo.length ? "Texto livre / observações" : "Texto livre", 11, "bold");
    paragrafo(d.textoLivre.trim(), 10.5, "normal");
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`${d.paciente} · ${format(d.data, "dd/MM/yyyy")}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF; devolve o nome do arquivo. */
export function baixarPDFAnamnese(d: DadosPDFAnamnese): string {
  const nome = nomeArquivoPDF(d.paciente, d.data);
  montarPDFAnamnese(d).save(nome);
  return nome;
}
