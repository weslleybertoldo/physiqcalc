// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/antropometriaUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { differenceInYears, format, isValid, parseISO } from "date-fns";
import { chaveDia, combinarDataHora, formatarHora } from "@/nutricao/editor/lib/agendaUtil";

// Regras puras da antropometria (W6): medidas, protocolos de dobras, fórmulas de composição corporal e a conversão
// formulário ⇄ registro do banco. Nada de rede aqui; testado no vitest com valores conferidos à mão.
// Referências: OMS (classificação do IMC) · Jackson & Pollock 1978 (homens) e Jackson, Pollock & Ward 1980
// (mulheres) — 3 e 7 dobras · Faulkner 1968 (4 dobras, % direto) · Guedes 1985 (3 dobras) · Siri 1961
// (densidade → % de gordura).

// ---- Sexo e protocolo ----
export type Sexo = "masculino" | "feminino";
export const SEXOS: { valor: Sexo; rotulo: string }[] = [
  { valor: "masculino", rotulo: "Masculino" },
  { valor: "feminino", rotulo: "Feminino" },
];
export const ehSexo = (v: unknown): v is Sexo => v === "masculino" || v === "feminino";
/** O gênero do cadastro vira o sexo padrão da avaliação ("outro"/vazio fica em branco: a nutricionista escolhe). */
export const sexoDoGenero = (genero: string | null | undefined): Sexo | "" => (ehSexo(genero) ? genero : "");
export const rotuloSexo = (s: string | null | undefined): string => SEXOS.find((x) => x.valor === s)?.rotulo ?? "—";

export type Protocolo = "nenhum" | "pollock3" | "pollock7" | "faulkner" | "guedes";
export const PROTOCOLOS: { valor: Protocolo; rotulo: string; curto: string }[] = [
  { valor: "nenhum", rotulo: "Sem protocolo (só medidas)", curto: "sem protocolo" },
  { valor: "pollock3", rotulo: "Jackson & Pollock — 3 dobras", curto: "Pollock 3" },
  { valor: "pollock7", rotulo: "Jackson & Pollock — 7 dobras", curto: "Pollock 7" },
  { valor: "faulkner", rotulo: "Faulkner — 4 dobras", curto: "Faulkner" },
  { valor: "guedes", rotulo: "Guedes — 3 dobras", curto: "Guedes" },
];
export const ehProtocolo = (v: unknown): v is Protocolo => PROTOCOLOS.some((p) => p.valor === v);
export function rotuloProtocolo(p: string | null | undefined, curto = true): string {
  const x = PROTOCOLOS.find((y) => y.valor === p);
  return x ? (curto ? x.curto : x.rotulo) : (p ?? "");
}
/** Protocolos que precisam do sexo / da idade pra fechar a densidade. */
export const protocoloPrecisaSexo = (p: Protocolo): boolean => p === "pollock3" || p === "pollock7" || p === "guedes";
export const protocoloPrecisaIdade = (p: Protocolo): boolean => p === "pollock3" || p === "pollock7";

// ---- Medidas ----
export type ChaveCircunferencia =
  | "pescoco" | "ombro" | "torax" | "cintura" | "abdomen" | "quadril"
  | "braco_d" | "braco_e" | "antebraco_d" | "antebraco_e" | "coxa_d" | "coxa_e" | "panturrilha_d" | "panturrilha_e";
