// Physiq W19 — regras PURAS do Resumo do Painel › Financeiro (spec 4.4: "Resumo (recebido, previsto, em aberto, vencido) … gráficos
// 'Receita por mês' e 'Cobranças do mês'" — N-9 do Nutri + C46 do Calc). Junta as duas fontes de dinheiro dos 2 apps SEM contar em
// dobro: os LANÇAMENTOS (entradas do Nutri) e as COBRANÇAS pagas que não viraram lançamento (Pix confirmado/Mercado Pago do Calc —
// quando o profissional marca "lançar a entrada", a cobrança aponta para o lançamento em transacao_id e conta só por ele). As
// mensalidades do Calc não têm linha até serem pagas: a régua da W6 (estadoDaMensalidade) diz quando cada uma vence.
import { estadoDaMensalidade } from "@/financeiro/regras";
import type { AlunoResumo, PendenteResumo } from "@/financeiro/tipos";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arred2 = (n: number): number => Math.round(n * 100) / 100;

// ───────────────────────── datas (AAAA-MM-DD, relógio de São Paulo já aplicado por quem chama) ─────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const partes = (dia: string) => ({ a: Number(dia.slice(0, 4)), m: Number(dia.slice(5, 7)), d: Number(dia.slice(8, 10)) });
export const inicioDoMes = (dia: string): string => `${dia.slice(0, 7)}-01`;
export function fimDoMes(dia: string): string {
  const { a, m } = partes(dia);
  return `${a}-${pad(m)}-${pad(new Date(Date.UTC(a, m, 0)).getUTCDate())}`;
}
export function somarMeses(dia: string, n: number): string {
  const { a, m } = partes(dia);
  const t = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}
export function somarDias(dia: string, n: number): string {
  const { a, m, d } = partes(dia);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const chaveMes = (dia: string): string => dia.slice(0, 7);
/** Os N meses até o de `hoje` (o atual por último), como AAAA-MM. */
export function mesesAte(hoje: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => chaveMes(somarMeses(inicioDoMes(hoje), i - (n - 1))));
}
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-07" → "Jul" (os rótulos do gráfico da tela 6). */
export const rotuloMesCurto = (chave: string): string => MESES_CURTOS[Number(chave.slice(5, 7)) - 1] ?? chave;
/** "2026-07-16" → "julho". */
export const nomeDoMesLongo = (dia: string): string => MESES_LONGOS[Number(dia.slice(5, 7)) - 1] ?? "";
const entre = (dia: string | null | undefined, de: string, ate: string): boolean => !!dia && dia >= de && dia <= ate;

// ───────────────────────── recebido (lançamentos + cobranças pagas sem lançamento) ─────────────────────────

/**
 * hml-14b (D14): o recebido vem SOMADO do banco (financeiro_resumo_periodo com `resumo: true`), por dia — antes o navegador baixava
 * os lançamentos e as cobranças (cortados em 1000) e somava. As regras ficaram no banco: entrada sem estorno (por dia e categoria;
 * a saída e a estornada ficam fora) e cobrança PAGA, sem estorno e sem lançamento (a lançada conta só pelo lançamento), pelo dia
 * de São Paulo. Aqui os dias viram os recebimentos que os cartões e o gráfico somam por mês.
 */
export interface EntradaDoDia {
  /** AAAA-MM-DD */
  dia: string;
  /** o nome da categoria; null = sem categoria (ou uma que você não lê) */
  categoria: string | null;
  valor: number | string;
}

export interface CobrancaDoDia {
  /** AAAA-MM-DD (São Paulo) */
  dia: string;
  valor: number | string;
}

export interface RecebidoDoPeriodo {
  entradasPorDia: EntradaDoDia[];
  cobrancasPorDia: CobrancaDoDia[];
}

export interface CobrancaDoResumo {
  id: string;
  paciente_id: string;
  tipo: string;
  descricao: string;
  valor: number | string;
  vencimento: string;
  status: string;
  pago_em: string | null;
  transacao_id: string | null;
  reembolsado_em: string | null;
  paciente?: { nome: string } | null;
}

export interface Recebimento {
  dia: string;
  valor: number;
  origem: "lancamento" | "cobranca";
}

