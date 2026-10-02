// Physiq W26 — as contas da Calculadora (C52/C63: o "Cálculo manual" do Calc — composição corporal + comparativo), PURAS e testadas.
// As MESMAS fórmulas da calculadora de hoje (src/pages/Index.tsx, src/components/SectionBodyFat.tsx e TdeeTable.tsx, que saem nesta
// worktree): TMB de Mifflin-St Jeor, % de gordura por Jackson & Pollock (3 dobras, acima de 7%) ou Jackson & Pollock 7 dobras (abaixo
// de 7%) com a densidade de Siri, TMB específico de Katch-McArdle pela massa magra e o gasto por nível de atividade.
import { classificarGordura, type ClassificacaoGordura } from "@/utils/composicaoCorporal";

export type Sexo = "male" | "female";
export type Protocolo = "3" | "7";

/** Os 5 níveis de atividade (gasto energético diário = TMB × fator), com a explicação de cada um. */
export const NIVEIS_ATIVIDADE = [
  { rotulo: "Sedentário", rotuloPdf: "Sedentario", fator: 1.2, dica: "Não pratica atividade física. Trabalho de escritório ou atividades do dia a dia com mínimo de movimento corporal." },
  { rotulo: "Levemente ativo", rotuloPdf: "Levemente ativo", fator: 1.375, dica: "Pratica exercícios leves 1 a 3 vezes por semana, como caminhadas, yoga ou treinos curtos de baixa intensidade." },
  { rotulo: "Moderadamente ativo", rotuloPdf: "Moderadamente ativo", fator: 1.55, dica: "Treina de 3 a 5 vezes por semana com intensidade moderada. Perfil típico de quem frequenta academia regularmente." },
  { rotulo: "Muito ativo", rotuloPdf: "Muito ativo", fator: 1.725, dica: "Treina de 6 a 7 vezes por semana com alta intensidade, ou tem trabalho físico pesado além dos treinos." },
  { rotulo: "Atleta / dupla sessão", rotuloPdf: "Atleta / dupla sessao", fator: 1.9, dica: "Treino duas vezes ao dia ou atleta de alto rendimento em período de preparação intensa para competição." },
] as const;

/** As 3 dobras do protocolo de 3 (por sexo) e as 7 do de 7 — os rótulos da tela; os do PDF vão sem acento (como hoje). */
export const DOBRAS_3: Record<Sexo, string[]> = { male: ["Peitoral", "Abdômen", "Coxa"], female: ["Tríceps", "Supra-ilíaca", "Coxa"] };
export const DOBRAS_3_PDF: Record<Sexo, string[]> = { male: ["Peitoral", "Abdomen", "Coxa"], female: ["Triceps", "Supra-iliaca", "Coxa"] };
export const DOBRAS_7 = ["Peitoral", "Axilar Média", "Tríceps", "Subescapular", "Abdômen", "Supra-ilíaca", "Coxa"];
export const DOBRAS_7_PDF = ["Peitoral", "Axilar Media", "Triceps", "Subescapular", "Abdomen", "Supra-iliaca", "Coxa"];

