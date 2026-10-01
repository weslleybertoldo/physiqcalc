// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/questionariosUtil.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { format, isValid, parseISO } from "date-fns";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";

// Regras PURAS dos questionários de saúde (W19): perguntas por tipo (escala / sim ou não / múltipla escolha / texto) em
// jsonb, pontuação e faixas (baixo / moderado / alto), os 4 questionários do sistema (texto próprio — a MIGRATION é a fonte
// no banco; aqui é espelho pra testes e prévia), editor de perguntas, validação, formulário ⇄ registro, ordenação, datas e
// nome do PDF. Nada de rede; testado no vitest. Tela/acesso/PDF em `pages/paciente/secoes/Questionarios.tsx`,
// `components/questionarios/*`, `lib/questionarios.ts` e `lib/questionariosPdf.ts`. A aplicação guarda a PRÓPRIA cópia do
// título, das perguntas e das faixas — mudar ou excluir o questionário depois não mexe no histórico (padrão das W15–W18).

export const TITULO_QUESTIONARIO_MIN = 2;
export const TITULO_QUESTIONARIO_MAX = 120;
export const DESCRICAO_QUESTIONARIO_MAX = 500;
export const PERGUNTAS_MAX = 60;
export const PERGUNTA_TEXTO_MAX = 300;
export const OPCOES_MIN = 2;
export const OPCOES_MAX = 10;
export const OPCAO_TEXTO_MAX = 120;
export const ESCALA_MAX_MIN = 1;
export const ESCALA_MAX_MAX = 10;
export const ESCALA_MAX_PADRAO = 4;
export const PONTOS_SIM_PADRAO = 1;
export const RESPOSTA_TEXTO_MAX = 500;
export const ROTULO_FAIXA_MAX = 60;
export const FAIXAS_POR_QUESTIONARIO = 3;
export const OBSERVACAO_QUESTIONARIO_MAX = 1000;

export type TipoPergunta = "escala" | "sim_nao" | "multipla" | "texto";
const TIPOS: TipoPergunta[] = ["escala", "sim_nao", "multipla", "texto"];
export const TIPOS_PERGUNTA: { valor: TipoPergunta; rotulo: string }[] = [
  { valor: "escala", rotulo: "Escala (0 até o máximo)" },
  { valor: "sim_nao", rotulo: "Sim ou não" },
  { valor: "multipla", rotulo: "Múltipla escolha" },
  { valor: "texto", rotulo: "Texto livre (sem pontos)" },
];
export const textoTipoPergunta = (t: TipoPergunta): string => TIPOS_PERGUNTA.find((x) => x.valor === t)?.rotulo ?? TIPOS_PERGUNTA[0].rotulo;
export const lerTipoPergunta = (v: unknown): TipoPergunta => ((TIPOS as string[]).includes(v as string) ? (v as TipoPergunta) : "escala");

export type OpcaoPergunta = { texto: string; pontos: number };
/** Pergunta em memória: sempre com todos os campos (o banco pode guardar só os do tipo — `lerPerguntas` completa). */
export type Pergunta = { id: string; texto: string; tipo: TipoPergunta; max: number; pontos_sim: number; opcoes: OpcaoPergunta[] };
export type Nivel = "baixo" | "moderado" | "alto";
export const NIVEIS: Nivel[] = ["baixo", "moderado", "alto"];
export type Faixa = { min: number; max: number; rotulo: string; nivel: Nivel };
/** Valor da resposta por tipo: escala → número 0..max; sim_nao → true/false; multipla → índice da opção; texto → string. */
export type Resposta = number | boolean | string;
export type Respostas = Record<string, Resposta>;

