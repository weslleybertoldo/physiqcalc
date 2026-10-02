// Physiq W26 — o PDF do Comparativo da Calculadora (C63). É o `gerarPDF` do src/components/ComparativoTab.tsx de hoje, MOVIDO sem
// mudar o desenho (o componente sai nesta worktree): mesmo cabeçalho PHYSIQ, mesmas seções, cards, cores e rodapé — o arquivo sai igual.
import jsPDF from "jspdf";
import {
  TEMA, corDelta, desenharCabecalho, desenharCard, desenharRodape, desenharTituloSecao, limparTexto, novaPagina, textoDelta,
} from "@/utils/gerarRelatorio";
import { calcularTMBKatch, calcularTMBMifflin, classificarGordura } from "@/utils/composicaoCorporal";
import { agoraFormatado } from "@/utils/formatDate";
import { MEDIDAS_CONFIG, type DadosComuns, type NovoData, type RefData } from "./comparativo";

/** Monta o PDF (sem baixar) — o teste confere o texto; a tela chama `baixarPdfComparativo`. */
export function montarPdfComparativo(refD: RefData, novo: NovoData, dados: DadosComuns): { doc: jsPDF; nomeArquivo: string } {
  const { sexo, idade, altura } = dados;
  const idadeN = (idade as number) || 25;
  const alturaN = (altura as number) || 170;
  const refPeso = (refD.peso as number) || 0;
  const novoPeso = (novo.peso as number) || 0;
  const refPct = (refD.pctGordura as number) || 0;
  const novoPct = (novo.pctGordura as number) || 0;

  const refMg = refPeso * refPct / 100;
  const refMm = refPeso - refMg;
  const novoMg = novoPeso * novoPct / 100;
  const novoMm = novoPeso - novoMg;
  const refCls = classificarGordura(refPct, sexo, idadeN);
  const novoCls = classificarGordura(novoPct, sexo, idadeN);
  const refTmbM = calcularTMBMifflin(refPeso, alturaN, idadeN, sexo);
  const novoTmbM = calcularTMBMifflin(novoPeso, alturaN, idadeN, sexo);
  const refTmbK = calcularTMBKatch(refMm);
  const novoTmbK = calcularTMBKatch(novoMm);

  const medidasAtivas = MEDIDAS_CONFIG.filter(m =>
    (refD.medidas[m.key] !== '' && refD.medidas[m.key] !== 0) ||
    (novo.medidas[m.key] !== '' && novo.medidas[m.key] !== 0)
  );

  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const nome = limparTexto(refD.nome.trim() || 'Aluno');

  let y = desenharCabecalho(
    doc,
    'Comparativo',
    `${nome} - ${sexo === 'M' ? 'Masculino' : 'Feminino'}, ${idadeN} anos, ${alturaN} cm - ${agoraFormatado({ incluirHora: false })}`
  );

  y = desenharTituloSecao(doc, 'Composicao Corporal', y);

  const compRows = [
    { lbl: 'Peso', r: `${refPeso.toFixed(1)} kg`, n: `${novoPeso.toFixed(1)} kg`, d: novoPeso - refPeso, inv: false },
    { lbl: '% Gordura', r: `${refPct.toFixed(1)}%`, n: `${novoPct.toFixed(1)}%`, d: novoPct - refPct, inv: true },
    { lbl: 'Massa Gorda', r: `${refMg.toFixed(1)} kg`, n: `${novoMg.toFixed(1)} kg`, d: novoMg - refMg, inv: true },
    { lbl: 'Massa Magra', r: `${refMm.toFixed(1)} kg`, n: `${novoMm.toFixed(1)} kg`, d: novoMm - refMm, inv: false },
    { lbl: 'TMB Mifflin', r: `${refTmbM} kcal`, n: `${novoTmbM} kcal`, d: novoTmbM - refTmbM, inv: false },
    { lbl: 'TMB Katch', r: `${refTmbK} kcal`, n: `${novoTmbK} kcal`, d: novoTmbK - refTmbK, inv: false },
  ];

  const hW = (W - 28 - 8) / 3;
  for (const row of compRows) {
    if (y > 260) { y = novaPagina(doc); }
    const cor = corDelta(row.d, row.inv);
    desenharCard(doc, row.lbl, `${row.r} -> ${row.n}`, 14, y, W - 28 - hW - 4, 16);
    desenharCard(doc, 'Variacao', textoDelta(row.d), 14 + W - 28 - hW, y, hW, 16, cor);
    y += 20;
  }

  desenharCard(doc, 'Classificacao Anterior', limparTexto(refCls.label), 14, y, (W - 28 - 4) / 2, 16, refCls.cor);
  desenharCard(doc, 'Classificacao Atual', limparTexto(novoCls.label), 14 + (W - 28 - 4) / 2 + 4, y, (W - 28 - 4) / 2, 16, novoCls.cor);
  y += 22;

  if (medidasAtivas.length > 0) {
    if (y > 220) { y = novaPagina(doc); }
    y = desenharTituloSecao(doc, 'Medidas Corporais (cm)', y);

    const mW = (W - 28 - 8) / 3;
    for (const m of medidasAtivas) {
      if (y > 260) { y = novaPagina(doc); }
      const vRef = refD.medidas[m.key];
      const vNovo = novo.medidas[m.key];
      const hasValues = vRef !== '' && vNovo !== '';
      const delta = hasValues ? (vNovo as number) - (vRef as number) : 0;
      const cor = hasValues ? corDelta(delta, m.inv) : TEMA.cinzaMedio;

      desenharCard(doc, m.label, `${vRef !== '' ? (vRef as number).toFixed(1) : '-'} -> ${vNovo !== '' ? (vNovo as number).toFixed(1) : '-'}`, 14, y, W - 28 - mW - 4, 16);
      desenharCard(doc, 'Var', hasValues ? textoDelta(delta) : '-', 14 + W - 28 - mW, y, mW, 16, cor);
      y += 20;
    }
  }

  desenharRodape(doc, 'Gallagher et al. (2000) | ACE | Lohman (1993) | ACSM');

  const safeName = nome.replace(/[^a-zA-Z0-9 ]/g, "");
  return { doc, nomeArquivo: `Comparativo ${safeName}.pdf` };
}

/** Gera e baixa (o mesmo nome de arquivo de hoje: "Comparativo <nome>.pdf"). */
export function baixarPdfComparativo(refD: RefData, novo: NovoData, dados: DadosComuns): string {
  const { doc, nomeArquivo } = montarPdfComparativo(refD, novo, dados);
  doc.save(nomeArquivo);
  return nomeArquivo;
}
