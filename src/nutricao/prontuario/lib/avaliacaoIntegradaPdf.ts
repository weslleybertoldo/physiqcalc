// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/avaliacaoIntegradaPdf.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { DadosProfissionais } from "@/nutricao/prontuario/lib/documentosUtil";
import { textoSituacaoCurto } from "@/nutricao/prontuario/lib/examesUtil";
import { blocosDoMarkdown, textoSemMarcas, trechosInline, type Bloco } from "@/nutricao/editor/lib/orientacoesUtil";
import { textoNascimento } from "@/nutricao/editor/lib/prontuarioUtil";
import { formatarPontos, textoNivel } from "@/nutricao/prontuario/lib/questionariosUtil";
import { alertas, fmtDataFonte, formatarDataHoraAvaliacao, nomeArquivoPDFAvaliacao, paresAntropometria, type Sintese } from "@/nutricao/prontuario/lib/avaliacaoIntegradaUtil";

// PDF da avaliação integrada (jspdf, A4): cabeçalho PHYSIQ · AVALIAÇÃO INTEGRADA com título, paciente (+ nascimento/idade),
// data da avaliação, nutricionista (+ CRN) e "emitido em"; uma seção por bloco PRESENTE da síntese congelada (Anamnese: pergunta
// em negrito + resposta; Antropometria: pares rótulo/valor em 2 colunas; Exames: 'exame · valor unidade · ref · situação' com
// fora da referência em destaque; Questionários: 'título · N/M pontos · faixa (nível)'), 'Pontos de atenção' e o 'Parecer'
// nos blocos do markdown da W10 — mesmo desenho do PDF do prontuário (W11). Fonte padrão (Helvetica, Latin-1).

