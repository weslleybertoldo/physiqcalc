// Physiq W6 — regras PURAS da cobrança aluno → profissional na tela (spec §4.3, §4.5, §9; R15, R16, A13). Sem rede e sem
// banco: testadas em src/financeiro/regras.test.ts. A régua da mensalidade é a do Calc (src/lib/cobertura.ts, a mesma do
// banco — mensalidade_recalcular): cada pagamento cobre 1 mês; "em dia" = a cobertura passa de agora.
import type { CobrancaVista, ModoRecebimento, PlanoSalvo, ResumoMatricula } from "./tipos";
import type { Modalidade } from "./planos";
import { tentativaViva } from "./infinitepay";
import { TEXTO_DO_RETORNO, ehUuidMp, type ResultadoDoRetorno, type SituacaoMp } from "./mpConta";

// ───────────────────────── datas (relógio de São Paulo) ─────────────────────────

export function hojeSP(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Instante (ISO) → AAAA-MM-DD em São Paulo; data pura (AAAA-MM-DD) fica como está. */
export function diaSP(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Dias de `de` até `ate` (AAAA-MM-DD). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000);
}

/** "2026-07-19" → "19/07" (curta) ou "19/07/2026". */
export function dataBR(dia: string | null | undefined, curta = true): string {
  if (!dia) return "";
  const d = diaSP(dia) ?? dia;
  const [a, m, dd] = d.slice(0, 10).split("-");
  return curta ? `${dd}/${m}` : `${dd}/${m}/${a}`;
}

