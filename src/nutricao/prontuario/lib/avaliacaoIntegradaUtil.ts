// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/avaliacaoIntegradaUtil.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { format, isValid, parseISO } from "date-fns";
import { lerConteudo, ordenarAnamneses } from "@/nutricao/prontuario/lib/anamneseUtil";
import { calcularIMC, classificarIMC, fmtNum, lerResultados, ordenarAntropometrias, rotuloProtocolo } from "@/nutricao/editor/lib/antropometriaUtil";
import { agruparResultadosPorData, situacaoDoResultado, textoReferencia, textoValor, type Situacao } from "@/nutricao/prontuario/lib/examesUtil";
import { normalizarConteudo } from "@/nutricao/editor/lib/orientacoesUtil";
import { formatarPontos, lerNivel, lerPerguntas, ordenarAplicacoes, pontuacaoMaxima, textoNivel, type Nivel } from "@/nutricao/prontuario/lib/questionariosUtil";

// Regras puras da avaliação integrada (W24). A avaliação é um documento DATADO que CONGELA, no momento da geração, a última
// anamnese (W5), a última antropometria (W6), os exames da data mais recente (W18) e a última aplicação de cada questionário
// (W19): `montarSintese` lê as listas das seções donas (só leitura, reusando os utils delas) e devolve os 4 blocos resolvidos
// (`Sintese`) + os ids/datas usados (`Fontes`). Alertas automáticos e o texto inicial do parecer derivam da síntese congelada —
// a fonte pode mudar depois sem alterar o documento (Regerar é explícito). Nada de rede aqui; testado no vitest.

export const TITULO_MAX = 120;
export const TEXTO_MAX = 8000;
export const ITENS_ANAMNESE_MAX = 40;

// ---- Fontes brutas (tipos estruturais: as linhas do banco das W5/W6/W18/W19 encaixam sem conversão) ----
export type FonteAnamnese = { id: string; titulo: string; data: string; conteudo: unknown; texto_livre: string | null; created_at: string };
export type FonteAntropometria = { id: string; data: string; peso: number | null; altura: number | null; protocolo: string; resultados: unknown; created_at: string };
export type FonteResultado = {
  id: string; data: string; exame: string; valor: number | null; valor_texto: string | null; unidade: string | null;
  ref_min: number | null; ref_max: number | null; referencia_texto: string | null; created_at: string;
};
export type FonteAplicacao = { id: string; titulo: string; data: string; perguntas: unknown; pontuacao: number; faixa: string; nivel: string; created_at: string };
export type FontesBrutas = { anamneses: FonteAnamnese[]; antropometrias: FonteAntropometria[]; resultados: FonteResultado[]; aplicacoes: FonteAplicacao[] };

// ---- Síntese congelada (o que vai pro jsonb `sintese`) ----
export type ItemSinteseAnamnese = { pergunta: string; resposta: string };
export type SinteseAnamnese = { titulo: string; data: string; itens: ItemSinteseAnamnese[]; texto_livre: string | null };
export type SinteseAntropometria = {
  data: string; peso: number | null; altura: number | null; imc: number | null; classificacao: string | null;
  percentual_gordura: number | null; massa_gorda: number | null; massa_magra: number | null; rcq: number | null; protocolo: string;
};
export type ItemSinteseExame = { exame: string; valor: string; unidade: string; referencia: string; situacao: Situacao };
export type SinteseExames = { data: string; itens: ItemSinteseExame[] };
export type SinteseQuestionario = { id: string; titulo: string; data: string; pontuacao: number; maximo: number; faixa: string; nivel: Nivel | "" };
export type Sintese = { anamnese: SinteseAnamnese | null; antropometria: SinteseAntropometria | null; exames: SinteseExames | null; questionarios: SinteseQuestionario[] };

// ---- Fontes usadas (o que vai pro jsonb `fontes`) ----
export type FonteQuestionario = { id: string; titulo: string; data: string };
export type Fontes = {
  anamnese_id: string | null; anamnese_data: string | null; antropometria_id: string | null; antropometria_data: string | null;
  exames_data: string | null; exames_n: number; questionarios: FonteQuestionario[];
};

