/**
 * Regras PURAS da série única de avaliações e fotos (W10): normaliza as linhas dos 2 bancos, junta em ordem de data com o
 * autor, e calcula o que a tela 4 mostra (período 3M/6M/1A, cards Peso/Gordura/Músculo com a variação, gráfico, tabela
 * com as variações, resumo do período, última avaliação, fotos por data e o Comparar). Sem rede aqui (testado no vitest);
 * quem busca é `fontes.ts` (o aluno) — a W12 e a W17 reusam estas regras com as fontes delas.
 */
import { DOBRA_KEYS, metodoDe, numero, rotuloMetodo, rotulosDobras, tmbEscolhida } from "@/lib/avaliacao";
import { MEDIDA_FIELDS, MEDIDA_GROUPS } from "@/lib/medidas";
import { classificarGordura, type ClassificacaoGordura } from "@/utils/composicaoCorporal";
import { mesCurto } from "./formato";
import type {
  AntropometriaPrincipal,
  Autor,
  Avaliacao,
  ChaveMedida,
  DobraAvaliacao,
  Foto,
  FotoPrincipal,
  LinhaFotoTreino,
  LinhaTreino,
  MetodoAvaliacao,
  ParteTreino,
  PartePrincipal,
  Periodo,
  Posicao,
  Serie,
  SessaoFotos,
} from "./tipos";

// ───────────────────────── medidas, dobras e protocolos ─────────────────────────

export type GrupoMedida = (typeof MEDIDA_GROUPS)[number]["key"];

/** As medidas na ordem da tela (as 13 do Calc + o abdômen, depois da cintura). */
export const MEDIDAS: { chave: ChaveMedida; rotulo: string; grupo: GrupoMedida }[] = (() => {
  const lista: { chave: ChaveMedida; rotulo: string; grupo: GrupoMedida }[] = [];
  for (const f of MEDIDA_FIELDS) {
    lista.push({ chave: f.key, rotulo: f.label, grupo: f.group });
    if (f.key === "medida_cintura") lista.push({ chave: "medida_abdomen", rotulo: "Abdômen", grupo: "tronco" });
  }
  return lista;
})();

export const GRUPOS_MEDIDA = MEDIDA_GROUPS;

/** Medidas em que diminuir é bom (a regra do Calc: cintura e quadril; o abdômen entra junto). */
const MEDIDAS_MENOR_MELHOR: ChaveMedida[] = ["medida_cintura", "medida_quadril", "medida_abdomen"];

/** Circunferências da antropometria do Nutri → as medidas do Calc (tórax = peitoral). */
const MEDIDA_DO_NUTRI: Record<string, ChaveMedida> = {
  pescoco: "medida_pescoco",
  ombro: "medida_ombro",
  torax: "medida_peitoral",
  cintura: "medida_cintura",
  abdomen: "medida_abdomen",
  quadril: "medida_quadril",
  braco_d: "medida_braco_d",
  braco_e: "medida_braco_e",
  antebraco_d: "medida_antebraco_d",
  antebraco_e: "medida_antebraco_e",
  coxa_d: "medida_coxa_d",
  coxa_e: "medida_coxa_e",
  panturrilha_d: "medida_panturrilha_d",
  panturrilha_e: "medida_panturrilha_e",
};

/** Dobras da antropometria do Nutri, na ordem do formulário de lá. */
const DOBRAS_DO_NUTRI: [string, string][] = [
  ["triceps", "Tríceps"],
  ["biceps", "Bíceps"],
  ["subescapular", "Subescapular"],
  ["suprailiaca", "Suprailíaca"],
  ["abdominal", "Abdominal"],
  ["coxa", "Coxa"],
  ["peitoral", "Peitoral"],
  ["axilar_media", "Axilar média"],
  ["panturrilha", "Panturrilha"],
];

/** Dobras que o protocolo mede, na ordem (a mesma regra do Nutri; Pollock 3 e Guedes mudam com o sexo — sem sexo, o masculino). */
function ordemDasDobras(protocolo: string | null, sexo: string | null): string[] {
  const f = sexo === "feminino";
  switch (protocolo) {
    case "pollock3":
      return f ? ["triceps", "suprailiaca", "coxa"] : ["peitoral", "abdominal", "coxa"];
    case "pollock7":
      return ["peitoral", "axilar_media", "triceps", "subescapular", "abdominal", "suprailiaca", "coxa"];
    case "faulkner":
      return ["triceps", "subescapular", "suprailiaca", "abdominal"];
    case "guedes":
      return f ? ["coxa", "suprailiaca", "subescapular"] : ["triceps", "suprailiaca", "abdominal"];
    default:
      return [];
  }
}

