// Physiq W6 — PDFs da cobrança do aluno (C80 "Comprovante"; N-59 recibo): gerados no aparelho com o jsPDF (carregado sob
// demanda), com a marca Physiq. O comprovante é o do Calc (valor, situação, forma, datas e os dados reais do Mercado Pago
// quando houver); o recibo é o do Nutri (número, valor por extenso, o texto final gravado, assinatura).
import type { jsPDF as JsPdf } from "jspdf";
import { salvarPdf } from "@/lib/salvarPdf";
import { dataBR, dataHoraBR, nomeDoMes, reais, rotuloDaForma, situacaoDaCobranca, CHIP_COBRANCA } from "./regras";
import { formatarDataRecibo, formatarNumeroRecibo, nomeArquivoPDFRecibo, valorPorExtenso } from "./recibos";
import type { CobrancaVista } from "./tipos";

type Cor = [number, number, number];
const VIOLETA: Cor = [139, 92, 246];
const TEXTO: Cor = [24, 24, 27];
const CINZA: Cor = [113, 113, 122];
const LINHA: Cor = [228, 228, 231];

export interface DetalheMp {
  date_approved?: string | null;
  payer_nome?: string | null;
  payer_email?: string | null;
  banco_pagador?: string | null;
  card_last4?: string | null;
  e2e_id?: string | null;
  mp_payment_id?: string | null;
  status_detail?: string | null;
}

async function novoDoc(): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "mm", format: "a4" });
}

/** "Comprovante de pagamento" de uma cobrança do aluno (o do Calc, com a marca Physiq). */
export async function baixarComprovantePdf(c: CobrancaVista, extra: { aluno: string; profissional: string | null; mp?: DetalheMp | null }): Promise<string> {
  const doc = await novoDoc();
  const W = doc.internal.pageSize.getWidth();
  const centro = (t: string, y: number) => doc.text(t, (W - doc.getTextWidth(t)) / 2, y);
  doc.setFillColor(...VIOLETA);
  doc.rect(0, 0, W, 3, "F");
  let y = 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...VIOLETA);
  centro("PHYSIQ", y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...CINZA);
  centro("COMPROVANTE DE PAGAMENTO", y);
  y += 12;
  doc.setDrawColor(...LINHA);
  doc.line(20, y, W - 20, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...TEXTO);
  centro(reais(c.valor), y);
  y += 9;
  const situacao = CHIP_COBRANCA[situacaoDaCobranca(c)].texto;
  doc.setFontSize(11);
  doc.setTextColor(...(c.status === "paga" ? VIOLETA : CINZA));
  centro(situacao, y);
  y += 14;
  const linhas: [string, string][] = [
    ["Referente a", c.tipo === "mensalidade" ? `Mensalidade · ${nomeDoMes(c.mes_ref ?? c.vencimento, "0000")}` : c.descricao],
    ["Aluno", extra.aluno],
  ];
  if (extra.profissional) linhas.push(["Profissional", extra.profissional]);
  linhas.push(["Forma de pagamento", rotuloDaForma(c) || "—"]);
  if (c.enviado_em) linhas.push(["Comprovante enviado em", dataHoraBR(c.enviado_em)]);
  if (c.pago_em) linhas.push(["Pago em", dataHoraBR(extra.mp?.date_approved ?? c.pago_em)]);
  if (c.cobre_ate) linhas.push(["Cobre até", dataBR(c.cobre_ate, false)]);
  if (extra.mp?.payer_nome) linhas.push(["Pagador", extra.mp.payer_nome]);
  else if (extra.mp?.payer_email) linhas.push(["Pagador", extra.mp.payer_email]);
  if (extra.mp?.banco_pagador) linhas.push(["Banco do pagador", extra.mp.banco_pagador]);
  if (extra.mp?.card_last4) linhas.push(["Cartão", `final ${extra.mp.card_last4}`]);
  if (extra.mp?.mp_payment_id) linhas.push(["ID da transação (Mercado Pago)", String(extra.mp.mp_payment_id)]);
  if (extra.mp?.e2e_id) linhas.push(["E2E ID (Pix)", extra.mp.e2e_id]);
  if (c.recusado_motivo && c.recusado_em) linhas.push(["Motivo da recusa", c.recusado_motivo]);
  if (c.reembolsado_em) linhas.push(["Estornado em", dataBR(c.reembolsado_em, false)]);
  doc.setFontSize(10);
  for (const [k, v] of linhas) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...CINZA);
    doc.text(k.toUpperCase(), 24, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXTO);
    doc.text(String(v), W - 24, y, { align: "right", maxWidth: W - 110 });
    y += 6;
    doc.setDrawColor(...LINHA);
    doc.line(24, y, W - 24, y);
    y += 7;
  }
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(...CINZA);
  const origem = c.forma === "manual" ? "Pagamento registrado pelo profissional" : c.forma === "pix_manual" ? "Pix na chave do profissional, confirmado por ele" : "Pagamento processado pelo Mercado Pago";
  doc.text(`Emitido em ${dataHoraBR(new Date().toISOString())} · ${origem}`, W / 2, y, { align: "center" });
  const nome = `comprovante-physiq-${(c.mes_ref ?? c.vencimento).slice(0, 7)}.pdf`;
  await salvarPdf(doc, nome);
  return nome;
}