export const sinteseVazia = (): Sintese => ({ anamnese: null, antropometria: null, exames: null, questionarios: [] });
export const fontesVazias = (): Fontes => ({
  anamnese_id: null, anamnese_data: null, antropometria_id: null, antropometria_data: null, exames_data: null, exames_n: 0, questionarios: [],
});

export type ChaveFonte = "anamnese" | "antropometria" | "exames" | "questionarios";
export const FONTES: { chave: ChaveFonte; rotulo: string }[] = [
  { chave: "anamnese", rotulo: "Anamnese" },
  { chave: "antropometria", rotulo: "Antropometria" },
  { chave: "exames", rotulo: "Exames" },
  { chave: "questionarios", rotulo: "Questionários" },
];

// ---- Helpers ----
const texto1 = (s: unknown): string => (typeof s === "string" ? s : s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOuNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOuNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const SITUACOES: Situacao[] = ["abaixo", "normal", "acima", "sem_referencia"];
const lerSituacao = (v: unknown): Situacao => ((SITUACOES as string[]).includes(v as string) ? (v as Situacao) : "sem_referencia");
const semAcento = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "");
const slug = (s: string, max = 40): string =>
  semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
const contagem = (n: number, singular: string, plural: string): string => `${n} ${n === 1 ? singular : plural}`;
const foraDaReferencia = (s: Situacao): boolean => s === "abaixo" || s === "acima";

/** Data de uma fonte: `yyyy-MM-dd` (coluna date) vai pelo parseISO; ISO com fuso (timestamptz) pelo `new Date`. */
export function dataDaFonte(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? parseISO(v) : new Date(v);
  return isValid(d) ? d : null;
}
export function fmtDataFonte(v: string | null | undefined, padrao = "dd/MM/yyyy"): string {
  const d = dataDaFonte(v);
  return d ? format(d, padrao) : "—";
}

// ---- Montar a síntese a partir das fontes (última de cada) ----
export function montarSintese(f: FontesBrutas): { sintese: Sintese; fontes: Fontes } {
  const sintese = sinteseVazia();
  const fontes = fontesVazias();

  const an = ordenarAnamneses(f.anamneses)[0];
  if (an) {
    const itens = lerConteudo(an.conteudo)
      .filter((i) => i.resposta.trim() !== "")
      .map((i) => ({ pergunta: i.pergunta, resposta: i.resposta.trim() }))
      .slice(0, ITENS_ANAMNESE_MAX);
    sintese.anamnese = { titulo: an.titulo, data: an.data, itens, texto_livre: strOuNull(an.texto_livre) };
    fontes.anamnese_id = an.id;
    fontes.anamnese_data = an.data;
  }

  const at = ordenarAntropometrias(f.antropometrias)[0];
  if (at) {
    const r = lerResultados(at.resultados);
    const imc = r.imc ?? calcularIMC(at.peso, at.altura);
    sintese.antropometria = {
      data: at.data,
      peso: at.peso,
      altura: at.altura,
      imc,
      classificacao: r.classificacao_imc ?? (imc !== null ? classificarIMC(imc) : null),
      percentual_gordura: r.percentual_gordura,
      massa_gorda: r.massa_gorda,
      massa_magra: r.massa_magra,
      rcq: r.rcq,
      protocolo: at.protocolo,
    };
    fontes.antropometria_id = at.id;
    fontes.antropometria_data = at.data;
  }

  const grupo = agruparResultadosPorData(f.resultados)[0];
  if (grupo) {
    sintese.exames = {
      data: grupo.data,
      itens: grupo.itens.map((r) => ({
        exame: r.exame,
        valor: textoValor(r.valor, r.valor_texto),
        unidade: texto1(r.unidade),
        referencia: textoReferencia(r.ref_min, r.ref_max, r.referencia_texto),
        situacao: situacaoDoResultado(r),
      })),
    };
    fontes.exames_data = grupo.data;
    fontes.exames_n = grupo.itens.length;
  }

  const vistos = new Set<string>();
  for (const ap of ordenarAplicacoes(f.aplicacoes)) {
    const k = slug(ap.titulo, 120);
    if (vistos.has(k)) continue;
    vistos.add(k);
    sintese.questionarios.push({
      id: ap.id,
      titulo: ap.titulo,
      data: ap.data,
      pontuacao: ap.pontuacao,
      maximo: pontuacaoMaxima(lerPerguntas(ap.perguntas)),
      faixa: texto1(ap.faixa),
      nivel: lerNivel(ap.nivel),
    });
    fontes.questionarios.push({ id: ap.id, titulo: ap.titulo, data: ap.data });
  }

  return { sintese, fontes };
}

