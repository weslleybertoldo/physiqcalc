// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/gestacionalUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { arred, calcularIMC, fmtNum, ordenarAntropometrias } from "@/nutricao/editor/lib/antropometriaUtil";

// Util PURO do Acompanhamento gestacional (W25): semana gestacional e DPP a partir da DUM, classificação do IMC
// pré-gestacional, faixas de ganho de peso do IOM 2009 (gestação única e gemelar), ganho acumulado recomendado por
// semana, série do ganho real contra a faixa, formulários e validações dos 2 modais e o nome do PDF. Sem React, sem
// banco — tudo testável no vitest. A referência só mostra o vazio da tela; o acompanhamento em si é nosso.

export type ClassificacaoIMCPre = "baixo_peso" | "adequado" | "sobrepeso" | "obesidade";
export type SituacaoGanho = "abaixo" | "dentro" | "acima";
export type Trimestre = 1 | 2 | 3;
export type Faixa = { min: number; max: number };
export type Semana = { semanas: number; dias: number };

export const DIAS_GESTACAO = 280;
/** acima disso a data não é mais lida como semana gestacional (gestação encerrada há muito) */
export const SEMANAS_MAX = 45;
export const SEMANA_FIM_1TRI = 13;
export const SEMANAS_CURVA = 40;
export const PESO_MIN = 20;
export const PESO_MAX = 300;
export const ALTURA_MIN = 100;
export const ALTURA_MAX = 250;
export const PA_SIS_MIN = 50;
export const PA_SIS_MAX = 260;
export const PA_DIA_MIN = 30;
export const PA_DIA_MAX = 160;
export const PA_ELEVADA_SIS = 140;
export const PA_ELEVADA_DIA = 90;
export const OBSERVACAO_GESTACIONAL_MAX = 300;
export const DUM_MAX_DIAS_ATRAS = 300;

// ---- Datas ----
export const hojeISO = (d: Date = new Date()): string => format(d, "yyyy-MM-dd");
export const dataValida = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && isValid(parseISO(v));
/** `yyyy-MM-dd` (coluna date) → `dd/MM/yyyy`; ISO com hora (timestamptz) → a data no fuso LOCAL; inválida → '—'. */
export const fmtData = (v: string | null | undefined): string => {
  if (!v) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dataValida(v) ? format(parseISO(v), "dd/MM/yyyy") : "—";
  const d = new Date(v);
  return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
};
/** ISO com hora (timestamptz) → `yyyy-MM-dd` no fuso LOCAL; coluna date passa intacta; inválida → ''. */
export const dataLocalISO = (v: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isValid(d) ? format(d, "yyyy-MM-dd") : "";
};
export const somarDias = (iso: string, n: number): string => format(addDays(parseISO(iso), n), "yyyy-MM-dd");

/** Data provável do parto = DUM + 280 dias (regra de Naegele). */
export const calcularDPP = (dum: string): string => somarDias(dum, DIAS_GESTACAO);

/** Semana gestacional na `data` (semanas completas + dias). Data antes da DUM ou acima de 45 semanas → null. */
export function semanaGestacional(dum: string, data: string): Semana | null {
  if (!dataValida(dum) || !dataValida(data)) return null;
  const dias = differenceInCalendarDays(parseISO(data), parseISO(dum));
  if (dias < 0) return null;
  const semanas = Math.floor(dias / 7);
  if (semanas > SEMANAS_MAX) return null;
  return { semanas, dias: dias % 7 };
}
export const textoSemana = (s: Semana | null): string => (s ? `${s.semanas}s ${s.dias}d` : "—");
/** ≤ 13 semanas → 1º · 14–27 → 2º · ≥ 28 → 3º */
export const trimestre = (semanas: number): Trimestre => (semanas <= SEMANA_FIM_1TRI ? 1 : semanas <= 27 ? 2 : 3);
export const textoTrimestre = (t: Trimestre): string => `${t}º trimestre`;
export const textoSemanaTrimestre = (s: Semana | null): string => (s ? `${textoSemana(s)} · ${textoTrimestre(trimestre(s.semanas))}` : "—");
/** semanas em número decimal (8s 3d → 8,43) — posição do ponto no gráfico */
export const semanaDecimal = (s: Semana | null): number => (s ? arred(s.semanas + s.dias / 7, 2) : 0);