const PROTOCOLOS: Record<string, { metodo: MetodoAvaliacao; titulo: string; tipo: string }> = {
  pollock3: { metodo: "pollock3", titulo: "Avaliação por 3 dobras", tipo: "Jackson & Pollock — 3 dobras" },
  pollock7: { metodo: "pollock7", titulo: "Avaliação por 7 dobras", tipo: "Jackson & Pollock — 7 dobras" },
  faulkner: { metodo: "faulkner", titulo: "Avaliação por 4 dobras", tipo: "Faulkner — 4 dobras" },
  guedes: { metodo: "guedes", titulo: "Avaliação por 3 dobras", tipo: "Guedes — 3 dobras" },
};

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function dataISO(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 10) : "";
}

/** Só números positivos de um jsonb {chave: número} (o formato do Nutri). */
function lerNumeros(v: unknown): Record<string, number> {
  const saida: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return saida;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = numero(typeof x === "string" ? x.replace(",", ".") : x);
    if (n !== null && n > 0) saida[k] = n;
  }
  return saida;
}

// ───────────────────────── Banco do Treino (Calc) ─────────────────────────

function medidasDoTreino(l: LinhaTreino): Partial<Record<ChaveMedida, number>> {
  const m: Partial<Record<ChaveMedida, number>> = {};
  for (const { chave } of MEDIDAS) {
    const v = numero(l[chave]);
    if (v !== null) m[chave] = v;
  }
  return m;
}

function sexoDoTreino(v: unknown): "M" | "F" | null {
  return v === "male" ? "M" : v === "female" ? "F" : null;
}

/** Tipo e título de uma linha do Calc: só é "3 dobras" etc. quando tem composição (registro só com medidas não é). */
function tipoDoTreino(l: LinhaTreino, temMedidas: boolean): { metodo: MetodoAvaliacao; titulo: string; tipo: string } {
  if (numero(l.percentual_gordura) !== null) {
    const m = metodoDe(l.metodo_avaliacao);
    return { metodo: m, titulo: `Avaliação por ${m === "bioimpedancia" ? "bioimpedância" : rotuloMetodo(m)}`, tipo: rotuloMetodo(m) };
  }
  if (temMedidas) return { metodo: "medidas", titulo: "Medidas corporais", tipo: "Medidas" };
  return { metodo: "fisica", titulo: "Avaliação física", tipo: "Avaliação física" };
}

/** Linha de `physiq_avaliacoes` (ou o perfil) → avaliação da série. Sexo e idade vêm do perfil (a linha não guarda). */
export function avaliacaoDoTreino(l: LinhaTreino, ctx: { perfil: LinhaTreino | null; autor: Autor }): Avaliacao {
  const medidas = medidasDoTreino(l);
  const tipo = tipoDoTreino(l, Object.keys(medidas).length > 0);
  const sexo = sexoDoTreino(ctx.perfil?.sexo ?? l.sexo);
  const metodo = metodoDe(l.metodo_avaliacao);
  const bio = metodo === "bioimpedancia";
  const dobras: DobraAvaliacao[] = [];
  if (!bio && numero(l.percentual_gordura) !== null) {
    const rotulos = rotulosDobras(metodo, sexo === "F" ? "female" : "male");
    rotulos.forEach((rotulo, i) => {
      const v = numero(l[DOBRA_KEYS[i]]);
      if (v !== null) dobras.push({ rotulo, valor: v });
    });
  }
  const t = tmbEscolhida(l);
  return {
    id: `treino:${String(l.id ?? "")}`,
    idOriginal: String(l.id ?? ""),
    origem: "treino",
    data: dataISO(l.data_avaliacao),
    criadoEm: texto(l.created_at),
    ...tipo,
    autor: ctx.autor,
    sexo,
    idade: numero(ctx.perfil?.idade ?? l.idade),
    peso: numero(l.peso),
    altura: numero(l.altura),
    gordura: numero(l.percentual_gordura),
    massaGorda: numero(l.massa_gorda),
    massaMagra: numero(l.massa_magra),
    massaMuscular: bio ? numero(l.massa_muscular) : null,
    agua: bio ? numero(l.agua_corporal) : null,
    visceral: bio ? numero(l.gordura_visceral) : null,
    imc: null,
    classificacaoImc: null,
    tmb: t.valor !== null ? { metodo: t.metodo, rotulo: t.label, valor: t.valor } : null,
    dobras,
    medidas,
    observacao: texto(l.observacao),
  };
}

/** O perfil do Treino tem os dados que a tela antiga mostrava ("Dados pessoais" pedia peso e idade; a composição, o %). */
export function perfilTemDados(perfil: LinhaTreino | null | undefined): boolean {
  if (!perfil) return false;
  return (numero(perfil.peso) !== null && numero(perfil.idade) !== null) || numero(perfil.percentual_gordura) !== null;
}

/**
 * A última avaliação do Treino com os números ATUAIS do perfil (o que o professor gravou por último e a tela antiga mostrava
 * em "Composição Corporal"): o que o perfil tem vence; o que só a linha tem, fica. A data e a observação são da linha.
 */