/** Texto de 1 linha: espaços repetidos viram 1, pontas fora; número vira texto; nulo vira "". */
const texto1 = (s: unknown): string => (typeof s === "string" ? s : s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
const ehNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Quebras de linha normalizadas, espaços no fim das linhas e nas pontas fora. */
export const normalizarTexto = (s: string | null | undefined): string =>
  (s ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();

// ---- Números ----
/** '5,5' → 5.5 · '3' → 3 · número já pronto passa; lixo ('abc', '', null) → null. */
export function normalizarNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = texto1(v).replace(",", ".");
  if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export const arredondar = (n: number): number => Math.round(n * 100) / 100;
/** Pontos em pt-BR (22 → '22'; 0.5 → '0,5'); nulo → '0'. */
export const formatarPontos = (n: number | null | undefined): string => (ehNum(n) ? String(arredondar(n)).replace(".", ",") : "0");
const inteiroEntre = (v: unknown, min: number, max: number, padrao: number): number => {
  const n = normalizarNumero(v);
  return n === null ? padrao : Math.min(max, Math.max(min, Math.round(n)));
};
const pontosOuZero = (v: unknown): number => {
  const n = normalizarNumero(v);
  return n === null || n < 0 ? 0 : arredondar(n);
};

// ---- Níveis e faixas ----
export const textoNivel = (n: Nivel | "" | null | undefined): string => (n === "baixo" ? "Baixo" : n === "moderado" ? "Moderado" : n === "alto" ? "Alto" : "Sem faixa");
export const lerNivel = (v: unknown): Nivel | "" => ((NIVEIS as string[]).includes(v as string) ? (v as Nivel) : "");
/** Lê o jsonb das faixas com tolerância: só entradas com mín/máx numéricos contam (mín > máx é trocado); nível inválido vira baixo. */
export function lerFaixas(v: unknown): Faixa[] {
  if (!Array.isArray(v)) return [];
  const saida: Faixa[] = [];
  for (const f of v) {
    if (!ehObj(f)) continue;
    const min = normalizarNumero(f.min);
    const max = normalizarNumero(f.max);
    if (min === null || max === null) continue;
    const nivel = lerNivel(f.nivel) || "baixo";
    saida.push({ min: Math.min(min, max), max: Math.max(min, max), rotulo: texto1(f.rotulo).slice(0, ROTULO_FAIXA_MAX) || textoNivel(nivel), nivel });
  }
  return saida;
}
/** Primeira faixa em que mín ≤ pontos ≤ máx; nenhuma → null. */
export function faixaDaPontuacao(faixas: Faixa[], pontos: number): { rotulo: string; nivel: Nivel } | null {
  for (const f of faixas) if (pontos >= f.min && pontos <= f.max) return { rotulo: f.rotulo, nivel: f.nivel };
  return null;
}
/** 3 faixas em terços da pontuação máxima (0..t1 baixo · t1+1..t2 moderado · t2+1..máx alto) — ponto de partida de um questionário novo. */
export function faixasSugeridas(max: number): Faixa[] {
  const m = Math.max(0, Math.floor(ehNum(max) ? max : 0));
  const t1 = Math.floor(m / 3);
  const t2 = Math.floor((2 * m) / 3);
  return [
    { min: 0, max: t1, rotulo: "Baixo", nivel: "baixo" },
    { min: t1 + 1, max: Math.max(t2, t1 + 1), rotulo: "Moderado", nivel: "moderado" },
    { min: Math.max(t2, t1 + 1) + 1, max: Math.max(m, Math.max(t2, t1 + 1) + 1), rotulo: "Alto", nivel: "alto" },
  ];
}

// ---- Perguntas ----
export function lerOpcoes(v: unknown): OpcaoPergunta[] {
  if (!Array.isArray(v)) return [];
  const saida: OpcaoPergunta[] = [];
  for (const o of v) {
    if (!ehObj(o)) continue;
    const t = texto1(o.texto);
    if (!t) continue;
    saida.push({ texto: t.slice(0, OPCAO_TEXTO_MAX), pontos: pontosOuZero(o.pontos) });
  }
  return saida;
}
/** Lê o jsonb das perguntas com tolerância: só objetos com texto contam; tipo inválido vira escala; `max` 1–10 (padrão 4);
 * `pontos_sim` ≥ 0 (padrão 1); id garantido ('p<n>' quando falta ou repete). */
export function lerPerguntas(v: unknown): Pergunta[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>();
  const saida: Pergunta[] = [];
  v.forEach((item, i) => {
    if (!ehObj(item)) return;
    const textoP = texto1(item.texto);
    if (!textoP) return;
    let id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || vistos.has(id)) {
      id = `p${i + 1}`;
      let n = 1;
      while (vistos.has(id)) id = `p${i + 1}_${n++}`;
    }
    vistos.add(id);
    saida.push({
      id,
      texto: textoP,
      tipo: lerTipoPergunta(item.tipo),
      max: inteiroEntre(item.max, ESCALA_MAX_MIN, ESCALA_MAX_MAX, ESCALA_MAX_PADRAO),
      pontos_sim: item.pontos_sim === undefined ? PONTOS_SIM_PADRAO : pontosOuZero(item.pontos_sim),
      opcoes: lerOpcoes(item.opcoes),
    });
  });
  return saida;
}
/** Pra gravar um questionário: até 60 perguntas, ids sequenciais 'p1'…'pn', texto ≤ 300, opções só na múltipla (≤ 10). */
export const normalizarPerguntas = (v: unknown): Pergunta[] =>
  lerPerguntas(v)
    .slice(0, PERGUNTAS_MAX)
    .map((p, i) => ({ ...p, id: `p${i + 1}`, texto: p.texto.slice(0, PERGUNTA_TEXTO_MAX), opcoes: p.tipo === "multipla" ? p.opcoes.slice(0, OPCOES_MAX) : [] }));

// ---- Respostas e pontuação ----
export function lerRespostas(v: unknown): Respostas {
  if (!ehObj(v)) return {};
  const saida: Respostas = {};
  for (const [k, val] of Object.entries(v)) {
    if ((typeof val === "number" && Number.isFinite(val)) || typeof val === "boolean" || typeof val === "string") saida[k] = val;
  }
  return saida;
}
/** Resposta válida pro tipo (escala: número; sim_nao: booleano; multipla: índice existente; texto: não vazio). */
export function respondida(p: Pergunta, r: Resposta | undefined): boolean {
  switch (p.tipo) {
    case "escala":
      return typeof r === "number" && Number.isFinite(r);
    case "sim_nao":
      return typeof r === "boolean";
    case "multipla":
      return typeof r === "number" && Number.isInteger(r) && r >= 0 && r < p.opcoes.length;
    case "texto":
      return typeof r === "string" && r.trim() !== "";
    default:
      return false;
  }
}
/** Pontos de 1 resposta: escala = valor 0..max; sim_nao = pontos_sim se sim; multipla = pontos da opção; texto = 0. */
export function pontuarPergunta(p: Pergunta, r: Resposta | undefined): number {
  if (!respondida(p, r)) return 0;
  switch (p.tipo) {
    case "escala":
      return Math.min(p.max, Math.max(0, Math.round(r as number)));
    case "sim_nao":
      return r === true ? p.pontos_sim : 0;
    case "multipla":
      return p.opcoes[r as number].pontos;
    default:
      return 0;
  }
}
export const pontuar = (perguntas: Pergunta[], respostas: Respostas): number => arredondar(perguntas.reduce((s, p) => s + pontuarPergunta(p, respostas[p.id]), 0));
/** Máximo possível: escala = max; sim_nao = pontos_sim; multipla = maior opção; texto = 0. */
export const pontuacaoMaxima = (perguntas: Pergunta[]): number =>
  arredondar(perguntas.reduce((s, p) => s + (p.tipo === "escala" ? p.max : p.tipo === "sim_nao" ? p.pontos_sim : p.tipo === "multipla" ? Math.max(0, ...p.opcoes.map((o) => o.pontos)) : 0), 0));
export const contarRespondidas = (perguntas: Pergunta[], respostas: Respostas): number => perguntas.filter((p) => respondida(p, respostas[p.id])).length;
/** '7/10 respondidas'. */
export const textoRespondidas = (n: number, m: number): string => `${n}/${m} respondidas`;
/** '22/40 pontos'. */
export const textoPontuacao = (pontos: number, max: number): string => `${formatarPontos(pontos)}/${formatarPontos(max)} pontos`;
/** Resposta pra mostrar: escala → '3'; sim_nao → 'Sim'/'Não'; multipla → texto da opção; texto → o texto; sem resposta → '—'. */
export function textoResposta(p: Pergunta, r: Resposta | undefined): string {
  if (!respondida(p, r)) return "—";
  switch (p.tipo) {
    case "escala":
      return formatarPontos(r as number);
    case "sim_nao":
      return r === true ? "Sim" : "Não";
    case "multipla":
      return p.opcoes[r as number].texto;
    default:
      return String(r).trim();
  }
}
export const responder = (respostas: Respostas, id: string, valor: Resposta): Respostas => ({ ...respostas, [id]: valor });
/** Pra gravar: só as respondidas, cada uma no formato do tipo (escala inteira 0..max; texto ≤ 500). */
export function normalizarRespostas(perguntas: Pergunta[], respostas: Respostas): Respostas {
  const saida: Respostas = {};
  for (const p of perguntas) {
    const r = respostas[p.id];
    if (!respondida(p, r)) continue;
    if (p.tipo === "escala") saida[p.id] = Math.min(p.max, Math.max(0, Math.round(r as number)));
    else if (p.tipo === "texto") saida[p.id] = String(r).trim().slice(0, RESPOSTA_TEXTO_MAX);
    else saida[p.id] = r;
  }
  return saida;
}
export type Resultado = { pontuacao: number; faixa: string; nivel: Nivel | "" };
/** Pontuação total + rótulo e nível da faixa (sem faixa → '' / ''). */
export function calcularResultado(perguntas: Pergunta[], faixas: Faixa[], respostas: Respostas): Resultado {
  const pontuacao = pontuar(perguntas, respostas);
  const f = faixaDaPontuacao(faixas, pontuacao);
  return { pontuacao, faixa: f?.rotulo ?? "", nivel: f?.nivel ?? "" };
}

// ---- Opções da múltipla escolha ⇄ texto do editor ('texto=pontos' por linha) ----
export function opcoesDeTexto(s: string): OpcaoPergunta[] {
  const saida: OpcaoPergunta[] = [];
  for (const linha of (s ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const l = linha.trim();
    if (!l) continue;
    const i = l.lastIndexOf("=");
    const textoO = texto1(i >= 0 ? l.slice(0, i) : l);
    if (!textoO) continue;
    const pontos = i >= 0 ? normalizarNumero(l.slice(i + 1)) : 0;
    saida.push({ texto: textoO.slice(0, OPCAO_TEXTO_MAX), pontos: pontos === null || pontos < 0 ? 0 : arredondar(pontos) });
  }
  return saida;
}
export const textoDeOpcoes = (opcoes: OpcaoPergunta[]): string => opcoes.map((o) => `${o.texto}=${formatarPontos(o.pontos)}`).join("\n");

// ---- Editor de perguntas (linhas do formulário; valores em texto enquanto ela digita) ----
export type FormPergunta = { texto: string; tipo: TipoPergunta; max: string; pontosSim: string; opcoes: string };
/** Linha nova = escala 0–4. */
export const perguntaVazia = (): FormPergunta => ({ texto: "", tipo: "escala", max: String(ESCALA_MAX_PADRAO), pontosSim: String(PONTOS_SIM_PADRAO), opcoes: "" });
export const perguntaParaForm = (p: Pergunta): FormPergunta => ({ texto: p.texto, tipo: p.tipo, max: String(p.max), pontosSim: formatarPontos(p.pontos_sim), opcoes: textoDeOpcoes(p.opcoes) });
/** Linha do editor → pergunta (id pela posição; campos que não são do tipo voltam ao padrão). */
export const formParaPergunta = (f: FormPergunta, i: number): Pergunta => ({
  id: `p${i + 1}`,
  texto: texto1(f.texto).slice(0, PERGUNTA_TEXTO_MAX),
  tipo: lerTipoPergunta(f.tipo),
  max: f.tipo === "escala" ? inteiroEntre(f.max, ESCALA_MAX_MIN, ESCALA_MAX_MAX, ESCALA_MAX_PADRAO) : ESCALA_MAX_PADRAO,
  pontos_sim: f.tipo === "sim_nao" ? pontosOuZero(f.pontosSim) : PONTOS_SIM_PADRAO,
  opcoes: f.tipo === "multipla" ? opcoesDeTexto(f.opcoes).slice(0, OPCOES_MAX) : [],
});
/** Acrescenta 1 linha vazia (até 60). */
export const adicionarPergunta = (lista: FormPergunta[]): FormPergunta[] => (lista.length >= PERGUNTAS_MAX ? lista : [...lista, perguntaVazia()]);
/** Mexe numa linha sem tocar nas outras. */
export const atualizarPergunta = (lista: FormPergunta[], i: number, patch: Partial<FormPergunta>): FormPergunta[] => lista.map((p, k) => (k === i ? { ...p, ...patch } : p));
/** Tira uma linha; o editor nunca fica sem linha (sobra 1 vazia). */
export const removerPergunta = (lista: FormPergunta[], i: number): FormPergunta[] => {
  const resto = lista.filter((_, k) => k !== i);
  return resto.length ? resto : [perguntaVazia()];
};
/** Troca a linha i com a vizinha (-1 sobe, +1 desce); fora da lista → nada muda. */
export const moverPergunta = (lista: FormPergunta[], i: number, direcao: -1 | 1): FormPergunta[] => {
  const j = i + direcao;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
};
/** Pontuação máxima com as linhas atuais do editor. */
export const pontuacaoMaximaForm = (lista: FormPergunta[]): number => pontuacaoMaxima(lista.map(formParaPergunta));

// ---- Faixas no formulário ----
export type FormFaixa = { min: string; max: string; rotulo: string; nivel: Nivel };
/** Sempre 3 linhas (baixo / moderado / alto); o que faltar vem das faixas sugeridas. */
export function faixasParaForm(faixas: Faixa[], maxSugestao = ESCALA_MAX_PADRAO): FormFaixa[] {
  const base = faixasSugeridas(maxSugestao);
  return NIVEIS.map((nivel, k) => {
    const f = faixas[k] ?? faixas.find((x) => x.nivel === nivel) ?? base[k];
    return { min: formatarPontos(f.min), max: formatarPontos(f.max), rotulo: f.rotulo, nivel: f.nivel };
  });
}
export const normalizarFaixas = (faixas: FormFaixa[]): Faixa[] =>
  lerFaixas(faixas.map((f) => ({ min: normalizarNumero(f.min), max: normalizarNumero(f.max), rotulo: f.rotulo, nivel: f.nivel })));

// ---- Validação ----
/** Erro do questionário (título 2–120; 1–60 perguntas com texto e campos válidos pro tipo; 3 faixas numéricas com mín ≤ máx) ou null. */
export function validarQuestionario(titulo: string, perguntas: FormPergunta[], faixas: FormFaixa[]): string | null {
  const t = texto1(titulo);
  if (t.length < TITULO_QUESTIONARIO_MIN) return "Dê um título ao questionário (pelo menos 2 letras)";
  if (t.length > TITULO_QUESTIONARIO_MAX) return "Título muito longo";
  if (!perguntas.length) return "Escreva pelo menos 1 pergunta";
  if (perguntas.length > PERGUNTAS_MAX) return `No máximo ${PERGUNTAS_MAX} perguntas`;
  for (let i = 0; i < perguntas.length; i += 1) {
    const p = perguntas[i];
    const n = i + 1;
    const tx = texto1(p.texto);
    if (!tx) return `Pergunta ${n}: escreva o texto da pergunta`;
    if (tx.length > PERGUNTA_TEXTO_MAX) return `Pergunta ${n}: texto muito longo`;
    if (p.tipo === "escala") {
      const m = normalizarNumero(p.max);
      if (m === null || !Number.isInteger(m) || m < ESCALA_MAX_MIN || m > ESCALA_MAX_MAX) return `Pergunta ${n}: o máximo da escala vai de 1 a 10`;
    }
    if (p.tipo === "sim_nao") {
      const ps = normalizarNumero(p.pontosSim);
      if (ps === null || ps < 0) return `Pergunta ${n}: pontos do "sim" inválidos (use um número, ex.: 1)`;
    }
    if (p.tipo === "multipla") {
      const ops = opcoesDeTexto(p.opcoes);
      if (ops.length < OPCOES_MIN || ops.length > OPCOES_MAX) return `Pergunta ${n}: a múltipla escolha precisa de 2 a 10 opções (uma por linha, texto=pontos)`;
    }
  }
  if (faixas.length !== FAIXAS_POR_QUESTIONARIO) return "Defina as 3 faixas de pontuação";
  for (let k = 0; k < faixas.length; k += 1) {
    const f = faixas[k];
    const n = k + 1;
    const min = normalizarNumero(f.min);
    const max = normalizarNumero(f.max);
    if (min === null || max === null) return `Faixa ${n}: informe mínimo e máximo (números)`;
    if (min > max) return `Faixa ${n}: o mínimo não pode passar do máximo`;
    if (texto1(f.rotulo).length > ROTULO_FAIXA_MAX) return `Faixa ${n}: rótulo muito longo`;
  }
  return null;
}
/** Erro da aplicação (data válida; questionário com perguntas; ≥ 1 respondida) ou null. */
export function validarAplicacao(data: string, perguntas: Pergunta[], respostas: Respostas): string | null {
  if (!dataValida(data)) return "Informe a data da aplicação";
  if (!perguntas.length) return "Escolha o questionário";
  if (contarRespondidas(perguntas, respostas) === 0) return "Responda pelo menos 1 pergunta";
  return null;
}

// ---- Listas ----
type QuestionarioBase = { titulo: string; nutricionista_id: string | null; favorito: boolean };
export const ehDoSistema = (q: { nutricionista_id: string | null }): boolean => q.nutricionista_id == null;
const grupoDe = (q: QuestionarioBase): number => (ehDoSistema(q) ? 2 : q.favorito ? 0 : 1);
/** Favoritos → próprios → do sistema; alfabético dentro de cada grupo. */
export const ordenarQuestionarios = <T extends QuestionarioBase>(lista: T[]): T[] => [...lista].sort((a, b) => grupoDe(a) - grupoDe(b) || a.titulo.localeCompare(b.titulo, "pt-BR"));
export const textoContagemQuestionarios = (n: number): string => (n === 0 ? "Nenhum questionário" : n === 1 ? "1 questionário" : `${n} questionários`);
export const textoContagemPerguntas = (n: number): string => (n === 1 ? "1 pergunta" : `${n} perguntas`);
/** Aplicação mais recente primeiro (data desc); empate → a criada por último primeiro. */
export const ordenarAplicacoes = <T extends { data: string; created_at: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at));
/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirAplicacao = <T extends { id: string; data: string; created_at: string }>(lista: T[], a: T): T[] => ordenarAplicacoes([...lista.filter((x) => x.id !== a.id), a]);
const chave = (s: string): string => semAcento(texto1(s)).toLowerCase();
/** Filtro pelo título do questionário ('' = todas); compara sem caixa/acento — evolução de 1 questionário em todas as datas. */
export const filtrarPorQuestionario = <T extends { titulo: string }>(lista: T[], titulo: string): T[] => {
  const k = chave(titulo);
  return k ? lista.filter((a) => chave(a.titulo) === k) : lista;
};
/** Títulos já aplicados (únicos, alfabéticos) — opções do filtro. */
export function titulosAplicados<T extends { titulo: string }>(lista: T[]): string[] {
  const vistos = new Set<string>();
  const titulos: string[] = [];
  for (const a of lista) {
    const k = chave(a.titulo);
    if (vistos.has(k)) continue;
    vistos.add(k);
    titulos.push(a.titulo);
  }
  return titulos.sort((a, b) => a.localeCompare(b, "pt-BR"));
}
export const textoContagemAplicacoes = (n: number): string => (n === 0 ? "Nenhuma aplicação" : n === 1 ? "1 aplicação" : `${n} aplicações`);

// ---- Datas ----
export const dataValida = (s: string | null | undefined): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "") && isValid(parseISO(s ?? ""));
/** Data-só (`yyyy-MM-dd`) → "dd/MM/yyyy" (parseISO — `new Date` deslocaria o dia pelo fuso). */
export const formatarDataQuestionario = (data: string | null | undefined): string => {
  const d = parseISO(data ?? "");
  return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
};
export const hojeISO = (d: Date = new Date()): string => format(d, "yyyy-MM-dd");