// ---- IMC pré-gestacional e faixas IOM 2009 ----
export function classificarIMCPre(imc: number): ClassificacaoIMCPre {
  if (imc < 18.5) return "baixo_peso";
  if (imc < 25) return "adequado";
  if (imc < 30) return "sobrepeso";
  return "obesidade";
}
export const ROTULO_CLASSIFICACAO: Record<ClassificacaoIMCPre, string> = {
  baixo_peso: "Baixo peso",
  adequado: "Adequado",
  sobrepeso: "Sobrepeso",
  obesidade: "Obesidade",
};
export const rotuloClassificacao = (c: ClassificacaoIMCPre): string => ROTULO_CLASSIFICACAO[c];
/** 'IMC pré 22,0 — Adequado' (sem IMC → '—') */
export const textoIMCPre = (imc: number | null): string => (imc === null ? "—" : `${fmtNum(imc, 1)} — ${rotuloClassificacao(classificarIMCPre(imc))}`);

/** IOM 2009, gestação ÚNICA: ganho TOTAL (kg) e ganho POR SEMANA no 2º/3º trimestre (kg), por IMC pré-gestacional. */
export const FAIXAS_IOM: Record<ClassificacaoIMCPre, { total: Faixa; semanal: Faixa }> = {
  baixo_peso: { total: { min: 12.5, max: 18 }, semanal: { min: 0.44, max: 0.58 } },
  adequado: { total: { min: 11.5, max: 16 }, semanal: { min: 0.35, max: 0.5 } },
  sobrepeso: { total: { min: 7, max: 11.5 }, semanal: { min: 0.23, max: 0.33 } },
  obesidade: { total: { min: 5, max: 9 }, semanal: { min: 0.17, max: 0.27 } },
};
/** 1º trimestre: 0,5–2 kg no TOTAL pra todas as classificações (atingidos na semana 13) */
export const GANHO_1TRI: Faixa = { min: 0.5, max: 2 };
/** IOM 2009, GEMELAR (ganho total): baixo peso não tem faixa oficial → usa a de adequado com aviso. */
export const FAIXAS_IOM_GEMELAR: Record<ClassificacaoIMCPre, Faixa | null> = {
  baixo_peso: null,
  adequado: { min: 17, max: 25 },
  sobrepeso: { min: 14, max: 23 },
  obesidade: { min: 11, max: 19 },
};
export const AVISO_GEMELAR_SEM_FAIXA = "Sem faixa IOM pra gestação gemelar com baixo peso — usando a faixa de IMC adequado";

/** Classificação usada nas contas: gemelar sem faixa própria (baixo peso) cai em 'adequado'. */
export const classificacaoEfetiva = (c: ClassificacaoIMCPre, gemelar: boolean): ClassificacaoIMCPre => (gemelar && !FAIXAS_IOM_GEMELAR[c] ? "adequado" : c);

/** Faixa TOTAL recomendada pra gestação inteira (kg) + aviso quando a gemelar não tem faixa oficial. */
export function faixaTotal(c: ClassificacaoIMCPre, gemelar: boolean): { faixa: Faixa; aviso: string | null } {
  if (!gemelar) return { faixa: FAIXAS_IOM[c].total, aviso: null };
  const propria = FAIXAS_IOM_GEMELAR[c];
  if (propria) return { faixa: propria, aviso: null };
  return { faixa: FAIXAS_IOM_GEMELAR.adequado as Faixa, aviso: AVISO_GEMELAR_SEM_FAIXA };
}

/**
 * Ganho ACUMULADO recomendado (kg) na semana `semana` (aceita fração): 1º trimestre linear até 0,5–2 kg na semana 13;
 * depois soma o ganho semanal da classificação. Gemelar: a curva da gestação única escalada pela razão total gemelar / total única.
 */