export function mesclarPerfil(av: Avaliacao, perfil: LinhaTreino): Avaliacao {
  const p = avaliacaoDoTreino({ ...perfil, id: av.idOriginal, data_avaliacao: av.data, created_at: av.criadoEm, observacao: null }, { perfil, autor: av.autor });
  const escolher = <K extends keyof Avaliacao>(k: K): Avaliacao[K] => (p[k] ?? av[k]) as Avaliacao[K];
  const tipo = p.gordura !== null ? { metodo: p.metodo, titulo: p.titulo, tipo: p.tipo } : { metodo: av.metodo, titulo: av.titulo, tipo: av.tipo };
  return {
    ...av,
    ...tipo,
    peso: escolher("peso"),
    altura: escolher("altura"),
    gordura: escolher("gordura"),
    massaGorda: escolher("massaGorda"),
    massaMagra: escolher("massaMagra"),
    massaMuscular: p.gordura !== null ? p.massaMuscular : av.massaMuscular,
    agua: p.gordura !== null ? p.agua : av.agua,
    visceral: p.gordura !== null ? p.visceral : av.visceral,
    tmb: escolher("tmb"),
    dobras: p.dobras.length ? p.dobras : av.dobras,
    medidas: { ...av.medidas, ...p.medidas },
    atual: true,
  };
}

// ───────────────────────── banco principal (Nutri) ─────────────────────────

/** Antropometria do principal → avaliação da série. A observação da nutricionista NÃO vai ao aluno (a função nem manda). */
export function avaliacaoDoPrincipal(a: AntropometriaPrincipal): Avaliacao {
  const r = a.resultados && typeof a.resultados === "object" ? (a.resultados as Record<string, unknown>) : {};
  const medidas: Partial<Record<ChaveMedida, number>> = {};
  for (const [k, v] of Object.entries(lerNumeros(a.circunferencias))) {
    const chave = MEDIDA_DO_NUTRI[k];
    if (chave) medidas[chave] = v;
  }
  const brutas = lerNumeros(a.dobras);
  // na ordem de medição do protocolo (a do formulário da nutri); as que sobrarem, na ordem da lista de lá
  const ordem = [...ordemDasDobras(a.protocolo, a.sexo), ...DOBRAS_DO_NUTRI.map(([k]) => k)].filter((k, i, l) => l.indexOf(k) === i);
  const rotulos = Object.fromEntries(DOBRAS_DO_NUTRI);
  const dobras: DobraAvaliacao[] = ordem.filter((k) => brutas[k] !== undefined).map((k) => ({ rotulo: rotulos[k], valor: brutas[k] }));
  const prot = PROTOCOLOS[a.protocolo ?? ""];
  const tipo = prot ?? (Object.keys(medidas).length
    ? { metodo: "medidas" as const, titulo: "Antropometria", tipo: "Só medidas" }
    : { metodo: "fisica" as const, titulo: "Antropometria", tipo: "Peso e altura" });
  let altura = numero(a.altura);
  if (altura !== null && altura > 0 && altura < 3) altura = Math.round(altura * 1000) / 10; // em metros por engano
  const gordura = numero(r.percentual_gordura);
  return {
    id: `principal:${a.id}`,
    idOriginal: a.id,
    origem: "principal",
    data: dataISO(a.data),
    criadoEm: a.criado_em ?? null,
    ...tipo,
    autor: { id: a.autor_id ?? null, nome: texto(a.autor_nome), papel: "nutricionista" },
    sexo: a.sexo === "masculino" ? "M" : a.sexo === "feminino" ? "F" : null,
    idade: numero(a.idade),
    peso: numero(a.peso),
    altura,
    gordura,
    massaGorda: numero(r.massa_gorda),
    massaMagra: numero(r.massa_magra),
    massaMuscular: null,
    agua: null,
    visceral: null,
    imc: numero(r.imc),
    classificacaoImc: texto(r.classificacao_imc),
    tmb: null,
    dobras: prot ? dobras : [],
    medidas,
    observacao: null,
  };
}

// ───────────────────────── fotos ─────────────────────────

const POSICAO_DO_TREINO: Record<string, Posicao> = { frente: "frente", costas: "costas", lateral_direita: "lado_d", lateral_esquerda: "lado_e" };
const POSICAO_DO_PRINCIPAL: Record<string, Posicao> = { frente: "frente", costas: "costas", lado_d: "lado_d", lado_e: "lado_e" };
export const ORDEM_POSICOES: Posicao[] = ["frente", "lado_d", "lado_e", "costas"];

/** Fotos mensais do Calc (`physiq_registros_fotos`): Frente, Costas, Lateral D e E, subidas pelo personal. */
export function fotosDoTreino(linhas: LinhaFotoTreino[], autor: Autor): Foto[] {
  return linhas
    .filter((l) => POSICAO_DO_TREINO[l.tipo] && l.storage_path)
    .map((l) => ({
      id: `treino:${l.id}`,
      origem: "treino" as const,
      data: dataISO(l.mes_ref),
      mensal: true,
      posicao: POSICAO_DO_TREINO[l.tipo],
      caminho: l.storage_path,
      url: l.url ?? null,
      autor,
      criadoEm: l.created_at ?? null,
    }));
}

