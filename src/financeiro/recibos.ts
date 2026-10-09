// Physiq W6 — recibos do aluno (N-45, N-54, N-59): porte das regras e do acesso a dados do PhysiqNutri
// (src/lib/recibosUtil.ts e src/lib/recibos.ts de lá) para o banco principal. Tags do modelo (`*|NOME_PACIENTE|*`…), valor por
// extenso em pt-BR, número com 4 dígitos (sequencial por profissional — gatilho numerar_recibo), modelo padrão, emitir a partir
// de um lançamento. A W19 (Painel › Financeiro) usa estas mesmas peças. hml-14b: os modelos (garantir, salvar, excluir) e o último
// número são lidos e gravados por src/painel/financeiro/dados.ts — as cópias daqui, sem uso, saíram.
import { principal } from "@/integrations/principal/client";
import { paginar, type Pagina, type RespostaComContagem } from "@/lib/paginacao";

export const TITULO_MODELO_MAX = 120;
export const CONTEUDO_MODELO_MAX = 8000;
export const DESCRICAO_RECIBO_MAX = 160;
export const DESCRICAO_RECIBO_PADRAO = "Atendimento";
export const CARIMBO_PLACEHOLDER = "[carimbo]";

export type Tag = { tag: string; rotulo: string; exemplo: string };
export const TAGS: Tag[] = [
  { tag: "*|NOME_PACIENTE|*", rotulo: "Nome do aluno", exemplo: "Maria da Silva" },
  { tag: "*|NUMERO_DOCUMENTO_PACIENTE|*", rotulo: "CPF do aluno", exemplo: "123.456.789-09" },
  { tag: "*|VALOR_CONSULTA|*", rotulo: "Valor (R$)", exemplo: "R$ 180,00" },
  { tag: "*|VALOR_POR_EXTENSO|*", rotulo: "Valor por extenso", exemplo: "cento e oitenta reais" },
  { tag: "*|DATA_HOJE|*", rotulo: "Data do recibo", exemplo: "19/09/2026" },
  { tag: "*|NUMERO_RECIBO|*", rotulo: "Nº do recibo", exemplo: "0001" },
  { tag: "*|NOME_NUTRICIONISTA|*", rotulo: "Nome do profissional", exemplo: "Ana Nutri" },
  { tag: "*|CARIMBO|*", rotulo: "Carimbo", exemplo: CARIMBO_PLACEHOLDER },
];
const RE_TAG = /\*\|[A-Z_]+\|\*/g;

export const TITULO_MODELO_PADRAO = "Recibo padrão";
/** Texto próprio do Physiq (o do Nutri, sem "nutricional": vale para os 2 módulos). */
export const CONTEUDO_MODELO_PADRAO = [
  "Recebi de *|NOME_PACIENTE|*, CPF *|NUMERO_DOCUMENTO_PACIENTE|*, a quantia de *|VALOR_CONSULTA|* (*|VALOR_POR_EXTENSO|*), referente a atendimento.",
  "",
  "Para maior clareza, firmo o presente recibo.",
  "",
  "*|DATA_HOJE|*",
  "",
  "*|NOME_NUTRICIONISTA|*",
  "*|CARIMBO|*",
].join("\n");

export type DadosTags = { nomePaciente: string; cpf: string | null | undefined; valor: number; data: string; numero: number; nomeProfissional: string | null | undefined };

export const formatarNumeroRecibo = (n: number): string => String(Math.max(0, Math.trunc(Number(n) || 0))).padStart(4, "0");

export function formatarCPF(cpf: string | null | undefined): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return (cpf ?? "").trim() || "não informado";
}

/** "2026-09-19" → "19/09/2026" (sem passar pelo fuso). */
export function formatarDataRecibo(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

const fmtBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n).replace(/\u00a0/g, " ");

export function aplicarTags(conteudo: string, d: DadosTags): string {
  const valores: Record<string, string> = {
    "*|NOME_PACIENTE|*": (d.nomePaciente ?? "").trim() || "—",
    "*|NUMERO_DOCUMENTO_PACIENTE|*": formatarCPF(d.cpf),
    "*|VALOR_CONSULTA|*": fmtBRL(d.valor),
    "*|VALOR_POR_EXTENSO|*": valorPorExtenso(d.valor),
    "*|DATA_HOJE|*": formatarDataRecibo(d.data),
    "*|NUMERO_RECIBO|*": formatarNumeroRecibo(d.numero),
    "*|NOME_NUTRICIONISTA|*": (d.nomeProfissional ?? "").trim() || "Profissional",
    "*|CARIMBO|*": CARIMBO_PLACEHOLDER,
  };
  return (conteudo ?? "").replace(RE_TAG, (m) => valores[m] ?? m);
}