// ---- Formulário ⇄ registro: aplicação ----
export type FormAplicacao = { questionarioId: string; data: string; respostas: Respostas; observacao: string };
export const formInicialAplicacao = (hoje: Date = new Date()): FormAplicacao => ({ questionarioId: "", data: hojeISO(hoje), respostas: {}, observacao: "" });
export type RegistroAplicacao = {
  questionario_id: string | null;
  titulo: string;
  perguntas: Pergunta[];
  faixas: Faixa[];
  respostas: Respostas;
  pontuacao: number;
  faixa: string;
  nivel: Nivel | "";
  data: string;
  observacao: string;
};
type QuestionarioFonte = { id: string; titulo: string; perguntas: unknown; faixas: unknown };
/** Nova aplicação: COPIA título/perguntas/faixas do questionário e calcula pontuação, faixa e nível. */
export function formParaRegistroAplicacao(f: FormAplicacao, q: QuestionarioFonte): RegistroAplicacao {
  const perguntas = lerPerguntas(q.perguntas);
  const faixas = lerFaixas(q.faixas);
  const respostas = normalizarRespostas(perguntas, f.respostas);
  return { questionario_id: q.id, titulo: q.titulo, perguntas, faixas, respostas, ...calcularResultado(perguntas, faixas, respostas), data: f.data, observacao: normalizarTexto(f.observacao).slice(0, OBSERVACAO_QUESTIONARIO_MAX) };
}
export const aplicacaoParaForm = (a: { questionario_id: string | null; data: string; respostas: unknown; observacao: string | null }): FormAplicacao => ({
  questionarioId: a.questionario_id ?? "",
  data: a.data,
  respostas: lerRespostas(a.respostas),
  observacao: a.observacao ?? "",
});
/** Edição: recalcula com a CÓPIA gravada na aplicação (perguntas/faixas) — o questionário original pode ter mudado ou sumido. */
export function recalcularAplicacao(a: { perguntas: unknown; faixas: unknown }, respostas: Respostas): Resultado & { respostas: Respostas } {
  const perguntas = lerPerguntas(a.perguntas);
  const faixas = lerFaixas(a.faixas);
  const r = normalizarRespostas(perguntas, respostas);
  return { respostas: r, ...calcularResultado(perguntas, faixas, r) };
}

