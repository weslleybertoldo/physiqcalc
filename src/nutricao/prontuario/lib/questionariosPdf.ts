// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/questionariosPdf.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { format } from "date-fns";
import type { DadosProfissionais } from "@/nutricao/prontuario/lib/documentosUtil";
import {
  contarRespondidas, formatarDataQuestionario, formatarPontos, lerNivel, lerPerguntas, lerRespostas, nomeArquivoPDFQuestionario, pontuacaoMaxima, pontuarPergunta, textoNivel,
  textoPontuacao, textoResposta, textoRespondidas,
} from "@/nutricao/prontuario/lib/questionariosUtil";

// PDF da aplicação de um questionário (jspdf + jspdf-autotable, A4): cabeçalho PHYSIQ · QUESTIONÁRIO DE SAÚDE, título do
// questionário, paciente + data + 'N/M respondidas' (+ CRN/telefone/endereço da nutricionista quando existirem — W15),
// RESULTADO ('22/40 pontos · Alta suspeita (alto)'), tabela Pergunta · Resposta · Pontos (uma linha por pergunta, na ordem),
// Observações, assinatura com o nome (+ CRN) e rodapé com páginas. Carregado em chunk separado (`pdf-*.js`).

export type AplicacaoPDF = { titulo: string; perguntas: unknown; faixas: unknown; respostas: unknown; pontuacao: number; faixa: string | null; nivel: string | null; data: string; observacao: string | null };
export type DadosPDFAplicacao = { paciente: string; nutricionista: string | null; profissional: DadosProfissionais | null; emitidoEm: Date; aplicacao: AplicacaoPDF };

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

/** Desenha a aplicação a partir do topo da página atual. */
export function desenharAplicacao(doc: jsPDF, d: DadosPDFAplicacao): void {
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

  const a = d.aplicacao;
  const perguntas = lerPerguntas(a.perguntas);
  const respostas = lerRespostas(a.respostas);
  const max = pontuacaoMaxima(perguntas);
  const nivel = lerNivel(a.nivel);

  // ---- Cabeçalho ----
  fonte(doc, 9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · QUESTIONÁRIO DE SAÚDE", MARGEM, y);
  fonte(doc, 9, "normal", [120, 120, 120]);
  doc.text(`Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}`, DIREITA, y, { align: "right" });
  y += 11;
  paragrafo(a.titulo || "Questionário de saúde", 18, "bold");
  y += 2;
  paragrafo(`Paciente: ${d.paciente}   ·   Data: ${formatarDataQuestionario(a.data)}   ·   ${textoRespondidas(contarRespondidas(perguntas, respostas), perguntas.length)}`, 9.5, "normal", [60, 60, 60]);
  const prof = d.profissional;
  const linhaProf = prof ? [prof.crn ? `CRN ${prof.crn}` : null, prof.telefone, prof.endereco].filter(Boolean).join("   ·   ") : "";
  if (linhaProf) paragrafo(linhaProf, 8.5, "normal", [110, 110, 110]);
  y += 3;
  separador();
  y += 9;

  // ---- Resultado ----
  secao("RESULTADO");
  const faixa = (a.faixa ?? "").trim();
  paragrafo(`${textoPontuacao(a.pontuacao, max)}${faixa ? `   ·   ${faixa} (${textoNivel(nivel).toLowerCase()})` : "   ·   sem faixa"}`, 12, "bold");
  y += 4;

  // ---- Respostas (tabela Pergunta · Resposta · Pontos) ----
  secao("RESPOSTAS");
  if (!perguntas.length) {
    paragrafo("Nenhuma pergunta.", 11, "italic", [140, 140, 140]);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEM, right: MARGEM, top: MARGEM, bottom: 18 },
      head: [["Pergunta", "Resposta", "Pontos"]],
      body: perguntas.map((p, i) => [`${i + 1}. ${p.texto}`, textoResposta(p, respostas[p.id]), formatarPontos(pontuarPergunta(p, respostas[p.id]))]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2, textColor: [30, 30, 30], lineColor: [205, 205, 205], lineWidth: 0.2, valign: "middle" },
      headStyles: { fillColor: ESCURO, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 104, halign: "left" }, 1: { cellWidth: 46, halign: "left" }, 2: { cellWidth: 20, halign: "center" } },
      didDrawPage: (data) => {
        if (data.cursor) y = data.cursor.y;
      },
    });
    y += 8;
  }

  // ---- Observações ----
  if ((a.observacao ?? "").trim()) {
    secao("OBSERVAÇÕES");
    blocoTexto(a.observacao ?? "");
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

export function montarPDFAplicacao(d: DadosPDFAplicacao): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  desenharAplicacao(doc, d);
  rodape(doc, `${d.paciente} · ${d.aplicacao.titulo} · ${formatarDataQuestionario(d.aplicacao.data)}`);
  return doc;
}

/** Gera e baixa o PDF; devolve o nome (`questionario-<paciente>-<questionário>-<yyyyMMdd>.pdf`, data = data da aplicação). */
export function baixarPDFAplicacao(d: DadosPDFAplicacao): string {
  const nome = nomeArquivoPDFQuestionario(d.paciente, d.aplicacao.titulo, d.aplicacao.data);
  montarPDFAplicacao(d).save(nome);
  return nome;
}