export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`;
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** "2026-07-01" → "Julho" (com ano quando não é o ano de hoje: "Julho/2025"). */
export function nomeDoMes(dia: string | null | undefined, hoje: string = hojeSP()): string {
  if (!dia) return "";
  const nome = MESES[Number(dia.slice(5, 7)) - 1] ?? "";
  return dia.slice(0, 4) === hoje.slice(0, 4) ? nome : `${nome}/${dia.slice(0, 4)}`;
}

// ───────────────────────── valores ─────────────────────────

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 249,00" (espaço comum — igual na tela e nos testes). */
export function reais(v: number | string | null | undefined): string {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? "—" : BRL.format(n).replace(/\u00a0/g, " ");
}

/** "R$ 249" sem centavos quando é inteiro (KPI e chip "R$ 249/MÊS" da tela 7). */
export function reaisCurto(v: number | string | null | undefined): string {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? `R$ ${n.toLocaleString("pt-BR")}` : reais(n);
}

/** Texto digitado → número com 2 casas ("1.234,56" → 1234.56; "99,9" → 99.9); inválido ou ≤ 0 → null. */
export function lerValor(texto: string | number | null | undefined): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) && texto > 0 ? Math.round(texto * 100) / 100 : null;
  let t = String(texto ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 99_999_999.99 ? Math.round(n * 100) / 100 : null;
}

// ───────────────────────── mensalidade (a régua do Calc) ─────────────────────────

/** "teste" (W7b) = a cobertura é só o teste grátis do app do aluno sem profissional (nada pago cobre depois dele). */
export type SituacaoMensalidade = "sem" | "pausada" | "aguardando" | "em_dia" | "vence_em_breve" | "vencida" | "pendente" | "teste";

export interface EstadoMensalidade {
  situacao: SituacaoMensalidade;
  /** dia do vencimento (AAAA-MM-DD) — o fim da cobertura, ou o 1º vencimento de quem nunca pagou */
  vence: string | null;
  /** dias até vencer (0 = hoje; negativo = vencida há N dias) */
  dias: number | null;
  valor: number | null;
  coberta: boolean;
}

export interface DadosMensalidade {
  valor: number | string | null;
  pausada: boolean;
  pago_ate: string | null;
  desde: string | null;
  aguardando?: boolean;
  /** W7b — fim do teste grátis do app (aluno sem profissional); a cobertura do banco já o inclui */
  teste_ate?: string | null;
}

export const JANELA_AVISO_DIAS = 7;

/** A cobertura de agora é só o teste grátis do app (pago_ate não passa do fim do teste — 1 min de folga)? */
export function soOTeste(m: Pick<DadosMensalidade, "pago_ate" | "teste_ate">): boolean {
  if (!m.teste_ate || !m.pago_ate) return false;
  const fim = new Date(m.teste_ate).getTime();
  const cob = new Date(m.pago_ate).getTime();
  return Number.isFinite(fim) && Number.isFinite(cob) && cob <= fim + 60_000;
}

export function estadoDaMensalidade(m: DadosMensalidade | null | undefined, agora: Date = new Date()): EstadoMensalidade {
  const valor = m && Number(m.valor) > 0 ? Number(m.valor) : null;
  if (!m || valor === null) return { situacao: "sem", vence: null, dias: null, valor: null, coberta: false };
  const hoje = hojeSP(agora);
  const coberta = !!m.pago_ate && new Date(m.pago_ate).getTime() > agora.getTime();
  const vence = diaSP(m.pago_ate) ?? diaSP(m.desde);
  const dias = vence ? diasEntre(hoje, vence) : null;
  if (m.pausada) return { situacao: "pausada", vence, dias, valor, coberta };
  if (m.aguardando) return { situacao: "aguardando", vence, dias, valor, coberta };
  if (coberta && soOTeste(m)) return { situacao: "teste", vence, dias, valor, coberta };
  if (coberta) return { situacao: dias !== null && dias <= JANELA_AVISO_DIAS ? "vence_em_breve" : "em_dia", vence, dias, valor, coberta };
  if (!m.pago_ate && m.desde && dias !== null && dias >= 0) return { situacao: "vence_em_breve", vence, dias, valor, coberta };
  if (vence) return { situacao: "vencida", vence, dias, valor, coberta };
  return { situacao: "pendente", vence: null, dias: null, valor, coberta };
}

/**
 * W1-B1 — o "aguardando" da mensalidade no painel (o cartão e o KPI da ficha), com a regra da financeiro_do_aluno no servidor e do
 * resumoDaTrava: uma cobrança da mensalidade esperando a confirmação; a tentativa da InfinitePay só enquanto vale (`ip_expira_em` no
 * futuro, 72 h). Vencida, não segura a mensalidade, mesmo antes de a rodada de 15 min (ou o prof_aluno) fechá-la.
 */
export function mensalidadeAguardando(cobrancas: readonly Pick<CobrancaVista, "tipo" | "status" | "forma" | "ip_expira_em">[], agora: Date = new Date()): boolean {
  return cobrancas.some((c) => c.tipo === "mensalidade" && c.status === "aguardando_confirmacao" && (c.forma !== "infinitepay" || tentativaViva(c, agora)));
}

/** A mensalidade está pendente (o "!" e o aviso do Calc: tem valor e a cobertura não vale agora). */
export function mensalidadePendente(e: EstadoMensalidade): boolean {
  return e.situacao === "vencida" || e.situacao === "pendente";
}

/** "vence em 3 dias" · "vence amanhã" · "vence hoje" · "venceu em 12/07" · "está pendente" · "em dia até 19/07" */
export function textoDoVencimento(e: EstadoMensalidade): string {
  if (e.situacao === "sem") return "sem mensalidade";
  if (e.situacao === "pausada") return "cobrança parada";
  if (e.situacao === "pendente") return "está pendente";
  if (e.situacao === "vencida") return `venceu em ${dataBR(e.vence)}`;
  if (e.dias === null) return "";
  if (e.situacao === "aguardando") return "aguardando a confirmação";
  if (e.situacao === "teste") return e.dias <= 0 ? "grátis até hoje" : e.dias === 1 ? "grátis até amanhã" : `grátis até ${dataBR(e.vence)}`;
  if (e.dias <= 0) return "vence hoje";
  if (e.dias === 1) return "vence amanhã";
  if (e.dias <= JANELA_AVISO_DIAS) return `vence em ${e.dias} dias`;
  return `em dia até ${dataBR(e.vence)}`;
}

export type TomChipFin = "n" | "a" | "r" | "g" | "c" | "t";

/** Chip da situação (Perfil › Pagamentos da tela 5: "Vence em 3 dias" âmbar). */
export function chipDaMensalidade(e: EstadoMensalidade): { texto: string; tom: TomChipFin } {
  switch (e.situacao) {
    case "sem":
      return { texto: "Sem cobrança", tom: "g" };
    case "pausada":
      return { texto: "Cobrança parada", tom: "g" };
    case "aguardando":
      return { texto: "Aguardando confirmação", tom: "c" };
    case "em_dia":
      return { texto: `Em dia até ${dataBR(e.vence)}`, tom: "n" };
    case "teste":
      return { texto: `Grátis até ${dataBR(e.vence)}`, tom: "n" };
    case "vence_em_breve": {
      const t = textoDoVencimento(e);
      return { texto: t.charAt(0).toUpperCase() + t.slice(1), tom: "a" };
    }
    case "vencida":
      return { texto: `Venceu em ${dataBR(e.vence)}`, tom: "r" };
    default:
      return { texto: "Pendente", tom: "r" };
  }
}

// ───────────────────────── cobranças avulsas e a trava do inadimplente (R15) ─────────────────────────

export function avulsaVencida(c: { vencimento: string }, hoje: string): boolean {
  return c.vencimento < hoje;
}

/** Inadimplente: a mensalidade venceu (ou nunca foi paga) ou há cobrança avulsa em aberto vencida. Aguardando não conta. */
export function inadimplente(r: ResumoMatricula, agora: Date = new Date()): boolean {
  const hoje = hojeSP(agora);
  if ((r.abertas ?? []).some((c) => avulsaVencida(c, hoje))) return true;
  const e = estadoDaMensalidade({ valor: r.mensalidade_valor, pausada: r.pausada, pago_ate: r.pago_ate, desde: r.desde, aguardando: r.aguardando, teste_ate: r.teste_ate }, agora);
  return mensalidadePendente(e);
}

/** A conta fecha o app do aluno inadimplente (opção da conta — R15, P13; contas do Nutri: ligada). */
export function travaDoInadimplente(r: ResumoMatricula, agora: Date = new Date()): boolean {
  return r.bloquear_inadimplente && inadimplente(r, agora);
}

/** O aluno consegue pagar pelo app? (Pix na chave com comprovante — R16 —, Mercado Pago nas contas liberadas, InfinitePay — W1 — ou o
 *  Mercado Pago do personal — W2) */
export function podePagarPeloApp(modo: ModoRecebimento, temChave: boolean): boolean {
  return modo === "mercadopago" || modo === "mercadopago_conta" || modo === "infinitepay" || (modo === "pix_manual" && temChave);
}

export function formasDePagar(modo: ModoRecebimento, temChave: boolean): string {
  if (modo === "mercadopago" || modo === "mercadopago_conta" || modo === "infinitepay") return "Pix ou cartão";
  if (modo === "pix_manual" && temChave) return "Pix";
  return "combine com seu profissional";
}

// ───────────────────────── o plano do período todo (W-P) ─────────────────────────

/**
 * W-P: o plano do período todo — à vista ou cartão parcelado com mais de 1 mês (cada pagamento cobre o período inteiro). Nele a
 * faixa do topo e o painel de pagar falam do plano; no mês a mês, no plano de 1 mês (o "/mês" da tela — B2) e no modo de hoje, da
 * mensalidade.
 */
export function ehPeriodoTodo(modalidade: Modalidade | null | undefined, meses: number | null | undefined): boolean {
  return (modalidade === "avista" || modalidade === "cartao_parcelado") && (Number(meses) || 1) > 1;
}

/** Título do painel de pagar a mensalidade (Pix na chave e Mercado Pago): "Pagar a mensalidade" / "Adiantar a mensalidade"; no
 *  período todo, "Pagar o plano" / "Renovar o plano". */
export function tituloDoPagar(m: { modalidade?: Modalidade | null; meses?: number | null } | null | undefined, adiantar = false): string {
  if (ehPeriodoTodo(m?.modalidade, m?.meses)) return adiantar ? "Renovar o plano" : "Pagar o plano";
  return adiantar ? "Adiantar a mensalidade" : "Pagar a mensalidade";
}

// ───────────────────────── faixa do topo (Início / aba de abertura — tela 1; A13) ─────────────────────────

export interface Faixa {
  /** a = vence em breve · r = vencida · t = teste grátis do app (W7b) */
  tom: "a" | "r" | "t";
  /** texto do botão ("Pagar" por padrão; "Assinar" no teste grátis) */
  acao?: string;
  titulo: string;
  subtitulo: string;
  podePagar: boolean;
  alvo: { tipo: "mensalidade" } | { tipo: "avulsa"; id: string };
  pacienteId: string;
}

/**
 * "Sua mensalidade vence em 3 dias · R$ 249,00 · Pix ou cartão · Pagar" — de 7 dias antes até pagar; vencida fica vermelha
 * (spec 4.3). Cobrança avulsa (Nutri) entra do mesmo jeito. O mais urgente primeiro; aguardando a confirmação não mostra.
 * W-P: no plano do período todo (ehPeriodoTodo) a faixa fala do plano ("Seu plano vence em 3 dias"); no mês a mês, no plano de
 * 1 mês e no modo de hoje, da mensalidade.
 */
/** play-W6: o que a faixa da conta do app usa na loja com a Play valendo. */
export interface OpcoesFaixa {
  /** o preço da PLAY do plano do app ("R$ 20,00"): o subtítulo fala da Google Play e o botão é "Assinar" */
  precoDaPlay?: (r: ResumoMatricula) => string | null;
}

/** play-W6: a matrícula do app com a assinatura da Google Play viva — sem faixa (renova sozinha; travada, a trava fala). */
const PLAY_VIVA = new Set(["pendente", "ativa", "cancelada", "carencia", "suspensa", "pausada"]);

export function faixaDoAluno(lista: ResumoMatricula[] | null | undefined, agora: Date = new Date(), opcoes: OpcoesFaixa = {}): Faixa | null {
  const hoje = hojeSP(agora);
  const candidatas: Array<Faixa & { ordem: number }> = [];
  for (const r of lista ?? []) {
    if (r.app && r.play && PLAY_VIVA.has(r.play.estado)) continue;
    const precoPlay = r.app && opcoes.precoDaPlay ? opcoes.precoDaPlay(r) : null;
    const pagar = precoPlay ? true : podePagarPeloApp(r.recebimento_modo, r.tem_chave);
    const formas = precoPlay ? "Google Play"
      : r.profissional && !pagar ? `combine com ${r.profissional.split(" ")[0]}` : formasDePagar(r.recebimento_modo, r.tem_chave);
    const e = estadoDaMensalidade({ valor: r.mensalidade_valor, pausada: r.pausada, pago_ate: r.pago_ate, desde: r.desde, aguardando: r.aguardando, teste_ate: r.teste_ate }, agora);
    if (e.situacao === "teste") {
      // W7b: aluno sem profissional nos dias grátis — "Seus dias grátis vão até 06/10 · Depois, R$ 20,00/mês · Pix ou cartão · Assinar"
      candidatas.push({
        tom: "t",
        titulo: e.dias !== null && e.dias <= 0 ? "Seu teste grátis termina hoje" : e.dias === 1 ? "Seu teste grátis termina amanhã" : `Seus dias grátis vão até ${dataBR(e.vence)}`,
        subtitulo: `Depois, ${precoPlay ?? reais(e.valor)}/mês · ${formas}`,
        podePagar: pagar,
        acao: "Assinar",
        alvo: { tipo: "mensalidade" },
        pacienteId: r.paciente_id,
        ordem: e.dias ?? 0,
      });
    } else if (e.situacao === "vence_em_breve" || e.situacao === "vencida" || e.situacao === "pendente") {
      candidatas.push({
        tom: e.situacao === "vence_em_breve" ? "a" : "r",
        titulo: ehPeriodoTodo(r.modalidade, r.plano_meses) ? `Seu plano ${textoDoVencimento(e)}` : `Sua mensalidade ${textoDoVencimento(e)}`,
        subtitulo: precoPlay ? `${precoPlay}/mês · ${formas}` : `${reais(e.valor)} · ${formas}`,
        podePagar: pagar,
        ...(precoPlay ? { acao: "Assinar" } : {}),
        alvo: { tipo: "mensalidade" },
        pacienteId: r.paciente_id,
        ordem: e.dias ?? -9999,
      });
    }
    for (const c of r.abertas ?? []) {
      const dias = diasEntre(hoje, c.vencimento);
      if (dias > JANELA_AVISO_DIAS) continue;
      const quando = dias < 0 ? `venceu em ${dataBR(c.vencimento)}` : dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`;
      candidatas.push({
        tom: dias < 0 ? "r" : "a",
        titulo: `${c.descricao} ${quando}`,
        subtitulo: `${reais(c.valor)} · ${formas}`,
        podePagar: pagar,
        alvo: { tipo: "avulsa", id: c.id },
        pacienteId: r.paciente_id,
        ordem: dias,
      });
    }
  }
  candidatas.sort((a, b) => a.ordem - b.ordem);
  if (!candidatas.length) return null;
  const { ordem: _ordem, ...faixa } = candidatas[0];
  void _ordem;
  return faixa;
}