// ---- Formulário ⇄ registro: questionário ----
export type FormQuestionario = { titulo: string; descricao: string; perguntas: FormPergunta[]; faixas: FormFaixa[]; favorito: boolean };
export type RegistroQuestionario = { titulo: string; descricao: string; perguntas: Pergunta[]; faixas: Faixa[]; favorito: boolean };
export const formQuestionarioVazio = (): FormQuestionario => ({ titulo: "", descricao: "", perguntas: [perguntaVazia()], faixas: faixasParaForm([], ESCALA_MAX_PADRAO), favorito: false });
export const questionarioParaForm = (q: { titulo: string; descricao: string | null; perguntas: unknown; faixas: unknown; favorito: boolean }): FormQuestionario => {
  const perguntas = lerPerguntas(q.perguntas);
  return {
    titulo: q.titulo,
    descricao: q.descricao ?? "",
    perguntas: perguntas.length ? perguntas.map(perguntaParaForm) : [perguntaVazia()],
    faixas: faixasParaForm(lerFaixas(q.faixas), pontuacaoMaxima(perguntas)),
    favorito: !!q.favorito,
  };
};
export const formParaRegistroQuestionario = (f: FormQuestionario): RegistroQuestionario => ({
  titulo: texto1(f.titulo).slice(0, TITULO_QUESTIONARIO_MAX),
  descricao: normalizarTexto(f.descricao).slice(0, DESCRICAO_QUESTIONARIO_MAX),
  perguntas: normalizarPerguntas(f.perguntas.map(formParaPergunta)),
  faixas: normalizarFaixas(f.faixas),
  favorito: !!f.favorito,
});
/** Cópia PRÓPRIA de um questionário (também de um do sistema): '<título> (cópia)', mesmas perguntas/faixas, sem favorito. */
export const copiaDeQuestionario = (q: { titulo: string; descricao: string | null; perguntas: unknown; faixas: unknown }): RegistroQuestionario => ({
  titulo: `${texto1(q.titulo)} (cópia)`.slice(0, TITULO_QUESTIONARIO_MAX),
  descricao: normalizarTexto(q.descricao).slice(0, DESCRICAO_QUESTIONARIO_MAX),
  perguntas: normalizarPerguntas(q.perguntas),
  faixas: lerFaixas(q.faixas),
  favorito: false,
});

