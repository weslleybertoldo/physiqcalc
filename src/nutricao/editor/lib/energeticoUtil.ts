// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/energeticoUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { format } from "date-fns";
import { chaveDia, combinarDataHora, formatarHora } from "@/nutricao/editor/lib/agendaUtil";
import { arred, ehSexo, fmtNum, idadeEm, lerResultados, numero, sexoDoGenero, type Sexo } from "@/nutricao/editor/lib/antropometriaUtil";

// Regras puras do cálculo energético (W7): equações da taxa metabólica basal (TMB), fator de atividade, gasto extra
// por atividade física (MET), gasto energético total (GET) e valor energético total (VET), mais a conversão
// formulário ⇄ registro do banco. Nada de rede aqui; testado no vitest com valores conferidos à mão.
// Referências: Harris & Benedict 1919 · Roza & Shizgal 1984 (revisão da Harris-Benedict) · Mifflin-St Jeor 1990 ·
// FAO/OMS/UNU 1985 (equações por peso e faixa de idade) · Cunningham 1980 (massa magra) · Tinsley 2018 (massa
// magra) · 1 MET ≈ 1 kcal por kg por hora.

export type { Sexo };
export { arred, ehSexo, fmtNum, numero };

// ---- Fórmulas ----
export type Formula = "mifflin" | "harris_benedict_1919" | "harris_benedict_1984" | "fao_oms_1985" | "cunningham" | "tinsley";
export const FORMULAS: { valor: Formula; rotulo: string; curto: string; precisa: string }[] = [
  { valor: "mifflin", rotulo: "Mifflin-St Jeor (1990)", curto: "Mifflin-St Jeor", precisa: "peso, altura, idade e sexo" },
  { valor: "harris_benedict_1919", rotulo: "Harris-Benedict (1919)", curto: "Harris-Benedict 1919", precisa: "peso, altura, idade e sexo" },
  { valor: "harris_benedict_1984", rotulo: "Harris-Benedict revisada (Roza & Shizgal, 1984)", curto: "Harris-Benedict 1984", precisa: "peso, altura, idade e sexo" },
  { valor: "fao_oms_1985", rotulo: "FAO/OMS (1985) — por faixa de idade", curto: "FAO/OMS 1985", precisa: "peso, idade e sexo" },
  { valor: "cunningham", rotulo: "Cunningham (1980) — pela massa magra", curto: "Cunningham", precisa: "massa magra" },
  { valor: "tinsley", rotulo: "Tinsley (2018) — pela massa magra", curto: "Tinsley", precisa: "massa magra" },
];
export const FORMULA_PADRAO: Formula = "mifflin";
export const ehFormula = (v: unknown): v is Formula => FORMULAS.some((f) => f.valor === v);
export function rotuloFormula(f: string | null | undefined, curto = true): string {
  const x = FORMULAS.find((y) => y.valor === f);
  return x ? (curto ? x.curto : x.rotulo) : (f ?? "");
}

/** O que cada equação precisa pra fechar. */
export type Requisitos = { peso: boolean; altura: boolean; idade: boolean; sexo: boolean; massaMagra: boolean };
export function requisitosDaFormula(f: Formula): Requisitos {
  switch (f) {
    case "cunningham":
    case "tinsley":
      return { peso: false, altura: false, idade: false, sexo: false, massaMagra: true };
    case "fao_oms_1985":
      return { peso: true, altura: false, idade: true, sexo: true, massaMagra: false };
    default:
      return { peso: true, altura: true, idade: true, sexo: true, massaMagra: false };
  }
}

export type Dados = { peso: number | null; altura: number | null; idade: number | null; sexo: Sexo | ""; massaMagra: number | null };