/** "72,5" ou "72.5" → 72.5; vazio/inválido → 0 (a tela trata 0 como "não preenchido", como hoje). */
export function numero(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** TMB de Mifflin-St Jeor (kcal/dia), sem arredondar — null sem idade, altura ou peso. */
export function tmbMifflin(sexo: Sexo, idade: number, altura: number, peso: number): number | null {
  if (!idade || !altura || !peso) return null;
  return sexo === "male" ? 10 * peso + 6.25 * altura - 5 * idade + 5 : 10 * peso + 6.25 * altura - 5 * idade - 161;
}

/** % de gordura por 3 dobras (Jackson & Pollock 1978/1980 + Siri). Fora de 0–100 → null. */
export function gordura3Dobras(sexo: Sexo, soma: number, idade: number): number | null {
  const densidade = sexo === "male"
    ? 1.10938 - 0.0008267 * soma + 0.0000016 * soma * soma - 0.0002574 * idade
    : 1.0994921 - 0.0009929 * soma + 0.0000023 * soma * soma - 0.0001392 * idade;
  const bf = (4.95 / densidade - 4.5) * 100;
  return bf > 0 && bf < 100 ? bf : null;
}

/** % de gordura por 7 dobras (Jackson & Pollock + Siri). Fora de 0–100 → null. */
export function gordura7Dobras(sexo: Sexo, soma: number, idade: number): number | null {
  const densidade = sexo === "male"
    ? 1.112 - 0.00043499 * soma + 0.00000055 * soma * soma - 0.00028826 * idade
    : 1.097 - 0.00046971 * soma + 0.00000056 * soma * soma - 0.00012828 * idade;
  const bf = (4.95 / densidade - 4.5) * 100;
  return bf > 0 && bf < 100 ? bf : null;
}

export interface ResultadoDobras {
  /** % de gordura */
  bf: number;
  /** TMB específico (Katch-McArdle), sem arredondar */
  tmbKatch: number;
  massaGorda: number;
  massaMagra: number;
}

/** O resultado das dobras do protocolo escolhido (todas preenchidas e > 0, mais idade e peso) — senão null. */
export function resultadoDobras(protocolo: Protocolo, sexo: Sexo, dobras: number[], idade: number, peso: number): ResultadoDobras | null {
  const n = protocolo === "3" ? 3 : 7;
  const valores = dobras.slice(0, n);
  if (valores.length < n || valores.some((v) => !v || v <= 0) || !idade || !peso) return null;
  const soma = valores.reduce((a, b) => a + b, 0);
  const bf = protocolo === "3" ? gordura3Dobras(sexo, soma, idade) : gordura7Dobras(sexo, soma, idade);
  if (bf === null) return null;
  const massaGorda = peso * (bf / 100);
  const massaMagra = peso - massaGorda;
  return { bf, tmbKatch: 370 + 21.6 * massaMagra, massaGorda, massaMagra };
}

/** Classificação de Gallagher (2000) com o ajuste por idade (a mesma do app e do PDF). */
export function classificacao(bf: number, sexo: Sexo, idade: number): ClassificacaoGordura {
  return classificarGordura(bf, sexo === "male" ? "M" : "F", idade || 25);
}

/** As dobras que vão no PDF: as do protocolo ativo, com os rótulos sem acento (o de hoje só levava as 3). */
export function dobrasDoPdf(protocolo: Protocolo, sexo: Sexo, dobras: number[]): { labels: string[]; values: number[] } | undefined {
  const labels = protocolo === "3" ? DOBRAS_3_PDF[sexo] : DOBRAS_7_PDF;
  const values = dobras.slice(0, labels.length);
  if (values.length < labels.length || values.some((v) => !v || v <= 0)) return undefined;
  return { labels, values };
}

/** As faixas da tabela de referência (Gallagher 2000 · ACE · Lohman 1993 · ACSM), por sexo, com a cor de cada uma. */
export const FAIXAS_REFERENCIA: Record<"M" | "F", { faixa: string; range: string; cor: string }[]> = {
  M: [
    { faixa: "Gordura Essencial", range: "< 5%", cor: "#ef4444" },
    { faixa: "Atleta", range: "5 – 13%", cor: "#22c55e" },
    { faixa: "Boa Forma", range: "14 – 17%", cor: "#4ade80" },
    { faixa: "Aceitável", range: "18 – 24%", cor: "#facc15" },
    { faixa: "Obesidade", range: "> 24%", cor: "#f97316" },
  ],
  F: [
    { faixa: "Gordura Essencial", range: "< 10%", cor: "#ef4444" },
    { faixa: "Atleta", range: "10 – 20%", cor: "#22c55e" },
    { faixa: "Boa Forma", range: "21 – 24%", cor: "#4ade80" },
    { faixa: "Aceitável", range: "25 – 31%", cor: "#facc15" },
    { faixa: "Obesidade", range: "> 31%", cor: "#f97316" },
  ],
};

/** Variação com sinal ("+1,5" · "-0,8" · "= 0"), a mesma regra do relatório comparativo. */
export function textoVariacao(delta: number, casas: number): string {
  if (delta === 0) return "= 0";
  const t = Math.abs(delta).toFixed(casas).replace(".", ",");
  return delta > 0 ? `+${t}` : `-${t}`;
}

/** Melhorou? (verde) — no peso, músculo e TMB subir é bom; na gordura, cintura e quadril, descer. */
export function tomVariacao(delta: number, inverter: boolean): "bom" | "ruim" | "igual" {
  if (delta === 0) return "igual";
  return (inverter ? delta < 0 : delta > 0) ? "bom" : "ruim";
}
