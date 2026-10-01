// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/gestacionalPdf.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { DadosProfissionais } from "@/nutricao/prontuario/lib/documentosUtil";
import { fmtNum } from "@/nutricao/editor/lib/antropometriaUtil";
import { textoNascimento } from "@/nutricao/editor/lib/prontuarioUtil";
import {
  alertaPA, classificarIMCPre, dataLocalISO, faixaTotal, fmtData, fmtFaixa, fmtGanho, fmtPeso, nomeArquivoPDFGestacional, rotuloClassificacao, rotuloSituacao,
  semanaGestacional, textoPA, textoSemana, textoSemanaTrimestre, type GestacaoBase, type PontoGanho,
} from "@/nutricao/editor/lib/gestacionalUtil";

// PDF do acompanhamento gestacional (jspdf, A4): cabeçalho PHYSIQ · ACOMPANHAMENTO GESTACIONAL com paciente (+ nascimento),
// nutricionista (+ CRN) e "emitido em"; bloco 'Gestação' em pares rótulo/valor (DUM, DPP, semana, tipo, peso/altura/IMC pré,
// ganho recomendado, ganho atual e situação); tabela dos registros (semana · data · peso · ganho · faixa · situação · PA), da
// mais antiga pra mais recente, com a PA elevada em destaque; observação; rodapé com página. Fonte padrão (Helvetica, Latin-1).

export type DadosPDFGestacional = {
  paciente: string;
  /** `yyyy-MM-dd` ou null */
  nascimento: string | null;
  nutricionista: string | null;
  profissional: DadosProfissionais | null;
  emitidoEm: Date;
  gestacao: GestacaoBase & { dpp: string; altura: number; observacao: string | null; encerrada_em: string | null };
  /** da mais antiga pra mais recente (`serieGanho`) */
  serie: PontoGanho[];
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
const VERMELHO: Cor = [180, 40, 40];
/** Helvetica padrão é Latin-1: ≤/≥/– não existem lá. */
const latin = (s: string): string => s.replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/–/g, "-");

// colunas da tabela de registros (x em mm)
const COLUNAS: { titulo: string; x: number }[] = [
  { titulo: "SEMANA", x: MARGEM },
  { titulo: "DATA", x: MARGEM + 20 },
  { titulo: "PESO", x: MARGEM + 44 },
  { titulo: "GANHO", x: MARGEM + 64 },
  { titulo: "FAIXA", x: MARGEM + 86 },
  { titulo: "SITUAÇÃO", x: MARGEM + 116 },
  { titulo: "PA", x: MARGEM + 148 },
];

