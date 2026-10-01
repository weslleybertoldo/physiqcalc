// Physiq W21 — regras PURAS dos formulários de pré-consulta (porta de src/lib/preconsultaUtil.ts do PhysiqNutri, main 294887a, para o
// Painel › Pré-consulta — spec §4.4, N-12, N-55, R7). O profissional monta o formulário a partir de um modelo de anamnese, de um
// questionário de saúde (só quem é nutricionista da conta: são ferramentas clínicas da nutrição) ou em branco, e compartilha o link
// público /f/<slug>; quem responde não tem login. REUSA as regras dos questionários portadas na W18 (perguntas por tipo, pontuação,
// faixas, editor, validações) — nada aqui reinventa o formato das perguntas, que é o MESMO do site antigo (as mesmas tabelas).
// Nada de rede; testado no vitest. A resposta guarda a PRÓPRIA cópia do título/perguntas/faixas (a RPC copia).
import {
  DESCRICAO_QUESTIONARIO_MAX, ESCALA_MAX_PADRAO, PERGUNTAS_MAX, PERGUNTA_TEXTO_MAX, PONTOS_SIM_PADRAO, TITULO_QUESTIONARIO_MAX, TITULO_QUESTIONARIO_MIN,
  contarRespondidas, faixasParaForm, formParaPergunta, lerFaixas, lerPerguntas, normalizarFaixas, normalizarPerguntas, normalizarTexto, perguntaParaForm, perguntaVazia,
  pontuacaoMaxima, textoContagemPerguntas, textoPontuacao, validarQuestionario, type Faixa, type FormFaixa, type FormPergunta, type Nivel, type Pergunta, type Respostas,
} from "@/nutricao/prontuario/lib/questionariosUtil";

export const SLUG_TAMANHO = 8;
/** [a-z0-9] sem 0/o/1/l — o link é lido em voz alta e digitado no celular (o mesmo alfabeto do site antigo). */
export const SLUG_ALFABETO = "abcdefghijkmnpqrstuvwxyz23456789";
export const NOME_MIN = 2;
export const NOME_MAX = 120;
export const EMAIL_MAX = 160;
export const TELEFONE_MAX = 30;
/** Rate limit da RPC pública: respostas do MESMO formulário na última hora. */
export const RESPOSTAS_POR_HORA = 30;

export type Origem = "anamnese" | "questionario" | "personalizado";
const ORIGENS_VALIDAS: Origem[] = ["anamnese", "questionario", "personalizado"];
export const ORIGENS: { valor: Origem; rotulo: string; grupo: string; descricao: string }[] = [
  { valor: "anamnese", rotulo: "Pré-anamnese", grupo: "Pré-anamnese", descricao: "as perguntas de um modelo de anamnese, respondidas em texto livre antes da consulta" },
  { valor: "questionario", rotulo: "Questionário de saúde", grupo: "Questionários de saúde", descricao: "um questionário com pontuação e faixas — quem responde vê o resultado na hora" },
  { valor: "personalizado", rotulo: "Em branco", grupo: "Personalizados", descricao: "você escreve as perguntas do zero (escala, sim ou não, múltipla escolha ou texto)" },
];
export const ehOrigem = (v: unknown): v is Origem => (ORIGENS_VALIDAS as string[]).includes(v as string);
export const lerOrigem = (v: unknown): Origem => (ehOrigem(v) ? v : "personalizado");
export const textoOrigem = (o: Origem): string => (o === "personalizado" ? "Personalizado" : ORIGENS.find((x) => x.valor === o)?.rotulo ?? "Personalizado");
export const textoGrupoOrigem = (o: Origem): string => ORIGENS.find((x) => x.valor === o)?.grupo ?? ORIGENS[2].grupo;

/**
 * De onde o formulário pode partir para quem cria (decisão da W21): modelo de anamnese e questionário de saúde são ferramentas
 * CLÍNICAS da nutrição (Prontuário › Anamnese/Questionários — só nutricionista, P3), então só aparecem para quem é nutricionista da
 * conta com o módulo Nutrição; o personal e o dono sem papel de nutricionista montam em branco (R7: o personal ganha a pré-consulta).
 */
