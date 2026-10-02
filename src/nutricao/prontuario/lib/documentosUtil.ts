// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/documentosUtil.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { format, isValid, parseISO } from "date-fns";
import { chaveDia, dataValida } from "@/nutricao/editor/lib/agendaUtil";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";
import { normalizarConteudo } from "@/nutricao/editor/lib/orientacoesUtil";
import { CARIMBO_PLACEHOLDER, formatarCPF, formatarDataRecibo, temTagPendente, type Tag } from "@/financeiro/recibos";

// Regras PURAS dos documentos do paciente (W15 — atestados, receituários e declarações): tipos, tags do modelo
// (`*|NOME_PACIENTE|*`…), 3 modelos padrão, título padrão, ordenação/filtro/contagem, validação, formulário ⇄ registro e
// nome do PDF. Nada de rede aqui; testado no vitest. A tela e o acesso a dados ficam em `pages/paciente/secoes/Documentos.tsx`,
// `components/documentos/*` e `lib/documentos.ts`; o PDF em `lib/documentoPdf.ts`. Mesmo desenho dos recibos (W13):
// o modelo tem as tags, o documento guarda o texto FINAL.

export type TipoDocumento = "atestado" | "receituario" | "declaracao";
export type InfoTipo = { tipo: TipoDocumento; rotulo: string; plural: string; botao: string };
export const TIPOS_DOCUMENTO: InfoTipo[] = [
  { tipo: "atestado", rotulo: "Atestado", plural: "Atestados", botao: "Novo atestado" },
  { tipo: "receituario", rotulo: "Receituário", plural: "Receituários", botao: "Novo receituário" },
  { tipo: "declaracao", rotulo: "Declaração", plural: "Declarações", botao: "Nova declaração" },
];
export const ehTipoDocumento = (v: unknown): v is TipoDocumento => TIPOS_DOCUMENTO.some((t) => t.tipo === v);
export const infoTipo = (tipo: TipoDocumento): InfoTipo => TIPOS_DOCUMENTO.find((t) => t.tipo === tipo) ?? TIPOS_DOCUMENTO[0];
/** "atestado" → "Atestado"; tipo desconhecido volta como veio. */
export const rotuloTipo = (tipo: string): string => TIPOS_DOCUMENTO.find((t) => t.tipo === tipo)?.rotulo ?? tipo;

export const TITULO_DOCUMENTO_MAX = 120;
export const TEXTO_DOCUMENTO_MAX = 8000;
export const CID_MAX = 20;
export const DIAS_MAX = 365;

// ---- Tags ----
export const TAGS_DOCUMENTO: Tag[] = [
  { tag: "*|NOME_PACIENTE|*", rotulo: "Nome do aluno", exemplo: "Maria da Silva" },
  { tag: "*|CPF_PACIENTE|*", rotulo: "CPF do aluno", exemplo: "123.456.789-09" },
  { tag: "*|DATA_HOJE|*", rotulo: "Data", exemplo: "19/09/2026" },
  { tag: "*|NOME_NUTRICIONISTA|*", rotulo: "Nome da nutricionista", exemplo: "Ana Nutri" },
  { tag: "*|CARIMBO|*", rotulo: "Carimbo", exemplo: CARIMBO_PLACEHOLDER },
];
/** Só o atestado tem dias de afastamento e CID. */
export const TAGS_ATESTADO: Tag[] = [
  { tag: "*|DIAS_AFASTAMENTO|*", rotulo: "Dias de afastamento", exemplo: "2 dias" },
  { tag: "*|CID|*", rotulo: "CID", exemplo: "Z00.0" },
];
export const tagsDoTipo = (tipo: TipoDocumento): Tag[] => (tipo === "atestado" ? [...TAGS_DOCUMENTO, ...TAGS_ATESTADO] : TAGS_DOCUMENTO);
const RE_TAG = /\*\|[A-Z_]+\|\*/g;

/** Dados que preenchem as tags. `data` é `yyyy-MM-dd`. */
export type DadosTagsDocumento = {
  nomePaciente: string;
  cpf: string | null | undefined;
  data: string;
  nomeNutricionista: string | null | undefined;
  diasAfastamento?: number | null;
  cid?: string | null;
};