// ---- Leitura tolerante dos jsonb gravados ----
export function lerSintese(v: unknown): Sintese {
  const s = sinteseVazia();
  if (!ehObj(v)) return s;
  if (ehObj(v.anamnese)) {
    const a = v.anamnese;
    s.anamnese = {
      titulo: texto1(a.titulo),
      data: typeof a.data === "string" ? a.data : "",
      itens: Array.isArray(a.itens)
        ? a.itens.filter(ehObj).map((i) => ({ pergunta: texto1(i.pergunta), resposta: typeof i.resposta === "string" ? i.resposta : "" })).filter((i) => i.pergunta)
        : [],
      texto_livre: strOuNull(a.texto_livre),
    };
  }
  if (ehObj(v.antropometria)) {
    const a = v.antropometria;
    s.antropometria = {
      data: typeof a.data === "string" ? a.data : "",
      peso: numOuNull(a.peso),
      altura: numOuNull(a.altura),
      imc: numOuNull(a.imc),
      classificacao: strOuNull(a.classificacao),
      percentual_gordura: numOuNull(a.percentual_gordura),
      massa_gorda: numOuNull(a.massa_gorda),
      massa_magra: numOuNull(a.massa_magra),
      rcq: numOuNull(a.rcq),
      protocolo: texto1(a.protocolo),
    };
  }
  if (ehObj(v.exames)) {
    const e = v.exames;
    s.exames = {
      data: typeof e.data === "string" ? e.data : "",
      itens: Array.isArray(e.itens)
        ? e.itens
            .filter(ehObj)
            .map((i) => ({ exame: texto1(i.exame), valor: texto1(i.valor), unidade: texto1(i.unidade), referencia: texto1(i.referencia), situacao: lerSituacao(i.situacao) }))
            .filter((i) => i.exame)
        : [],
    };
  }
  if (Array.isArray(v.questionarios)) {
    s.questionarios = v.questionarios
      .filter(ehObj)
      .map((q) => ({
        id: texto1(q.id),
        titulo: texto1(q.titulo),
        data: typeof q.data === "string" ? q.data : "",
        pontuacao: numOuNull(q.pontuacao) ?? 0,
        maximo: numOuNull(q.maximo) ?? 0,
        faixa: texto1(q.faixa),
        nivel: lerNivel(q.nivel),
      }))
      .filter((q) => q.titulo);
  }
  return s;
}

export function lerFontes(v: unknown): Fontes {
  const f = fontesVazias();
  if (!ehObj(v)) return f;
  f.anamnese_id = strOuNull(v.anamnese_id);
  f.anamnese_data = strOuNull(v.anamnese_data);
  f.antropometria_id = strOuNull(v.antropometria_id);
  f.antropometria_data = strOuNull(v.antropometria_data);
  f.exames_data = strOuNull(v.exames_data);
  f.exames_n = Math.max(0, Math.round(numOuNull(v.exames_n) ?? 0));
  f.questionarios = Array.isArray(v.questionarios)
    ? v.questionarios.filter(ehObj).map((q) => ({ id: texto1(q.id), titulo: texto1(q.titulo), data: typeof q.data === "string" ? q.data : "" })).filter((q) => q.id || q.titulo)
    : [];
  return f;
}