// ---- Nome do PDF ----
const slug = (s: string, max: number, padrao: string): string =>
  semAcento(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || padrao;
const carimbo = (data: string | Date): string => {
  const d = typeof data === "string" ? parseISO(data) : data;
  return format(isValid(d) ? d : new Date(), "yyyyMMdd");
};
/** `questionario-<paciente>-<questionário>-<yyyyMMdd>.pdf` (data = data da aplicação). */
export const nomeArquivoPDFQuestionario = (paciente: string, titulo: string, data: string | Date): string =>
  `questionario-${slug(paciente, 40, "paciente")}-${slug(titulo, 40, "questionario")}-${carimbo(data)}.pdf`;

// ---- Os 4 questionários do sistema (espelho do seed da migration 20260919180000_questionarios.sql; texto próprio) ----
export type QuestionarioPadrao = { codigo: string; titulo: string; descricao: string; perguntas: Pergunta[]; faixas: Faixa[] };
type SemId = Omit<Pergunta, "id">;
const esc = (texto: string): SemId => ({ texto, tipo: "escala", max: 4, pontos_sim: PONTOS_SIM_PADRAO, opcoes: [] });
const mult = (texto: string, opcoes: [string, number][]): SemId => ({ texto, tipo: "multipla", max: ESCALA_MAX_PADRAO, pontos_sim: PONTOS_SIM_PADRAO, opcoes: opcoes.map(([t, p]) => ({ texto: t, pontos: p })) });
const comIds = (lista: SemId[]): Pergunta[] => lista.map((p, i) => ({ id: `p${i + 1}`, ...p }));
const FREQ: [string, string, string, string] = ["Nunca", "1 a 2 vezes por semana", "3 a 5 vezes por semana", "Todo dia"];
const PROTETOR = (texto: string): SemId => mult(texto, [[FREQ[0], 4], [FREQ[1], 3], [FREQ[2], 1], [FREQ[3], 0]]);
const RISCO = (texto: string): SemId => mult(texto, [[FREQ[0], 0], [FREQ[1], 1], [FREQ[2], 3], [FREQ[3], 4]]);
export const QUESTIONARIOS_PADRAO: QuestionarioPadrao[] = [
  {
    codigo: "sistema:disbiose",
    titulo: "Disbiose intestinal",
    descricao: "Sintomas digestivos e gerais ligados ao desequilíbrio da flora intestinal. Escala de 0 (nunca) a 4 (sempre).",
    perguntas: comIds([
      esc("Sente a barriga estufada ou distendida depois das refeições?"),
      esc("Tem excesso de gases?"),
      esc("Sente dor ou desconforto abdominal?"),
      esc("O intestino alterna entre preso e solto?"),
      esc("Tem azia ou refluxo?"),
      esc("Percebe intolerância a algum alimento (leite, trigo, feijão)?"),
      esc("Usou antibiótico nos últimos 6 meses?"),
      esc("Sente a digestão lenta ou pesada?"),
      esc("Dorme mal ou acorda sem energia?"),
      esc("Percebe mudanças de humor ou ansiedade ligadas à digestão?"),
    ]),
    faixas: [
      { min: 0, max: 10, rotulo: "Baixa suspeita", nivel: "baixo" },
      { min: 11, max: 20, rotulo: "Suspeita moderada", nivel: "moderado" },
      { min: 21, max: 40, rotulo: "Alta suspeita", nivel: "alto" },
    ],
  },
  {
    codigo: "sistema:rastreamento",
    titulo: "Rastreamento metabólico",
    descricao: "Frequência dos sintomas por sistema do corpo nas últimas semanas. Escala de 0 (nunca) a 4 (sempre).",
    perguntas: comIds([
      esc("Cabeça: dor de cabeça, enxaqueca ou tontura"),
      esc("Olhos: lacrimejamento, coceira ou visão embaçada"),
      esc("Nariz e garganta: congestão, coriza, pigarro ou dor de garganta"),
      esc("Pele: acne, coceira, ressecamento ou suor excessivo"),
      esc("Coração: palpitações ou batimentos irregulares"),
      esc("Digestivo: náusea, azia, gases, prisão de ventre ou diarreia"),
      esc("Articulações e músculos: dor, rigidez ou fraqueza"),
      esc("Energia: cansaço, sonolência ou agitação"),
      esc("Mente: dificuldade de concentração ou de memória"),
      esc("Emoções: irritabilidade, ansiedade ou desânimo"),
    ]),
    faixas: [
      { min: 0, max: 15, rotulo: "Poucos sintomas", nivel: "baixo" },
      { min: 16, max: 30, rotulo: "Sintomas moderados", nivel: "moderado" },
      { min: 31, max: 40, rotulo: "Muitos sintomas", nivel: "alto" },
    ],
  },
  {
    codigo: "sistema:frequencia",
    titulo: "Frequência alimentar",
    descricao: "Com que frequência você consome cada grupo? Alimentos protetores pontuam quando raros; os de risco, quando frequentes.",
    perguntas: comIds([
      PROTETOR("Frutas"),
      PROTETOR("Verduras e legumes"),
      PROTETOR("Leguminosas (feijão, lentilha, grão-de-bico)"),
      PROTETOR("Cereais integrais (arroz integral, aveia, pão integral)"),
      RISCO("Ultraprocessados (salgadinhos, biscoitos recheados, macarrão instantâneo)"),
      RISCO("Doces e sobremesas"),
      RISCO("Refrigerantes e sucos adoçados"),
      RISCO("Frituras"),
      RISCO("Embutidos (salsicha, presunto, linguiça)"),
      PROTETOR("Água (pelo menos 2 litros por dia)"),
    ]),
    faixas: [
      { min: 0, max: 8, rotulo: "Padrão protetor", nivel: "baixo" },
      { min: 9, max: 18, rotulo: "Atenção", nivel: "moderado" },
      { min: 19, max: 40, rotulo: "Alto risco", nivel: "alto" },
    ],
  },
  {
    codigo: "sistema:cafeina",
    titulo: "Consumo de cafeína",
    descricao: "Fontes de cafeína no dia a dia, horário do último consumo e qualidade do sono.",
    perguntas: comIds([
      mult("Quantas xícaras de café você toma por dia?", [["Não tomo", 0], ["1 a 2", 1], ["3 a 4", 3], ["5 ou mais", 5]]),
      mult("Chá preto, chá verde ou mate", [["Não tomo", 0], ["Às vezes", 1], ["Todo dia", 2], ["Várias vezes ao dia", 3]]),
      mult("Energéticos", [["Nunca", 0], ["1 vez por semana", 2], ["Várias vezes por semana", 4], ["Todo dia", 6]]),
      mult("Refrigerante à base de cola", [["Nunca", 0], ["Às vezes", 1], ["Todo dia", 2], ["Mais de 1 lata por dia", 3]]),
      mult("Chocolate ou achocolatado", [["Raramente", 0], ["Algumas vezes por semana", 1], ["Todo dia", 2], ["Várias vezes ao dia", 3]]),
      mult("Pré-treino ou suplemento com cafeína", [["Não uso", 0], ["Às vezes", 2], ["Sempre que treino", 4], ["Mais de uma dose por dia", 6]]),
      mult("Horário do último consumo de cafeína no dia", [["Antes das 12h", 0], ["Entre 12h e 16h", 1], ["Entre 16h e 19h", 3], ["Depois das 19h", 5]]),
      mult("Como tem sido o seu sono?", [["Durmo bem", 0], ["Demoro a pegar no sono", 2], ["Acordo durante a noite", 3], ["Durmo mal quase sempre", 5]]),
    ]),
    faixas: [
      { min: 0, max: 5, rotulo: "Consumo baixo", nivel: "baixo" },
      { min: 6, max: 12, rotulo: "Consumo moderado", nivel: "moderado" },
      { min: 13, max: 40, rotulo: "Consumo alto", nivel: "alto" },
    ],
  },
];