/** 1 → "1 dia"; 2 → "2 dias"; nada → "—". */
export const textoDias = (n: number | null | undefined): string => {
  const v = Math.trunc(Number(n) || 0);
  if (v <= 0) return "—";
  return v === 1 ? "1 dia" : `${v} dias`;
};

/** Substitui TODAS as tags conhecidas (inclusive `*|NUMERO_DOCUMENTO_PACIENTE|*` da W13, alias do CPF); tag desconhecida fica como está. */
export function aplicarTagsDocumento(conteudo: string, d: DadosTagsDocumento): string {
  const valores: Record<string, string> = {
    "*|NOME_PACIENTE|*": (d.nomePaciente ?? "").trim() || "—",
    "*|CPF_PACIENTE|*": formatarCPF(d.cpf),
    "*|NUMERO_DOCUMENTO_PACIENTE|*": formatarCPF(d.cpf),
    "*|DATA_HOJE|*": formatarDataRecibo(d.data),
    "*|NOME_NUTRICIONISTA|*": (d.nomeNutricionista ?? "").trim() || "Nutricionista",
    "*|CARIMBO|*": CARIMBO_PLACEHOLDER,
    "*|DIAS_AFASTAMENTO|*": textoDias(d.diasAfastamento),
    "*|CID|*": (d.cid ?? "").trim() || "não informado",
  };
  return (conteudo ?? "").replace(RE_TAG, (m) => valores[m] ?? m);
}
export { CARIMBO_PLACEHOLDER, formatarCPF, normalizarConteudo, temTagPendente };
/** Data-só (`yyyy-MM-dd`) → "dd/MM/yyyy" (mesma regra dos recibos). */
export const formatarDataDocumento = formatarDataRecibo;

/** Dados de exemplo pra prévia do modelo (dialog de modelos). */
export const dadosExemploDocumento = (nomeNutricionista: string | null | undefined, hoje: Date = new Date()): DadosTagsDocumento => ({
  nomePaciente: "Maria da Silva",
  cpf: "12345678909",
  data: chaveDia(hoje),
  nomeNutricionista: nomeNutricionista || "Ana Nutri",
  diasAfastamento: 2,
  cid: "Z00.0",
});

// ---- Modelos padrão (texto próprio do PhysiqNutri, não copiado de nenhuma referência) ----
export type ModeloPadrao = { tipo: TipoDocumento; titulo: string; conteudo: string };
export const MODELOS_PADRAO: ModeloPadrao[] = [
  {
    tipo: "atestado",
    titulo: "Atestado padrão",
    conteudo: [
      "Atesto, para os devidos fins, que *|NOME_PACIENTE|*, CPF *|CPF_PACIENTE|*, esteve sob atendimento nutricional nesta data, necessitando de *|DIAS_AFASTAMENTO|* de afastamento de suas atividades.",
      "",
      "CID: *|CID|*",
      "",
      "*|DATA_HOJE|*",
      "",
      "*|NOME_NUTRICIONISTA|*",
      "*|CARIMBO|*",
    ].join("\n"),
  },
  {
    tipo: "receituario",
    titulo: "Receituário padrão",
    conteudo: [
      "Paciente: *|NOME_PACIENTE|*",
      "CPF: *|CPF_PACIENTE|*",
      "Data: *|DATA_HOJE|*",
      "",
      "Prescrição:",
      "",
      "*|NOME_NUTRICIONISTA|*",
      "*|CARIMBO|*",
    ].join("\n"),
  },
  {
    tipo: "declaracao",
    titulo: "Declaração de comparecimento",
    conteudo: [
      "Declaro, para os devidos fins, que *|NOME_PACIENTE|*, CPF *|CPF_PACIENTE|*, compareceu a atendimento nutricional nesta data.",
      "",
      "*|DATA_HOJE|*",
      "",
      "*|NOME_NUTRICIONISTA|*",
      "*|CARIMBO|*",
    ].join("\n"),
  },
];

/** "Atestado 19/09/2026" — título sugerido pro documento novo. */
export const tituloPadrao = (tipo: TipoDocumento, hoje: Date = new Date()): string => `${infoTipo(tipo).rotulo} ${format(hoje, "dd/MM/yyyy")}`;

