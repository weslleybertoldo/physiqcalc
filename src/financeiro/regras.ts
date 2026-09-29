// Physiq W6 — regras PURAS da cobrança aluno → profissional na tela (spec §4.3, §4.5, §9; R15, R16, A13). Sem rede e sem
// banco: testadas em src/financeiro/regras.test.ts. A régua da mensalidade é a do Calc (src/lib/cobertura.ts, a mesma do
// banco — mensalidade_recalcular): cada pagamento cobre 1 mês; "em dia" = a cobertura passa de agora.
import type { CobrancaVista, ModoRecebimento, ResumoMatricula } from "./tipos";

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

export type SituacaoMensalidade = "sem" | "pausada" | "aguardando" | "em_dia" | "vence_em_breve" | "vencida" | "pendente";

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
}

export const JANELA_AVISO_DIAS = 7;

export function estadoDaMensalidade(m: DadosMensalidade | null | undefined, agora: Date = new Date()): EstadoMensalidade {
  const valor = m && Number(m.valor) > 0 ? Number(m.valor) : null;
  if (!m || valor === null) return { situacao: "sem", vence: null, dias: null, valor: null, coberta: false };
  const hoje = hojeSP(agora);
  const coberta = !!m.pago_ate && new Date(m.pago_ate).getTime() > agora.getTime();
  const vence = diaSP(m.pago_ate) ?? diaSP(m.desde);
  const dias = vence ? diasEntre(hoje, vence) : null;
  if (m.pausada) return { situacao: "pausada", vence, dias, valor, coberta };
  if (m.aguardando) return { situacao: "aguardando", vence, dias, valor, coberta };
  if (coberta) return { situacao: dias !== null && dias <= JANELA_AVISO_DIAS ? "vence_em_breve" : "em_dia", vence, dias, valor, coberta };
  if (!m.pago_ate && m.desde && dias !== null && dias >= 0) return { situacao: "vence_em_breve", vence, dias, valor, coberta };
  if (vence) return { situacao: "vencida", vence, dias, valor, coberta };
  return { situacao: "pendente", vence: null, dias: null, valor, coberta };
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
  const e = estadoDaMensalidade({ valor: r.mensalidade_valor, pausada: r.pausada, pago_ate: r.pago_ate, desde: r.desde, aguardando: r.aguardando }, agora);
  return mensalidadePendente(e);
}

/** A conta fecha o app do aluno inadimplente (opção da conta — R15, P13; contas do Nutri: ligada). */
export function travaDoInadimplente(r: ResumoMatricula, agora: Date = new Date()): boolean {
  return r.bloquear_inadimplente && inadimplente(r, agora);
}

/** O aluno consegue pagar pelo app? (Pix na chave com comprovante — R16 — ou Mercado Pago nas contas liberadas) */
export function podePagarPeloApp(modo: ModoRecebimento, temChave: boolean): boolean {
  return modo === "mercadopago" || (modo === "pix_manual" && temChave);
}

export function formasDePagar(modo: ModoRecebimento, temChave: boolean): string {
  if (modo === "mercadopago") return "Pix ou cartão";
  if (modo === "pix_manual" && temChave) return "Pix";
  return "combine com seu profissional";
}

// ───────────────────────── faixa do topo (Início / aba de abertura — tela 1; A13) ─────────────────────────

export interface Faixa {
  tom: "a" | "r";
  titulo: string;
  subtitulo: string;
  podePagar: boolean;
  alvo: { tipo: "mensalidade" } | { tipo: "avulsa"; id: string };
  pacienteId: string;
}

/**
 * "Sua mensalidade vence em 3 dias · R$ 249,00 · Pix ou cartão · Pagar" — de 7 dias antes até pagar; vencida fica vermelha
 * (spec 4.3). Cobrança avulsa (Nutri) entra do mesmo jeito. O mais urgente primeiro; aguardando a confirmação não mostra.
 */
export function faixaDoAluno(lista: ResumoMatricula[] | null | undefined, agora: Date = new Date()): Faixa | null {
  const hoje = hojeSP(agora);
  const candidatas: Array<Faixa & { ordem: number }> = [];
  for (const r of lista ?? []) {
    const pagar = podePagarPeloApp(r.recebimento_modo, r.tem_chave);
    const formas = r.profissional && !pagar ? `combine com ${r.profissional.split(" ")[0]}` : formasDePagar(r.recebimento_modo, r.tem_chave);
    const e = estadoDaMensalidade({ valor: r.mensalidade_valor, pausada: r.pausada, pago_ate: r.pago_ate, desde: r.desde, aguardando: r.aguardando }, agora);
    if (e.situacao === "vence_em_breve" || e.situacao === "vencida" || e.situacao === "pendente") {
      candidatas.push({
        tom: e.situacao === "vence_em_breve" ? "a" : "r",
        titulo: `Sua mensalidade ${textoDoVencimento(e)}`,
        subtitulo: `${reais(e.valor)} · ${formas}`,
        podePagar: pagar,
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

/** "Pix" · "Cartão" · "Pix (Mercado Pago)" · "Por fora · Dinheiro" */
export function rotuloDaForma(c: Pick<CobrancaVista, "forma" | "metodo">): string {
  if (c.forma === "pix_manual") return "Pix";
  if (c.forma === "mp") return c.metodo === "pix" ? "Pix (Mercado Pago)" : "Cartão";
  if (c.forma === "manual") return `Por fora · ${ROTULO_METODO[c.metodo ?? ""] ?? c.metodo ?? "manual"}`;
  return "";
}

export type SituacaoCobranca = "a_vencer" | "vencida" | "paga" | "aguardando" | "aguardando_mp" | "recusada" | "reembolsada" | "cancelada";

export function situacaoDaCobranca(c: CobrancaVista, hoje: string = hojeSP()): SituacaoCobranca {
  if (c.status === "paga") return "paga";
  if (c.status === "aguardando_confirmacao") return c.forma === "mp" ? "aguardando_mp" : "aguardando";
  if (c.status === "cancelada") return c.reembolsado_em ? "reembolsada" : c.recusado_em ? "recusada" : "cancelada";
  return avulsaVencida(c, hoje) ? "vencida" : "a_vencer";
}

export const CHIP_COBRANCA: Record<SituacaoCobranca, { texto: string; tom: TomChipFin }> = {
  a_vencer: { texto: "A VENCER", tom: "a" },
  vencida: { texto: "VENCIDA", tom: "r" },
  paga: { texto: "PAGO", tom: "n" },
  aguardando: { texto: "AGUARDANDO", tom: "c" },
  aguardando_mp: { texto: "PROCESSANDO", tom: "c" },
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
  sem_assinatura: "Não há cobrança automática ativa.",
  rate_limited: "Muitas tentativas. Tente em alguns minutos.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste entram.",
};

export function mensagemErroFinanceiro(codigo: string | null | undefined, padrao = "Não deu certo agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_FINANCEIRO[codigo]) || padrao;
}
