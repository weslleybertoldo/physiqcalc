// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/suplementosPdf.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo. W26: marca PHYSIQ no cabeçalho (N-60, como a W18/W19/W24).
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { DadosProfissionais } from "@/nutricao/editor/lib/profissional";
import { textoNascimento } from "@/nutricao/editor/lib/prontuarioUtil";
import { fmtData, nomeArquivoPDFSuplementos, rotuloCategoria, textoPosologia, type IndicacaoBase } from "@/nutricao/editor/lib/suplementosUtil";

// PDF da suplementação (jspdf, A4; modelo da W25): cabeçalho PHYSIQ · SUPLEMENTAÇÃO com paciente (+ nascimento),
// nutricionista (+ CRN) e "emitido em · N produtos"; lista NUMERADA só das indicações ATIVAS, na ordem da tela: 'N. Produto' em
// negrito + 'marca · apresentação · categoria' + 'Dose · horário · duração · desde dd/MM/yyyy' + observação em itálico; rodapé com
// página. Fonte padrão (Helvetica, Latin-1).

export type DadosPDFSuplementos = {
  paciente: string;
  /** `yyyy-MM-dd` ou null */
  nascimento: string | null;
  nutricionista: string | null;
  profissional: DadosProfissionais | null;
  emitidoEm: Date;
  /** só as ATIVAS, na ordem da tela */
  ativas: IndicacaoBase[];
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
/** Helvetica padrão é Latin-1: ≤/≥/– não existem lá. */
const latin = (s: string): string => s.replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/–/g, "-");

const contagem = (n: number): string => (n === 0 ? "nenhum produto" : n === 1 ? "1 produto" : `${n} produtos`);

export function montarPDFSuplementos(d: DadosPDFSuplementos): jsPDF {
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

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · SUPLEMENTAÇÃO", MARGEM, y);
  y += 7;
  paragrafo("Suplementação e produtos", 16, "bold");
  y += 1;
  const nascimento = textoNascimento(d.nascimento, d.emitidoEm);
  paragrafo(`Paciente: ${d.paciente}${nascimento ? `   ·   Nascimento: ${nascimento}` : ""}`, 10.5, "normal", CINZA);
  const crn = d.profissional?.crn ? `CRN ${d.profissional.crn}` : "";
  const nutri = d.nutricionista ? `Nutricionista: ${d.nutricionista}${crn ? ` · ${crn}` : ""}` : crn;
  if (nutri) paragrafo(nutri, 10.5, "normal", CINZA);
  paragrafo(`Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}   ·   ${contagem(d.ativas.length)}`, 10.5, "normal", CINZA);
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGEM, y, 210 - MARGEM, y);
  y += 4;

  // ---- Produtos indicados (só as ativas, numeradas) ----
  secao("Produtos indicados", `${d.ativas.length}`);
  if (!d.ativas.length) paragrafo("Nenhum produto ativo.", 10.5, "italic", APAGADO);
  d.ativas.forEach((i, k) => {
    quebrar(16);
    paragrafo(`${k + 1}. ${i.produto_nome}`, 11.5, "bold");
    const detalhe = [i.produto_marca, i.produto_apresentacao, rotuloCategoria(i.produto_categoria)].map((s) => (s ?? "").trim()).filter(Boolean).join(" · ");
    if (detalhe) paragrafo(detalhe, 9.5, "normal", CINZA_CLARO, 6);
    paragrafo(`Dose ${textoPosologia(i)} · desde ${fmtData(i.inicio)}`, 10, "normal", CINZA, 6);
    if (i.observacao) paragrafo(i.observacao, 9, "italic", CINZA_CLARO, 6);
    y += 2.5;
  });

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(latin(`${d.paciente} · Suplementação · ${format(d.emitidoEm, "dd/MM/yyyy")}`), MARGEM, RODAPE + 4);
    doc.text(`${p}/${paginas}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF; devolve o nome do arquivo (data = a da emissão). */
export function baixarPDFSuplementos(d: DadosPDFSuplementos): string {
  const nome = nomeArquivoPDFSuplementos(d.paciente, d.emitidoEm);
  montarPDFSuplementos(d).save(nome);
  return nome;
}