// ---- Ordenação, filtro, contagem ----
/** Mais recente primeiro. */
export const ordenarDocumentos = <T extends { created_at: string }>(lista: T[]): T[] => [...lista].sort((a, b) => b.created_at.localeCompare(a.created_at));
/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirDocumento = <T extends { id: string; created_at: string }>(lista: T[], d: T): T[] => ordenarDocumentos([...lista.filter((x) => x.id !== d.id), d]);
export type FiltroTipo = TipoDocumento | "todos";
export const FILTROS: { filtro: FiltroTipo; rotulo: string }[] = [{ filtro: "todos", rotulo: "Todos" }, ...TIPOS_DOCUMENTO.map((t) => ({ filtro: t.tipo as FiltroTipo, rotulo: t.plural }))];
export const filtrarDocumentos = <T extends { tipo: string }>(lista: T[], filtro: FiltroTipo): T[] => (filtro === "todos" ? lista : lista.filter((d) => d.tipo === filtro));
export const contarPorTipo = (lista: { tipo: string }[]): Record<FiltroTipo, number> => ({
  todos: lista.length,
  atestado: lista.filter((d) => d.tipo === "atestado").length,
  receituario: lista.filter((d) => d.tipo === "receituario").length,
  declaracao: lista.filter((d) => d.tipo === "declaracao").length,
});
export function textoContagemDocumentos(n: number): string {
  if (n === 0) return "Nenhum documento";
  if (n === 1) return "1 documento";
  return `${n} documentos`;
}

// ---- Modelos ----
/** Favoritos primeiro; dentro de cada grupo, ordem alfabética do título. */
export const ordenarModelosDocumento = <T extends { favorito: boolean; titulo: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.titulo.localeCompare(b.titulo, "pt-BR"));
/** Só os modelos do tipo, favoritos primeiro. */
export const modelosDoTipo = <T extends { tipo: string; favorito: boolean; titulo: string }>(lista: T[], tipo: TipoDocumento): T[] =>
  ordenarModelosDocumento(lista.filter((m) => m.tipo === tipo));
/** Modelo pré-selecionado no modal: o 1º favorito do tipo (sem favorito, o 1º da lista); nenhum → null. */
export const modeloInicialDoTipo = <T extends { id: string; tipo: string; favorito: boolean; titulo: string }>(lista: T[], tipo: TipoDocumento): T | null =>
  modelosDoTipo(lista, tipo)[0] ?? null;
/** Modelo precisa de tipo válido, título e algum texto. */
export function validarModeloDocumento(tipo: string, titulo: string, conteudo: string): string | null {
  if (!ehTipoDocumento(tipo)) return "Escolha o tipo do modelo";
  if (!(titulo ?? "").trim()) return "Dê um título ao modelo";
  if ((titulo ?? "").trim().length > TITULO_DOCUMENTO_MAX) return "Título muito longo";
  if (!normalizarConteudo(conteudo)) return "Escreva o texto do modelo";
  if ((conteudo ?? "").length > TEXTO_DOCUMENTO_MAX) return "Texto muito longo";
  return null;
}

// ---- Formulário ⇄ registro ----
/** O que a nutricionista preenche no modal do documento novo (`texto` ainda COM as tags; `data` é `yyyy-MM-dd`). */
export type FormDocumento = { modeloId: string; titulo: string; texto: string; dias: string; cid: string; data: string };
/** O que documenta as tags do atestado (coluna `dados` jsonb). */
export type DadosDocumento = { dias_afastamento?: number; cid?: string | null };
/** Colunas do documento que o formulário controla (paciente/nutricionista vêm do contexto). */
export type RegistroDocumento = { tipo: TipoDocumento; modelo_id: string | null; titulo: string; texto: string; dados: DadosDocumento; data: string };

/** "2" → 2; vazio, zero, negativo, não número ou acima de 365 → null. */
export const parseDias = (s: string | number | null | undefined): number | null => {
  const n = Math.trunc(Number(String(s ?? "").trim().replace(",", ".")));
  return Number.isFinite(n) && n >= 1 && n <= DIAS_MAX ? n : null;
};