/** Evolução fotográfica do Nutri (`fotos_evolucao`): posição e data de cada foto, subidas pela nutricionista. */
export function fotosDoPrincipal(linhas: FotoPrincipal[]): Foto[] {
  return linhas
    .filter((l) => POSICAO_DO_PRINCIPAL[l.posicao] && l.path)
    .map((l) => ({
      id: `principal:${l.id}`,
      origem: "principal" as const,
      data: dataISO(l.data),
      mensal: false,
      posicao: POSICAO_DO_PRINCIPAL[l.posicao],
      caminho: l.path,
      url: l.url ?? null,
      autor: { id: l.autor_id ?? null, nome: texto(l.autor_nome), papel: "nutricionista" as const },
      criadoEm: l.criado_em ?? null,
    }));
}

/** Fotos agrupadas por data e origem (a mais recente primeiro); 2 fotos na mesma posição e data → a enviada por último. */
export function sessoesDeFotos(fotos: Foto[]): SessaoFotos[] {
  const mapa = new Map<string, SessaoFotos>();
  for (const f of fotos) {
    const chave = `${f.origem}:${f.data}`;
    const s = mapa.get(chave) ?? { chave, origem: f.origem, data: f.data, mensal: f.mensal, autor: f.autor, fotos: {} };
    const atual = s.fotos[f.posicao];
    if (!atual || (f.criadoEm ?? "") > (atual.criadoEm ?? "")) s.fotos[f.posicao] = f;
    mapa.set(chave, s);
  }
  return [...mapa.values()].sort((a, b) => (b.data === a.data ? (a.origem === "principal" ? -1 : 1) : b.data.localeCompare(a.data)));
}

export type SlotFoto = "frente" | "lado" | "costas";
export const SLOTS: { slot: SlotFoto; rotulo: string }[] = [
  { slot: "frente", rotulo: "Frente" },
  { slot: "lado", rotulo: "Lado" },
  { slot: "costas", rotulo: "Costas" },
];

/** Foto do quadro da tela 4: "Lado" = o lado direito (ou o esquerdo, se só tiver ele). */
export function fotoDoSlot(s: SessaoFotos | null | undefined, slot: SlotFoto): Foto | null {
  if (!s) return null;
  if (slot === "lado") return s.fotos.lado_d ?? s.fotos.lado_e ?? null;
  return s.fotos[slot] ?? null;
}

/** Posições que têm foto em alguma data (na ordem Frente, Lado D, Lado E, Costas). */
export function posicoesComFotos(sessoes: SessaoFotos[]): Posicao[] {
  return ORDEM_POSICOES.filter((p) => sessoes.some((s) => s.fotos[p]));
}

/** Datas (sessões) com foto na posição, a mais recente primeiro. */
export function sessoesComPosicao(sessoes: SessaoFotos[], posicao: Posicao): SessaoFotos[] {
  return sessoes.filter((s) => s.fotos[posicao]);
}

/** Comparar começa com a penúltima (antes) e a última (depois) — a regra da tela antiga (mês anterior × mais recente). */
export function comparacaoInicial(sessoes: SessaoFotos[], posicao: Posicao): { antes: string | null; depois: string | null } {
  const lista = sessoesComPosicao(sessoes, posicao);
  return { antes: lista[1]?.chave ?? lista[0]?.chave ?? null, depois: lista[0]?.chave ?? null };
}

// ───────────────────────── a série ─────────────────────────

export function temDados(av: Avaliacao): boolean {
  return (
    av.peso !== null ||
    av.gordura !== null ||
    av.massaMagra !== null ||
    av.massaGorda !== null ||
    av.massaMuscular !== null ||
    av.agua !== null ||
    av.visceral !== null ||
    av.tmb !== null ||
    av.dobras.length > 0 ||
    Object.keys(av.medidas).length > 0
  );
}

/** Em ordem de data (a mais antiga primeiro); na mesma data, a criada antes. */
export function ordenar(avs: Avaliacao[]): Avaliacao[] {
  return [...avs].sort((a, b) => a.data.localeCompare(b.data) || (a.criadoEm ?? "").localeCompare(b.criadoEm ?? "") || a.origem.localeCompare(b.origem));
}

export interface EntradaSerie {
  treino: ParteTreino | null;
  principal: PartePrincipal | null;
  /** o personal responsável (o autor das avaliações e fotos do Treino — a linha de lá não guarda quem fez) */
  personal: { id: string | null; nome: string | null } | null;
}

