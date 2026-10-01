// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/alimentosUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { arred, fmtNum, numero } from "@/nutricao/editor/lib/antropometriaUtil";

// Regras puras da tela Meus alimentos (W8): normalização da busca (mesma regra da coluna `busca` do banco), macros
// por porção/medida caseira (regra de 3 a partir dos 100 g), kcal estimada pelos fatores de Atwater (4/4/9) × a
// informada, leitura do jsonb `nutrientes`, medidas caseiras do formulário e a conversão formulário ⇄ registro.
// Nada de rede aqui; testado no vitest.

export { arred, fmtNum, numero };

// ---- Fonte ----
export type Fonte = "taco" | "proprio";
export type FiltroFonte = "" | Fonte;
export const FONTES: { valor: FiltroFonte; rotulo: string }[] = [
  { valor: "", rotulo: "Todas as fontes" },
  { valor: "taco", rotulo: "TACO" },
  { valor: "proprio", rotulo: "Meus alimentos" },
];
export const ehFonte = (v: unknown): v is Fonte => v === "taco" || v === "proprio";
export const rotuloFonte = (f: string | null | undefined): string => (f === "taco" ? "TACO" : f === "proprio" ? "Meu alimento" : (f ?? ""));
export const MARCA_MAX = 80;
/** Marca do alimento próprio limpa (espaços únicos, ≤ MARCA_MAX); vazia → null. A TACO é a referência e nunca tem marca. */
export const limparMarca = (s: string | null | undefined): string | null => (s ?? "").trim().replace(/\s+/g, " ").slice(0, MARCA_MAX) || null;
/** Etiqueta da lista/busca: a MARCA do alimento próprio quando houver ("Italac"), senão o rótulo da fonte ("TACO" / "Meu alimento"). */
export const etiquetaAlimento = (a: { fonte: string; marca?: string | null }): string => {
  const marca = a.fonte === "proprio" ? limparMarca(a.marca) : null;
  return marca ?? rotuloFonte(a.fonte);
};
export const TACO_DESCRICAO ="TACO — Tabela Brasileira de Composição de Alimentos, 4ª edição (NEPA/Unicamp, 2011)";
/** Só alimento próprio é editável — a base TACO é de todo mundo e só leitura. */
export const editavel = (a: { fonte: string }): boolean => a.fonte === "proprio";

// ---- Grupos (rótulos exatos da TACO; viram sugestões no cadastro) ----
export const GRUPOS_TACO: string[] = [
  "Alimentos preparados",
  "Bebidas (alcoólicas e não alcoólicas)",
  "Carnes e derivados",
  "Cereais e derivados",
  "Frutas e derivados",
  "Gorduras e óleos",
  "Leguminosas e derivados",
  "Leite e derivados",
  "Miscelâneas",
  "Nozes e sementes",
  "Outros alimentos industrializados",
  "Ovos e derivados",
  "Pescados e frutos do mar",
  "Produtos açucarados",
  "Verduras, hortaliças e derivados",
];