export const CIRCUNFERENCIAS: { chave: ChaveCircunferencia; rotulo: string }[] = [
  { chave: "pescoco", rotulo: "Pescoço" },
  { chave: "ombro", rotulo: "Ombro" },
  { chave: "torax", rotulo: "Tórax" },
  { chave: "cintura", rotulo: "Cintura" },
  { chave: "abdomen", rotulo: "Abdômen" },
  { chave: "quadril", rotulo: "Quadril" },
  { chave: "braco_d", rotulo: "Braço direito" },
  { chave: "braco_e", rotulo: "Braço esquerdo" },
  { chave: "antebraco_d", rotulo: "Antebraço direito" },
  { chave: "antebraco_e", rotulo: "Antebraço esquerdo" },
  { chave: "coxa_d", rotulo: "Coxa direita" },
  { chave: "coxa_e", rotulo: "Coxa esquerda" },
  { chave: "panturrilha_d", rotulo: "Panturrilha direita" },
  { chave: "panturrilha_e", rotulo: "Panturrilha esquerda" },
];
export type ChaveDobra = "triceps" | "biceps" | "subescapular" | "suprailiaca" | "abdominal" | "coxa" | "peitoral" | "axilar_media" | "panturrilha";
export const DOBRAS: { chave: ChaveDobra; rotulo: string }[] = [
  { chave: "triceps", rotulo: "Tríceps" },
  { chave: "biceps", rotulo: "Bíceps" },
  { chave: "subescapular", rotulo: "Subescapular" },
  { chave: "suprailiaca", rotulo: "Suprailíaca" },
  { chave: "abdominal", rotulo: "Abdominal" },
  { chave: "coxa", rotulo: "Coxa" },
  { chave: "peitoral", rotulo: "Peitoral" },
  { chave: "axilar_media", rotulo: "Axilar média" },
  { chave: "panturrilha", rotulo: "Panturrilha" },
];
export const CHAVES_CIRCUNFERENCIAS: string[] = CIRCUNFERENCIAS.map((c) => c.chave);
export const CHAVES_DOBRAS: string[] = DOBRAS.map((d) => d.chave);
export const rotuloCircunferencia = (c: string): string => CIRCUNFERENCIAS.find((x) => x.chave === c)?.rotulo ?? c;
export const rotuloDobra = (d: string): string => DOBRAS.find((x) => x.chave === d)?.rotulo ?? d;

/** Dobras que o protocolo exige, na ordem de medição. Pollock 3 e Guedes mudam com o sexo (sem sexo → conjunto masculino). */
export function dobrasNecessarias(protocolo: Protocolo, sexo: Sexo | ""): ChaveDobra[] {
  switch (protocolo) {
    case "pollock3":
      return sexo === "feminino" ? ["triceps", "suprailiaca", "coxa"] : ["peitoral", "abdominal", "coxa"];
    case "pollock7":
      return ["peitoral", "axilar_media", "triceps", "subescapular", "abdominal", "suprailiaca", "coxa"];
    case "faulkner":
      return ["triceps", "subescapular", "suprailiaca", "abdominal"];
    case "guedes":
      return sexo === "feminino" ? ["coxa", "suprailiaca", "subescapular"] : ["triceps", "suprailiaca", "abdominal"];
    default:
      return [];
  }
}

// ---- Números ----
/** "70,5" / "70.5" / " 70 " → 70.5; vazio ou inválido → null. */
export function numero(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = (v ?? "").toString().trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export const arred = (n: number, casas = 2): number => Math.round(n * 10 ** casas) / 10 ** casas;
/** Número pra tela, com vírgula ("—" quando não há). */
export const fmtNum = (n: number | null | undefined, casas = 1): string => (n === null || n === undefined ? "—" : n.toFixed(casas).replace(".", ","));

/** Lê um jsonb de medidas ({chave: número}) com segurança: só números finitos e positivos. */
export function lerMedidas(v: unknown): Record<string, number> {
  const saida: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return saida;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = numero(typeof x === "number" || typeof x === "string" ? x : null);
    if (n !== null && n > 0) saida[k] = n;
  }
  return saida;
}

// ---- Fórmulas ----
export type Resultados = {
  imc: number | null;
  classificacao_imc: string | null;
  densidade: number | null;
  percentual_gordura: number | null;
  massa_gorda: number | null;
  massa_magra: number | null;
  rcq: number | null;
  rce: number | null;
};
export const RESULTADOS_VAZIOS: Resultados = {
  imc: null, classificacao_imc: null, densidade: null, percentual_gordura: null, massa_gorda: null, massa_magra: null, rcq: null, rce: null,
};

/** Lê o jsonb `resultados` do banco com segurança (o que faltar vira null). */
export function lerResultados(v: unknown): Resultados {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const num = (k: keyof Resultados): number | null => (typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : null);
  return {
    imc: num("imc"),
    classificacao_imc: typeof o.classificacao_imc === "string" ? o.classificacao_imc : null,
    densidade: num("densidade"),
    percentual_gordura: num("percentual_gordura"),
    massa_gorda: num("massa_gorda"),
    massa_magra: num("massa_magra"),
    rcq: num("rcq"),
    rce: num("rce"),
  };
}