/** Tudo o que entrou, por dia: as entradas não estornadas (somadas por dia) + as cobranças pagas sem lançamento (já somadas no banco). */
export function recebimentos(r: RecebidoDoPeriodo): Recebimento[] {
  const porDia = new Map<string, number>();
  for (const e of r.entradasPorDia) porDia.set(e.dia, (porDia.get(e.dia) ?? 0) + num(e.valor));
  const saida: Recebimento[] = [...porDia.entries()].map(([dia, valor]) => ({ dia, valor: arred2(valor), origem: "lancamento" }));
  for (const c of r.cobrancasPorDia) saida.push({ dia: c.dia, valor: num(c.valor), origem: "cobranca" });
  return saida;
}

/** O que entra numa soma por dia (os recebimentos do Financeiro e, W28, os pagamentos das contas da Visão geral do master). */
export type ValorDoDia = Pick<Recebimento, "dia" | "valor">;

export const somaEntre = (recs: readonly ValorDoDia[], de: string, ate: string): number => arred2(recs.filter((r) => entre(r.dia, de, ate)).reduce((s, r) => s + r.valor, 0));

/** Variação percentual (null sem base: o período anterior não teve nada). */
export function variacao(atual: number, anterior: number): number | null {
  if (!(anterior > 0)) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

// ───────────────────────── o mês contra o MESMO período do mês anterior (W25 — herdado da W19) ─────────────────────────

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export interface ComparacaoMes {
  /** recebido de 1º até hoje */
  atual: number;
  /** recebido de 1º até o mesmo dia do mês anterior (o último dia dele, se ele for mais curto) */
  anterior: number;
  variacao: number | null;
  /** o período anterior (AAAA-MM-DD) */
  de: string;
  ate: string;
  /** "1–16 jun" · "1º set" (o detalhe do cartão) */
  rotulo: string;
  /** "1º a 16 de junho" (a dica do cartão) */
  rotuloLongo: string;
}

/**
 * Regra ÚNICA da comparação do mês (o KPI "Receita do mês" do Dashboard e o "Recebido em <mês>" do Resumo do Financeiro): o que
 * entrou de 1º até hoje contra o que entrou de 1º até o MESMO dia do mês anterior — no dia 1º, 1º contra 1º (não mais o mês parcial
 * contra o mês cheio, que dava "−87 % sobre setembro" no dia 1º); dia 31 contra um mês de 30 = o mês anterior inteiro; em março,
 * fevereiro vai até o dia 28 (ou 29). W28: também o KPI "Receita do mês" da Visão geral do master (receitaDoMes, src/master/regras.ts).
 */
export function comparacaoDoMes(recs: readonly ValorDoDia[], hoje: string): ComparacaoMes {
  const mes = inicioDoMes(hoje);
  const de = somarMeses(mes, -1);
  const diaHoje = Number(hoje.slice(8, 10));
  const ultimo = Number(fimDoMes(de).slice(8, 10));
  const diaAte = Math.min(diaHoje, ultimo);
  const ate = `${de.slice(0, 8)}${pad(diaAte)}`;
  const atual = somaEntre(recs, mes, hoje);
  const anterior = somaEntre(recs, de, ate);
  const m = Number(de.slice(5, 7)) - 1;
  return {
    atual, anterior, variacao: variacao(atual, anterior), de, ate,
    rotulo: diaAte === 1 ? `1º ${MESES_ABREV[m]}` : `1–${diaAte} ${MESES_ABREV[m]}`,
    rotuloLongo: diaAte === 1 ? `1º de ${MESES_LONGOS[m]}` : `1º a ${diaAte} de ${MESES_LONGOS[m]}`,
  };
}

// ───────────────────────── o que falta receber (cobranças abertas + mensalidades pela régua da W6) ─────────────────────────

export type SituacaoAReceber = "aberta" | "aguardando" | "vencida";

export interface AReceber {
  chave: string;
  paciente_id: string;
  nome: string;
  descricao: string;
  valor: number;
  /** vencimento (AAAA-MM-DD) */
  vence: string;
  situacao: SituacaoAReceber;
  origem: "cobranca" | "mensalidade";
}

/**
 * Cobranças em aberto (no prazo ou vencidas) e aguardando a confirmação, + as mensalidades sem linha ainda: a que já venceu e a que
 * vence até `ate` (padrão: o fim do mês de hoje). Mensalidade parada, sem valor, em teste do app ou com comprovante aguardando
 * (a cobrança dela já está na lista) não entra.
 */
export function aReceber(cobs: CobrancaDoResumo[], alunos: AlunoResumo[], hoje: string, agora: Date, ate: string = fimDoMes(hoje)): AReceber[] {
  const saida: AReceber[] = [];
  const comLinhaAguardando = new Set<string>();
  for (const c of cobs) {
    if (c.status !== "aberta" && c.status !== "aguardando_confirmacao") continue;
    if (c.status === "aguardando_confirmacao" && c.tipo === "mensalidade") comLinhaAguardando.add(c.paciente_id);
    const situacao: SituacaoAReceber = c.status === "aguardando_confirmacao" ? "aguardando" : c.vencimento < hoje ? "vencida" : "aberta";
    saida.push({ chave: `c:${c.id}`, paciente_id: c.paciente_id, nome: c.paciente?.nome ?? "Aluno", descricao: c.descricao, valor: num(c.valor),
      vence: c.vencimento, situacao, origem: "cobranca" });
  }
  for (const a of alunos) {
    if (!(num(a.mensalidade_valor) > 0) || comLinhaAguardando.has(a.paciente_id)) continue;
    const e = estadoDaMensalidade({ valor: a.mensalidade_valor, pausada: a.pausada, pago_ate: a.pago_ate, desde: a.desde, aguardando: !!a.aguardando }, agora);
    if (e.situacao === "vencida" || e.situacao === "pendente") {
      saida.push({ chave: `m:${a.paciente_id}`, paciente_id: a.paciente_id, nome: a.nome || a.email || "Aluno", descricao: "Mensalidade", valor: num(a.mensalidade_valor),
        vence: e.vence ?? hoje, situacao: "vencida", origem: "mensalidade" });
    } else if ((e.situacao === "vence_em_breve" || e.situacao === "em_dia") && e.vence && e.vence >= hoje && e.vence <= ate) {
      saida.push({ chave: `m:${a.paciente_id}`, paciente_id: a.paciente_id, nome: a.nome || a.email || "Aluno", descricao: "Mensalidade", valor: num(a.mensalidade_valor),
        vence: e.vence, situacao: "aberta", origem: "mensalidade" });
    }
  }
  return saida;
}

const somar = (l: { valor: number }[]): number => arred2(l.reduce((s, x) => s + x.valor, 0));

// ───────────────────────── os 4 cartões (tela 6) ─────────────────────────

export interface KpisFinanceiro {
  hoje: string;
  /** AAAA-MM-01 do mês de hoje */
  mes: string;
  recebidoMes: number;
  /** o recebido no MESMO período do mês anterior (comparacaoDoMes) */
  recebidoMesAnterior: number;
  variacaoMes: number | null;
  comparacao: ComparacaoMes;
  /** cobranças e mensalidades que vencem de hoje até o fim do mês + as que aguardam a confirmação */
  aReceberMes: number;
  previstoMes: number;
  emAberto: { qtd: number; valor: number; aguardando: number };
  vencido: { qtd: number; valor: number };
  series: { recebido6m: number[]; previstoMes: number[]; aReceber30d: number[]; vencido6m: number[] };
}

export function kpis(recs: Recebimento[], lista: AReceber[], hoje: string): KpisFinanceiro {
  const mes = inicioDoMes(hoje);
  const fim = fimDoMes(hoje);
  const recebidoMes = somaEntre(recs, mes, fim);
  const comparacao = comparacaoDoMes(recs, hoje);
  const noPrazo = lista.filter((x) => x.situacao !== "vencida");
  const doMes = noPrazo.filter((x) => x.situacao === "aguardando" || x.vence <= fim);
  const vencidas = lista.filter((x) => x.situacao === "vencida");
  const aReceberMes = somar(doMes);
  // séries dos mini gráficos: recebido nos últimos 6 meses; previsto acumulado dia a dia no mês; a receber nos próximos 30 dias
  // (acumulado pelo vencimento); vencido por mês de vencimento nos últimos 6 meses
  const meses6 = mesesAte(hoje, 6);
  const recebido6m = meses6.map((m) => somaEntre(recs, `${m}-01`, fimDoMes(`${m}-01`)));
  const dias = Number(fim.slice(8, 10));
  const previstoSerie: number[] = [];
  for (let d = 1; d <= dias; d += 1) {
    const dia = `${mes.slice(0, 8)}${pad(d)}`;
    const ja = somaEntre(recs, mes, dia <= hoje ? dia : hoje);
    const vem = dia < hoje ? 0 : somar(doMes.filter((x) => x.situacao === "aguardando" || x.vence <= dia));
    previstoSerie.push(arred2(ja + vem));
  }
  const aReceber30d: number[] = [];
  for (let i = 0; i <= 30; i += 3) {
    const dia = somarDias(hoje, i);
    aReceber30d.push(somar(noPrazo.filter((x) => x.situacao === "aguardando" || x.vence <= dia)));
  }
  const vencido6m = meses6.map((m) => somar(vencidas.filter((x) => chaveMes(x.vence) === m)));
  return {
    hoje, mes, recebidoMes, recebidoMesAnterior: comparacao.anterior, variacaoMes: comparacao.variacao, comparacao, aReceberMes,
    previstoMes: arred2(recebidoMes + aReceberMes),
    emAberto: { qtd: noPrazo.length, valor: somar(noPrazo), aguardando: noPrazo.filter((x) => x.situacao === "aguardando").length },
    vencido: { qtd: vencidas.length, valor: somar(vencidas) },
    series: { recebido6m, previstoMes: previstoSerie, aReceber30d, vencido6m },
  };
}

// ───────────────────────── "Receita" (o gráfico da tela 6: 30D · 6M · Ano) ─────────────────────────

export type PeriodoGrafico = "30d" | "6m" | "ano";
export const PERIODOS_GRAFICO: { valor: PeriodoGrafico; rotulo: string }[] = [
  { valor: "30d", rotulo: "30D" },
  { valor: "6m", rotulo: "6M" },
  { valor: "ano", rotulo: "Ano" },
];

export interface SerieReceita {
  pontos: number[];
  rotulos: string[];
  total: number;
  totalAnterior: number;
  variacao: number | null;
  /** texto do chip: "+12% em 6 meses" */
  textoVariacao: string | null;
}

const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * 30D: o recebido ACUMULADO dia a dia nos últimos 30 dias (6 rótulos). 6M: por mês, os últimos 6. Ano: por mês, de janeiro até o
 * mês de hoje. A variação compara com o período anterior de mesmo tamanho (Ano: o mesmo pedaço do ano passado).
 */
export function serieReceita(recs: Recebimento[], hoje: string, periodo: PeriodoGrafico): SerieReceita {
  if (periodo === "30d") {
    const de = somarDias(hoje, -29);
    const pontos: number[] = [];
    let acc = 0;
    const porDia = new Map<string, number>();
    for (const r of recs) if (entre(r.dia, de, hoje)) porDia.set(r.dia, (porDia.get(r.dia) ?? 0) + r.valor);
    const dias: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      const dia = somarDias(de, i);
      dias.push(dia);
      acc += porDia.get(dia) ?? 0;
      pontos.push(arred2(acc));
    }
    const total = somaEntre(recs, de, hoje);
    const totalAnterior = somaEntre(recs, somarDias(de, -30), somarDias(de, -1));
    const v = variacao(total, totalAnterior);
    return { pontos, rotulos: [0, 6, 12, 18, 24, 29].map((i) => dm(dias[i])), total, totalAnterior, variacao: v, textoVariacao: v === null ? null : `${v >= 0 ? "+" : ""}${v}% em 30 dias` };
  }
  const meses = periodo === "6m" ? mesesAte(hoje, 6) : mesesAte(hoje, Number(hoje.slice(5, 7)));
  const pontos = meses.map((m) => somaEntre(recs, `${m}-01`, fimDoMes(`${m}-01`)));
  const total = arred2(pontos.reduce((s, x) => s + x, 0));
  let totalAnterior: number;
  if (periodo === "6m") {
    const antes = mesesAte(somarMeses(inicioDoMes(hoje), -6), 6);
    totalAnterior = arred2(antes.reduce((s, m) => s + somaEntre(recs, `${m}-01`, fimDoMes(`${m}-01`)), 0));
  } else {
    const anoPassado = `${Number(hoje.slice(0, 4)) - 1}`;
    totalAnterior = somaEntre(recs, `${anoPassado}-01-01`, `${anoPassado}-${hoje.slice(5, 10)}`);
  }
  const v = variacao(total, totalAnterior);
  const texto = v === null ? null : `${v >= 0 ? "+" : ""}${v}% ${periodo === "6m" ? "em 6 meses" : "no ano"}`;
  return { pontos, rotulos: meses.map(rotuloMesCurto), total, totalAnterior, variacao: v, textoVariacao: texto };
}