export interface DadosPdfRecibo {
  numero: number;
  valor: number;
  data: string;
  descricao: string;
  texto: string;
  aluno: string;
  profissional: string | null;
  emitidoEm: Date;
}

/** Recibo em PDF (o do Nutri: número, valor em destaque e por extenso, o texto gravado e a assinatura). */
export async function baixarReciboPdf(d: DadosPdfRecibo): Promise<string> {
  const doc = await novoDoc();
  const MARGEM = 20;
  const LARGURA = 210 - MARGEM * 2;
  const DIREITA = 210 - MARGEM;
  const RODAPE = 285;
  let y = MARGEM;
  const fonte = (t: number, e: "normal" | "bold" | "italic", cor: Cor = TEXTO) => {
    doc.setFont("helvetica", e);
    doc.setFontSize(t);
    doc.setTextColor(...cor);
  };
  const quebrar = (h: number) => {
    if (y + h > RODAPE - 8) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const paragrafo = (texto: string, t: number, e: "normal" | "bold" | "italic", cor: Cor = TEXTO) => {
    fonte(t, e, cor);
    for (const linha of doc.splitTextToSize(texto || "—", LARGURA) as string[]) {
      quebrar(t * 0.5);
      doc.text(linha, MARGEM, y);
      y += t * 0.5;
    }
  };
  fonte(9, "bold", CINZA);
  doc.text("PHYSIQ · RECIBO", MARGEM, y);
  fonte(9, "normal", CINZA);
  doc.text(`Emitido em ${dataHoraBR(d.emitidoEm.toISOString())}`, DIREITA, y, { align: "right" });
  y += 11;
  fonte(20, "bold");
  doc.text(`RECIBO Nº ${formatarNumeroRecibo(d.numero)}`, MARGEM, y);
  fonte(16, "bold");
  const valor = reais(d.valor);
  const larg = doc.getTextWidth(valor) + 10;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.5);
  doc.rect(DIREITA - larg, y - 9.5, larg, 13);
  doc.text(valor, DIREITA - 5, y, { align: "right" });
  y += 8;
  paragrafo(`(${valorPorExtenso(d.valor)})`, 9.5, "italic", CINZA);
  y += 2;
  paragrafo(`Referente a: ${d.descricao}   ·   Data: ${formatarDataRecibo(d.data)}   ·   Aluno: ${d.aluno}`, 9.5, "normal", CINZA);
  y += 3;
  doc.setDrawColor(...LINHA);
  doc.line(MARGEM, y, DIREITA, y);
  y += 9;
  for (const l of (d.texto ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const t = l.trim();
    if (!t) {
      y += 3;
      continue;
    }
    paragrafo(t, 11.5, "normal");
    y += 1;
  }
  y += 16;
  quebrar(26);
  const xIni = DIREITA - 80;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.4);
  doc.line(xIni, y, DIREITA, y);
  y += 5;
  fonte(10, "bold");
  doc.text((d.profissional ?? "").trim() || "Assinatura", (xIni + DIREITA) / 2, y, { align: "center" });
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", CINZA);
    doc.text(`${d.aluno} · Recibo nº ${formatarNumeroRecibo(d.numero)} · ${formatarDataRecibo(d.data)}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, DIREITA, RODAPE + 4, { align: "right" });
  }
  const nome = nomeArquivoPDFRecibo(d.numero, d.aluno);
  await salvarPdf(doc, nome);
  return nome;
}
