// Physiq W19 — regras PURAS do Financeiro do profissional (N-19): porta do PhysiqNutri (main ca9f66f, src/lib/financeiroUtil.ts):
// presets de período, estado na URL, valor em BRL (ler/escrever), totais do período (estornadas fora), formulário ⇄ registro,
// ordenação, filtro por tipo/categoria/forma/texto e contagem. Novo aqui: o filtro pela FORMA de pagamento (spec 4.4 —
// "entradas e saídas por categoria e forma de pagamento"). Nada de rede; testado no Vitest (financeiroUtil.test.ts).
import { endOfMonth, endOfYear, format, isValid, parseISO, startOfDay, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import { chaveDia, dataValida } from "@/nutricao/editor/lib/agendaUtil";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";
import { arred } from "@/nutricao/editor/lib/antropometriaUtil";

// ---- Tipo e método ----
export type Tipo = "entrada" | "saida";
export const TIPOS: { valor: Tipo; rotulo: string }[] = [
  { valor: "entrada", rotulo: "Entrada" },
  { valor: "saida", rotulo: "Saída" },
];
export const ehTipo = (v: unknown): v is Tipo => v === "entrada" || v === "saida";
export const rotuloTipo = (t: string | null | undefined): string => (t === "entrada" ? "Entrada" : t === "saida" ? "Saída" : (t ?? ""));
export type FiltroTipo = "" | Tipo;
export const FILTRO_TIPOS: { valor: FiltroTipo; rotulo: string }[] = [
  { valor: "", rotulo: "Todas" },
  { valor: "entrada", rotulo: "Entradas" },
  { valor: "saida", rotulo: "Saídas" },
];

export type Metodo = "pix" | "dinheiro" | "cartao_credito" | "cartao_debito" | "transferencia" | "boleto" | "outro";
export const METODOS: { valor: Metodo; rotulo: string }[] = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "cartao_credito", rotulo: "Cartão de crédito" },
  { valor: "cartao_debito", rotulo: "Cartão de débito" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "outro", rotulo: "Outro" },
];
export const METODO_PADRAO: Metodo = "pix";
export const ehMetodo = (v: unknown): v is Metodo => METODOS.some((m) => m.valor === v);
export const rotuloMetodo = (m: string | null | undefined): string => METODOS.find((x) => x.valor === m)?.rotulo ?? (m ?? "");

/** Nascem no 1º acesso do profissional (as do Nutri — src/financeiro/lancamentos.ts da W6 cria as mesmas). */
export const CATEGORIAS_PADRAO = ["Consulta", "Retorno", "Plano alimentar", "Aluguel", "Material", "Outros"];
export const CATEGORIA_NOME_MAX = 60;
export const DESCRICAO_MAX = 160;
export const OBSERVACAO_MAX = 2000;
/** numeric(12,2): até 10 dígitos antes da vírgula. */
export const VALOR_MAX = 9_999_999_999.99;

// ---- Período (datas yyyy-MM-dd, inclusivas) ----
export type Preset = "30d" | "mes" | "mes_passado" | "90d" | "ano" | "personalizado";
export const PRESETS: { chave: Preset; rotulo: string }[] = [
  { chave: "30d", rotulo: "Últimos 30 dias" },
  { chave: "mes", rotulo: "Este mês" },
  { chave: "mes_passado", rotulo: "Mês passado" },
  { chave: "90d", rotulo: "Últimos 90 dias" },
  { chave: "ano", rotulo: "Este ano" },
  { chave: "personalizado", rotulo: "Personalizado" },
];
export const PRESET_PADRAO: Preset = "30d";
export const ehPreset = (v: unknown): v is Preset => PRESETS.some((p) => p.chave === v);
export type Periodo = { de: string; ate: string };