/** Dados que faltam pra fórmula fechar (rótulos, na ordem do formulário). */
export function dadosFaltando(f: Formula, d: Dados): string[] {
  const r = requisitosDaFormula(f);
  const falta: string[] = [];
  if (r.peso && (d.peso === null || d.peso <= 0)) falta.push("peso");
  if (r.altura && (d.altura === null || d.altura <= 0)) falta.push("altura");
  if (r.idade && d.idade === null) falta.push("idade");
  if (r.sexo && !d.sexo) falta.push("sexo");
  if (r.massaMagra && (d.massaMagra === null || d.massaMagra <= 0)) falta.push("massa magra");
  return falta;
}
/** Fórmulas que dá pra calcular com o que se tem. */
export const formulasDisponiveis = (d: Dados): Formula[] => FORMULAS.map((f) => f.valor).filter((f) => dadosFaltando(f, d).length === 0);

// ---- TMB (kcal/dia) ----
/** Harris & Benedict (1919). H: 66,473 + 13,7516·P + 5,0033·A − 6,755·I · M: 655,0955 + 9,5634·P + 1,8496·A − 4,6756·I */
export function tmbHarrisBenedict1919(sexo: Sexo, peso: number, altura: number, idade: number): number {
  return sexo === "masculino"
    ? 66.473 + 13.7516 * peso + 5.0033 * altura - 6.755 * idade
    : 655.0955 + 9.5634 * peso + 1.8496 * altura - 4.6756 * idade;
}
/** Harris-Benedict revisada por Roza & Shizgal (1984). H: 88,362 + 13,397·P + 4,799·A − 5,677·I · M: 447,593 + 9,247·P + 3,098·A − 4,330·I */
export function tmbHarrisBenedict1984(sexo: Sexo, peso: number, altura: number, idade: number): number {
  return sexo === "masculino"
    ? 88.362 + 13.397 * peso + 4.799 * altura - 5.677 * idade
    : 447.593 + 9.247 * peso + 3.098 * altura - 4.33 * idade;
}
/** Mifflin-St Jeor (1990): 10·P + 6,25·A − 5·I + 5 (homem) / − 161 (mulher). */
export function tmbMifflin(sexo: Sexo, peso: number, altura: number, idade: number): number {
  return 10 * peso + 6.25 * altura - 5 * idade + (sexo === "masculino" ? 5 : -161);
}
/** FAO/OMS/UNU (1985), só pelo peso, por faixa de idade (0–3, 3–10, 10–18, 18–30, 30–60, 60+). */
export function tmbFaoOms1985(sexo: Sexo, peso: number, idade: number): number {
  const h = sexo === "masculino";
  if (idade < 3) return h ? 60.9 * peso - 54 : 61.0 * peso - 51;
  if (idade < 10) return h ? 22.7 * peso + 495 : 22.5 * peso + 499;
  if (idade < 18) return h ? 17.5 * peso + 651 : 12.2 * peso + 746;
  if (idade < 30) return h ? 15.3 * peso + 679 : 14.7 * peso + 496;
  if (idade < 60) return h ? 11.6 * peso + 879 : 8.7 * peso + 829;
  return h ? 13.5 * peso + 487 : 10.5 * peso + 596;
}
/** Cunningham (1980): 500 + 22·MLG (massa magra em kg). */
export const tmbCunningham = (massaMagra: number): number => 500 + 22 * massaMagra;
/** Tinsley (2018): 25,9·MLG + 284. */
export const tmbTinsley = (massaMagra: number): number => 25.9 * massaMagra + 284;

/** TMB pela fórmula escolhida, arredondada a 2 casas; faltando dado → null. */
export function calcularTMB(f: Formula, d: Dados): number | null {
  if (dadosFaltando(f, d).length) return null;
  const sexo: Sexo = d.sexo === "feminino" ? "feminino" : "masculino";
  const peso = d.peso ?? 0;
  const altura = d.altura ?? 0;
  const idade = d.idade ?? 0;
  const mlg = d.massaMagra ?? 0;
  switch (f) {
    case "harris_benedict_1919":
      return arred(tmbHarrisBenedict1919(sexo, peso, altura, idade), 2);
    case "harris_benedict_1984":
      return arred(tmbHarrisBenedict1984(sexo, peso, altura, idade), 2);
    case "mifflin":
      return arred(tmbMifflin(sexo, peso, altura, idade), 2);
    case "fao_oms_1985":
      return arred(tmbFaoOms1985(sexo, peso, idade), 2);
    case "cunningham":
      return arred(tmbCunningham(mlg), 2);
    case "tinsley":
      return arred(tmbTinsley(mlg), 2);
    default:
      return null;
  }
}