export const temTagPendente = (texto: string): boolean => new RegExp(RE_TAG.source).test(texto ?? "");

// ───────────────────────── valor por extenso (pt-BR) ─────────────────────────
const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze",
  "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
const ESCALAS = [
  { valor: 1_000_000_000, um: "um bilhão", varios: "bilhões" },
  { valor: 1_000_000, um: "um milhão", varios: "milhões" },
  { valor: 1_000, um: "mil", varios: "mil" },
];

function centenaPorExtenso(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 20) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

export function inteiroPorExtenso(n: number): string {
  const v = Math.trunc(Math.abs(Number(n) || 0));
  if (v === 0) return "zero";
  const grupos: { texto: string; valor: number }[] = [];
  let resto = v;
  for (const e of ESCALAS) {
    const q = Math.floor(resto / e.valor);
    resto %= e.valor;
    if (!q) continue;
    grupos.push({ texto: q === 1 ? e.um : `${centenaPorExtenso(q)} ${e.varios}`, valor: q });
  }
  if (resto) grupos.push({ texto: centenaPorExtenso(resto), valor: resto });
  let saida = grupos[0].texto;
  for (let i = 1; i < grupos.length; i += 1) {
    const g = grupos[i];
    saida += (i === grupos.length - 1 && (g.valor < 100 || g.valor % 100 === 0) ? " e " : " ") + g.texto;
  }
  return saida;
}

export function valorPorExtenso(n: number): string {
  const cents = Math.round(Math.abs(Number(n) || 0) * 100);
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  if (reais === 0 && centavos === 0) return "zero reais";
  const partes: string[] = [];
  if (reais) partes.push(`${inteiroPorExtenso(reais)}${reais >= 1_000_000 && reais % 1_000_000 === 0 ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ");
}

export function nomeArquivoPDFRecibo(numero: number, aluno: string): string {
  const s = (aluno ?? "").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "aluno";
  return `recibo-${formatarNumeroRecibo(numero)}-${s}.pdf`;
}

export const podeEmitirRecibo = (t: { tipo: string; estornada: boolean; recibo_id: string | null; deleted_at?: string | null }): boolean =>
  t.tipo === "entrada" && !t.estornada && !t.recibo_id && !t.deleted_at;

export const ordenarModelosRecibo = <T extends { favorito: boolean; titulo: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.titulo.localeCompare(b.titulo, "pt-BR"));

export function validarModelo(titulo: string, conteudo: string): string | null {
  if (!(titulo ?? "").trim()) return "Dê um título ao modelo";
  if ((titulo ?? "").trim().length > TITULO_MODELO_MAX) return "Título muito longo";
  if (!(conteudo ?? "").trim()) return "Escreva o texto do recibo";
  if ((conteudo ?? "").length > CONTEUDO_MODELO_MAX) return "Texto muito longo";
  return null;
}

// ───────────────────────── dados (banco principal; RLS: cada profissional os seus — o dono da conta vê os da conta) ─────────

export interface Recibo {
  id: string;
  nutricionista_id: string;
  paciente_id: string;
  transacao_id: string | null;
  modelo_id: string | null;
  numero: number;
  valor: number;
  data: string;
  descricao: string;
  texto: string;
  created_at: string;
}

const falhou = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/**
 * hml-14d (B21 · D31): uma página (20) dos recibos do aluno, o número mais alto primeiro (desempate pelo id), e o total — o cartão
 * mostra os 12 primeiros e o "Ver todos (N)" abre as páginas (antes: todos de uma vez, cortados calados em 1000). Erro do banco lança.
 */
export function paginaRecibosDoAluno(pacienteId: string, pagina: number): Promise<Pagina<Recibo>> {
  return paginar<Recibo>(
    (de, ate) =>
      principal.from("recibos")
        .select("id, nutricionista_id, paciente_id, transacao_id, modelo_id, numero, valor, data, descricao, texto, created_at", { count: "exact" })
        .eq("paciente_id", pacienteId).is("deleted_at", null).order("numero", { ascending: false }).order("id", { ascending: true })
        .range(de, ate) as unknown as PromiseLike<RespostaComContagem<Recibo>>,
    pagina,
  );
}

// hml-14b (B14): o `emitirRecibo` duplicado que morava aqui (sem uso — a emissão é a de src/painel/financeiro/dados.ts, que confere
// cada erro) saiu; ele ignorava o erro ao regravar o texto com o número certo.

export async function excluirRecibo(id: string): Promise<void> {
  const { error } = await principal.from("recibos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
  const { error: e2 } = await principal.from("transacoes").update({ recibo_id: null }).eq("recibo_id", id);
  falhou(e2);
}