/** Soma as 2 origens numa série só, em ordem de data, com o autor. */
export function montarSerie(e: EntradaSerie): Serie {
  const autorTreino: Autor = { id: e.personal?.id ?? null, nome: e.personal?.nome ?? null, papel: "personal" };
  const perfil = e.treino?.perfil ?? null;
  let doTreino = ordenar((e.treino?.avaliacoes ?? []).map((l) => avaliacaoDoTreino(l, { perfil, autor: autorTreino })));
  let composicaoAtual: Avaliacao | null = null;
  if (perfil && perfilTemDados(perfil)) {
    const comDados = doTreino.filter(temDados);
    const ultima = comDados[comDados.length - 1];
    if (ultima) {
      doTreino = doTreino.map((a) => (a.id === ultima.id ? mesclarPerfil(a, perfil) : a));
    } else {
      composicaoAtual = { ...avaliacaoDoTreino({ ...perfil, id: "perfil", data_avaliacao: "", created_at: null, observacao: null }, { perfil, autor: autorTreino }), id: "treino:perfil", atual: true };
    }
  }
  const doPrincipal = (e.principal?.antropometrias ?? []).map(avaliacaoDoPrincipal);
  const fotos = [...fotosDoTreino(e.treino?.fotos ?? [], autorTreino), ...fotosDoPrincipal(e.principal?.fotos ?? [])];
  return {
    avaliacoes: ordenar([...doTreino, ...doPrincipal]),
    fotos,
    sessoes: sessoesDeFotos(fotos),
    composicaoAtual,
    objetivo: e.principal?.objetivo ?? null,
  };
}

/** Nada para mostrar: nenhuma avaliação com número, nenhum dado atual no perfil e nenhuma foto. */
export function serieVazia(s: Serie): boolean {
  return !s.avaliacoes.some(temDados) && !s.composicaoAtual && s.fotos.length === 0;
}

/** A avaliação do card "última avaliação": a mais recente com número (senão os dados atuais do perfil). */
export function ultimaAvaliacao(s: Serie): Avaliacao | null {
  const comDados = s.avaliacoes.filter(temDados);
  return comDados[comDados.length - 1] ?? s.composicaoAtual ?? null;
}

// ───────────────────────── período ─────────────────────────

/** Hoje em yyyy-mm-dd no fuso de São Paulo. */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** yyyy-mm-dd + N meses (o dia fica no último do mês quando não existe: 31/03 − 1 mês = 28/02). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = total - ano * 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export const MESES_DO_PERIODO: Record<Exclude<Periodo, "tudo">, number> = { "3m": 3, "6m": 6, "1a": 12 };

export function inicioDoPeriodo(p: Periodo, hoje: string): string | null {
  return p === "tudo" ? null : somarMeses(hoje, -MESES_DO_PERIODO[p]);
}

export function noPeriodo<T extends { data: string }>(itens: T[], p: Periodo, hoje: string): T[] {
  const ini = inicioDoPeriodo(p, hoje);
  return ini ? itens.filter((i) => i.data >= ini) : itens;
}

/** "Peso nos últimos 6 meses" · "no último ano" · "em todas as avaliações". */
export function rotuloDoPeriodo(p: Periodo): string {
  return { "3m": "nos últimos 3 meses", "6m": "nos últimos 6 meses", "1a": "no último ano", tudo: "em todas as avaliações" }[p];
}

// ───────────────────────── métricas ─────────────────────────

export type Metrica = "peso" | "gordura" | "massaMagra" | "massaGorda" | "massaMuscular" | "agua" | "visceral" | "tmb" | ChaveMedida;
export type Melhor = "menor" | "maior" | "objetivo" | "neutro";

export interface InfoMetrica {
  chave: Metrica;
  rotulo: string;
  curto: string;
  unidade: string;
  /** unidade da variação ("pts" = pontos percentuais) */
  unidadeVariacao: string;
  melhor: Melhor;
  casas: number;
}

export const METRICAS_BASE: InfoMetrica[] = [
  { chave: "peso", rotulo: "Peso", curto: "Peso", unidade: "kg", unidadeVariacao: "kg", melhor: "objetivo", casas: 1 },
  { chave: "gordura", rotulo: "% de gordura", curto: "Gordura", unidade: "%", unidadeVariacao: "pts", melhor: "menor", casas: 1 },
  { chave: "massaMagra", rotulo: "Massa magra", curto: "M. magra", unidade: "kg", unidadeVariacao: "kg", melhor: "maior", casas: 1 },
  { chave: "massaGorda", rotulo: "Massa gorda", curto: "M. gorda", unidade: "kg", unidadeVariacao: "kg", melhor: "menor", casas: 1 },
  { chave: "massaMuscular", rotulo: "Massa muscular", curto: "Músculo", unidade: "kg", unidadeVariacao: "kg", melhor: "maior", casas: 1 },
  { chave: "agua", rotulo: "Água corporal", curto: "Água", unidade: "%", unidadeVariacao: "pts", melhor: "maior", casas: 1 },
  { chave: "visceral", rotulo: "Gordura visceral", curto: "Visceral", unidade: "nível", unidadeVariacao: "", melhor: "menor", casas: 1 },
  { chave: "tmb", rotulo: "TMB", curto: "TMB", unidade: "kcal", unidadeVariacao: "kcal", melhor: "maior", casas: 0 },
];