// ---- Fator de atividade ----
export const FATORES_ATIVIDADE: { valor: string; numero: number; rotulo: string }[] = [
  { valor: "1.2", numero: 1.2, rotulo: "Sedentário — 1,2" },
  { valor: "1.375", numero: 1.375, rotulo: "Levemente ativo — 1,375" },
  { valor: "1.55", numero: 1.55, rotulo: "Moderadamente ativo — 1,55" },
  { valor: "1.725", numero: 1.725, rotulo: "Muito ativo — 1,725" },
  { valor: "1.9", numero: 1.9, rotulo: "Extremamente ativo — 1,9" },
];
export const FATOR_PADRAO = "1.2";
const fatorDaTabela = (n: number | null) => (n === null ? undefined : FATORES_ATIVIDADE.find((y) => Math.abs(y.numero - n) < 0.0005));
export function rotuloFator(v: number | string | null | undefined): string {
  const n = numero(v);
  const x = fatorDaTabela(n);
  if (x) return x.rotulo;
  return n === null ? "—" : fmtNum(n, 3);
}
/** Valor do select a partir do número do banco (1.55 → "1.55"; fora da tabela → o número como texto). */
export function fatorParaForm(n: number | null | undefined): string {
  if (n === null || n === undefined) return FATOR_PADRAO;
  return fatorDaTabela(n)?.valor ?? String(n);
}

// ---- Objetivo ----
export type Objetivo = "manter" | "emagrecer" | "ganhar";
export const OBJETIVOS: { valor: Objetivo; rotulo: string; dica: string }[] = [
  { valor: "manter", rotulo: "Manter o peso", dica: "sem ajuste" },
  { valor: "emagrecer", rotulo: "Emagrecer", dica: "déficit — ajuste negativo (ex.: -500)" },
  { valor: "ganhar", rotulo: "Ganhar peso / massa", dica: "superávit — ajuste positivo (ex.: 300)" },
];
export const ehObjetivo = (v: unknown): v is Objetivo => OBJETIVOS.some((o) => o.valor === v);
export const rotuloObjetivo = (v: string | null | undefined): string => OBJETIVOS.find((o) => o.valor === v)?.rotulo ?? (v ?? "—");
export const dicaObjetivo = (v: Objetivo): string => OBJETIVOS.find((o) => o.valor === v)?.dica ?? "";

// ---- Atividades (MET) ----
export type Atividade = { descricao: string; met: number; minutos_por_dia: number };
export const DESCRICAO_MAX = 80;

/** Lê o jsonb `atividades` com segurança: só linhas com MET e minutos válidos (descrição pode vir vazia). */
export function lerAtividades(v: unknown): Atividade[] {
  if (!Array.isArray(v)) return [];
  const saida: Atividade[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const met = numero(typeof o.met === "number" || typeof o.met === "string" ? o.met : null);
    const min = numero(typeof o.minutos_por_dia === "number" || typeof o.minutos_por_dia === "string" ? o.minutos_por_dia : null);
    const descricao = typeof o.descricao === "string" ? o.descricao.trim() : "";
    if (met !== null && met > 0 && min !== null && min > 0) saida.push({ descricao, met, minutos_por_dia: Math.round(min) });
  }
  return saida;
}
/** kcal/dia de uma atividade: MET × peso (kg) × horas por dia. */
export const gastoAtividade = (a: { met: number; minutos_por_dia: number }, pesoKg: number): number => arred(a.met * pesoKg * (a.minutos_por_dia / 60), 2);
/** Soma do gasto extra das atividades (kcal/dia). Sem atividades → 0; com atividades mas sem peso → null. */
export function gastoAtividades(lista: Atividade[], pesoKg: number | null): number | null {
  if (!lista.length) return 0;
  if (pesoKg === null || pesoKg <= 0) return null;
  return arred(lista.reduce((s, a) => s + gastoAtividade(a, pesoKg), 0), 2);
}