// ───────────────────────── rótulos das cobranças (listas das telas 5 e 7) ─────────────────────────

export const ROTULO_METODO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  transferencia: "Transferência",
  outro: "Outro",
};

/** "Pix" · "Cartão" · "Pix (Mercado Pago)" · "Pix (InfinitePay)" · "Cartão em 3× (InfinitePay)" · "Por fora · Dinheiro" */
export function rotuloDaForma(c: Pick<CobrancaVista, "forma" | "metodo" | "ip_meio" | "ip_parcelas">): string {
  if (c.forma === "pix_manual") return "Pix";
  if (c.forma === "mp") return c.metodo === "pix" ? "Pix (Mercado Pago)" : "Cartão";
  if (c.forma === "infinitepay") {
    const meio = c.ip_meio ?? (c.metodo === "pix" ? "pix" : c.metodo === "cartao" ? "credit_card" : null);
    if (meio === "pix") return "Pix (InfinitePay)";
    if (meio === "credit_card") return c.ip_parcelas && c.ip_parcelas > 1 ? `Cartão em ${c.ip_parcelas}× (InfinitePay)` : "Cartão (InfinitePay)";
    return "InfinitePay";
  }
  if (c.forma === "manual") return `Por fora · ${ROTULO_METODO[c.metodo ?? ""] ?? c.metodo ?? "manual"}`;
  if (c.forma === "google_play") return "Google Play";
  return "";
}