export function ganhoRecomendado(c: ClassificacaoIMCPre, semana: number, gemelar = false): Faixa {
  const s = Math.max(0, Math.min(semana, SEMANAS_MAX));
  const ce = classificacaoEfetiva(c, gemelar);
  const semanal = FAIXAS_IOM[ce].semanal;
  let min: number;
  let max: number;
  if (s <= SEMANA_FIM_1TRI) {
    min = (GANHO_1TRI.min * s) / SEMANA_FIM_1TRI;
    max = (GANHO_1TRI.max * s) / SEMANA_FIM_1TRI;
  } else {
    min = GANHO_1TRI.min + (s - SEMANA_FIM_1TRI) * semanal.min;
    max = GANHO_1TRI.max + (s - SEMANA_FIM_1TRI) * semanal.max;
  }
  if (gemelar) {
    const gem = faixaTotal(ce, true).faixa;
    const unica = FAIXAS_IOM[ce].total;
    min *= gem.min / unica.min;
    max *= gem.max / unica.max;
  }
  return { min: arred(min, 2), max: arred(max, 2) };
}

export type PontoCurva = { semana: number; min: number; max: number };
/** Curva recomendada semana a semana (0..40). */
export const curvaRecomendada = (c: ClassificacaoIMCPre, gemelar = false): PontoCurva[] =>
  Array.from({ length: SEMANAS_CURVA + 1 }, (_, semana) => ({ semana, ...ganhoRecomendado(c, semana, gemelar) }));

export const ganhoAtual = (pesoPre: number, peso: number): number => arred(peso - pesoPre, 2);
export const situacaoGanho = (ganho: number, faixa: Faixa): SituacaoGanho => (ganho < faixa.min ? "abaixo" : ganho > faixa.max ? "acima" : "dentro");
export const ROTULO_SITUACAO: Record<SituacaoGanho, string> = { abaixo: "Abaixo da faixa", dentro: "Dentro da faixa", acima: "Acima da faixa" };
export const rotuloSituacao = (s: SituacaoGanho): string => ROTULO_SITUACAO[s];

// ---- Formatação ----
/** kg com 1 decimal, sem o ',0' final: 16 → '16' · 11,5 → '11,5' · 0,31 → '0,3' */
export const fmtKg = (n: number): string => fmtNum(n, 1).replace(/,0$/, "");
export const fmtFaixa = (f: Faixa): string => `${fmtKg(f.min)}–${fmtKg(f.max)} kg`;
/** ganho com sinal e 1 decimal: '+6,5 kg' · '-0,4 kg' · '0,0 kg' */
export const fmtGanho = (g: number): string => {
  const abs = fmtNum(Math.abs(g), 1);
  const sinal = abs === "0,0" ? "" : g > 0 ? "+" : "-";
  return `${sinal}${abs} kg`;
};
export const fmtPeso = (kg: number): string => `${fmtNum(kg, 1)} kg`;
export const textoPA = (sis: number | null, dia: number | null): string => (sis !== null && dia !== null ? `${sis}/${dia} mmHg` : "—");
/** sistólica ≥ 140 ou diastólica ≥ 90 → 'PA elevada' */
export const alertaPA = (sis: number | null, dia: number | null): string | null =>
  sis !== null && dia !== null && (sis >= PA_ELEVADA_SIS || dia >= PA_ELEVADA_DIA) ? "PA elevada" : null;
export const textoContagemRegistros = (n: number): string => (n === 0 ? "Nenhum registro" : n === 1 ? "1 registro" : `${n} registros`);

// ---- Série do ganho real ----
export type GestacaoBase = { dum: string; peso_pre: number; imc_pre: number; gemelar: boolean };
export type RegistroBase = {
  id: string;
  data: string;
  peso: number;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  observacao: string | null;
  created_at: string;
};
export type PontoGanho = RegistroBase & {
  semana: Semana | null;
  /** semanas em decimal (posição no eixo X) */
  x: number;
  ganho: number;
  faixa: Faixa;
  situacao: SituacaoGanho;
};