/** IMC = peso (kg) / altura (m)². */
export function calcularIMC(pesoKg: number | null, alturaCm: number | null): number | null {
  if (pesoKg === null || alturaCm === null || pesoKg <= 0 || alturaCm <= 0) return null;
  const m = alturaCm / 100;
  return arred(pesoKg / (m * m), 2);
}

/** Classificação da OMS (adultos). */
export function classificarIMC(imc: number): string {
  if (imc < 18.5) return "Abaixo do peso";
  if (imc < 25) return "Peso normal";
  if (imc < 30) return "Sobrepeso";
  if (imc < 35) return "Obesidade grau I";
  if (imc < 40) return "Obesidade grau II";
  return "Obesidade grau III";
}

/** Soma das dobras pedidas; falta alguma → null. */
export function somaDobras(dobras: Record<string, number>, chaves: readonly string[]): number | null {
  if (!chaves.length) return null;
  let soma = 0;
  for (const k of chaves) {
    const v = dobras[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
    soma += v;
  }
  return soma;
}

/** Siri (1961): % gordura = 495 / densidade − 450. */
export const siri = (densidade: number): number => arred(495 / densidade - 450, 2);

/** Densidade corporal (g/cm³) pelos protocolos que passam pela densidade. Faulkner e "nenhum" → null. */
export function densidadeCorporal(protocolo: Protocolo, sexo: Sexo | "", idade: number | null, dobras: Record<string, number>): number | null {
  const soma = somaDobras(dobras, dobrasNecessarias(protocolo, sexo));
  if (soma === null) return null;
  switch (protocolo) {
    case "pollock3":
      if (!sexo || idade === null) return null;
      return sexo === "masculino"
        ? 1.10938 - 0.0008267 * soma + 0.0000016 * soma * soma - 0.0002574 * idade
        : 1.0994921 - 0.0009929 * soma + 0.0000023 * soma * soma - 0.0001392 * idade;
    case "pollock7":
      if (!sexo || idade === null) return null;
      return sexo === "masculino"
        ? 1.112 - 0.00043499 * soma + 0.00000055 * soma * soma - 0.00028826 * idade
        : 1.097 - 0.00046971 * soma + 0.00000056 * soma * soma - 0.00012828 * idade;
    case "guedes":
      if (!sexo) return null;
      return sexo === "masculino" ? 1.17136 - 0.06706 * Math.log10(soma) : 1.1665 - 0.07063 * Math.log10(soma);
    default:
      return null;
  }
}

/** % de gordura do protocolo (com a densidade quando o protocolo passa por ela). */
export function percentualGordura(protocolo: Protocolo, sexo: Sexo | "", idade: number | null, dobras: Record<string, number>): { densidade: number | null; percentual: number | null } {
  if (protocolo === "faulkner") {
    const soma = somaDobras(dobras, dobrasNecessarias("faulkner", sexo));
    return { densidade: null, percentual: soma === null ? null : arred(soma * 0.153 + 5.783, 2) };
  }
  const d = densidadeCorporal(protocolo, sexo, idade, dobras);
  if (d === null || d <= 0) return { densidade: null, percentual: null };
  return { densidade: arred(d, 4), percentual: siri(d) };
}

export type EntradaCalculo = {
  peso: number | null;
  altura: number | null;
  sexo: Sexo | "";
  idade: number | null;
  protocolo: Protocolo;
  circunferencias: Record<string, number>;
  dobras: Record<string, number>;
};

/** Tudo que a avaliação consegue calcular com o que foi medido (o que faltar fica null). */
export function calcular(e: EntradaCalculo): Resultados {
  const imc = calcularIMC(e.peso, e.altura);
  const { densidade, percentual } = percentualGordura(e.protocolo, e.sexo, e.idade, e.dobras);
  const massaGorda = e.peso !== null && e.peso > 0 && percentual !== null ? arred((e.peso * percentual) / 100, 2) : null;
  const massaMagra = e.peso !== null && massaGorda !== null ? arred(e.peso - massaGorda, 2) : null;
  const cintura = e.circunferencias.cintura ?? null;
  const quadril = e.circunferencias.quadril ?? null;
  const rcq = cintura && quadril ? arred(cintura / quadril, 2) : null;
  const rce = cintura && e.altura ? arred(cintura / e.altura, 2) : null;
  return {
    imc,
    classificacao_imc: imc === null ? null : classificarIMC(imc),
    densidade,
    percentual_gordura: percentual,
    massa_gorda: massaGorda,
    massa_magra: massaMagra,
    rcq,
    rce,
  };
}

// ---- Idade ----
/** Idade completa na data da avaliação, a partir do nascimento (yyyy-MM-dd) do cadastro. */
export function idadeEm(nascimento: string | null | undefined, em: Date = new Date()): number | null {
  if (!nascimento) return null;
  const n = parseISO(nascimento);
  if (!isValid(n)) return null;
  const anos = differenceInYears(em, n);
  return anos >= 0 && anos <= 130 ? anos : null;
}

// ---- Lista, gráfico, textos ----
const instante = (iso: string): number => new Date(iso).getTime();

/** Mais recente primeiro (pela data da avaliação; empate → a criada por último primeiro). */
export function ordenarAntropometrias<T extends { data: string; created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => instante(b.data) - instante(a.data) || instante(b.created_at) - instante(a.created_at));
}