/** aguardando_ip (W1) = a tentativa da InfinitePay esperando a confirmação (sem comprovante). */
export type SituacaoCobranca = "a_vencer" | "vencida" | "paga" | "aguardando" | "aguardando_mp" | "aguardando_ip" | "recusada" | "reembolsada" | "cancelada";

export function situacaoDaCobranca(c: CobrancaVista, hoje: string = hojeSP()): SituacaoCobranca {
  if (c.status === "paga") return "paga";
  if (c.status === "aguardando_confirmacao") return c.forma === "mp" ? "aguardando_mp" : c.forma === "infinitepay" ? "aguardando_ip" : "aguardando";
  if (c.status === "cancelada") return c.reembolsado_em ? "reembolsada" : c.recusado_em ? "recusada" : "cancelada";
  return avulsaVencida(c, hoje) ? "vencida" : "a_vencer";
}

export const CHIP_COBRANCA: Record<SituacaoCobranca, { texto: string; tom: TomChipFin }> = {
  a_vencer: { texto: "A VENCER", tom: "a" },
  vencida: { texto: "VENCIDA", tom: "r" },
  paga: { texto: "PAGO", tom: "n" },
  aguardando: { texto: "AGUARDANDO", tom: "c" },
  aguardando_mp: { texto: "PROCESSANDO", tom: "c" },
  aguardando_ip: { texto: "PROCESSANDO", tom: "c" },
  recusada: { texto: "RECUSADO", tom: "r" },
  reembolsada: { texto: "ESTORNADO", tom: "g" },
  cancelada: { texto: "CANCELADO", tom: "g" },
};

/** Linha da lista (tela 7): "Julho · R$ 249,00" e "Pix · pago em 18/06" / "Vence em 19/07". */
export function linhaDaCobranca(c: CobrancaVista, hoje: string = hojeSP()): { titulo: string; valor: string; detalhe: string; situacao: SituacaoCobranca } {
  const s = situacaoDaCobranca(c, hoje);
  const titulo = c.tipo === "mensalidade" ? nomeDoMes(c.mes_ref ?? c.vencimento, hoje) || "Mensalidade" : c.descricao;
  const forma = rotuloDaForma(c);
  let detalhe: string;
  if (s === "paga") detalhe = [forma, c.pago_em ? `pago em ${dataBR(c.pago_em)}` : "pago"].filter(Boolean).join(" · ");
  else if (s === "aguardando") detalhe = `Comprovante enviado${c.enviado_em ? ` em ${dataBR(c.enviado_em)}` : ""}`;
  else if (s === "aguardando_mp") detalhe = `${forma} · aguardando o Mercado Pago`;
  else if (s === "aguardando_ip") detalhe = "InfinitePay · aguardando a confirmação";
  else if (s === "recusada") detalhe = `Recusado${c.recusado_motivo ? `: ${c.recusado_motivo}` : ""}`;
  else if (s === "reembolsada") detalhe = `${forma} · estornado em ${dataBR(c.reembolsado_em)}`;
  else if (s === "cancelada") detalhe = "Cancelada";
  else if (s === "vencida") detalhe = `Venceu em ${dataBR(c.vencimento)}${c.recusado_motivo ? ` · recusado: ${c.recusado_motivo}` : ""}`;
  else detalhe = `Vence em ${dataBR(c.vencimento)}${c.recusado_motivo ? ` · recusado: ${c.recusado_motivo}` : ""}`;
  return { titulo, valor: reais(c.valor), detalhe, situacao: s };
}