// ---- Fontes: presença, contagem e textos ----
export const temFontes = (s: Sintese): boolean => !!(s.anamnese || s.antropometria || s.exames || s.questionarios.length);

/** Quantas das 4 fontes entraram (0–4). */
export const contarFontes = (f: Fontes): number =>
  [f.anamnese_id, f.antropometria_id, f.exames_n > 0 ? "x" : null, f.questionarios.length ? "x" : null].filter(Boolean).length;

/** Chip de uma fonte: se tem dado e o detalhe (data / quantidade) ou 'sem dado'. */
export function detalheFonte(f: Fontes, chave: ChaveFonte): { tem: boolean; texto: string } {
  if (chave === "anamnese") return f.anamnese_id ? { tem: true, texto: fmtDataFonte(f.anamnese_data) } : { tem: false, texto: "sem dado" };
  if (chave === "antropometria") return f.antropometria_id ? { tem: true, texto: fmtDataFonte(f.antropometria_data) } : { tem: false, texto: "sem dado" };
  if (chave === "exames") return f.exames_n > 0 ? { tem: true, texto: `${contagem(f.exames_n, "exame", "exames")} de ${fmtDataFonte(f.exames_data)}` } : { tem: false, texto: "sem dado" };
  return f.questionarios.length ? { tem: true, texto: contagem(f.questionarios.length, "questionário", "questionários") } : { tem: false, texto: "sem dado" };
}

/** 'Anamnese 12/09 · Antropometria 19/09 · 3 exames de 15/09 · 1 questionário' ('sem dado' no que falta). */
export function resumoFontes(f: Fontes): string {
  return [
    f.anamnese_id ? `Anamnese ${fmtDataFonte(f.anamnese_data, "dd/MM")}` : "Anamnese sem dado",
    f.antropometria_id ? `Antropometria ${fmtDataFonte(f.antropometria_data, "dd/MM")}` : "Antropometria sem dado",
    f.exames_n > 0 ? `${contagem(f.exames_n, "exame", "exames")} de ${fmtDataFonte(f.exames_data, "dd/MM")}` : "Exames sem dado",
    f.questionarios.length ? contagem(f.questionarios.length, "questionário", "questionários") : "Questionários sem dado",
  ].join(" · ");
}

export type Par = { chave: string; rotulo: string; valor: string };

/** Pares rótulo/valor da antropometria congelada (só o que existe) — a tela mostra em 2 colunas e o PDF também. */
export function paresAntropometria(a: SinteseAntropometria): Par[] {
  const pares: Par[] = [];
  if (a.peso !== null) pares.push({ chave: "peso", rotulo: "Peso", valor: `${fmtNum(a.peso, 1)} kg` });
  if (a.altura !== null) pares.push({ chave: "altura", rotulo: "Altura", valor: `${fmtNum(a.altura, 0)} cm` });
  if (a.imc !== null) pares.push({ chave: "imc", rotulo: "IMC", valor: fmtNum(a.imc, 1) });
  if (a.classificacao) pares.push({ chave: "classificacao", rotulo: "Classificação", valor: a.classificacao });
  if (a.percentual_gordura !== null) pares.push({ chave: "gordura", rotulo: "% de gordura", valor: `${fmtNum(a.percentual_gordura, 1)} %` });
  if (a.massa_gorda !== null) pares.push({ chave: "massa_gorda", rotulo: "Massa gorda", valor: `${fmtNum(a.massa_gorda, 1)} kg` });
  if (a.massa_magra !== null) pares.push({ chave: "massa_magra", rotulo: "Massa magra", valor: `${fmtNum(a.massa_magra, 1)} kg` });
  if (a.rcq !== null) pares.push({ chave: "rcq", rotulo: "RCQ", valor: fmtNum(a.rcq, 2) });
  if (a.protocolo && a.protocolo !== "nenhum") pares.push({ chave: "protocolo", rotulo: "Protocolo", valor: rotuloProtocolo(a.protocolo, false) });
  return pares;
}