// ───────────────────────── "Cobranças do mês" (a rosca do Nutri, com o "aguardando" do Calc) ─────────────────────────

export type ChaveFatia = "pagas" | "aguardando" | "abertas" | "vencidas";
export interface FatiaCobranca {
  chave: ChaveFatia;
  rotulo: string;
  qtd: number;
  valor: number;
}

/** Cobranças com vencimento no mês de hoje (canceladas e estornadas fora) + as mensalidades do mês que ainda não têm linha. */
export function cobrancasDoMes(cobs: CobrancaDoResumo[], lista: AReceber[], hoje: string): FatiaCobranca[] {
  const de = inicioDoMes(hoje);
  const ate = fimDoMes(hoje);
  const doMes = cobs.filter((c) => entre(c.vencimento, de, ate) && c.status !== "cancelada" && !c.reembolsado_em);
  const pagas = doMes.filter((c) => c.status === "paga");
  const virtuais = lista.filter((x) => x.origem === "mensalidade" && entre(x.vence, de, ate));
  const aguardando = doMes.filter((c) => c.status === "aguardando_confirmacao");
  const abertas = [...doMes.filter((c) => c.status === "aberta" && c.vencimento >= hoje).map((c) => num(c.valor)), ...virtuais.filter((x) => x.situacao === "aberta").map((x) => x.valor)];
  const vencidas = [...doMes.filter((c) => c.status === "aberta" && c.vencimento < hoje).map((c) => num(c.valor)), ...virtuais.filter((x) => x.situacao === "vencida").map((x) => x.valor)];
  const soma = (l: number[]) => arred2(l.reduce((s, x) => s + x, 0));
  return [
    { chave: "pagas", rotulo: "Pagas", qtd: pagas.length, valor: soma(pagas.map((c) => num(c.valor))) },
    { chave: "aguardando", rotulo: "Aguardando", qtd: aguardando.length, valor: soma(aguardando.map((c) => num(c.valor))) },
    { chave: "abertas", rotulo: "Em aberto", qtd: abertas.length, valor: soma(abertas) },
    { chave: "vencidas", rotulo: "Vencidas", qtd: vencidas.length, valor: soma(vencidas) },
  ];
}