/** Mais recente primeiro (pela data; empate → a criada por último primeiro). */
export function ordenarRegistros<T extends { data: string; created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at));
}
export const inserirRegistro = <T extends { id: string; data: string; created_at: string }>(lista: T[], r: T): T[] =>
  ordenarRegistros([...lista.filter((x) => x.id !== r.id), r]);
export const ultimoRegistro = <T extends { data: string; created_at: string }>(lista: T[]): T | null => ordenarRegistros(lista)[0] ?? null;
/** registro vivo daquele dia (aviso 'já existe' derivado no render) */
export const registroDoDia = <T extends { data: string }>(lista: T[], data: string): T | null => lista.find((r) => r.data === data) ?? null;

/** Ganho de cada registro contra a faixa da semana dele (semanas COMPLETAS), da mais antiga pra mais recente. */
export function serieGanho(registros: RegistroBase[], g: GestacaoBase): PontoGanho[] {
  const c = classificarIMCPre(g.imc_pre);
  return ordenarRegistros(registros)
    .reverse()
    .map((r) => {
      const semana = semanaGestacional(g.dum, r.data);
      const faixa = ganhoRecomendado(c, semana ? semana.semanas : 0, g.gemelar);
      const ganho = ganhoAtual(g.peso_pre, r.peso);
      return { ...r, semana, x: semanaDecimal(semana), ganho, faixa, situacao: situacaoGanho(ganho, faixa) };
    });
}

export type LinhaGrafico = { semana: number; faixa: [number, number]; ganho?: number; data?: string };
/** Curva recomendada (0..40) + os pontos reais (na semana decimal deles) numa lista só, ordenada por semana — o recharts lê `faixa` (área) e `ganho` (linha). */
export function dadosGrafico(serie: PontoGanho[], c: ClassificacaoIMCPre, gemelar: boolean): LinhaGrafico[] {
  const porSemana = new Map<number, LinhaGrafico>();
  for (const p of curvaRecomendada(c, gemelar)) porSemana.set(p.semana, { semana: p.semana, faixa: [p.min, p.max] });
  for (const p of serie) {
    const f = ganhoRecomendado(c, p.x, gemelar);
    const linha = porSemana.get(p.x) ?? { semana: p.x, faixa: [f.min, f.max] };
    porSemana.set(p.x, { ...linha, ganho: p.ganho, data: p.data });
  }
  return [...porSemana.values()].sort((a, b) => a.semana - b.semana);
}
/** rótulos do eixo X de 4 em 4 semanas (0, 4, …, 40) */
export const TICKS_SEMANAS = Array.from({ length: SEMANAS_CURVA / 4 + 1 }, (_, i) => i * 4);

// ---- Formulário da gestação ----
export type FormGestacao = {
  dum: string;
  peso_pre: string;
  altura: string;
  gemelar: boolean;
  observacao: string;
  /** data da antropometria de onde peso/altura foram sugeridos (só no modo novo) */
  origemSugestao: string | null;
};
const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export type AntropometriaBase = { data: string; created_at: string; peso: number | null; altura: number | null };
/** Última antropometria (mais recente primeiro) — fonte da sugestão de peso/altura pré-gestacionais. */
export const ultimaAntropometria = <T extends AntropometriaBase>(lista: T[]): T | null => ordenarAntropometrias(lista)[0] ?? null;

export function formInicialGestacao(ultima: AntropometriaBase | null): FormGestacao {
  const sugere = !!ultima && (ultima.peso !== null || ultima.altura !== null);
  return {
    dum: "",
    peso_pre: sugere && ultima.peso !== null ? String(ultima.peso) : "",
    altura: sugere && ultima.altura !== null ? String(ultima.altura) : "",
    gemelar: false,
    observacao: "",
    origemSugestao: sugere ? ultima.data : null,
  };
}
export const formDaGestacao = (g: { dum: string; peso_pre: number; altura: number; gemelar: boolean; observacao: string | null }): FormGestacao => ({
  dum: g.dum,
  peso_pre: String(g.peso_pre),
  altura: String(g.altura),
  gemelar: g.gemelar,
  observacao: g.observacao ?? "",
  origemSugestao: null,
});
/** IMC ao vivo do formulário (peso e altura preenchidos) */
export const imcDoForm = (f: FormGestacao): number | null => {
  const p = num(f.peso_pre);
  const a = num(f.altura);
  return p !== null && a !== null ? calcularIMC(p, a) : null;
};