export type DadosPDFAvaliacao = {
  paciente: string;
  /** `yyyy-MM-dd` ou null */
  nascimento: string | null;
  nutricionista: string | null;
  profissional: DadosProfissionais | null;
  emitidoEm: Date;
  avaliacao: { titulo: string; data: string; sintese: Sintese; texto: string | null };
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
/** Helvetica padrão é Latin-1: ≤/≥ não existem lá. */
const latin = (s: string): string => s.replace(/≤/g, "<=").replace(/≥/g, ">=");

export function montarPDFAvaliacao(d: DadosPDFAvaliacao): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const s = d.avaliacao.sintese;
  const al = alertas(s);
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
  /** Texto corrido com `**negrito**`: monta palavra a palavra e quebra a linha quando não cabe (igual aos PDFs da W10/W11). */
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
  /** Título de seção (cinza, caixa alta) com um detalhe opcional ao lado (data/título da fonte). */
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
  const marcador = (texto: string, estilo: Estilo, cor: Cor) => {
    quebrar(6);
    fonte(10.5, estilo, cor);
    doc.text("•", MARGEM + 1.5, y);
    paragrafo(texto, 10.5, estilo, cor, 6);
    y += 0.8;
  };

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · AVALIAÇÃO INTEGRADA", MARGEM, y);
  y += 7;
  paragrafo(d.avaliacao.titulo, 16, "bold");
  y += 1;
  const nascimento = textoNascimento(d.nascimento, d.emitidoEm);
  paragrafo(`Paciente: ${d.paciente}${nascimento ? `   ·   Nascimento: ${nascimento}` : ""}`, 10.5, "normal", CINZA);
  const crn = d.profissional?.crn ? `CRN ${d.profissional.crn}` : "";
  const nutri = d.nutricionista ? `Nutricionista: ${d.nutricionista}${crn ? ` · ${crn}` : ""}` : crn;
  paragrafo(`Avaliação de ${formatarDataHoraAvaliacao(d.avaliacao.data)}${nutri ? `   ·   ${nutri}` : ""}`, 10.5, "normal", CINZA);
  const nFontes = [s.anamnese, s.antropometria, s.exames, s.questionarios.length ? s.questionarios : null].filter(Boolean).length;
  paragrafo(
    `Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}   ·   ${nFontes === 1 ? "1 fonte" : `${nFontes} fontes`} na síntese   ·   ${al.length === 0 ? "nenhum ponto de atenção" : al.length === 1 ? "1 ponto de atenção" : `${al.length} pontos de atenção`}`,
    10.5, "normal", CINZA,
  );
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGEM, y, 210 - MARGEM, y);
  y += 4;

  // ---- Anamnese ----
  if (s.anamnese) {
    secao("Anamnese", `"${s.anamnese.titulo}" · ${fmtDataFonte(s.anamnese.data, "dd/MM/yyyy HH:mm")}`);
    if (!s.anamnese.itens.length && !s.anamnese.texto_livre) paragrafo("Sem respostas registradas.", 10.5, "italic", APAGADO);
    for (const item of s.anamnese.itens) {
      quebrar(10);
      paragrafo(item.pergunta, 10, "bold");
      paragrafo(item.resposta, 10.5, "normal", CINZA, 4);
      y += 1;
    }
    if (s.anamnese.texto_livre) {
      quebrar(10);
      paragrafo("Texto livre", 10, "bold");
      paragrafo(s.anamnese.texto_livre, 10.5, "normal", CINZA, 4);
      y += 1;
    }
  }

  // ---- Antropometria (pares em 2 colunas) ----
  if (s.antropometria) {
    secao("Antropometria", fmtDataFonte(s.antropometria.data, "dd/MM/yyyy HH:mm"));
    const pares = paresAntropometria(s.antropometria);
    if (!pares.length) paragrafo("Sem medidas registradas.", 10.5, "italic", APAGADO);
    for (let i = 0; i < pares.length; i += 2) {
      quebrar(10);
      for (let col = 0; col < 2; col += 1) {
        const par = pares[i + col];
        if (!par) continue;
        const x = MARGEM + col * (LARGURA / 2);
        fonte(8.5, "normal", CINZA_CLARO);
        doc.text(par.rotulo.toUpperCase(), x, y);
        fonte(11, "bold");
        doc.text(latin(par.valor), x, y + 4.5);
      }
      y += 10;
    }
  }

  // ---- Exames ----
  if (s.exames) {
    secao("Exames", fmtDataFonte(s.exames.data));
    if (!s.exames.itens.length) paragrafo("Sem resultados nesta data.", 10.5, "italic", APAGADO);
    for (const item of s.exames.itens) {
      const fora = item.situacao === "abaixo" || item.situacao === "acima";
      const linha = `${item.exame} · ${item.valor}${item.unidade ? ` ${item.unidade}` : ""} · ref. ${item.referencia} · ${textoSituacaoCurto(item.situacao)}`;
      paragrafo(linha, 10.5, fora ? "bold" : "normal", fora ? VERMELHO : PRETO);
      y += 0.6;
    }
  }

  // ---- Questionários ----
  if (s.questionarios.length) {
    secao("Questionários");
    for (const q of s.questionarios) {
      const alto = q.nivel === "alto";
      const nivel = textoNivel(q.nivel);
      const faixa = q.faixa && q.faixa.toLowerCase() !== nivel.toLowerCase() ? `${q.faixa} (${nivel})` : nivel;
      paragrafo(`${q.titulo} · ${formatarPontos(q.pontuacao)}/${formatarPontos(q.maximo)} pontos · ${faixa} · ${fmtDataFonte(q.data)}`, 10.5, alto ? "bold" : "normal", alto ? VERMELHO : PRETO);
      y += 0.6;
    }
  }

  // ---- Pontos de atenção ----
  secao("Pontos de atenção");
  if (!al.length) paragrafo("Nenhum ponto de atenção automático.", 10.5, "italic", APAGADO);
  for (const a of al) marcador(a.texto, a.nivel === "alto" ? "bold" : "normal", a.nivel === "alto" ? VERMELHO : PRETO);

  // ---- Parecer ----
  secao("Parecer");
  const blocos = blocosDoMarkdown(d.avaliacao.texto);
  if (!blocos.length) paragrafo("Sem parecer.", 10.5, "italic", APAGADO);
  for (const b of blocos) bloco(b);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(`${d.paciente} · Avaliação integrada · ${formatarDataHoraAvaliacao(d.avaliacao.data)}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF da avaliação; devolve o nome do arquivo (data = a da avaliação). */
export function baixarPDFAvaliacao(d: DadosPDFAvaliacao): string {
  const nome = nomeArquivoPDFAvaliacao(d.paciente, new Date(d.avaliacao.data));
  montarPDFAvaliacao(d).save(nome);
  return nome;
}