export const origensPara = (souNutri: boolean): Origem[] => (souNutri ? [...ORIGENS_VALIDAS] : ["personalizado"]);

/** Texto de 1 linha: espaços repetidos viram 1, pontas fora; nulo vira "". */
const linha1 = (s: unknown): string => (typeof s === "string" ? s : s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ---- Slug e link público ----
/** Slug aleatório de 8 chars do alfabeto sem 0/o/1/l (`aleatorio` injetável pros testes). */
export function gerarSlug(tamanho = SLUG_TAMANHO, aleatorio: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < tamanho; i += 1) s += SLUG_ALFABETO[Math.min(SLUG_ALFABETO.length - 1, Math.max(0, Math.floor(aleatorio() * SLUG_ALFABETO.length)))];
  return s;
}
export const normalizarSlug = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();
export const slugValido = (s: string | null | undefined): boolean => new RegExp(`^[${SLUG_ALFABETO}]{${SLUG_TAMANHO}}$`).test(normalizarSlug(s));
export const caminhoPublico = (slug: string): string => `/f/${normalizarSlug(slug)}`;
/** `https://<site do Physiq>/f/<slug>` — a origem é a do ambiente (./link.ts), nunca a do APK. */
export const urlPublica = (slug: string, origem: string): string => `${origem.replace(/\/+$/, "")}${caminhoPublico(slug)}`;

// ---- Perguntas de um modelo de anamnese → perguntas de texto ----
/** Linha nova do editor numa pré-anamnese: texto livre. */
export const perguntaTextoVazia = (): FormPergunta => ({ ...perguntaVazia(), tipo: "texto" });
/** O jsonb `perguntas` do modelo de anamnese é uma lista de textos; cada um vira uma pergunta de TEXTO ('p<n>'). Tolera objetos com `texto`/`pergunta`. */
export function perguntasDeAnamnese(v: unknown): Pergunta[] {
  if (!Array.isArray(v)) return [];
  const saida: Pergunta[] = [];
  for (const item of v) {
    const t = linha1(typeof item === "string" ? item : ehObj(item) ? item.texto ?? item.pergunta : "");
    if (!t) continue;
    saida.push({ id: `p${saida.length + 1}`, texto: t.slice(0, PERGUNTA_TEXTO_MAX), tipo: "texto", max: ESCALA_MAX_PADRAO, pontos_sim: PONTOS_SIM_PADRAO, opcoes: [] });
    if (saida.length >= PERGUNTAS_MAX) break;
  }
  return saida;
}

// ---- Formulário (estado do modal) ⇄ registro ----
export type FormFormulario = { titulo: string; descricao: string; origem: Origem; origemId: string | null; perguntas: FormPergunta[]; faixas: FormFaixa[]; ativo: boolean };
export type RegistroFormulario = { titulo: string; descricao: string; origem: Origem; origem_id: string | null; perguntas: Pergunta[]; faixas: Faixa[]; ativo: boolean };