export const METRICAS_MEDIDA: InfoMetrica[] = MEDIDAS.map((m) => ({
  chave: m.chave,
  rotulo: m.rotulo,
  curto: m.rotulo,
  unidade: "cm",
  unidadeVariacao: "cm",
  melhor: MEDIDAS_MENOR_MELHOR.includes(m.chave) ? "menor" : "maior",
  casas: 1,
}));

const TODAS_METRICAS = [...METRICAS_BASE, ...METRICAS_MEDIDA];

export function infoMetrica(m: Metrica): InfoMetrica {
  return TODAS_METRICAS.find((x) => x.chave === m) ?? METRICAS_BASE[0];
}

export function valorDe(av: Avaliacao, m: Metrica): number | null {
  switch (m) {
    case "peso":
      return av.peso;
    case "gordura":
      return av.gordura;
    case "massaMagra":
      return av.massaMagra;
    case "massaGorda":
      return av.massaGorda;
    case "massaMuscular":
      return av.massaMuscular;
    case "agua":
      return av.agua;
    case "visceral":
      return av.visceral;
    case "tmb":
      return av.tmb?.valor ?? null;
    default:
      return av.medidas[m] ?? null;
  }
}

/** Métricas que têm pelo menos 1 valor na lista (na ordem: as do corpo, depois as medidas). */
export function metricasComDados(avs: Avaliacao[]): Metrica[] {
  return TODAS_METRICAS.filter((i) => avs.some((a) => valorDe(a, i.chave) !== null)).map((i) => i.chave);
}

/** O objetivo da matrícula (NF8) diz se o peso descendo é bom: emagrecer/definir → sim; ganhar massa → não; os 2 ou nada → neutro. */
export function sentidoDoObjetivo(objetivo: string | null | undefined): "perder" | "ganhar" | null {
  const t = (objetivo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!t.trim()) return null;
  const perder = /emagrec|perd|defin|secar|cutting|reduz|queima/.test(t);
  const ganhar = /hipertrof|ganh|bulk|massa muscular|forca/.test(t);
  if (perder === ganhar) return null;
  return perder ? "perder" : "ganhar";
}

export type Tom = "bom" | "ruim" | "neutro";

/** Cor da variação: verde quando foi pro lado bom, rosa quando foi pro ruim; o peso segue o objetivo. */
export function tomDaVariacao(m: Metrica, delta: number | null, objetivo?: string | null): Tom {
  if (delta === null || Math.abs(delta) < 0.05) return "neutro";
  const melhor = infoMetrica(m).melhor;
  if (melhor === "neutro") return "neutro";
  const sentido = melhor === "objetivo" ? sentidoDoObjetivo(objetivo) : melhor === "menor" ? "perder" : "ganhar";
  if (!sentido) return "neutro";
  return (sentido === "perder" ? delta < 0 : delta > 0) ? "bom" : "ruim";
}

export interface PontoSerie {
  data: string;
  valor: number;
  av: Avaliacao;
}

/** Os valores da métrica (as avaliações sem ela ficam de fora), em ordem de data. */
export function pontosDe(avs: Avaliacao[], m: Metrica): PontoSerie[] {
  const saida: PontoSerie[] = [];
  for (const av of avs) {
    const v = valorDe(av, m);
    if (v !== null && av.data) saida.push({ data: av.data, valor: v, av });
  }
  return saida;
}

/** Variação do período: o último valor menos o primeiro (precisa de 2 valores). */
export function variacaoNoPeriodo(pontos: PontoSerie[]): number | null {
  if (pontos.length < 2) return null;
  // sem arredondar aqui: a tela arredonda 1 vez só (como a antiga) — 15 − 8,9476 = 6,05… mostra "6,1", não "6,0"
  return pontos[pontos.length - 1].valor - pontos[0].valor;
}

export interface VariacaoMetrica {
  /** os valores da métrica dentro do período, em ordem de data */
  pontos: PontoSerie[];
  primeira: number | null;
  ultima: number | null;
  delta: number | null;
}

/**
 * A variação de uma métrica no período: o 1º e o último valor DENTRO dele e a diferença. É a MESMA conta dos cards do topo,
 * do resumo da tabela e do gráfico ("Tudo" = desde a 1ª avaliação) — nenhum lugar da tela faz outra.
 */
export function variacaoDaMetrica(avs: Avaliacao[], m: Metrica, periodo: Periodo, hoje: string): VariacaoMetrica {
  const pontos = noPeriodo(pontosDe(avs, m), periodo, hoje);
  return {
    pontos,
    primeira: pontos[0]?.valor ?? null,
    ultima: pontos[pontos.length - 1]?.valor ?? null,
    delta: variacaoNoPeriodo(pontos),
  };
}

export interface Kpi {
  metrica: Metrica;
  titulo: string;
  valor: number | null;
  unidade: string;
  variacao: number | null;
  unidadeVariacao: string;
  tom: Tom;
  casas: number;
}

