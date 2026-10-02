// Physiq W26 — o Comparativo da Calculadora (C63: antes × depois, com o PDF). Os tipos, as 13 medidas e as contas do relatório são os
// do src/components/ComparativoTab.tsx de hoje (que sai nesta worktree); a tela nova (visual premium) e o PDF (pdfComparativo.ts) usam
// isto. Os dados ficam só no navegador por 24 h (src/utils/storageComparativo.ts, a mesma chave de hoje): nada vai para o servidor.
import { medidasVazias, type MedidasCorporais } from "@/types/medidas";
import { calcularTMBKatch, calcularTMBMifflin, classificarGordura, type ClassificacaoGordura } from "@/utils/composicaoCorporal";

export interface RefData {
  nome: string;
  data: string;
  peso: number | "";
  pctGordura: number | "";
  medidas: MedidasCorporais;
}

export interface NovoData {
  data: string;
  peso: number | "";
  pctGordura: number | "";
  medidas: MedidasCorporais;
}

export interface DadosComuns {
  sexo: "M" | "F";
  idade: number | "";
  altura: number | "";
}

export const REF_VAZIO: RefData = { nome: "", data: "", peso: "", pctGordura: "", medidas: { ...medidasVazias } };
export const NOVO_VAZIO: NovoData = { data: "", peso: "", pctGordura: "", medidas: { ...medidasVazias } };
export const DADOS_VAZIOS: DadosComuns = { sexo: "M", idade: "", altura: "" };

/** As 13 medidas, na ordem do relatório (inv = diminuir é melhora: cintura e quadril). */
export const MEDIDAS_CONFIG: { label: string; key: keyof MedidasCorporais; inv: boolean }[] = [
  { label: "Pescoço", key: "pescoco", inv: false },
  { label: "Ombro", key: "ombro", inv: false },
  { label: "Peitoral", key: "peitoral", inv: false },
  { label: "Cintura", key: "cintura", inv: true },
  { label: "Quadril", key: "quadril", inv: true },
  { label: "Braço D", key: "bracoD", inv: false },
  { label: "Braço E", key: "bracoE", inv: false },
  { label: "Antebraço D", key: "antebracoD", inv: false },
  { label: "Antebraço E", key: "antebracoE", inv: false },
  { label: "Coxa D", key: "coxaD", inv: false },
  { label: "Coxa E", key: "coxaE", inv: false },
  { label: "Panturrilha D", key: "panturrilhaD", inv: false },
  { label: "Panturrilha E", key: "panturrilhaE", inv: false },
];

/** Os grupos do formulário de medidas (Tronco, Braços, Pernas), como o MedidasForm de hoje. */
export const GRUPOS_MEDIDAS: { titulo: string; campos: { label: string; key: keyof MedidasCorporais }[] }[] = [
  { titulo: "Tronco", campos: [{ label: "Pescoço", key: "pescoco" }, { label: "Ombro", key: "ombro" }, { label: "Peitoral", key: "peitoral" }, { label: "Cintura", key: "cintura" }, { label: "Quadril", key: "quadril" }] },
  { titulo: "Braços", campos: [{ label: "Braço D", key: "bracoD" }, { label: "Braço E", key: "bracoE" }, { label: "Antebraço D", key: "antebracoD" }, { label: "Antebraço E", key: "antebracoE" }] },
  { titulo: "Pernas", campos: [{ label: "Coxa D", key: "coxaD" }, { label: "Coxa E", key: "coxaE" }, { label: "Panturrilha D", key: "panturrilhaD" }, { label: "Panturrilha E", key: "panturrilhaE" }] },
];

export interface LinhaComparativo {
  lbl: string;
  r: string;
  n: string;
  d: number;
  dec: number;
  inv: boolean;
}

export interface RelatorioComparativo {
  idade: number;
  altura: number;
  refCls: ClassificacaoGordura;
  novoCls: ClassificacaoGordura;
  composicao: LinhaComparativo[];
  medidas: { label: string; key: keyof MedidasCorporais; inv: boolean; ref: number | ""; novo: number | ""; delta: number | null }[];
}

const temValor = (v: number | "") => v !== "" && v !== 0;

/** As contas do relatório comparativo (idade 25 e altura 170 quando vazias — a regra de hoje). */
export function montarRelatorio(refD: RefData, novo: NovoData, dados: DadosComuns): RelatorioComparativo {
  const idade = (dados.idade as number) || 25;
  const altura = (dados.altura as number) || 170;
  const refPeso = (refD.peso as number) || 0;
  const novoPeso = (novo.peso as number) || 0;
  const refPct = (refD.pctGordura as number) || 0;
  const novoPct = (novo.pctGordura as number) || 0;
  const refMg = (refPeso * refPct) / 100;
  const refMm = refPeso - refMg;
  const novoMg = (novoPeso * novoPct) / 100;
  const novoMm = novoPeso - novoMg;
  const refTmbM = calcularTMBMifflin(refPeso, altura, idade, dados.sexo);
  const novoTmbM = calcularTMBMifflin(novoPeso, altura, idade, dados.sexo);
  const refTmbK = calcularTMBKatch(refMm);
  const novoTmbK = calcularTMBKatch(novoMm);
  return {
    idade,
    altura,
    refCls: classificarGordura(refPct, dados.sexo, idade),
    novoCls: classificarGordura(novoPct, dados.sexo, idade),
    composicao: [
      { lbl: "Peso", r: `${refPeso.toFixed(1)} kg`, n: `${novoPeso.toFixed(1)} kg`, d: novoPeso - refPeso, dec: 1, inv: false },
      { lbl: "% Gordura", r: `${refPct.toFixed(1)}%`, n: `${novoPct.toFixed(1)}%`, d: novoPct - refPct, dec: 1, inv: true },
      { lbl: "Massa Gorda", r: `${refMg.toFixed(1)} kg`, n: `${novoMg.toFixed(1)} kg`, d: novoMg - refMg, dec: 1, inv: true },
      { lbl: "Massa Magra", r: `${refMm.toFixed(1)} kg`, n: `${novoMm.toFixed(1)} kg`, d: novoMm - refMm, dec: 1, inv: false },
      { lbl: "TMB Mifflin", r: `${refTmbM} kcal`, n: `${novoTmbM} kcal`, d: novoTmbM - refTmbM, dec: 0, inv: false },
      { lbl: "TMB Katch", r: `${refTmbK} kcal`, n: `${novoTmbK} kcal`, d: novoTmbK - refTmbK, dec: 0, inv: false },
    ],
    medidas: MEDIDAS_CONFIG.filter((m) => temValor(refD.medidas[m.key]) || temValor(novo.medidas[m.key])).map((m) => {
      const vRef = refD.medidas[m.key];
      const vNovo = novo.medidas[m.key];
      return { ...m, ref: vRef, novo: vNovo, delta: vRef !== "" && vNovo !== "" ? (vNovo as number) - (vRef as number) : null };
    }),
  };
}

/** Massa gorda, massa magra e classificação da prévia de cada lado (só com peso e % de gordura). */
export function previa(peso: number | "", pct: number | "", sexo: "M" | "F", idade: number | "") {
  if (!peso || !pct) return null;
  const mg = ((peso as number) * (pct as number)) / 100;
  const mm = (peso as number) - mg;
  return { mg, mm, cls: classificarGordura(pct as number, sexo, (idade as number) || 25) };
}