/** Itens de um bloco da síntese (respostas, medidas, resultados, questionários). */
export function contarItens(s: Sintese, chave: ChaveFonte): number {
  if (chave === "anamnese") return s.anamnese?.itens.length ?? 0;
  if (chave === "antropometria") return s.antropometria ? paresAntropometria(s.antropometria).length : 0;
  if (chave === "exames") return s.exames?.itens.length ?? 0;
  return s.questionarios.length;
}

export function textoItensFonte(chave: ChaveFonte, n: number): string {
  if (chave === "anamnese") return contagem(n, "resposta", "respostas");
  if (chave === "antropometria") return contagem(n, "medida", "medidas");
  if (chave === "exames") return contagem(n, "resultado", "resultados");
  return contagem(n, "questionário", "questionários");
}

// ---- Alertas automáticos ----
export type NivelAlerta = "atencao" | "alto";
export type Alerta = { chave: string; texto: string; nivel: NivelAlerta };

/** IMC fora de 18,5–24,9 · cada exame abaixo/acima da referência · questionário moderado/alto. Os 'alto' vêm antes. */
export function alertas(s: Sintese): Alerta[] {
  const lista: Alerta[] = [];
  const usadas = new Map<string, number>();
  const unica = (base: string): string => {
    const n = (usadas.get(base) ?? 0) + 1;
    usadas.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  const a = s.antropometria;
  if (a && a.imc !== null && (a.imc < 18.5 || a.imc >= 25)) {
    lista.push({ chave: "imc", texto: `IMC ${fmtNum(a.imc, 1)} — ${a.classificacao ?? classificarIMC(a.imc)}`, nivel: a.imc >= 30 || a.imc < 16 ? "alto" : "atencao" });
  }
  for (const e of s.exames?.itens ?? []) {
    if (!foraDaReferencia(e.situacao)) continue;
    const valor = `${e.valor}${e.unidade ? ` ${e.unidade}` : ""}`;
    lista.push({ chave: unica(`exame:${slug(e.exame) || "exame"}`), texto: `${e.exame} ${valor} ${e.situacao} da referência (${e.referencia})`, nivel: "atencao" });
  }
  for (const q of s.questionarios) {
    if (q.nivel !== "alto" && q.nivel !== "moderado") continue;
    lista.push({
      chave: unica(`questionario:${q.id || slug(q.titulo)}`),
      texto: `${q.titulo}: ${formatarPontos(q.pontuacao)}/${formatarPontos(q.maximo)} pontos — ${textoNivel(q.nivel)}`,
      nivel: q.nivel === "alto" ? "alto" : "atencao",
    });
  }
  return [...lista.filter((x) => x.nivel === "alto"), ...lista.filter((x) => x.nivel === "atencao")];
}

/** Markdown inicial do parecer: '## Resumo' (1 linha por fonte presente), '## Pontos de atenção' (alertas ou 'Nenhum') e '## Conduta' vazio. */
export function textoSugerido(s: Sintese, al: Alerta[] = alertas(s)): string {
  const resumo: string[] = [];
  if (s.anamnese) {
    resumo.push(
      `- Anamnese "${s.anamnese.titulo}" de ${fmtDataFonte(s.anamnese.data)} — ${contagem(s.anamnese.itens.length, "resposta registrada", "respostas registradas")}${s.anamnese.texto_livre ? " · com texto livre" : ""}`,
    );
  }
  if (s.antropometria) {
    const a = s.antropometria;
    const partes = [
      a.peso !== null ? `peso ${fmtNum(a.peso, 1)} kg` : null,
      a.imc !== null ? `IMC ${fmtNum(a.imc, 1)}${a.classificacao ? ` (${a.classificacao})` : ""}` : null,
      a.percentual_gordura !== null ? `${fmtNum(a.percentual_gordura, 1)} % de gordura` : null,
    ].filter(Boolean);
    resumo.push(`- Antropometria de ${fmtDataFonte(a.data)}${partes.length ? ` — ${partes.join(" · ")}` : ""}`);
  }
  if (s.exames) {
    const fora = s.exames.itens.filter((i) => foraDaReferencia(i.situacao)).length;
    resumo.push(`- Exames de ${fmtDataFonte(s.exames.data)} — ${contagem(s.exames.itens.length, "resultado", "resultados")}, ${fora === 0 ? "todos dentro da referência" : `${fora} fora da referência`}`);
  }
  for (const q of s.questionarios) {
    const nivel = textoNivel(q.nivel);
    const faixa = q.faixa && q.faixa.toLowerCase() !== nivel.toLowerCase() ? `${q.faixa} (${nivel})` : nivel;
    resumo.push(`- Questionário ${q.titulo} de ${fmtDataFonte(q.data)} — ${formatarPontos(q.pontuacao)}/${formatarPontos(q.maximo)} pontos · ${faixa}`);
  }
  if (!resumo.length) resumo.push("- Nenhuma fonte registrada");
  const atencao = al.length ? al.map((x) => `- ${x.texto}`) : ["- Nenhum"];
  return ["## Resumo", ...resumo, "", "## Pontos de atenção", ...atencao, "", "## Conduta", ""].join("\n");
}

// ---- Formulário (título + parecer) ----
export type FormAvaliacao = { titulo: string; texto: string };

export const tituloPadraoAvaliacao = (d: Date = new Date()): string => `Avaliação integrada — ${format(d, "dd/MM/yyyy")}`;

export const formInicialAvaliacao = (hoje: Date, sugerido: string): FormAvaliacao => ({ titulo: tituloPadraoAvaliacao(hoje), texto: sugerido });

export const formDaAvaliacao = (a: { titulo: string; texto: string | null }): FormAvaliacao => ({ titulo: a.titulo, texto: a.texto ?? "" });

export function validarAvaliacao(f: FormAvaliacao): string | null {
  const t = texto1(f.titulo);
  if (!t) return "Informe o título da avaliação";
  if (t.length > TITULO_MAX) return `Título com mais de ${TITULO_MAX} caracteres`;
  if ((f.texto ?? "").length > TEXTO_MAX) return `Parecer com mais de ${TEXTO_MAX} caracteres`;
  return null;
}

/** Como vai pro banco: título em 1 linha e parecer normalizado (vazio → null). */
export const formParaBanco = (f: FormAvaliacao): { titulo: string; texto: string | null } => ({
  titulo: texto1(f.titulo).slice(0, TITULO_MAX),
  texto: normalizarConteudo(f.texto) || null,
});

// ---- Lista ----
const instante = (iso: string): number => new Date(iso).getTime();

/** Mais recente primeiro (pela data da avaliação; empate → a criada por último primeiro). */
export function ordenarAvaliacoes<T extends { data: string; created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => instante(b.data) - instante(a.data) || instante(b.created_at) - instante(a.created_at));
}