export const inserirOrdenada = <T extends { id: string; data: string; created_at: string }>(lista: T[], a: T): T[] =>
  ordenarAntropometrias([...lista.filter((x) => x.id !== a.id), a]);

export type PontoEvolucao = { data: string; rotulo: string; peso: number | null; gordura: number | null };

/** Série do gráfico (da mais antiga pra mais recente): peso e % de gordura por data. */
export function serieEvolucao<T extends { data: string; peso: number | null; resultados: unknown }>(lista: T[]): PontoEvolucao[] {
  return [...lista]
    .sort((a, b) => instante(a.data) - instante(b.data))
    .map((a) => ({ data: a.data, rotulo: format(new Date(a.data), "dd/MM/yy"), peso: a.peso, gordura: lerResultados(a.resultados).percentual_gordura }));
}

export function textoContagem(n: number): string {
  if (n === 0) return "Nenhuma avaliação";
  if (n === 1) return "1 avaliação";
  return `${n} avaliações`;
}

export const formatarDataHoraAntropometria = (iso: string): string => format(new Date(iso), "dd/MM/yyyy HH:mm");

/** Linha da lista: "80,0 kg · IMC 24,7 · 13,6% gordura (Pollock 3)". */
export function resumoAvaliacao(a: { peso: number | null; protocolo: string; resultados: unknown }): string {
  const r = lerResultados(a.resultados);
  const partes = [a.peso !== null ? `${fmtNum(a.peso, 1)} kg` : "sem peso"];
  if (r.imc !== null) partes.push(`IMC ${fmtNum(r.imc, 1)}`);
  if (r.percentual_gordura !== null) partes.push(`${fmtNum(r.percentual_gordura, 1)}% gordura (${rotuloProtocolo(a.protocolo)})`);
  return partes.join(" · ");
}

/** `antropometria-<paciente sem acento>-<yyyy-MM-dd>.pdf` */
export function nomeArquivoPDF(paciente: string, d: Date): string {
  const slug = paciente
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "paciente";
  return `antropometria-${slug}-${format(d, "yyyy-MM-dd")}.pdf`;
}

// ---- Formulário ⇄ registro ----
export const OBSERVACAO_MAX = 4000;

/** O que a nutricionista digita no modal (números como texto: aceita vírgula). */
export type FormAntropometria = {
  data: string;
  hora: string;
  peso: string;
  altura: string;
  sexo: Sexo | "";
  idade: string;
  protocolo: Protocolo;
  circunferencias: Record<string, string>;
  dobras: Record<string, string>;
  observacao: string;
};

/** Como vai/vem do banco. */
export type RegistroAntropometria = {
  data: string;
  peso: number | null;
  altura: number | null;
  sexo: Sexo | null;
  idade: number | null;
  protocolo: Protocolo;
  circunferencias: Record<string, number>;
  dobras: Record<string, number>;
  resultados: Resultados;
  observacao: string | null;
};