export function validarGestacao(f: FormGestacao, hoje: string): string | null {
  if (!dataValida(f.dum)) return "Informe a data da última menstruação";
  if (f.dum > hoje) return "A DUM não pode ser futura";
  if (f.dum < somarDias(hoje, -DUM_MAX_DIAS_ATRAS)) return `A DUM não pode ter mais de ${DUM_MAX_DIAS_ATRAS} dias`;
  const peso = num(f.peso_pre);
  if (peso === null || peso < PESO_MIN || peso > PESO_MAX) return `Peso pré-gestacional entre ${PESO_MIN} e ${PESO_MAX} kg`;
  const altura = num(f.altura);
  if (altura === null || altura < ALTURA_MIN || altura > ALTURA_MAX) return `Altura entre ${ALTURA_MIN} e ${ALTURA_MAX} cm`;
  if (f.observacao.length > OBSERVACAO_GESTACIONAL_MAX) return `Observação com no máximo ${OBSERVACAO_GESTACIONAL_MAX} caracteres`;
  return null;
}
/** Linha pra `gestacoes` (DPP e IMC pré calculados aqui — o banco só guarda). Chamar depois do `validarGestacao`. */
export function gestacaoParaBanco(f: FormGestacao): { dum: string; dpp: string; peso_pre: number; altura: number; imc_pre: number; gemelar: boolean; observacao: string | null } {
  const peso_pre = num(f.peso_pre) ?? 0;
  const altura = num(f.altura) ?? 0;
  return {
    dum: f.dum,
    dpp: calcularDPP(f.dum),
    peso_pre,
    altura,
    imc_pre: calcularIMC(peso_pre, altura) ?? 0,
    gemelar: f.gemelar,
    observacao: f.observacao.trim() || null,
  };
}

// ---- Formulário do registro ----
export type FormRegistroGestacional = { data: string; peso: string; pa_sistolica: string; pa_diastolica: string; observacao: string };

export const formInicialRegistro = (hoje: string, ultimoPeso: number | null): FormRegistroGestacional => ({
  data: hoje,
  peso: ultimoPeso !== null ? String(ultimoPeso) : "",
  pa_sistolica: "",
  pa_diastolica: "",
  observacao: "",
});
export const formDoRegistro = (r: { data: string; peso: number; pa_sistolica: number | null; pa_diastolica: number | null; observacao: string | null }): FormRegistroGestacional => ({
  data: r.data,
  peso: String(r.peso),
  pa_sistolica: r.pa_sistolica === null ? "" : String(r.pa_sistolica),
  pa_diastolica: r.pa_diastolica === null ? "" : String(r.pa_diastolica),
  observacao: r.observacao ?? "",
});

/** Dia escolhido JÁ tem registro vivo (modo novo): o formulário passa a mostrar os dados dele — salvar vai atualizar aquele dia, sem apagar PA/observação por engano. */
export const preencherDoExistente = (f: FormRegistroGestacional, r: { peso: number; pa_sistolica: number | null; pa_diastolica: number | null; observacao: string | null }): FormRegistroGestacional => ({
  ...f,
  peso: String(r.peso),
  pa_sistolica: r.pa_sistolica === null ? "" : String(r.pa_sistolica),
  pa_diastolica: r.pa_diastolica === null ? "" : String(r.pa_diastolica),
  observacao: r.observacao ?? "",
});