// ---- Resultado ----
export type Resultados = { tmb: number | null; extra: number | null; get: number | null; vet: number | null };
export const RESULTADOS_VAZIOS: Resultados = { tmb: null, extra: null, get: null, vet: null };
export type Entrada = Dados & { formula: Formula; fatorAtividade: number | null; atividades: Atividade[]; ajusteKcal: number };

/** TMB pela fórmula; GET = TMB × fator + atividades; VET = GET + ajuste. O que faltar fica null. */
export function calcular(e: Entrada): Resultados {
  const tmb = calcularTMB(e.formula, e);
  const extra = gastoAtividades(e.atividades, e.peso);
  if (tmb === null || extra === null || e.fatorAtividade === null || e.fatorAtividade <= 0) return { tmb, extra, get: null, vet: null };
  const get = arred(tmb * e.fatorAtividade + extra, 2);
  return { tmb, extra, get, vet: arred(get + e.ajusteKcal, 2) };
}

// ---- Textos ----
/** kcal inteiras com separador de milhar ("1.750"); null → "—". */
export const fmtKcal = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** Ajuste com sinal ("+300", "-500", "0"). */
export const fmtAjuste = (n: number | null | undefined): string => (n !== null && n !== undefined && n > 0 ? `+${fmtKcal(n)}` : fmtKcal(n));

export function textoContagem(n: number): string {
  if (n === 0) return "Nenhum cálculo";
  if (n === 1) return "1 cálculo";
  return `${n} cálculos`;
}
export const formatarDataHoraCalculo = (iso: string): string => format(new Date(iso), "dd/MM/yyyy HH:mm");

/** Linha da lista: "Mifflin-St Jeor · TMB 1.750 · GET 2.853 · VET 2.353 kcal". */
export function resumoCalculo(c: { formula: string; tmb: number | null; get: number | null; vet: number | null }): string {
  const partes = [rotuloFormula(c.formula)];
  if (c.tmb !== null) partes.push(`TMB ${fmtKcal(c.tmb)}`);
  if (c.get !== null) partes.push(`GET ${fmtKcal(c.get)}`);
  if (c.vet !== null) partes.push(`VET ${fmtKcal(c.vet)}`);
  if (partes.length > 1) partes[partes.length - 1] += " kcal";
  return partes.join(" · ");
}

/** `calculo-energetico-<paciente sem acento>-<yyyy-MM-dd>.pdf` */
export function nomeArquivoPDF(paciente: string, d: Date): string {
  const slug = paciente
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "paciente";
  return `calculo-energetico-${slug}-${format(d, "yyyy-MM-dd")}.pdf`;
}

// ---- Lista ----
const instante = (iso: string): number => new Date(iso).getTime();

/** Mais recente primeiro (pela data do cálculo; empate → o criado por último primeiro). */
export function ordenarCalculos<T extends { data: string; created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => instante(b.data) - instante(a.data) || instante(b.created_at) - instante(a.created_at));
}
export const inserirOrdenado = <T extends { id: string; data: string; created_at: string }>(lista: T[], c: T): T[] =>
  ordenarCalculos([...lista.filter((x) => x.id !== c.id), c]);

// ---- Formulário ⇄ registro ----
export const OBSERVACAO_MAX = 4000;

export type AtividadeForm = { descricao: string; met: string; minutos_por_dia: string };