/** Documento novo: título padrão do tipo, texto do modelo escolhido (com as tags), 1 dia no atestado, data de hoje. */
export function formInicialDocumento(tipo: TipoDocumento, modelo: { id: string; conteudo: string } | null | undefined, hoje: Date = new Date()): FormDocumento {
  return {
    modeloId: modelo?.id ?? "",
    titulo: tituloPadrao(tipo, hoje),
    texto: modelo?.conteudo ?? "",
    dias: tipo === "atestado" ? "1" : "",
    cid: "",
    data: chaveDia(hoje),
  };
}

/** Dados das tags a partir do formulário + paciente + nutricionista. */
export function dadosDoForm(
  tipo: TipoDocumento,
  f: FormDocumento,
  paciente: { nome: string; cpf: string | null | undefined },
  nomeNutricionista: string | null | undefined,
  hoje: Date = new Date(),
): DadosTagsDocumento {
  return {
    nomePaciente: paciente.nome,
    cpf: paciente.cpf,
    data: dataValida(f.data ?? "") ? f.data : chaveDia(hoje),
    nomeNutricionista,
    diasAfastamento: tipo === "atestado" ? parseDias(f.dias) : null,
    cid: tipo === "atestado" ? (f.cid ?? "").trim() || null : null,
  };
}

/** Erro do documento novo (além do zod do formulário): dias no atestado, CID curto, texto final com conteúdo e sem tag pendente. */
export function validarDocumento(tipo: TipoDocumento, f: FormDocumento, textoFinal: string): string | null {
  if (!(f.titulo ?? "").trim()) return "Dê um título ao documento";
  if ((f.titulo ?? "").trim().length > TITULO_DOCUMENTO_MAX) return "Título muito longo";
  if (tipo === "atestado" && parseDias(f.dias) === null) return `Informe os dias de afastamento (1 a ${DIAS_MAX})`;
  if ((f.cid ?? "").trim().length > CID_MAX) return "CID muito longo";
  if (!normalizarConteudo(textoFinal)) return "Escreva o texto do documento";
  if ((textoFinal ?? "").length > TEXTO_DOCUMENTO_MAX) return "Texto muito longo";
  if (temTagPendente(textoFinal)) return "Ainda há uma tag sem valor no texto (*|…|*)";
  return null;
}

export function formParaRegistroDocumento(tipo: TipoDocumento, f: FormDocumento, textoFinal: string, hoje: Date = new Date()): RegistroDocumento {
  const dados: DadosDocumento = {};
  if (tipo === "atestado") {
    const dias = parseDias(f.dias);
    if (dias !== null) dados.dias_afastamento = dias;
    dados.cid = (f.cid ?? "").trim() || null;
  }
  return {
    tipo,
    modelo_id: f.modeloId || null,
    titulo: (f.titulo ?? "").trim().replace(/\s+/g, " ").slice(0, TITULO_DOCUMENTO_MAX) || tituloPadrao(tipo, hoje),
    texto: normalizarConteudo(textoFinal),
    dados,
    data: dataValida(f.data ?? "") ? f.data : chaveDia(hoje),
  };
}

// ---- Nome do PDF ----
/** `atestado-<paciente sem acento>-<yyyyMMdd>.pdf` */
export function nomeArquivoPDFDocumento(tipo: TipoDocumento, paciente: string, data: string): string {
  const s = semAcento(paciente ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "paciente";
  const d = parseISO(data ?? "");
  const dia = isValid(d) ? format(d, "yyyyMMdd") : "data";
  return `${tipo}-${s}-${dia}.pdf`;
}

// ---- Dados profissionais (profiles.dados_profissionais — preenchidos na W35) ----
export type DadosProfissionais = { crn: string | null; telefone: string | null; endereco: string | null };
/** Lê o jsonb com tolerância: só strings não vazias contam; nada preenchido → null. */
export function lerDadosProfissionais(v: unknown): DadosProfissionais | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const s = (k: string): string | null => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim() : null);
  const r = { crn: s("crn"), telefone: s("telefone"), endereco: s("endereco") };
  return r.crn || r.telefone || r.endereco ? r : null;
}