/** Histórico: aguardando e em aberto primeiro, depois o mais novo. */
export function ordenarCobrancas<T extends CobrancaVista>(lista: T[]): T[] {
  const peso = (c: CobrancaVista) => (c.status === "aguardando_confirmacao" ? 0 : c.status === "aberta" ? 1 : 2);
  return [...lista].sort((a, b) => peso(a) - peso(b) || (b.pago_em ?? b.created_at).localeCompare(a.pago_em ?? a.created_at));
}

/** O comprovante mais recente recusado da mensalidade que ainda não foi substituído por outro envio/pagamento. */
export function recusaVigente(lista: CobrancaVista[]): CobrancaVista | null {
  const mens = lista.filter((c) => c.tipo === "mensalidade" && c.forma === "pix_manual").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ultima = mens[0];
  return ultima && ultima.status === "cancelada" && ultima.recusado_em ? ultima : null;
}

// ───────────────────────── cobertura (porte do Calc — conferida contra o banco no E2E) ─────────────────────────

function somarMesClamp(d: Date): Date {
  const r = new Date(d);
  const dia = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + 1);
  r.setUTCDate(Math.min(dia, new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()));
  return r;
}

function proximaAncora(base: Date, dia: number): Date {
  const ultimo = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const c = new Date(base);
  c.setUTCDate(Math.min(dia, ultimo(c)));
  if (c <= base) {
    c.setUTCDate(1);
    c.setUTCMonth(c.getUTCMonth() + 1);
    c.setUTCDate(Math.min(dia, ultimo(c)));
  }
  return c;
}

/** Fim da cobertura dado o histórico de pagamentos (a régua do mp-payments/cobertura.ts e do mensalidade_recalcular). */
export function coberturaMensalidade(pagamentos: Date[], diaAncora: number | null): Date | null {
  let cobertura: Date | null = null;
  for (const d of [...pagamentos].sort((a, b) => a.getTime() - b.getTime())) {
    const base = cobertura && cobertura > d ? cobertura : d;
    let fim = somarMesClamp(base);
    if (diaAncora !== null) {
      const ancora = proximaAncora(base, diaAncora);
      if (ancora < fim) fim = ancora;
    }
    cobertura = fim;
  }
  return cobertura;
}

// ───────────────────────── erros da função (frases para a pessoa) ─────────────────────────