/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirAvaliacao = <T extends { id: string; data: string; created_at: string }>(lista: T[], a: T): T[] =>
  ordenarAvaliacoes([...lista.filter((x) => x.id !== a.id), a]);

export function textoContagemAvaliacoes(n: number): string {
  if (n === 0) return "Nenhuma avaliação";
  if (n === 1) return "1 avaliação";
  return `${n} avaliações`;
}

export const formatarDataHoraAvaliacao = (iso: string): string => format(new Date(iso), "dd/MM/yyyy HH:mm");

/** 'título · N fontes · N alertas' (descrição curta da avaliação gravada). */
export function resumoAvaliacao(a: { titulo: string; sintese: unknown; fontes: unknown }): string {
  const nF = contarFontes(lerFontes(a.fontes));
  const nA = alertas(lerSintese(a.sintese)).length;
  return `${a.titulo} · ${contagem(nF, "fonte", "fontes")} · ${contagem(nA, "alerta", "alertas")}`;
}

/** `<paciente sem acento>-avaliacao-integrada-<yyyy-MM-dd>.pdf` (paciente vazio → 'paciente'). */
export const nomeArquivoPDFAvaliacao = (paciente: string, d: Date): string => `${slug(paciente) || "paciente"}-avaliacao-integrada-${format(d, "yyyy-MM-dd")}.pdf`;