/** Em branco (personalizado): 1 linha (escala 0–4), sem faixas, ativo. */
export const formularioEmBranco = (): FormFormulario => ({ titulo: "", descricao: "", origem: "personalizado", origemId: null, perguntas: [perguntaVazia()], faixas: [], ativo: true });
/** Pré-anamnese: título do modelo, cada pergunta em texto livre, sem faixas. */
export function formularioDeAnamnese(m: { id: string; titulo: string; perguntas: unknown }): FormFormulario {
  const perguntas = perguntasDeAnamnese(m.perguntas);
  return {
    titulo: linha1(m.titulo).slice(0, TITULO_QUESTIONARIO_MAX),
    descricao: "",
    origem: "anamnese",
    origemId: m.id,
    perguntas: perguntas.length ? perguntas.map(perguntaParaForm) : [perguntaTextoVazia()],
    faixas: [],
    ativo: true,
  };
}
/** Questionário de saúde: título, descrição, perguntas e as 3 faixas copiadas (o resultado sai para quem responde). */
export function formularioDeQuestionario(q: { id: string; titulo: string; descricao: string | null; perguntas: unknown; faixas: unknown }): FormFormulario {
  const perguntas = lerPerguntas(q.perguntas);
  return {
    titulo: linha1(q.titulo).slice(0, TITULO_QUESTIONARIO_MAX),
    descricao: q.descricao ?? "",
    origem: "questionario",
    origemId: q.id,
    perguntas: perguntas.length ? perguntas.map(perguntaParaForm) : [perguntaVazia()],
    faixas: faixasParaForm(lerFaixas(q.faixas), pontuacaoMaxima(perguntas)),
    ativo: true,
  };
}
/** Registro gravado → estado do modal (edição). */
export function formularioParaForm(r: { titulo: string; descricao: string | null; origem: string; origem_id: string | null; perguntas: unknown; faixas: unknown; ativo: boolean }): FormFormulario {
  const origem = lerOrigem(r.origem);
  const perguntas = lerPerguntas(r.perguntas);
  return {
    titulo: r.titulo,
    descricao: r.descricao ?? "",
    origem,
    origemId: r.origem_id ?? null,
    perguntas: perguntas.length ? perguntas.map(perguntaParaForm) : [origem === "anamnese" ? perguntaTextoVazia() : perguntaVazia()],
    faixas: origem === "questionario" ? faixasParaForm(lerFaixas(r.faixas), pontuacaoMaxima(perguntas)) : [],
    ativo: r.ativo !== false,
  };
}
/** Erro do formulário (título 2–120; ≥ 1 pergunta com as regras dos questionários; 3 faixas numéricas só na origem questionario) ou null. */
export function validarFormulario(f: FormFormulario): string | null {
  const t = linha1(f.titulo);
  if (t.length < TITULO_QUESTIONARIO_MIN) return "Dê um título ao formulário (pelo menos 2 letras)";
  if (t.length > TITULO_QUESTIONARIO_MAX) return "Título muito longo";
  if (!f.perguntas.length) return "Escreva pelo menos 1 pergunta";
  // as regras das perguntas são as dos questionários; as faixas só contam quando o formulário veio de um questionário
  const faixas = f.origem === "questionario" ? f.faixas : faixasParaForm([], ESCALA_MAX_PADRAO);
  return validarQuestionario(t, f.perguntas, faixas);
}
export const formParaRegistroFormulario = (f: FormFormulario): RegistroFormulario => ({
  titulo: linha1(f.titulo).slice(0, TITULO_QUESTIONARIO_MAX),
  descricao: normalizarTexto(f.descricao).slice(0, DESCRICAO_QUESTIONARIO_MAX),
  origem: f.origem,
  origem_id: f.origemId ?? null,
  perguntas: normalizarPerguntas(f.perguntas.map(formParaPergunta)),
  faixas: f.origem === "questionario" ? normalizarFaixas(f.faixas) : [],
  ativo: !!f.ativo,
});
/** Cópia de um formulário: '<título> (cópia)', mesma origem/perguntas/faixas, ATIVA — o slug novo nasce na gravação. */
export const copiaDeFormulario = (r: { titulo: string; descricao: string | null; origem: string; origem_id: string | null; perguntas: unknown; faixas: unknown }): RegistroFormulario => {
  const origem = lerOrigem(r.origem);
  return {
    titulo: `${linha1(r.titulo)} (cópia)`.slice(0, TITULO_QUESTIONARIO_MAX),
    descricao: normalizarTexto(r.descricao).slice(0, DESCRICAO_QUESTIONARIO_MAX),
    origem,
    origem_id: r.origem_id ?? null,
    perguntas: normalizarPerguntas(r.perguntas),
    faixas: origem === "questionario" ? lerFaixas(r.faixas) : [],
    ativo: true,
  };
};