export const MENSAGEM_ERRO_FINANCEIRO: Record<string, string> = {
  sem_internet: "Sem internet. Os pagamentos aparecem quando a conexão voltar.",
  sem_matricula: "Você ainda não tem matrícula com um profissional.",
  sem_mensalidade: "Nenhuma mensalidade configurada. Fale com seu profissional.",
  cobranca_pausada: "A cobrança pelo app está parada. Fale com seu profissional.",
  ainda_coberto: "Sua mensalidade está em dia — pague de novo quando vencer.",
  modo_nao_mercadopago: "Seu profissional não recebe pelo Mercado Pago.",
  modo_nao_pix_manual: "Seu profissional não recebe por Pix na chave.",
  sem_chave_pix: "Seu profissional ainda não cadastrou a chave Pix.",
  missing_comprovante: "Anexe o comprovante antes de avisar.",
  comprovante_fora_da_pasta: "Comprovante inválido — anexe de novo.",
  comprovante_nao_enviado: "O comprovante não chegou. Anexe de novo.",
  arquivo_grande: "Arquivo muito grande — o limite é 5 MB.",
  tipo_invalido: "Envie uma foto, um print ou um PDF do comprovante.",
  cobranca_nao_aberta: "Essa cobrança não está mais em aberto.",
  cobranca_de_outro_aluno: "Essa cobrança não é sua.",
  cartao_ativo: "A cobrança automática no cartão já está ligada.",
  assinatura_ja_ativa: "Você já tem a cobrança automática ligada.",
  cartao_recusado: "Pagamento recusado pelo cartão.",
  pix_indisponivel: "O Mercado Pago não gerou o Pix agora. Tente de novo em instantes.",
  mp_error: "O Mercado Pago não respondeu. Tente de novo.",
  so_o_dono: "Só o dono da conta mexe na mensalidade.",
  sem_permissao: "Você não tem acesso ao financeiro deste aluno.",
  aluno_inexistente: "Aluno não encontrado.",
  nao_pendente: "Esse comprovante já foi tratado.",
  data_futura: "A data do pagamento não pode ser no futuro.",
  invalid_data: "Informe a data do pagamento.",
  missing_metodo: "Escolha como foi pago.",
  sem_valor: "Sem valor: defina a mensalidade ou informe o valor.",
  valor_invalido: "Valor inválido.",
  descricao_vazia: "Descreva a cobrança.",
  vencimento_invalido: "Informe o vencimento.",
  plano_invalido: "Plano inválido.",
  nao_manual: "Só dá para remover pagamento registrado por fora.",
  nao_reembolsavel: "Esse pagamento não pode ser estornado.",
  sem_transacao_mp: "Só pagamento pelo Mercado Pago é estornado por aqui.",
  // W1b (C1): o pagamento do MP gravado na linha não é desta cobrança — o estorno, o cancelamento e o detalhe dão 409 (é permanente)
  cobranca_de_outro_pagamento: "Esse pagamento do Mercado Pago não é desta cobrança. Fale com o suporte.",
  sem_assinatura: "Não há cobrança automática ativa.",
  rate_limited: "Muitas tentativas. Tente em alguns minutos.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste entram.",
  nao_e_do_app: "Esta mensalidade não é do plano do app.",
  // W-P — os planos do aluno (aba Planos e a ficha do aluno)
  nome_invalido: "Dê um nome ao plano (até 80 letras).",
  meses_invalido: "A duração vai de 1 a 24 meses.",
  modalidades_invalidas: "Marque pelo menos uma forma de pagar.",
  modalidade_da_conta: "Essa forma de pagar não é aceita pelo seu recebimento.",
  parcelas_invalidas: "Escolha de 2 a 12 parcelas.",
  parcela_sem_mensal: "A parcela é só do mês a mês.",
  parcela_invalida: "Parcela inválida.",
  nome_repetido: "Já existe um plano com esse nome (mesmo desativado).",
  modalidade_em_uso: "Há alunos nessa forma de pagar. Passe-os para outra antes de tirar.",
  modalidade_indisponivel: "Essa forma de pagar não está neste plano.",
  modalidade_invalida: "Escolha como o aluno vai pagar.",
  modalidade_sem_automatica: "A cobrança automática é só no mês a mês.",
  automatica_ativa: "O aluno tem a cobrança automática ligada.",
  aluno_em_plano_novo: "Este aluno está num plano com período. Atualize o app para mudar.",
  planos_indisponivel: "Os planos ainda não chegaram a este ambiente.",
  conta_do_app: "Os planos do app são do Physiq.",
  // W1 — a InfinitePay e o Recebimento pela função
  modo_nao_infinitepay: "Seu profissional não recebe pela InfinitePay.",
  infinitepay_nao_ligada: "Seu profissional ainda não terminou de ligar a InfinitePay.",
  infinitepay_indisponivel: "A InfinitePay não respondeu agora. Tente de novo em instantes.",
  infinitepay_recusou: "A InfinitePay não aceitou agora. Confira a InfiniteTag no app da InfinitePay e tente de novo.",
  // sondado em 11/10: a InfiniteTag que não existe e o checkout externo desligado dão a MESMA resposta. A frase diz as 2 coisas, e a tela
  // mostra junto o botão de ativar, com o link que a InfinitePay mandou
  infinitepay_checkout_desligado: "Confira a InfiniteTag e ative o checkout externo na InfinitePay.",
  infinitetag_invalida: "Essa InfiniteTag não parece certa: use só letras, números, ponto, traço ou _ (sem o $).",
  sem_infinitetag: "Cole a sua InfiniteTag e salve antes de escolher a InfinitePay.",
  infinitepay_em_teste: "A InfinitePay ainda está em teste. Logo ela aparece para você.",
  automaticas_ativas: "Há alunos com cobrança automática no cartão pelo Mercado Pago.",
  // W2: agora são 2 — o do Physiq (este) e o da conta do personal
  mp_so_master: "O Mercado Pago do Physiq só é ligado pelo master.",
  w1_indisponivel: "A InfinitePay ainda não chegou a este ambiente.",
  chave_inexistente: "Essa chave não existe mais. Atualize a página.",
  volta_invalida: "Não deu para ler a volta da InfinitePay. Toque em Conferir pagamento.",
  em_uso: "Troque a forma de receber antes de tirar a InfiniteTag.",
  conta_invalida: "Conta não encontrada.",
  // W2 — o Mercado Pago do personal (Tasks 7 e 9). Para o ALUNO: a conexão do profissional caiu, o Pix dele sem chave, a automática antiga
  w2_indisponivel: "O Mercado Pago da sua conta ainda não chegou a este ambiente.",
  mp_nao_conectado: "Conecte o Mercado Pago primeiro: toque em Conectar com o Mercado Pago.",
  mp_conta_sem_integracao: "Conecte o Mercado Pago primeiro: toque em Conectar com o Mercado Pago.",
  mp_conta_em_teste: "O Mercado Pago da sua conta ainda está em teste. Logo ele aparece para você.",
  mp_oauth_nao_configurado: "A conexão com o Mercado Pago ainda está sendo preparada. Tente mais tarde.",
  mp_sem_acesso: "Não deu para desligar as cobranças automáticas: o Physiq não tem mais acesso à conta do Mercado Pago delas. Conecte de novo ou cancele pelo app do Mercado Pago.",
  automaticas_nao_canceladas: "O Mercado Pago não desligou as cobranças automáticas agora. Nada mudou — tente de novo em instantes.",
  mp_conta_indisponivel: "O pagamento pelo app está indisponível agora. Avise o seu profissional.",
  mp_conta_sem_chave_pix: "O Pix do seu profissional ainda não está pronto. Use o cartão ou avise ele.",
  // Task 9: cancelar a automática de OUTRA conta do Mercado Pago (ou da desconectada) — o Physiq não alcança. O mp_outra_conta da confirmação
  // (I5) é outro: o da tela de Recebimento (mensagemDoMpConta)
  mp_outra_conta: "Essa cobrança automática é de outra conta do Mercado Pago, que o Physiq não alcança mais. Cancele pelo app do Mercado Pago.",
  mp_reembolso_pelo_app_do_mp: "Esse pagamento foi para uma conta do Mercado Pago que o Physiq não alcança mais. Faça o estorno pelo app do Mercado Pago.",
  // I11: a automática antiga ainda viva no Mercado Pago (o servidor tentou cancelar e conferiu)
  assinatura_antiga_viva: "Cancele a cobrança automática antiga no app do Mercado Pago ou fale com o seu profissional.",
  // a confirmação da conexão (I8): os textos da volta de mesmo nome, sem o mp_
  mp_conexao_invalida: TEXTO_DO_RETORNO.invalido,
  mp_invalido: TEXTO_DO_RETORNO.invalido,
  mp_conta_invalida: TEXTO_DO_RETORNO.invalido,
  mp_outra_pessoa: TEXTO_DO_RETORNO.outra_pessoa,
  mp_vencido: TEXTO_DO_RETORNO.vencido,
  mp_em_outra_conta: TEXTO_DO_RETORNO.mp_em_outra_conta,
  mp_sem_login: "Entre na sua conta do Physiq e toque em Conectar de novo.",
};