/** Fração paga do mês pelo valor (0 a 1; sem cobrança no mês = 0). */
export function fracaoPaga(fatias: FatiaCobranca[]): number {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const pagas = fatias.find((f) => f.chave === "pagas")?.valor ?? 0;
  return total > 0 ? pagas / total : 0;
}

// ───────────────────────── "Precisam de atenção" (tela 6) ─────────────────────────

export interface ItemAtencao {
  chave: string;
  paciente_id: string;
  nome: string;
  texto: string;
  chip: "PIX" | "VENCIDA";
  /** para ordenar: comprovante primeiro, depois a vencida mais antiga */
  ordem: string;
}

const brCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export function precisamDeAtencao(pendentes: PendenteResumo[], lista: AReceber[]): ItemAtencao[] {
  const itens: ItemAtencao[] = pendentes.map((p) => ({
    chave: `pix:${p.id}`, paciente_id: p.paciente_id, nome: p.aluno?.nome || p.aluno?.email || "Aluno", texto: "Pix aguardando sua confirmação", chip: "PIX",
    ordem: `0:${p.enviado_em ?? p.created_at}`,
  }));
  for (const x of lista) {
    if (x.situacao !== "vencida") continue;
    itens.push({
      chave: x.chave, paciente_id: x.paciente_id, nome: x.nome, chip: "VENCIDA", ordem: `1:${x.vence}`,
      texto: x.origem === "mensalidade" ? `Mensalidade vencida desde ${brCurto(x.vence)}` : `${x.descricao} venceu em ${brCurto(x.vence)}`,
    });
  }
  return itens.sort((a, b) => a.ordem.localeCompare(b.ordem));
}

// ───────────────────────── entradas do mês por categoria (barras da tela 7) ─────────────────────────

export interface BarraCategoria {
  nome: string;
  valor: number;
}

/** Entradas do mês por categoria (as cobranças pagas sem lançamento entram como "Mensalidades e cobranças"), maior primeiro. */
export function entradasPorCategoria(r: RecebidoDoPeriodo, hoje: string): BarraCategoria[] {
  const de = inicioDoMes(hoje);
  const ate = fimDoMes(hoje);
  const mapa = new Map<string, number>();
  for (const e of r.entradasPorDia) {
    if (!entre(e.dia, de, ate)) continue;
    const nome = e.categoria ?? "Sem categoria";
    mapa.set(nome, (mapa.get(nome) ?? 0) + num(e.valor));
  }
  for (const c of r.cobrancasPorDia) {
    if (!entre(c.dia, de, ate)) continue;
    mapa.set("Mensalidades e cobranças", (mapa.get("Mensalidades e cobranças") ?? 0) + num(c.valor));
  }
  return [...mapa.entries()].map(([nome, valor]) => ({ nome, valor: arred2(valor) })).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"));
}