/** "Músculo" é a massa muscular da balança quando a avaliação mais recente tem; senão, a massa magra ("Massa magra"). */
export function metricaDoMusculo(s: Serie): "massaMuscular" | "massaMagra" {
  const lista = [...s.avaliacoes.filter(temDados)];
  if (s.composicaoAtual) lista.push(s.composicaoAtual);
  for (let i = lista.length - 1; i >= 0; i--) {
    if (lista[i].massaMuscular !== null) return "massaMuscular";
    if (lista[i].massaMagra !== null) return "massaMagra";
  }
  return "massaMagra";
}

function kpi(s: Serie, m: Metrica, titulo: string, periodo: Periodo, hoje: string): Kpi {
  const info = infoMetrica(m);
  const todos = pontosDe(s.avaliacoes, m);
  const valor = todos.length ? todos[todos.length - 1].valor : s.composicaoAtual ? valorDe(s.composicaoAtual, m) : null;
  const variacao = variacaoDaMetrica(s.avaliacoes, m, periodo, hoje).delta;
  return { metrica: m, titulo, valor, unidade: info.unidade, variacao, unidadeVariacao: info.unidadeVariacao, tom: tomDaVariacao(m, variacao, s.objetivo), casas: info.casas };
}

/** Os 3 cards do topo da tela 4: o valor mais recente e a variação dentro do período. */
export function kpisDaSerie(s: Serie, periodo: Periodo, hoje: string): [Kpi, Kpi, Kpi] {
  const musc = metricaDoMusculo(s);
  return [
    kpi(s, "peso", "Peso", periodo, hoje),
    kpi(s, "gordura", "Gordura", periodo, hoje),
    // "Massa magra" não cabe no card de 1/3 da tela (390 px): "M. magra", como na tela antiga
    kpi(s, musc, musc === "massaMuscular" ? "Músculo" : "M. magra", periodo, hoje),
  ];
}

/** Abre no 6M (a tela 4); se ele tem menos de 2 pesos e o último ano tem mais, abre no 1A. */
export function periodoInicial(s: Serie, hoje: string): Exclude<Periodo, "tudo"> {
  const pesos = pontosDe(s.avaliacoes, "peso");
  const n6 = noPeriodo(pesos, "6m", hoje).length;
  if (n6 >= 2) return "6m";
  return noPeriodo(pesos, "1a", hoje).length > n6 ? "1a" : "6m";
}

// ───────────────────────── gráfico ─────────────────────────

function dias(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d) / 86_400_000;
}

/** Janela de tempo do gráfico: do início do período até hoje (Tudo: da 1ª avaliação até hoje ou a última). */
export function janelaDoGrafico(pontos: PontoSerie[], p: Periodo, hoje: string): { inicio: string; fim: string } {
  const ultima = pontos[pontos.length - 1]?.data ?? hoje;
  const fim = ultima > hoje ? ultima : hoje;
  const ini = inicioDoPeriodo(p, hoje) ?? pontos[0]?.data ?? hoje;
  return { inicio: ini, fim };
}

/** Posição de uma data na janela (0 = início, 1 = fim). */
export function posicaoNaJanela(data: string, janela: { inicio: string; fim: string }): number {
  const total = dias(janela.fim) - dias(janela.inicio);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (dias(data) - dias(janela.inicio)) / total));
}

/** Meses do eixo (no meio do trecho de cada mês que cabe na janela); mais de 7 → um sim, um não (o último sempre). */
export function eixoDeMeses(janela: { inicio: string; fim: string }): { rotulo: string; x: number }[] {
  const [ai, mi] = janela.inicio.split("-").map(Number);
  const [af, mf] = janela.fim.split("-").map(Number);
  const saida: { rotulo: string; x: number; dias: number }[] = [];
  for (let t = ai * 12 + (mi - 1); t <= af * 12 + (mf - 1); t++) {
    const ano = Math.floor(t / 12);
    const mes = t - ano * 12;
    const primeiro = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
    const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const ultimo = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
    const a = primeiro < janela.inicio ? janela.inicio : primeiro;
    const b = ultimo > janela.fim ? janela.fim : ultimo;
    const meio = (posicaoNaJanela(a, janela) + posicaoNaJanela(b, janela)) / 2;
    saida.push({ rotulo: mesCurto(mes), x: Math.min(0.95, Math.max(0.05, meio)), dias: dias(b) - dias(a) + 1 });
  }
  // mês que mal aparece na janela (menos de 10 dias, ex.: os 2 últimos dias de março no 6M) não ganha rótulo
  const visiveis = saida.filter((m) => m.dias >= 10);
  const lista = (visiveis.length ? visiveis : saida).map(({ rotulo, x }) => ({ rotulo, x }));
  if (lista.length <= 7) return lista;
  const passo = Math.ceil(lista.length / 6);
  return lista.filter((_, i) => (lista.length - 1 - i) % passo === 0);
}

// ───────────────────────── tabela e resumo ─────────────────────────

export interface CelulaTabela {
  valor: number | null;
  /** diferença para a avaliação anterior que tem a métrica */
  delta: number | null;
  tom: Tom;
}