// ---- Resposta pública (espelho das validações da RPC, pro erro amigável antes do POST) ----
export function validarRespostaPublica(nome: string, email: string, telefone: string, perguntas: Pergunta[], respostas: Respostas): string | null {
  const n = linha1(nome);
  if (n.length < NOME_MIN) return "Escreva seu nome (pelo menos 2 letras)";
  if (n.length > NOME_MAX) return "Nome muito longo";
  const e = (email ?? "").trim();
  if (e && (!e.includes("@") || e.length > EMAIL_MAX)) return "E-mail inválido";
  if ((telefone ?? "").trim().length > TELEFONE_MAX) return "Telefone muito longo";
  if (!perguntas.length) return "Este formulário está sem perguntas";
  if (contarRespondidas(perguntas, respostas) === 0) return "Responda pelo menos 1 pergunta";
  return null;
}
/** Traduz o erro da RPC ('formulario_nao_encontrado' / 'sem_respostas' / 'muitas_respostas' / …) para quem responde. */
export function mensagemErroRpc(e: unknown): string {
  const m = (e instanceof Error ? e.message : typeof e === "string" ? e : ehObj(e) && typeof e.message === "string" ? e.message : "").toLowerCase();
  if (m.includes("formulario_nao_encontrado")) return "Formulário não encontrado ou desativado";
  if (m.includes("sem_respostas")) return "Responda pelo menos 1 pergunta";
  if (m.includes("muitas_respostas")) return "Este formulário recebeu muitas respostas na última hora. Tente de novo mais tarde.";
  if (m.includes("nome_invalido")) return "Escreva seu nome (2 a 120 letras)";
  if (m.includes("email_invalido")) return "E-mail inválido";
  if (m.includes("telefone_invalido")) return "Telefone muito longo";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("abort") || m.includes("falha de rede")) return "Sem conexão. Confira a internet e tente de novo.";
  return "Não foi possível enviar as respostas. Tente de novo.";
}
export type ResultadoPublico = { pontuacao: number; faixa: string; nivel: Nivel | "" };
/** O formulário mostra resultado para quem responde SÓ quando tem faixas (origem questionário). */
export const temResultado = (faixas: Faixa[]): boolean => faixas.length > 0;
/** '13/40 pontos · Suspeita moderada' (sem faixa → só os pontos). */
export const textoResultadoPublico = (r: ResultadoPublico, max: number): string => `${textoPontuacao(r.pontuacao, max)}${r.faixa ? ` · ${r.faixa}` : ""}`;

// ---- Listas ----
type FormularioBase = { titulo: string; ativo: boolean; origem: string };
/** Ativos → inativos; alfabético dentro de cada bloco. */
export const ordenarFormularios = <T extends FormularioBase>(lista: T[]): T[] =>
  [...lista].sort((a, b) => Number(!!b.ativo) - Number(!!a.ativo) || a.titulo.localeCompare(b.titulo, "pt-BR"));
export type GrupoFormularios<T> = { origem: Origem; rotulo: string; itens: T[] };
/** Grupos na ordem Pré-anamnese · Questionários de saúde · Personalizados — só os que têm itens. */
export const agruparPorOrigem = <T extends FormularioBase>(lista: T[]): GrupoFormularios<T>[] =>
  ORIGENS.map((o) => ({ origem: o.valor, rotulo: o.grupo, itens: ordenarFormularios(lista.filter((f) => lerOrigem(f.origem) === o.valor)) })).filter((g) => g.itens.length > 0);
export const textoContagemFormularios = (n: number): string => (n === 0 ? "Nenhum formulário" : n === 1 ? "1 formulário" : `${n} formulários`);
export const textoAtivo = (ativo: boolean): string => (ativo ? "Ativo" : "Inativo");
/** 'N perguntas · /f/<slug>'. */
export const resumoFormulario = (f: { perguntas: unknown; slug: string }): string =>
  `${textoContagemPerguntas(lerPerguntas(f.perguntas).length)} · ${caminhoPublico(f.slug)}`;
