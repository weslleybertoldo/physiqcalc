// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/farmacoPdf.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { DadosProfissionais } from "@/nutricao/prontuario/lib/documentosUtil";
import {
  agruparCongeladas, formatarDataHoraAnalise, nomeArquivoPDFFarmaco, rotuloGravidade, textoMedicamento, type InteracaoCongelada, type MedicamentoCongelado,
} from "@/nutricao/prontuario/lib/farmacoUtil";
import { blocosDoMarkdown, textoSemMarcas, trechosInline, type Bloco } from "@/nutricao/editor/lib/orientacoesUtil";
import { textoNascimento } from "@/nutricao/editor/lib/prontuarioUtil";

// PDF da análise fármaco-nutriente (jspdf, A4; modelo das W24/W26): cabeçalho PHYSIQ · FÁRMACO-NUTRIENTES com o título da
// análise, paciente (+ nascimento), nutricionista (+ CRN), 'análise de dd/MM/yyyy HH:mm · emitido em · N medicamentos · N
// interações'; bloco 'Medicamentos em uso' (numerado: nome em negrito + dose · posologia); bloco 'Interações' agrupado por
// medicamento (nutriente em negrito · gravidade — em VERMELHO quando alta — · efeito · conduta); bloco 'Parecer' nos blocos do
// markdown simples da W10; rodapé com página. Fonte padrão (Helvetica, Latin-1).

export type DadosPDFFarmaco = {
  paciente: string;
  /** `yyyy-MM-dd` ou null */
  nascimento: string | null;
  nutricionista: string | null;
  profissional: DadosProfissionais | null;
  emitidoEm: Date;
  analise: { titulo: string; data: string; medicamentos: MedicamentoCongelado[]; interacoes: InteracaoCongelada[]; parecer: string };
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
const VERMELHO: Cor = [180, 30, 30];
/** Helvetica padrão é Latin-1: ≤/≥/–/—/→ não existem lá. */
const latin = (s: string): string => s.replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/[–—]/g, "-").replace(/→/g, "->");

const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

export function montarPDFFarmaco(d: DadosPDFFarmaco): jsPDF {
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
        if (/^\s+$/.test(p.t)) continue; // espaço no começo da linha nova não conta
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

  const a = d.analise;

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · FÁRMACO-NUTRIENTES", MARGEM, y);
  y += 7;
  paragrafo(a.titulo, 16, "bold");
  y += 1;
  const nascimento = textoNascimento(d.nascimento, d.emitidoEm);
  paragrafo(`Paciente: ${d.paciente}${nascimento ? `   ·   Nascimento: ${nascimento}` : ""}`, 10.5, "normal", CINZA);
  const crn = d.profissional?.crn ? `CRN ${d.profissional.crn}` : "";
  const nutri = d.nutricionista ? `Nutricionista: ${d.nutricionista}${crn ? ` · ${crn}` : ""}` : crn;
  if (nutri) paragrafo(nutri, 10.5, "normal", CINZA);
  paragrafo(
    `Análise de ${formatarDataHoraAnalise(a.data)}   ·   Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}   ·   ${plural(a.medicamentos.length, "medicamento", "medicamentos")} · ${plural(a.interacoes.length, "interação", "interações")}`,
    10.5,
    "normal",
    CINZA,
  );
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGEM, y, 210 - MARGEM, y);
  y += 4;

  // ---- Medicamentos em uso (cópia congelada) ----
  secao("Medicamentos em uso", `${a.medicamentos.length}`);
  if (!a.medicamentos.length) paragrafo("Nenhum medicamento em uso na hora da análise.", 10.5, "italic", APAGADO);
  a.medicamentos.forEach((m, k) => {
    quebrar(12);
    paragrafo(`${k + 1}. ${m.medicamento}`, 11, "bold");
    const detalhe = [m.dose, m.posologia].map((s) => (s ?? "").trim()).filter(Boolean).join(" · ");
    if (detalhe) paragrafo(detalhe, 9.5, "normal", CINZA_CLARO, 6);
    y += 1.5;
  });

  // ---- Interações (agrupadas por medicamento) ----
  secao("Interações", `${a.interacoes.length}`);
  if (!a.interacoes.length) paragrafo("Nenhuma interação conhecida pros medicamentos em uso.", 10.5, "italic", APAGADO);
  else {
    for (const g of agruparCongeladas(a.medicamentos, a.interacoes)) {
      quebrar(14);
      paragrafo(textoMedicamento(g.medicamento), 11, "bold");
      if (!g.interacoes.length) paragrafo("sem interação conhecida na base", 9.5, "italic", APAGADO, 6);
      for (const i of g.interacoes) {
        quebrar(16);
        const alta = i.gravidade === "alta";
        fonte(10.5, "bold");
        doc.text(latin(i.nutriente), MARGEM + 6, y);
        const larg = doc.getTextWidth(latin(i.nutriente));
        fonte(9.5, alta ? "bold" : "normal", alta ? VERMELHO : CINZA_CLARO);
        doc.text(`· ${rotuloGravidade(i.gravidade)}${i.origem === "propria" ? " · minha" : ""}`, MARGEM + 6 + larg + 2, y);
        y += 10.5 * 0.45;
        paragrafo(`Efeito: ${i.efeito}`, 9.5, "normal", CINZA, 6);
        paragrafo(`Conduta: ${i.conduta}`, 9.5, "normal", PRETO, 6);
        y += 1.5;
      }
      y += 1.5;
    }
  }

  // ---- Parecer ----
  secao("Parecer");
  const blocos = blocosDoMarkdown(a.parecer);
  if (!blocos.length) paragrafo("Sem parecer.", 10.5, "italic", APAGADO);
  for (const b of blocos) bloco(b);

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(latin(`${d.paciente} · Fármaco-nutrientes · ${formatarDataHoraAnalise(a.data)}`), MARGEM, RODAPE + 4);
    doc.text(`${p}/${paginas}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF; devolve o nome do arquivo (data = a da emissão). */
export function baixarPDFFarmaco(d: DadosPDFFarmaco): string {
  const nome = nomeArquivoPDFFarmaco(d.paciente, d.emitidoEm);
  montarPDFFarmaco(d).save(nome);
  return nome;
}