export function mensagemErroFinanceiro(codigo: string | null | undefined, padrao = "Não deu certo agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_FINANCEIRO[codigo]) || padrao;
}

/** mp-cartao (§7.7, decisão 7): o texto da recusa do antifraude do Mercado Pago — o "recusado pelo cartão" de antes fazia a pessoa pensar no
 *  banco (14/10). */
export const TEXTO_RECUSA_SEGURANCA = "O Mercado Pago recusou este pagamento por segurança. Tente o Pix ou outro cartão.";

/** mp-cartao: o texto da recusa do cartão pelo motivo do MP (o status_detail do pagamento ou o código que a função tirou da recusa): só o
 *  cc_rejected_high_risk tem o texto próprio; o resto, o de sempre ("Pagamento recusado pelo cartão."). */
export function mensagemDaRecusa(statusDetail: unknown): string {
  return statusDetail === "cc_rejected_high_risk" ? TEXTO_RECUSA_SEGURANCA : MENSAGEM_ERRO_FINANCEIRO.cartao_recusado;
}

/** W2 — o PROFISSIONAL no painel (as ações do financeiro do aluno: cancelar a cobrança, estornar, registrar, a cobrança automática): os
 *  códigos cuja frase global fala com o ALUNO. O 409 mp_conta_indisponivel da Task 9 (a conexão do MP dele caída) chega aos dois. */
const FRASE_DO_PROFISSIONAL: Record<string, string> = {
  mp_conta_indisponivel: "A conexão com o seu Mercado Pago caiu. Conecte de novo em Configurações › Recebimento.",
};

export function mensagemDoProfissional(codigo: string | null | undefined, padrao?: string): string {
  return (codigo && FRASE_DO_PROFISSIONAL[codigo]) || mensagemErroFinanceiro(codigo, padrao);
}

/** W1 — Configurações › Recebimento (a tela, a lista e o diálogo das chaves Pix): os códigos cuja frase global fala de outra coisa (do
 *  aluno, da mensalidade, dos planos) e o que só o prof_recebimento_salvar devolve. O resto é a frase global. */
const FRASE_DO_RECEBIMENTO: Record<string, string> = {
  sem_permissao: "Você não tem permissão para mudar o recebimento desta conta.",
  so_o_dono: "Só o dono da conta muda o recebimento.",
  conta_do_app: "O recebimento da conta do app é do Physiq.",
  nada_para_salvar: "Nada mudou para salvar.",
};

/** W2 (MENOR 11): a recusa do cancelamento das automáticas (Salvar a forma e Desconectar), com a contagem que a função manda — nada mudou
 *  (o modo e a conexão ficam). Sem a contagem, null (vale a frase de sempre). */
function fraseDoCancelamento(codigo: string | null | undefined, extra: Record<string, unknown>): string | null {
  const alunos = Number(extra.alunos);
  if (codigo === "mp_sem_acesso" && Number.isInteger(alunos) && alunos > 0) {
    return `${alunos === 1 ? "1 cobrança automática ficou ligada" : `${alunos} cobranças automáticas ficaram ligadas`}: o Physiq não tem mais acesso à conta do Mercado Pago onde ${alunos === 1 ? "ela está" : "elas estão"}. Conecte de novo ou cancele pelo app do Mercado Pago. Nada mudou.`;
  }
  const falhas = Number(extra.falhas);
  if (codigo === "automaticas_nao_canceladas" && Number.isInteger(falhas) && falhas > 0) {
    return `O Mercado Pago não desligou ${falhas === 1 ? "1 cobrança automática" : `${falhas} cobranças automáticas`} agora. Nada mudou — tente de novo em instantes.`;
  }
  return null;
}

export function mensagemDoRecebimento(codigo: string | null | undefined, padrao?: string, extra: Record<string, unknown> = {}): string {
  return fraseDoCancelamento(codigo, extra) ?? ((codigo && FRASE_DO_RECEBIMENTO[codigo]) || mensagemErroFinanceiro(codigo, padrao));
}

// ───────────────────────── W2 — o Mercado Pago do personal em Configurações › Recebimento ─────────────────────────

/** W2 — conectar, confirmar e desconectar o Mercado Pago da conta: as frases do DONO onde a do Recebimento (ou a global, do aluno) fala de
 *  outra coisa. O resto é a do Recebimento. */
const FRASE_DO_MP_CONTA: Record<string, string> = {
  // MENOR 19: o prof_mp_conectar só aceita o dono de verdade (nem o master liga o MP dele na conta de um personal)
  so_o_dono: "Só o dono da conta conecta o Mercado Pago.",
  mp_conta_indisponivel: FRASE_DO_PROFISSIONAL.mp_conta_indisponivel,
};