/** O que a nutricionista digita no modal (números como texto: aceita vírgula). */
export type FormEnergetico = {
  data: string;
  hora: string;
  formula: Formula;
  peso: string;
  altura: string;
  idade: string;
  sexo: Sexo | "";
  massa_magra: string;
  fator_atividade: string;
  atividades: AtividadeForm[];
  ajuste_kcal: string;
  objetivo: Objetivo;
  observacao: string;
};

/** Como vai/vem do banco. */
export type RegistroEnergetico = {
  data: string;
  formula: Formula;
  peso: number | null;
  altura: number | null;
  idade: number | null;
  sexo: Sexo | null;
  massa_magra: number | null;
  fator_atividade: number;
  atividades: Atividade[];
  tmb: number | null;
  get: number | null;
  ajuste_kcal: number;
  vet: number | null;
  objetivo: Objetivo;
  observacao: string | null;
};

export const atividadeVazia = (): AtividadeForm => ({ descricao: "", met: "", minutos_por_dia: "" });
/** Linha do formulário em branco (as três colunas vazias) — é ignorada ao salvar. */
export const atividadeEmBranco = (a: AtividadeForm): boolean => !a.descricao.trim() && !a.met.trim() && !a.minutos_por_dia.trim();

/** Linhas incompletas ou inválidas (alguma coluna preenchida e outra não; MET fora de 0–30; minutos fora de 1–1440): posição 1-based. */
export function atividadesInvalidas(lista: AtividadeForm[]): number[] {
  const ruins: number[] = [];
  lista.forEach((a, i) => {
    if (atividadeEmBranco(a)) return;
    const met = numero(a.met);
    const min = numero(a.minutos_por_dia);
    if (!a.descricao.trim() || met === null || met <= 0 || met > 30 || min === null || min <= 0 || min > 1440) ruins.push(i + 1);
  });
  return ruins;
}

/** Atividades do formulário → números (só as linhas completas e válidas). */
export function atividadesDoForm(lista: AtividadeForm[] | undefined): Atividade[] {
  const saida: Atividade[] = [];
  for (const a of lista ?? []) {
    if (atividadeEmBranco(a)) continue;
    const met = numero(a.met);
    const min = numero(a.minutos_por_dia);
    if (a.descricao.trim() && met !== null && met > 0 && min !== null && min > 0) {
      saida.push({ descricao: a.descricao.trim().slice(0, DESCRICAO_MAX), met: arred(met, 2), minutos_por_dia: Math.round(min) });
    }
  }
  return saida;
}

export function dadosDoForm(f: FormEnergetico): Dados {
  const idadeN = numero(f.idade);
  return {
    peso: numero(f.peso),
    altura: numero(f.altura),
    idade: idadeN === null ? null : Math.round(idadeN),
    sexo: ehSexo(f.sexo) ? f.sexo : "",
    massaMagra: numero(f.massa_magra),
  };
}

/** Entrada de cálculo a partir do formulário (sem mexer na data — serve pra prévia enquanto digita). */
export function entradaDoForm(f: FormEnergetico): Entrada {
  const fator = numero(f.fator_atividade);
  return {
    ...dadosDoForm(f),
    formula: f.formula,
    fatorAtividade: fator === null || fator <= 0 ? 1.2 : fator, // select sempre traz um valor válido; fora disso, sedentário
    atividades: atividadesDoForm(f.atividades),
    ajusteKcal: numero(f.ajuste_kcal) ?? 0,
  };
}

export const previaDoForm = (f: FormEnergetico): Resultados => calcular(entradaDoForm(f));