/** Datas do preset a partir de hoje. "Personalizado" não tem preset — devolve a base (últimos 30 dias). */
export function periodoDoPreset(p: Preset, hoje: Date = new Date()): Periodo {
  const h = startOfDay(hoje);
  switch (p) {
    case "mes":
      return { de: chaveDia(startOfMonth(h)), ate: chaveDia(endOfMonth(h)) };
    case "mes_passado": {
      const m = subMonths(h, 1);
      return { de: chaveDia(startOfMonth(m)), ate: chaveDia(endOfMonth(m)) };
    }
    case "90d":
      return { de: chaveDia(subDays(h, 89)), ate: chaveDia(h) };
    case "ano":
      return { de: chaveDia(startOfYear(h)), ate: chaveDia(endOfYear(h)) };
    default:
      return { de: chaveDia(subDays(h, 29)), ate: chaveDia(h) };
  }
}
export const periodoValido = (de: string, ate: string): boolean => dataValida(de) && dataValida(ate) && de <= ate;
/** Qual preset gera exatamente esse período (hoje como referência); nenhum → "personalizado". */
export function presetDoPeriodo(per: Periodo, hoje: Date = new Date()): Preset {
  for (const p of PRESETS) {
    if (p.chave === "personalizado") continue;
    const x = periodoDoPreset(p.chave, hoje);
    if (x.de === per.de && x.ate === per.ate) return p.chave;
  }
  return "personalizado";
}
/** Data-só (`yyyy-MM-dd`) → "dd/MM/yyyy" com `parseISO` (`new Date` deslocaria o dia pelo fuso). */
export const formatarData = (iso: string): string => {
  const d = parseISO(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy") : iso;
};
export const formatarDataHora = (iso: string): string => format(new Date(iso), "dd/MM/yyyy HH:mm");
export const rotuloPeriodo = (per: Periodo): string => `${formatarData(per.de)} – ${formatarData(per.ate)}`;
/** A data (yyyy-MM-dd) cai no período (inclusive)? */
export const noPeriodo = (data: string, per: Periodo): boolean => data >= per.de && data <= per.ate;

// ---- Estado na URL (?de=&ate=&tipo=&categoria=&forma=&q=, o padrão do Nutri + a forma) ----
export type FiltroMetodo = "" | Metodo;
export type FiltrosFinanceiro = Periodo & { tipo: FiltroTipo; categoria: string; metodo: FiltroMetodo; q: string };
type Params = { get(nome: string): string | null };
/** Período inválido ou ausente → padrão (últimos 30 dias); tipo ou forma desconhecidos → todas. */
export function filtrosDaURL(params: Params, hoje: Date = new Date()): FiltrosFinanceiro {
  const de = params.get("de") ?? "";
  const ate = params.get("ate") ?? "";
  const per = periodoValido(de, ate) ? { de, ate } : periodoDoPreset(PRESET_PADRAO, hoje);
  const tipo = params.get("tipo");
  const forma = params.get("forma");
  return {
    ...per, tipo: ehTipo(tipo) ? tipo : "", categoria: params.get("categoria") ?? "", metodo: ehMetodo(forma) ? forma : "",
    q: (params.get("q") ?? "").trim(),
  };
}
/** Só o que difere do padrão entra na URL — o período padrão é relativo a hoje e não fica gravado no link. */
export function filtrosParaURL(f: FiltrosFinanceiro, hoje: Date = new Date()): Record<string, string> {
  const saida: Record<string, string> = {};
  const padrao = periodoDoPreset(PRESET_PADRAO, hoje);
  if (f.de !== padrao.de || f.ate !== padrao.ate) {
    saida.de = f.de;
    saida.ate = f.ate;
  }
  if (f.tipo) saida.tipo = f.tipo;
  if (f.categoria) saida.categoria = f.categoria;
  if (f.metodo) saida.forma = f.metodo;
  if (f.q.trim()) saida.q = f.q.trim();
  return saida;
}
/** As chaves de filtro que esta tela põe na URL (a página guarda as outras — ?aba=). */
export const CHAVES_FILTRO_URL = ["de", "ate", "tipo", "categoria", "forma", "q"] as const;
// ---- As abas da página (?aba=) ----
export type IdAba = "resumo" | "mensalidades" | "lancamentos" | "recibos" | "categorias";
export const IDS_ABA: IdAba[] = ["resumo", "mensalidades", "lancamentos", "recibos", "categorias"];
/** ?aba= escolhe a aba; sem ela, um link antigo do Financeiro do Nutri (?de=&ate=&tipo=…) abre direto em Lançamentos. */
export function abaDaUrl(sp: { get(nome: string): string | null; has(nome: string): boolean }): IdAba {
  const a = sp.get("aba");
  if (IDS_ABA.includes(a as IdAba)) return a as IdAba;
  return CHAVES_FILTRO_URL.some((k) => sp.has(k)) ? "lancamentos" : "resumo";
}
export const filtrosAtivos = (f: { tipo: string; categoria: string; metodo?: string; q: string }): boolean => !!f.tipo || !!f.categoria || !!f.metodo || !!f.q.trim();

// ---- Valor em BRL ----
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** "R$ 1.234,56" (espaço comum, não NBSP, e hífen comum no negativo — facilita ler na tela e nos testes); null → "—". */
export const fmtBRL = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : BRL.format(n).replace(/\xA0/g, " ").replace(/−/g, "-");
/** "+R$ 150,00" pra entrada, "−R$ 40,50" pra saída (sinal de menos tipográfico). */
export const fmtValorComSinal = (tipo: string, valor: number): string => `${tipo === "saida" ? "−" : "+"}${fmtBRL(Math.abs(valor))}`;

/** Texto digitado → número com 2 casas: "1.234,56" → 1234.56; "150" → 150; "40,5" → 40.5; "R$ 2.000" → 2000;
 *  "1234.56" → 1234.56; "12.345.678" → 12345678. Inválido → null. */
export function parseValor(s: string | number | null | undefined): number | null {
  if (typeof s === "number") return Number.isFinite(s) ? arred(s, 2) : null;
  let t = (s ?? "").toString().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return null;
  const negativo = t.startsWith("-");
  t = t.replace(/^[-+]/, "");
  if (!t || !/^[\d.,]+$/.test(t)) return null;
  if (t.includes(",")) {
    if ((t.match(/,/g) ?? []).length > 1) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // só separadores de milhar
  } else if ((t.match(/\./g) ?? []).length > 1) {
    return null;
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return arred(negativo ? -n : n, 2);
}
/** Maior que zero e dentro do numeric(12,2). */
export const valorValido = (s: string | number | null | undefined): boolean => {
  const n = parseValor(s);
  return n !== null && n > 0 && n <= VALOR_MAX;
};
/** Número → texto do formulário "1234,56" (sem milhar, 2 casas); null → "". */
export const textoValor = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? "" : n.toFixed(2).replace(".", ","));
/** Enquanto digita: só dígitos, ponto e vírgula. */
export const limparValorDigitado = (s: string): string => s.replace(/[^\d.,]/g, "");

// ---- Totais (estornadas NÃO contam) ----
export type Totais = { entradas: number; saidas: number; saldo: number; nEntradas: number; nSaidas: number; nEstornadas: number; total: number };
export function totais(lista: { tipo: string; valor: number; estornada: boolean }[]): Totais {
  let entradas = 0;
  let saidas = 0;
  let nEntradas = 0;
  let nSaidas = 0;
  let nEstornadas = 0;
  for (const t of lista) {
    if (t.estornada) {
      nEstornadas += 1;
      continue;
    }
    const v = Number(t.valor) || 0;
    if (t.tipo === "saida") {
      saidas += v;
      nSaidas += 1;
    } else {
      entradas += v;
      nEntradas += 1;
    }
  }
  return { entradas: arred(entradas, 2), saidas: arred(saidas, 2), saldo: arred(entradas - saidas, 2), nEntradas, nSaidas, nEstornadas, total: lista.length };
}

// ---- Formulário ⇄ registro ----
/** O que o profissional digita no modal (valor como texto: aceita vírgula e milhar). */
export type FormMovimentacao = {
  tipo: Tipo;
  descricao: string;
  valor: string;
  data: string;
  categoriaId: string;
  metodo: Metodo;
  pacienteId: string | null;
  observacao: string;
};
/** Nova movimentação: entrada, hoje, Pix, sem categoria/aluno. */
export const formVazio = (hoje: Date = new Date()): FormMovimentacao => ({
  tipo: "entrada",
  descricao: "",
  valor: "",
  data: chaveDia(hoje),
  categoriaId: "",
  metodo: METODO_PADRAO,
  pacienteId: null,
  observacao: "",
});
/** Colunas da transação que o formulário controla (profissional/estornada/recibo ficam fora). */
export type RegistroMovimentacao = {
  tipo: Tipo;
  descricao: string;
  valor: number;
  data: string;
  categoria_id: string | null;
  metodo: Metodo;
  paciente_id: string | null;
  observacao: string | null;
};
const limparTexto = (s: string | null | undefined): string => (s ?? "").trim().replace(/\s+/g, " ");

export function formParaRegistro(f: FormMovimentacao): RegistroMovimentacao {
  return {
    tipo: ehTipo(f.tipo) ? f.tipo : "entrada",
    descricao: limparTexto(f.descricao).slice(0, DESCRICAO_MAX),
    valor: parseValor(f.valor) ?? 0,
    data: dataValida(f.data ?? "") ? f.data : chaveDia(new Date()),
    categoria_id: f.categoriaId || null,
    metodo: ehMetodo(f.metodo) ? f.metodo : "outro",
    paciente_id: f.pacienteId || null,
    observacao: (f.observacao ?? "").trim().slice(0, OBSERVACAO_MAX) || null,
  };
}
export function registroParaForm(t: {
  tipo: string;
  descricao: string;
  valor: number;
  data: string;
  categoria_id: string | null;
  metodo: string;
  paciente_id: string | null;
  observacao: string | null;
}): FormMovimentacao {
  return {
    tipo: ehTipo(t.tipo) ? t.tipo : "entrada",
    descricao: t.descricao ?? "",
    valor: textoValor(t.valor),
    data: t.data,
    categoriaId: t.categoria_id ?? "",
    metodo: ehMetodo(t.metodo) ? t.metodo : "outro",
    pacienteId: t.paciente_id ?? null,
    observacao: t.observacao ?? "",
  };
}

// ---- Ordenação, filtro e contagem ----
/** Mais recente primeiro (pela data; empate → gravada por último primeiro). */
export function ordenarTransacoes<T extends { data: string; created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
}
/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirOrdenado = <T extends { id: string; data: string; created_at: string }>(lista: T[], t: T): T[] =>
  ordenarTransacoes([...lista.filter((x) => x.id !== t.id), t]);

export type TransacaoFiltravel = {
  tipo: string;
  categoria_id: string | null;
  metodo?: string | null;
  descricao: string;
  categoria?: { nome: string } | null;
  paciente?: { nome: string } | null;
  observacao?: string | null;
};
const normalizar = (s: string | null | undefined): string => semAcento(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
/** Palavras da busca (até 6), sem acento/caixa. */
export const palavrasBusca = (q: string | null | undefined): string[] => normalizar(q).split(" ").filter(Boolean).slice(0, 6);
/** Tipo, categoria (pelo id), forma e texto — descrição, aluno, categoria e observação; TODAS as palavras precisam aparecer. */
export function filtrarTransacoes<T extends TransacaoFiltravel>(lista: T[], f: { tipo: string; categoria: string; metodo?: string; q: string }): T[] {
  const ps = palavrasBusca(f.q);
  return lista.filter((t) => {
    if (f.tipo && t.tipo !== f.tipo) return false;
    if (f.categoria && t.categoria_id !== f.categoria) return false;
    if (f.metodo && t.metodo !== f.metodo) return false;
    if (!ps.length) return true;
    const alvo = normalizar([t.descricao, t.paciente?.nome, t.categoria?.nome, t.observacao].filter(Boolean).join(" "));
    return ps.every((p) => alvo.includes(p));
  });
}
export function textoContagem(n: number): string {
  if (n === 0) return "Nenhuma movimentação";
  if (n === 1) return "1 movimentação";
  return `${n} movimentações`;
}
/** Nome de categoria: 2–60 caracteres, sem repetir (sem caixa/acento) uma categoria viva. */
export function validarNomeCategoria(nome: string, existentes: { id: string; nome: string }[], ignorarId?: string): string | null {
  const n = limparTexto(nome);
  if (n.length < 2) return "Informe o nome da categoria";
  if (n.length > CATEGORIA_NOME_MAX) return "Nome muito longo";
  if (existentes.some((c) => c.id !== ignorarId && normalizar(c.nome) === normalizar(n))) return "Já existe uma categoria com esse nome";
  return null;
}
export const ordenarCategorias = <T extends { nome: string }>(l: T[]): T[] => [...l].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