// ---- Busca ----
export const semAcento = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Sem acento, sem caixa, sem os caracteres especiais do filtro do PostgREST, espaços únicos — mesma regra da coluna `busca`. */
export const normalizarBusca = (q: string | null | undefined): string =>
  semAcento(q ?? "").toLowerCase().replace(/[,()"'\\%_*;]/g, " ").replace(/\s+/g, " ").trim();
/** Palavras da busca (até 6): cada uma vira um `ilike '%palavra%'` na coluna `busca` (E lógico). */
export const palavrasBusca = (q: string | null | undefined): string[] => normalizarBusca(q).split(" ").filter(Boolean).slice(0, 6);
/** Espelho do filtro do banco: o alimento casa quando TODAS as palavras aparecem no nome normalizado. */
export function casaComBusca(nome: string, q: string): boolean {
  const n = normalizarBusca(nome);
  return palavrasBusca(q).every((p) => n.includes(p));
}
/** Mesma regra da coluna `busca` desde a W38: nome + marca (buscar "italac" acha o alimento da marca). */
export const casaComBuscaAlimento = (a: { nome: string; marca?: string | null }, q: string): boolean => casaComBusca(`${a.nome} ${a.marca ?? ""}`, q);

export interface FiltrosAlimentos {
  q: string;
  grupo: string; // "" = todos
  fonte: FiltroFonte;
}
export const FILTROS_PADRAO: FiltrosAlimentos = { q: "", grupo: "", fonte: "" };
export const filtrosAtivos = (f: FiltrosAlimentos): boolean => !!f.q.trim() || !!f.grupo || !!f.fonte;

// ---- Macros (sempre por 100 g) e regra de 3 ----
export type Macros = {
  energia_kcal: number | null;
  proteina_g: number | null;
  carboidrato_g: number | null;
  lipidio_g: number | null;
  fibra_g: number | null;
  sodio_mg: number | null;
};
export const MACRO_CHAVES = ["energia_kcal", "proteina_g", "carboidrato_g", "lipidio_g", "fibra_g", "sodio_mg"] as const;
export type MacroChave = (typeof MACRO_CHAVES)[number];
export const MACROS: { chave: MacroChave; rotulo: string; curto: string; unidade: string }[] = [
  { chave: "energia_kcal", rotulo: "Energia", curto: "kcal", unidade: "kcal" },
  { chave: "proteina_g", rotulo: "Proteína", curto: "P", unidade: "g" },
  { chave: "carboidrato_g", rotulo: "Carboidrato", curto: "C", unidade: "g" },
  { chave: "lipidio_g", rotulo: "Lipídios", curto: "L", unidade: "g" },
  { chave: "fibra_g", rotulo: "Fibra alimentar", curto: "Fibra", unidade: "g" },
  { chave: "sodio_mg", rotulo: "Sódio", curto: "Na", unidade: "mg" },
];
export const MACROS_VAZIOS: Macros = { energia_kcal: null, proteina_g: null, carboidrato_g: null, lipidio_g: null, fibra_g: null, sodio_mg: null };

/** Valor por 100 g → valor pra `gramas` (regra de 3), 2 casas. Sem valor → null. */
export const porGramas = (por100: number | null | undefined, gramas: number): number | null =>
  por100 === null || por100 === undefined || !Number.isFinite(gramas) || gramas < 0 ? null : arred((por100 * gramas) / 100, 2);

export const macrosPorGramas = (a: Macros, gramas: number): Macros => ({
  energia_kcal: porGramas(a.energia_kcal, gramas),
  proteina_g: porGramas(a.proteina_g, gramas),
  carboidrato_g: porGramas(a.carboidrato_g, gramas),
  lipidio_g: porGramas(a.lipidio_g, gramas),
  fibra_g: porGramas(a.fibra_g, gramas),
  sodio_mg: porGramas(a.sodio_mg, gramas),
});

/** kcal estimada pelos fatores de Atwater: 4 kcal/g de proteína e de carboidrato, 9 kcal/g de lipídio. Falta algum → null. */
export function kcalAtwater(proteina: number | null, carboidrato: number | null, lipidio: number | null): number | null {
  if (proteina === null || carboidrato === null || lipidio === null) return null;
  return arred(4 * proteina + 4 * carboidrato + 9 * lipidio, 2);
}
/** Diferença da kcal informada em relação à estimada, em % (positivo = informada maior). Sem as duas → null. */
export function divergenciaKcal(informada: number | null, estimada: number | null): number | null {
  if (informada === null || estimada === null || estimada <= 0) return null;
  return arred(((informada - estimada) / estimada) * 100, 1);
}
/** Acima disso a prévia avisa que a kcal informada destoa dos macros. */
export const DIVERGENCIA_ALERTA_PCT = 15;

// ---- Nutrientes (jsonb `nutrientes`, além dos macros em coluna) ----
export type NutrienteDef = { chave: string; rotulo: string; unidade: string };
export const NUTRIENTES: NutrienteDef[] = [
  { chave: "umidade_pct", rotulo: "Umidade", unidade: "%" },
  { chave: "energia_kj", rotulo: "Energia", unidade: "kJ" },
  { chave: "acucares_g", rotulo: "Açúcares", unidade: "g" },
  { chave: "colesterol_mg", rotulo: "Colesterol", unidade: "mg" },
  { chave: "saturados_g", rotulo: "Gorduras saturadas", unidade: "g" },
  { chave: "monoinsaturados_g", rotulo: "Gorduras monoinsaturadas", unidade: "g" },
  { chave: "poliinsaturados_g", rotulo: "Gorduras poli-insaturadas", unidade: "g" },
  { chave: "trans_g", rotulo: "Gorduras trans", unidade: "g" },
  { chave: "cinzas_g", rotulo: "Cinzas", unidade: "g" },
  { chave: "calcio_mg", rotulo: "Cálcio", unidade: "mg" },
  { chave: "magnesio_mg", rotulo: "Magnésio", unidade: "mg" },
  { chave: "manganes_mg", rotulo: "Manganês", unidade: "mg" },
  { chave: "fosforo_mg", rotulo: "Fósforo", unidade: "mg" },
  { chave: "ferro_mg", rotulo: "Ferro", unidade: "mg" },
  { chave: "potassio_mg", rotulo: "Potássio", unidade: "mg" },
  { chave: "cobre_mg", rotulo: "Cobre", unidade: "mg" },
  { chave: "zinco_mg", rotulo: "Zinco", unidade: "mg" },
  { chave: "retinol_mcg", rotulo: "Retinol", unidade: "µg" },
  { chave: "re_mcg", rotulo: "Vitamina A (RE)", unidade: "µg" },
  { chave: "rae_mcg", rotulo: "Vitamina A (RAE)", unidade: "µg" },
  { chave: "tiamina_mg", rotulo: "Tiamina (B1)", unidade: "mg" },
  { chave: "riboflavina_mg", rotulo: "Riboflavina (B2)", unidade: "mg" },
  { chave: "piridoxina_mg", rotulo: "Piridoxina (B6)", unidade: "mg" },
  { chave: "niacina_mg", rotulo: "Niacina (B3)", unidade: "mg" },
  { chave: "vitamina_c_mg", rotulo: "Vitamina C", unidade: "mg" },
];

/** Lê o jsonb com segurança: só números finitos e não negativos (aceita número em texto). */
export function lerNutrientes(v: unknown): Record<string, number> {
  const saida: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return saida;
  for (const [chave, valor] of Object.entries(v as Record<string, unknown>)) {
    const n = numero(typeof valor === "number" || typeof valor === "string" ? valor : null);
    if (n !== null && n >= 0) saida[chave] = n;
  }
  return saida;
}
export type NutrienteValor = NutrienteDef & { valor: number };
/** Nutrientes presentes, na ordem da tabela; chaves desconhecidas vão pro fim com a própria chave como rótulo. */
export function nutrientesListados(v: unknown): NutrienteValor[] {
  const lidos = lerNutrientes(v);
  const saida: NutrienteValor[] = [];
  for (const d of NUTRIENTES) {
    if (lidos[d.chave] !== undefined) saida.push({ ...d, valor: lidos[d.chave] });
  }
  const conhecidas = new Set(NUTRIENTES.map((d) => d.chave));
  for (const [chave, valor] of Object.entries(lidos)) {
    if (!conhecidas.has(chave)) saida.push({ chave, rotulo: chave, unidade: "", valor });
  }
  return saida;
}

// ---- Textos ----
/** Quantidade pra tela: até 2 casas, sem zeros à direita, vírgula ("25,8", "100", "0,03"); null → "—". */
export const fmtQtd = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
export const fmtComUnidade = (n: number | null | undefined, unidade: string): string =>
  n === null || n === undefined ? "—" : `${fmtQtd(n)}${unidade === "%" ? "" : " "}${unidade}`.trim();

/** Linha da lista, por 100 g: "124 kcal · P 2,6 g · C 25,8 g · L 1 g". */
export function resumoMacros(a: Macros): string {
  const partes: string[] = [];
  if (a.energia_kcal !== null) partes.push(`${fmtQtd(a.energia_kcal)} kcal`);
  if (a.proteina_g !== null) partes.push(`P ${fmtQtd(a.proteina_g)} g`);
  if (a.carboidrato_g !== null) partes.push(`C ${fmtQtd(a.carboidrato_g)} g`);
  if (a.lipidio_g !== null) partes.push(`L ${fmtQtd(a.lipidio_g)} g`);
  return partes.length ? partes.join(" · ") : "sem valores nutricionais";
}
export function textoTotal(total: number, comFiltro: boolean): string {
  if (comFiltro) return total === 1 ? "1 alimento encontrado" : `${total} alimentos encontrados`;
  return `Total de alimentos: ${total}`;
}

// ---- Medidas caseiras ----
export const NOME_MAX = 160;
export const GRUPO_MAX = 80;
export const DESCRICAO_MAX = 80;
export const MEDIDAS_MAX = 12;

/** Linha do formulário (como a nutricionista digita; gramas aceita vírgula). */
export type MedidaForm = { descricao: string; gramas: string };
/** Medida pronta pro banco. */
export type MedidaNova = { descricao: string; gramas: number; ordem: number };

export const medidaVazia = (): MedidaForm => ({ descricao: "", gramas: "" });
const temAlgo = (m: MedidaForm): boolean => !!(m.descricao ?? "").trim() || !!(m.gramas ?? "").trim();
export const medidasPreenchidas = (l: MedidaForm[]): MedidaForm[] => l.filter(temAlgo);

/** Posições (1-based) das linhas incompletas: descrição sem gramas válidas (> 0) ou gramas sem descrição. Linha em branco não conta. */
export function medidasInvalidas(l: MedidaForm[]): number[] {
  const ruins: number[] = [];
  l.forEach((m, i) => {
    if (!temAlgo(m)) return;
    const g = numero(m.gramas);
    if (!(m.descricao ?? "").trim() || g === null || g <= 0 || g >= 100000) ruins.push(i + 1);
  });
  return ruins;
}
/** Linhas válidas → medidas prontas (ordem = posição na lista). Linhas em branco são ignoradas. */
export function medidasDoForm(l: MedidaForm[]): MedidaNova[] {
  const saida: MedidaNova[] = [];
  for (const m of l) {
    if (!temAlgo(m)) continue;
    const g = numero(m.gramas);
    const d = (m.descricao ?? "").trim().replace(/\s+/g, " ");
    if (!d || g === null || g <= 0) continue;
    saida.push({ descricao: d.slice(0, DESCRICAO_MAX), gramas: arred(g, 2), ordem: saida.length });
  }
  return saida;
}
export const ordenarMedidas = <T extends { ordem: number; descricao: string }>(l: T[]): T[] =>
  [...l].sort((a, b) => a.ordem - b.ordem || a.descricao.localeCompare(b.descricao, "pt-BR"));
/** "1 colher de sopa cheia (25 g)" */
export const rotuloMedida = (m: { descricao: string; gramas: number }): string => `${m.descricao} (${fmtQtd(m.gramas)} g)`;

// ---- Formulário ⇄ registro ----
/** O que a nutricionista digita no modal (números como texto: aceita vírgula). */
export type FormAlimento = {
  nome: string;
  marca: string;
  grupo: string;
  porcao_g: string;
  energia_kcal: string;
  proteina_g: string;
  carboidrato_g: string;
  lipidio_g: string;
  fibra_g: string;
  sodio_mg: string;
  /** "Demais nutrientes": chave da tabela NUTRIENTES → valor digitado (texto, aceita vírgula); só os preenchidos vão pro jsonb */
  nutrientes: Record<string, string>;
  medidas: MedidaForm[];
};
export const FORM_VAZIO: FormAlimento = {
  nome: "",
  marca: "",
  grupo: "",
  porcao_g: "100",
  energia_kcal: "",
  proteina_g: "",
  carboidrato_g: "",
  lipidio_g: "",
  fibra_g: "",
  sodio_mg: "",
  nutrientes: {},
  medidas: [],
};
/** Colunas do alimento que o formulário controla (fonte/dona ficam fora). `nutrientes` = jsonb só com o que foi preenchido. */
export type RegistroAlimento = Macros & { nome: string; grupo: string | null; porcao_g: number; marca: string | null; nutrientes: Record<string, number> };
/** O que chega do banco pra edição (`nutrientes` é jsonb; `marca` pode faltar em registro sem a coluna). */
export type RegistroLido = Macros & { nome: string; grupo: string | null; porcao_g: number; marca?: string | null; nutrientes?: unknown };

export const textoNumero = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const valorOuNull = (s: string | null | undefined): number | null => {
  const n = numero(s);
  return n === null || n < 0 ? null : arred(n, 2);
};

export function formParaRegistro(f: FormAlimento): RegistroAlimento {
  const porcao = numero(f.porcao_g);
  return {
    nome: (f.nome ?? "").trim().replace(/\s+/g, " ").slice(0, NOME_MAX),
    grupo: (f.grupo ?? "").trim().replace(/\s+/g, " ").slice(0, GRUPO_MAX) || null,
    porcao_g: porcao !== null && porcao > 0 && porcao < 100000 ? arred(porcao, 2) : 100,
    energia_kcal: valorOuNull(f.energia_kcal),
    proteina_g: valorOuNull(f.proteina_g),
    carboidrato_g: valorOuNull(f.carboidrato_g),
    lipidio_g: valorOuNull(f.lipidio_g),
    fibra_g: valorOuNull(f.fibra_g),
    sodio_mg: valorOuNull(f.sodio_mg),
    marca: limparMarca(f.marca),
    nutrientes: nutrientesDoForm(f.nutrientes),
  };
}
/** Campos "Demais nutrientes" do formulário → jsonb: só chaves da tabela com valor válido (≥ 0), 3 casas; vazio/inválido fica de fora. */
export function nutrientesDoForm(n: Record<string, string> | null | undefined): Record<string, number> {
  const saida: Record<string, number> = {};
  if (!n) return saida;
  for (const d of NUTRIENTES) {
    const v = numero(n[d.chave]);
    if (v !== null && v >= 0 && v < 1000000) saida[d.chave] = arred(v, 3);
  }
  return saida;
}
/** jsonb gravado → campos do formulário (texto com vírgula), só as chaves da tabela. */
export function nutrientesParaForm(v: unknown): Record<string, string> {
  const lidos = lerNutrientes(v);
  const saida: Record<string, string> = {};
  for (const d of NUTRIENTES) {
    if (lidos[d.chave] !== undefined) saida[d.chave] = textoNumero(lidos[d.chave]);
  }
  return saida;
}
/** Quantos "demais nutrientes" válidos o formulário tem (contagem no botão). */
export const totalNutrientesPreenchidos = (n: Record<string, string> | null | undefined): number => Object.keys(nutrientesDoForm(n)).length;

export function registroParaForm(a: RegistroLido & { medidas_caseiras?: { descricao: string; gramas: number; ordem: number }[] | null }): FormAlimento {
  return {
    nome: a.nome,
    marca: a.marca ?? "",
    grupo: a.grupo ?? "",
    porcao_g: textoNumero(a.porcao_g) || "100",
    energia_kcal: textoNumero(a.energia_kcal),
    proteina_g: textoNumero(a.proteina_g),
    carboidrato_g: textoNumero(a.carboidrato_g),
    lipidio_g: textoNumero(a.lipidio_g),
    fibra_g: textoNumero(a.fibra_g),
    sodio_mg: textoNumero(a.sodio_mg),
    nutrientes: nutrientesParaForm(a.nutrientes),
    medidas: ordenarMedidas(a.medidas_caseiras ?? []).map((m) => ({ descricao: m.descricao, gramas: textoNumero(m.gramas) })),
  };
}
/** Macros do formulário enquanto digita (prévia). */
export const macrosDoForm = (f: FormAlimento): Macros => ({
  energia_kcal: valorOuNull(f.energia_kcal),
  proteina_g: valorOuNull(f.proteina_g),
  carboidrato_g: valorOuNull(f.carboidrato_g),
  lipidio_g: valorOuNull(f.lipidio_g),
  fibra_g: valorOuNull(f.fibra_g),
  sodio_mg: valorOuNull(f.sodio_mg),
});

// ---- Ordenação ----
/** Alfabética pelo nome normalizado (sem acento/caixa); empate → alimento próprio antes da TACO. */
export function ordenarAlimentos<T extends { nome: string; fonte: string }>(l: T[]): T[] {
  return [...l].sort(
    (a, b) => normalizarBusca(a.nome).localeCompare(normalizarBusca(b.nome)) || (a.fonte === b.fonte ? 0 : a.fonte === "proprio" ? -1 : 1),
  );
}
export const inserirOrdenado = <T extends { id: string; nome: string; fonte: string }>(l: T[], a: T): T[] =>
  ordenarAlimentos([...l.filter((x) => x.id !== a.id), a]);