export function formParaRegistro(f: FormEnergetico): RegistroEnergetico {
  const e = entradaDoForm(f);
  const r = calcular(e);
  return {
    data: combinarDataHora(f.data, f.hora).toISOString(),
    formula: f.formula,
    peso: e.peso === null ? null : arred(e.peso, 2),
    altura: e.altura === null ? null : arred(e.altura, 2),
    idade: e.idade,
    sexo: e.sexo || null,
    massa_magra: e.massaMagra === null ? null : arred(e.massaMagra, 2),
    fator_atividade: e.fatorAtividade === null || e.fatorAtividade <= 0 ? 1.2 : arred(e.fatorAtividade, 3),
    atividades: e.atividades,
    tmb: r.tmb,
    get: r.get,
    ajuste_kcal: arred(e.ajusteKcal, 2),
    vet: r.vet,
    objetivo: f.objetivo,
    observacao: f.observacao.trim() || null,
  };
}

export type LinhaCalculo = {
  data: string;
  formula: string;
  peso: number | null;
  altura: number | null;
  idade: number | null;
  sexo: string | null;
  massa_magra: number | null;
  fator_atividade: number;
  atividades: unknown;
  ajuste_kcal: number;
  objetivo: string;
  observacao: string | null;
};

const texto = (n: number | null): string => (n === null ? "" : String(n));

export function registroParaForm(c: LinhaCalculo): FormEnergetico {
  const d = new Date(c.data);
  return {
    data: chaveDia(d),
    hora: formatarHora(d),
    formula: ehFormula(c.formula) ? c.formula : FORMULA_PADRAO,
    peso: texto(c.peso),
    altura: texto(c.altura),
    idade: texto(c.idade),
    sexo: ehSexo(c.sexo) ? c.sexo : "",
    massa_magra: texto(c.massa_magra),
    fator_atividade: fatorParaForm(c.fator_atividade),
    atividades: lerAtividades(c.atividades).map((a) => ({ descricao: a.descricao, met: String(a.met), minutos_por_dia: String(a.minutos_por_dia) })),
    ajuste_kcal: c.ajuste_kcal ? String(c.ajuste_kcal) : "",
    objetivo: ehObjetivo(c.objetivo) ? c.objetivo : "manter",
    observacao: c.observacao ?? "",
  };
}

// ---- Pré-preenchimento ----
export type Origem = Dados & { tipo: "antropometria" | "cadastro"; data: string | null };

/**
 * Dados iniciais de um cálculo novo: a última antropometria (peso, altura, sexo e a massa magra que ela calculou) ou,
 * sem ela, o cadastro. A idade é sempre recalculada do nascimento (a gravada na antropometria pode ter ficado pra trás).
 */
export function origemDosDados(
  paciente: { genero: string | null; nascimento: string | null },
  ultima: { data: string; peso: number | null; altura: number | null; sexo: string | null; idade: number | null; resultados: unknown } | null | undefined,
  agora: Date = new Date(),
): Origem {
  const idadeCadastro = idadeEm(paciente.nascimento, agora);
  if (!ultima) {
    return { tipo: "cadastro", data: null, peso: null, altura: null, idade: idadeCadastro, sexo: sexoDoGenero(paciente.genero), massaMagra: null };
  }
  const r = lerResultados(ultima.resultados);
  return {
    tipo: "antropometria",
    data: ultima.data,
    peso: ultima.peso,
    altura: ultima.altura,
    idade: idadeCadastro ?? ultima.idade,
    sexo: ehSexo(ultima.sexo) ? ultima.sexo : sexoDoGenero(paciente.genero),
    massaMagra: r.massa_magra,
  };
}

/** Formulário de um cálculo novo: agora, dados da origem, fator sedentário, sem atividades, sem ajuste. */
export function formNovo(o: Origem, formula: Formula = FORMULA_PADRAO, agora: Date = new Date()): FormEnergetico {
  return {
    data: chaveDia(agora),
    hora: formatarHora(agora),
    formula,
    peso: texto(o.peso),
    altura: texto(o.altura),
    idade: texto(o.idade),
    sexo: o.sexo,
    massa_magra: texto(o.massaMagra),
    fator_atividade: FATOR_PADRAO,
    atividades: [],
    ajuste_kcal: "",
    objetivo: "manter",
    observacao: "",
  };
}