/** I5: a confirmação de OUTRA conta do Mercado Pago recusada porque a de antes ainda tem `abertos` pagamentos em andamento nos alunos desta
 *  conta (automáticas vivas + Pix aberto ou cartão em análise — recebimento_mp_confirmar). Com a contagem, ela entra na frase da volta. */
function fraseDaOutraConta(extra: Record<string, unknown>): string {
  const n = Number(extra.abertos);
  if (!Number.isInteger(n) || n <= 0) return TEXTO_DO_RETORNO.outra_conta;
  return TEXTO_DO_RETORNO.outra_conta.replace("ainda tem pagamento em andamento",
    `ainda tem ${n === 1 ? "1 pagamento" : `${n} pagamentos`} em andamento`);
}

export function mensagemDoMpConta(codigo: string | null | undefined, extra: Record<string, unknown> = {}, padrao?: string): string {
  // o mp_outra_conta GLOBAL é o da Task 9 (cancelar a automática de outra conta); aqui é o da confirmação (I5)
  if (codigo === "mp_outra_conta") return fraseDaOutraConta(extra);
  return (codigo && FRASE_DO_MP_CONTA[codigo]) || mensagemDoRecebimento(codigo, padrao, extra);
}

/** O que a mp-conectar-retorno manda na volta com erro (T8). ok, outra_conta, conectado_sem_trocar, outra_pessoa… vêm da CONFIRMAÇÃO. */
export const RESULTADOS_DA_VOLTA = ["negado", "vencido", "invalido", "falhou", "conta_de_teste"] as const satisfies readonly ResultadoDoRetorno[];
export type ResultadoDaVolta = (typeof RESULTADOS_DA_VOLTA)[number];
export type VoltaDoMp = { tipo: "conectar" } | { tipo: "confirmar"; conexao: string } | { tipo: "erro"; resultado: ResultadoDaVolta };

/**
 * W2 — a busca de Configurações › Recebimento: `?mp=conectar` (o APK abriu o site — só destaca o botão, nunca começa sozinho),
 * `?mp=confirmar&c=<uuid>` (a volta boa: a confirmação pela sessão de quem começou — I8) ou `?mp=<resultado da volta>`. O id fora do formato
 * vira "invalido" sem pedir nada à função; qualquer outra coisa (inclusive o que só a confirmação devolve, como "ok"), null: um link com
 * ?mp=ok não mostra "conectado".
 */
export function lerVoltaDoMp(mp: string | null | undefined, conexao?: string | null): VoltaDoMp | null {
  if (mp === "conectar") return { tipo: "conectar" };
  if (mp === "confirmar") return ehUuidMp(conexao) ? { tipo: "confirmar", conexao } : { tipo: "erro", resultado: "invalido" };
  const resultado = RESULTADOS_DA_VOLTA.find((r) => r === mp);
  return resultado ? { tipo: "erro", resultado } : null;
}

/** W2 (I8) — a pergunta antes de gravar a conexão: a conta do Mercado Pago que vai receber (o apelido pode faltar — T8). */
export function perguntaDaConexaoMp(apelido: string | null | undefined): { titulo: string; descricao: string } {
  const nome = (apelido ?? "").trim();
  return {
    titulo: nome ? `Conectar a conta ${nome} do Mercado Pago?` : "Conectar esta conta do Mercado Pago?",
    descricao: "Os alunos passam a pagar direto nela. Confira se é a sua conta antes de conectar.",
  };
}

export type MarcaDaConexaoMp = "conectado" | "renove" | "caiu" | "desconectado";
const CHIP_DA_CONEXAO_MP: Record<SituacaoMp["tom"], { tom: TomChipFin; marca: MarcaDaConexaoMp }> = {
  verde: { tom: "n", marca: "conectado" },
  ambar: { tom: "a", marca: "renove" },
  rosa: { tom: "r", marca: "caiu" },
  cinza: { tom: "g", marca: "desconectado" },
};
/** W2 — o chip da situação da conexão (situacaoDoMp): o tom da tela e a marca do E2E (data-mp-situacao). */
export function chipDaConexaoMp(s: SituacaoMp): { tom: TomChipFin; marca: MarcaDaConexaoMp } {
  return CHIP_DA_CONEXAO_MP[s.tom];
}

/**
 * W-P — a frase depois de salvar um plano, pelo que o prof_plano_salvar diz das cobranças automáticas de quem segue o plano: a fila da
 * Task 8b (decisão do Weslley 10/10, ponto 2 — `{ enfileiradas }`) ou a troca na hora da função de antes (`{ atualizadas, falharam }`;
 * ela pode seguir publicada por um tempo e o schema sem a fila cai nela). Nada mudou nas automáticas → null.
 */
export function avisoDasAutomaticas(r: Partial<PlanoSalvo> | null | undefined): string | null {
  const a: NonNullable<PlanoSalvo["automaticas"]> = r?.automaticas ?? {};
  if ((Number(r?.enfileiradas ?? a.enfileiradas) || 0) > 0) return "As cobranças automáticas dos alunos vão ser atualizadas em instantes.";
  const falharam = Number(a.falharam) || 0;
  if (falharam > 0) {
    return falharam === 1
      ? "Não deu para mudar a cobrança automática de 1 aluno. Confira no financeiro dele."
      : `Não deu para mudar a cobrança automática de ${falharam} alunos. Confira no financeiro de cada um.`;
  }
  return (Number(a.atualizadas) || 0) > 0 ? "As cobranças automáticas dos alunos já estão com o valor novo." : null;
}