export function montarPDFGestacional(d: DadosPDFGestacional): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const g = d.gestacao;
  const c = classificarIMCPre(g.imc_pre);
  const total = faixaTotal(c, g.gemelar);
  const ultimo = d.serie.length ? d.serie[d.serie.length - 1] : null;
  const referencia = g.encerrada_em ? dataLocalISO(g.encerrada_em) : format(d.emitidoEm, "yyyy-MM-dd");
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
  /** pares rótulo/valor em 2 colunas */
  const pares = (lista: { rotulo: string; valor: string; destaque?: boolean }[]) => {
    for (let i = 0; i < lista.length; i += 2) {
      quebrar(10);
      for (let col = 0; col < 2; col += 1) {
        const par = lista[i + col];
        if (!par) continue;
        const x = MARGEM + col * (LARGURA / 2);
        fonte(8.5, "normal", CINZA_CLARO);
        doc.text(par.rotulo.toUpperCase(), x, y);
        fonte(11, "bold", par.destaque ? VERMELHO : PRETO);
        doc.text(latin(par.valor), x, y + 4.5);
      }
      y += 10;
    }
  };

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · ACOMPANHAMENTO GESTACIONAL", MARGEM, y);
  y += 7;
  paragrafo("Acompanhamento gestacional", 16, "bold");
  y += 1;
  const nascimento = textoNascimento(d.nascimento, d.emitidoEm);
  paragrafo(`Paciente: ${d.paciente}${nascimento ? `   ·   Nascimento: ${nascimento}` : ""}`, 10.5, "normal", CINZA);
  const crn = d.profissional?.crn ? `CRN ${d.profissional.crn}` : "";
  const nutri = d.nutricionista ? `Nutricionista: ${d.nutricionista}${crn ? ` · ${crn}` : ""}` : crn;
  if (nutri) paragrafo(nutri, 10.5, "normal", CINZA);
  paragrafo(
    `Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}   ·   ${d.serie.length === 0 ? "nenhum registro" : d.serie.length === 1 ? "1 registro" : `${d.serie.length} registros`}${g.encerrada_em ? `   ·   encerrado em ${fmtData(g.encerrada_em)}` : ""}`,
    10.5, "normal", CINZA,
  );
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGEM, y, 210 - MARGEM, y);
  y += 4;

  // ---- Gestação ----
  secao("Gestação", g.gemelar ? "gemelar" : "única");
  pares([
    { rotulo: "DUM", valor: fmtData(g.dum) },
    { rotulo: "DPP", valor: fmtData(g.dpp) },
    { rotulo: g.encerrada_em ? "Semana no encerramento" : "Semana atual", valor: textoSemanaTrimestre(semanaGestacional(g.dum, referencia)) },
    { rotulo: "IMC pré-gestacional", valor: `${fmtNum(g.imc_pre, 1)} — ${rotuloClassificacao(c)}` },
    { rotulo: "Peso pré-gestacional", valor: fmtPeso(g.peso_pre) },
    { rotulo: "Altura", valor: `${fmtNum(g.altura, 1)} cm` },
    { rotulo: "Ganho recomendado (total)", valor: fmtFaixa(total.faixa) },
    { rotulo: "Ganho atual", valor: ultimo ? `${fmtGanho(ultimo.ganho)} · ${rotuloSituacao(ultimo.situacao).toLowerCase()}` : "sem registro", destaque: !!ultimo && ultimo.situacao !== "dentro" },
  ]);
  if (total.aviso) paragrafo(total.aviso, 9.5, "italic", APAGADO);

  // ---- Registros ----
  secao("Registros", `${d.serie.length}`);
  if (!d.serie.length) paragrafo("Nenhum peso registrado.", 10.5, "italic", APAGADO);
  else {
    const cabecalho = () => {
      quebrar(8);
      fonte(8, "bold", CINZA_CLARO);
      for (const col of COLUNAS) doc.text(latin(col.titulo), col.x, y);
      y += 1.5;
      doc.setDrawColor(215, 215, 215);
      doc.line(MARGEM, y, 210 - MARGEM, y);
      y += 4.5;
    };
    cabecalho();
    for (const p of d.serie) {
      if (y + 6 > RODAPE - 6) {
        doc.addPage();
        y = MARGEM;
        cabecalho();
      }
      const fora = p.situacao !== "dentro";
      const paAlta = !!alertaPA(p.pa_sistolica, p.pa_diastolica);
      const celulas = [
        { t: textoSemana(p.semana), cor: PRETO, negrito: false },
        { t: fmtData(p.data), cor: PRETO, negrito: false },
        { t: fmtPeso(p.peso), cor: PRETO, negrito: false },
        { t: fmtGanho(p.ganho), cor: fora ? VERMELHO : PRETO, negrito: fora },
        { t: fmtFaixa(p.faixa), cor: CINZA, negrito: false },
        { t: rotuloSituacao(p.situacao), cor: fora ? VERMELHO : PRETO, negrito: fora },
        { t: textoPA(p.pa_sistolica, p.pa_diastolica), cor: paAlta ? VERMELHO : PRETO, negrito: paAlta },
      ];
      celulas.forEach((cel, i) => {
        fonte(9.5, cel.negrito ? "bold" : "normal", cel.cor);
        doc.text(latin(cel.t), COLUNAS[i].x, y);
      });
      y += 5.2;
      if (p.observacao) {
        fonte(8.5, "italic", CINZA_CLARO);
        const linhas = doc.splitTextToSize(latin(p.observacao), LARGURA - 20) as string[];
        for (const linha of linhas) {
          quebrar(4);
          doc.text(linha, MARGEM + 20, y);
          y += 3.8;
        }
        y += 0.8;
      }
    }
  }

  // ---- Observação da gestação ----
  if (g.observacao) {
    secao("Observação");
    paragrafo(g.observacao, 10.5, "normal");
  }

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(latin(`${d.paciente} · Acompanhamento gestacional · DUM ${fmtData(g.dum)}`), MARGEM, RODAPE + 4);
    doc.text(`${p}/${paginas}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF; devolve o nome do arquivo (data = a da emissão). */
export function baixarPDFGestacional(d: DadosPDFGestacional): string {
  const nome = nomeArquivoPDFGestacional(d.paciente, d.emitidoEm);
  montarPDFGestacional(d).save(nome);
  return nome;
}