export interface LinhaTabela {
  av: Avaliacao;
  celulas: Partial<Record<Metrica, CelulaTabela>>;
}

/** Linhas da tabela "N avaliações" (a mais recente primeiro), com a variação de cada métrica desde a anterior. */
export function linhasDaTabela(avs: Avaliacao[], metricas: Metrica[], objetivo?: string | null): LinhaTabela[] {
  const ultimoValor: Partial<Record<Metrica, number>> = {};
  const linhas: LinhaTabela[] = [];
  for (const av of avs) {
    const celulas: Partial<Record<Metrica, CelulaTabela>> = {};
    for (const m of metricas) {
      const v = valorDe(av, m);
      const antes = ultimoValor[m];
      const delta = v !== null && antes !== undefined ? v - antes : null;
      celulas[m] = { valor: v, delta, tom: tomDaVariacao(m, delta, objetivo) };
      if (v !== null) ultimoValor[m] = v;
    }
    linhas.push({ av, celulas });
  }
  return linhas.reverse();
}

export interface LinhaResumo {
  metrica: Metrica;
  rotulo: string;
  unidade: string;
  casas: number;
  primeira: number | null;
  ultima: number | null;
  delta: number | null;
  tom: Tom;
}

/**
 * "Resumo do período" (o "Resumo Comparativo" da tela antiga): a 1ª e a última de cada métrica no período e a variação —
 * pela `variacaoDaMetrica`, a mesma dos cards (em 6M, o Peso do resumo é o Peso do card). "Tudo" = desde a 1ª avaliação.
 */
export function resumoDoPeriodo(avs: Avaliacao[], periodo: Periodo, hoje: string, objetivo?: string | null): LinhaResumo[] {
  return metricasComDados(noPeriodo(avs, periodo, hoje)).map((m) => {
    const info = infoMetrica(m);
    const { primeira, ultima, delta } = variacaoDaMetrica(avs, m, periodo, hoje);
    return { metrica: m, rotulo: info.rotulo, unidade: info.unidade, casas: info.casas, primeira, ultima, delta, tom: tomDaVariacao(m, delta, objetivo) };
  });
}

/** A tabela "N avaliações" mostra as do PERÍODO escolhido na tela (o mesmo N do botão) ou, pelo "Ver todas", o histórico inteiro. */
export type ModoTabela = "periodo" | "todas";

/** O período de verdade de cada modo: o da tela ou "tudo" (desde a 1ª avaliação). */
export function periodoDaTabela(periodo: Periodo, modo: ModoTabela): Periodo {
  return modo === "todas" ? "tudo" : periodo;
}

export function avaliacoesDaTabela(s: Serie, periodo: Periodo, hoje: string, modo: ModoTabela): Avaliacao[] {
  return noPeriodo(s.avaliacoes, periodoDaTabela(periodo, modo), hoje);
}

/** Abre no período da tela; período sem nenhuma avaliação abre direto em "todas" (nada fica escondido). */
export function modoInicialDaTabela(s: Serie, periodo: Periodo, hoje: string): ModoTabela {
  return noPeriodo(s.avaliacoes, periodo, hoje).length > 0 ? "periodo" : "todas";
}

// ───────────────────────── composição (o "Ver") ─────────────────────────

/** Classificação do % de gordura (Gallagher/ACE/Lohman/ACSM — a mesma da tela antiga; lá o sexo vazio contava como feminino). */
export function classificacaoDe(av: Avaliacao): ClassificacaoGordura | null {
  if (av.gordura === null) return null;
  const sexo = av.sexo ?? (av.origem === "treino" ? "F" : null);
  if (!sexo) return null;
  return classificarGordura(av.gordura, sexo, av.idade || 25);
}

/** Medidas da avaliação agrupadas (Tronco, Braços, Pernas), só as preenchidas. */
export function medidasPorGrupo(av: Avaliacao): { grupo: string; rotulo: string; itens: { chave: ChaveMedida; rotulo: string; valor: number }[] }[] {
  return GRUPOS_MEDIDA.map((g) => ({
    grupo: g.key,
    rotulo: g.label,
    itens: MEDIDAS.filter((m) => m.grupo === g.key && av.medidas[m.chave] !== undefined).map((m) => ({ chave: m.chave, rotulo: m.rotulo, valor: av.medidas[m.chave] as number })),
  })).filter((g) => g.itens.length > 0);
}

/** Tipo curto na tabela: "7 dobras", "Bioimpedância", "Pollock 3", "Medidas"… */
export function tipoCurto(av: Avaliacao): string {
  return (
    {
      dobras_3: "3 dobras",
      dobras_7: "7 dobras",
      bioimpedancia: "Bioimpedância",
      pollock3: "Pollock 3",
      pollock7: "Pollock 7",
      faulkner: "Faulkner",
      guedes: "Guedes",
      medidas: "Medidas",
      fisica: "Avaliação",
    } as Record<MetodoAvaliacao, string>
  )[av.metodo];
}