/** Medidas do formulário → números (só as chaves pedidas, só as preenchidas e positivas). */
export function medidasDoForm(m: Record<string, string> | undefined, chaves: readonly string[]): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const k of chaves) {
    const n = numero(m?.[k]);
    if (n !== null && n > 0) saida[k] = arred(n, 2);
  }
  return saida;
}

/** Dobras que ficam no registro: as do protocolo; sem protocolo, todas as preenchidas. */
export const chavesDobrasDoForm = (protocolo: Protocolo, sexo: Sexo | ""): string[] =>
  protocolo === "nenhum" ? CHAVES_DOBRAS : dobrasNecessarias(protocolo, sexo);

/** Entrada de cálculo a partir do formulário (sem mexer na data — serve pra prévia enquanto digita). */
export function entradaDoForm(f: FormAntropometria): EntradaCalculo {
  const idadeN = numero(f.idade);
  return {
    peso: numero(f.peso),
    altura: numero(f.altura),
    sexo: ehSexo(f.sexo) ? f.sexo : "",
    idade: idadeN === null ? null : Math.round(idadeN),
    protocolo: f.protocolo,
    circunferencias: medidasDoForm(f.circunferencias, CHAVES_CIRCUNFERENCIAS),
    dobras: medidasDoForm(f.dobras, chavesDobrasDoForm(f.protocolo, f.sexo)),
  };
}

export const previaDoForm = (f: FormAntropometria): Resultados => calcular(entradaDoForm(f));

/** Dobras do protocolo que ainda não foram preenchidas (rótulos), pra avisar antes de salvar. */
export function dobrasFaltando(f: FormAntropometria): string[] {
  if (f.protocolo === "nenhum") return [];
  return dobrasNecessarias(f.protocolo, f.sexo).filter((k) => numero(f.dobras[k]) === null).map(rotuloDobra);
}

export function formParaRegistro(f: FormAntropometria): RegistroAntropometria {
  const e = entradaDoForm(f);
  return {
    data: combinarDataHora(f.data, f.hora).toISOString(),
    peso: e.peso === null ? null : arred(e.peso, 2),
    altura: e.altura === null ? null : arred(e.altura, 2),
    sexo: e.sexo || null,
    idade: e.idade,
    protocolo: f.protocolo,
    circunferencias: e.circunferencias,
    dobras: e.dobras,
    resultados: calcular(e),
    observacao: f.observacao.trim() || null,
  };
}

export type LinhaAntropometria = {
  data: string;
  peso: number | null;
  altura: number | null;
  sexo: string | null;
  idade: number | null;
  protocolo: string;
  circunferencias: unknown;
  dobras: unknown;
  observacao: string | null;
};

const textoMedidas = (m: Record<string, number>): Record<string, string> => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v)]));

export function registroParaForm(a: LinhaAntropometria): FormAntropometria {
  const d = new Date(a.data);
  return {
    data: chaveDia(d),
    hora: formatarHora(d),
    peso: a.peso === null ? "" : String(a.peso),
    altura: a.altura === null ? "" : String(a.altura),
    sexo: ehSexo(a.sexo) ? a.sexo : "",
    idade: a.idade === null ? "" : String(a.idade),
    protocolo: ehProtocolo(a.protocolo) ? a.protocolo : "nenhum",
    circunferencias: textoMedidas(lerMedidas(a.circunferencias)),
    dobras: textoMedidas(lerMedidas(a.dobras)),
    observacao: a.observacao ?? "",
  };
}

/** Formulário de uma avaliação nova: agora, sexo do cadastro, idade calculada do nascimento e o protocolo da última avaliação. */
export function formNovo(p: { genero: string | null; nascimento: string | null }, protocolo: Protocolo = "nenhum", agora: Date = new Date()): FormAntropometria {
  const idade = idadeEm(p.nascimento, agora);
  return {
    data: chaveDia(agora),
    hora: formatarHora(agora),
    peso: "",
    altura: "",
    sexo: sexoDoGenero(p.genero),
    idade: idade === null ? "" : String(idade),
    protocolo,
    circunferencias: {},
    dobras: {},
    observacao: "",
  };
}