export function validarRegistro(f: FormRegistroGestacional, g: { dum: string }, hoje: string): string | null {
  if (!dataValida(f.data)) return "Informe a data do registro";
  if (f.data < g.dum) return `A data não pode ser anterior à DUM (${fmtData(g.dum)})`;
  if (f.data > hoje) return "A data não pode ser futura";
  const peso = num(f.peso);
  if (peso === null || peso < PESO_MIN || peso > PESO_MAX) return `Peso entre ${PESO_MIN} e ${PESO_MAX} kg`;
  const temSis = f.pa_sistolica.trim() !== "";
  const temDia = f.pa_diastolica.trim() !== "";
  if (temSis !== temDia) return "Informe a pressão arterial completa (sistólica e diastólica) ou deixe as duas em branco";
  if (temSis) {
    const sis = num(f.pa_sistolica);
    const dia = num(f.pa_diastolica);
    if (sis === null || !Number.isInteger(sis) || sis < PA_SIS_MIN || sis > PA_SIS_MAX) return `Sistólica entre ${PA_SIS_MIN} e ${PA_SIS_MAX} mmHg`;
    if (dia === null || !Number.isInteger(dia) || dia < PA_DIA_MIN || dia > PA_DIA_MAX) return `Diastólica entre ${PA_DIA_MIN} e ${PA_DIA_MAX} mmHg`;
    if (sis <= dia) return "A sistólica tem que ser maior que a diastólica";
  }
  if (f.observacao.length > OBSERVACAO_GESTACIONAL_MAX) return `Observação com no máximo ${OBSERVACAO_GESTACIONAL_MAX} caracteres`;
  return null;
}
/** Linha pra `registros_gestacionais`. Chamar depois do `validarRegistro`. */
export function registroParaBanco(f: FormRegistroGestacional): { data: string; peso: number; pa_sistolica: number | null; pa_diastolica: number | null; observacao: string | null } {
  const temPA = f.pa_sistolica.trim() !== "" && f.pa_diastolica.trim() !== "";
  return {
    data: f.data,
    peso: num(f.peso) ?? 0,
    pa_sistolica: temPA ? Math.round(num(f.pa_sistolica) ?? 0) : null,
    pa_diastolica: temPA ? Math.round(num(f.pa_diastolica) ?? 0) : null,
    observacao: f.observacao.trim() || null,
  };
}

export type PreviaRegistro = { semana: Semana | null; ganho: number | null; faixa: Faixa | null; situacao: SituacaoGanho | null };
/** Prévia ao vivo do modal de registro: semana da data digitada, ganho contra o peso pré e a faixa daquela semana. */
export function previaRegistro(f: FormRegistroGestacional, g: GestacaoBase): PreviaRegistro {
  const semana = dataValida(f.data) ? semanaGestacional(g.dum, f.data) : null;
  const peso = num(f.peso);
  if (peso === null || !semana) return { semana, ganho: null, faixa: null, situacao: null };
  const faixa = ganhoRecomendado(classificarIMCPre(g.imc_pre), semana.semanas, g.gemelar);
  const ganho = ganhoAtual(g.peso_pre, peso);
  return { semana, ganho, faixa, situacao: situacaoGanho(ganho, faixa) };
}
export const textoPrevia = (p: PreviaRegistro): string =>
  p.ganho === null || !p.faixa || !p.situacao ? "—" : `ganho ${fmtGanho(p.ganho)} · faixa ${fmtFaixa(p.faixa)} · ${rotuloSituacao(p.situacao).toLowerCase()}`;

/** Ganho final de uma gestação encerrada = ganho do último registro dela (sem registro → null). */
export function ganhoFinal(registros: RegistroBase[], g: GestacaoBase): number | null {
  const ultimo = ultimoRegistro(registros);
  return ultimo ? ganhoAtual(g.peso_pre, ultimo.peso) : null;
}

// ---- PDF ----
const slug = (s: string, max = 40): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
/** `<paciente sem acento>-gestacional-<yyyy-MM-dd>.pdf` (paciente vazio → 'paciente'). */
export const nomeArquivoPDFGestacional = (paciente: string, d: Date): string => `${slug(paciente) || "paciente"}-gestacional-${format(d, "yyyy-MM-dd")}.pdf`;
