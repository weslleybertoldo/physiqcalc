// Physiq W6 — regras PURAS da cobrança aluno → profissional (spec §4.3, §4.5, §6.6 e §9). Sem Deno, sem rede e sem banco:
// usadas pela pagamentos-aluno e pela mp-webhook-aluno e testadas no Vitest (src/financeiro/servidor.test.ts), que também
// confere que casam com as regras da tela (src/financeiro/regras.ts).

export type Schema = "public" | "staging";
export type StatusCobranca = "aberta" | "paga" | "cancelada" | "aguardando_confirmacao";
export type TipoCobranca = "mensalidade" | "avulsa";
export type FormaCobranca = "pix_manual" | "mp" | "manual";
export type TipoRefAluno = TipoCobranca | "recorrente";

export const STATUS_COBRANCA: StatusCobranca[] = ["aberta", "paga", "cancelada", "aguardando_confirmacao"];

/** Métodos do "pagamento feito por fora" (os do Calc — METODOS_MANUAIS). */
export const METODOS_POR_FORA = ["dinheiro", "pix", "cartao", "transferencia", "outro"] as const;
export type MetodoPorFora = (typeof METODOS_POR_FORA)[number];

export function ehMetodoPorFora(v: unknown): v is MetodoPorFora {
  return typeof v === "string" && (METODOS_POR_FORA as readonly string[]).includes(v);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ehUuidFin(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

// ───────────────────────── referência externa ─────────────────────────

/**
 * Cobranças novas de aluno no Mercado Pago: `physiq:<schema>:aluno:<paciente_id>:<mensalidade|avulsa|recorrente>[:<cobranca_id>]`.
 * A mp-webhook-conta (W4) só lê `physiq:<schema>:conta:…`, o webhook antigo do Calc só lê `<schema>:<user>…` e o do Nutri só
 * `physiqnutri…` — ninguém trata a referência do outro.
 */
export function referenciaAluno(schema: Schema, pacienteId: string, tipo: TipoRefAluno, cobrancaId?: string | null): string {
  return `physiq:${schema}:aluno:${pacienteId}:${tipo}${cobrancaId ? `:${cobrancaId}` : ""}`;
}

export interface RefAluno {
  schema: Schema;
  pacienteId: string;
  tipo: TipoRefAluno;
  cobrancaId: string | null;
}

export function lerReferenciaAluno(ref: string | null | undefined): RefAluno | null {
  const partes = String(ref ?? "").split(":");
  if (partes.length < 5 || partes.length > 6 || partes[0] !== "physiq" || partes[2] !== "aluno") return null;
  const [, schema, , pacienteId, tipo, cobrancaId] = partes;
  if (schema !== "public" && schema !== "staging") return null;
  if (!ehUuidFin(pacienteId)) return null;
  if (tipo !== "mensalidade" && tipo !== "avulsa" && tipo !== "recorrente") return null;
  if (cobrancaId !== undefined && !ehUuidFin(cobrancaId)) return null;
  return { schema, pacienteId, tipo, cobrancaId: cobrancaId ?? null };
}

export interface RefCalc {
  schema: Schema;
  treinoUserId: string;
  mesRef: string | null;
  contexto: "aluno" | "plano_professor";
  tipoCobranca: string | null;
}

/**
 * Referência antiga do Calc (mp-payments do Banco do Treino): `<schema>:<user_id>[:<mes_ref>[:<contexto>[:<tipo>]]]` — a
 * mesma leitura do `parseRef` do mp-webhook de lá (contexto que não é "plano_professor" = aluno).
 */
export function lerReferenciaCalc(ref: string | null | undefined): RefCalc | null {
  if (!ref) return null;
  const partes = String(ref).split(":");
  if (partes.length < 2 || (partes[0] !== "public" && partes[0] !== "staging")) return null;
  if (!ehUuidFin(partes[1])) return null;
  const contexto = partes[3] === "plano_professor" ? "plano_professor" : "aluno";
  return {
    schema: partes[0] as Schema,
    treinoUserId: partes[1],
    mesRef: partes[2] || null,
    contexto,
    tipoCobranca: partes[4] || (contexto === "aluno" ? "mensal" : null),
  };
}

// ───────────────────────── Mercado Pago → cobrança ─────────────────────────

/** Status do pagamento no MP → o da cobrança (nada do MP fica "aberta": a trava e o WhatsApp do Nutri só olham "aberta"). */
export function cobrancaDoStatusMp(status: string | null | undefined): { status: StatusCobranca; reembolso: boolean; final: boolean } {
  switch (String(status || "pending")) {
    case "approved":
      return { status: "paga", reembolso: false, final: false };
    case "refunded":
    case "charged_back":
      return { status: "cancelada", reembolso: true, final: true };
    case "rejected":
    case "cancelled":
    case "expired":
      return { status: "cancelada", reembolso: false, final: true };
    default: // pending, in_process, in_mediation, authorized
      return { status: "aguardando_confirmacao", reembolso: false, final: false };
  }
}

/** O MP ainda pode mudar este pagamento (a tela e o webhook conferem de novo). */
export function mpEmAberto(mpStatus: string | null | undefined): boolean {
  return mpStatus === "pending" || mpStatus === "in_process" || mpStatus === "in_mediation" || mpStatus === "authorized" || !mpStatus;
}

// ───────────────────────── datas (São Paulo) ─────────────────────────

export function diaSP(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** 1º dia do mês de uma data AAAA-MM-DD. */
export function mesRefDe(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** "2026-09-01" → "Setembro/2026" */
export function mesPorExtenso(mesRef: string | null | undefined): string {
  if (!mesRef) return "";
  const [a, m] = mesRef.split("-");
  const nome = MESES[Number(m) - 1];
  return nome ? `${nome}/${a}` : mesRef;
}

/** "Mensalidade · Amigos+Nutritrack · Setembro/2026" (sem plano: "Mensalidade · Setembro/2026"). */
export function descricaoMensalidade(plano: string | null | undefined, mesRef: string): string {
  const p = (plano ?? "").trim();
  return ["Mensalidade", p, mesPorExtenso(mesRef)].filter(Boolean).join(" · ");
}

/**
 * Vencimento da mensalidade que está sendo paga agora (a linha nova): o fim da cobertura (pago_ate) quando existe; senão o
 * 1º vencimento (desde); senão hoje. Sempre AAAA-MM-DD de São Paulo.
 */
export function vencimentoAPagar(m: { pago_ate: string | null; desde: string | null }, hoje: string): string {
  return diaSP(m.pago_ate) ?? diaSP(m.desde) ?? hoje;
}

/** A cobertura vigente cobre agora? (o "em dia" do Calc: pago_ate > agora) */
export function coberto(pagoAte: string | null | undefined, agora: Date = new Date()): boolean {
  return !!pagoAte && new Date(pagoAte).getTime() > agora.getTime();
}

// ───────────────────────── comprovante (Storage) ─────────────────────────

export const COMPROVANTE_MAX_BYTES = 5 * 1024 * 1024;
export type ExtComprovante = "jpg" | "png" | "webp" | "pdf";

export function extensaoComprovante(tipo: string | null | undefined): ExtComprovante | null {
  const t = String(tipo || "").toLowerCase();
  if (t === "image/jpeg" || t === "jpg" || t === "jpeg") return "jpg";
  if (t === "image/png" || t === "png") return "png";
  if (t === "image/webp" || t === "webp") return "webp";
  if (t === "application/pdf" || t === "pdf") return "pdf";
  return null;
}

/** `conta/<conta>/<paciente>/<AAAA-MM>-<carimbo>.<ext>` — o servidor escolhe o caminho (o aluno só sobe pela URL assinada). */
export function caminhoComprovante(contaId: string, pacienteId: string, ext: ExtComprovante, agora: Date = new Date()): string {
  const mes = (diaSP(agora) ?? agora.toISOString().slice(0, 10)).slice(0, 7);
  return `conta/${contaId}/${pacienteId}/${mes}-${agora.getTime()}.${ext}`;
}

/** O comprovante é da pasta desta matrícula (nada de "..")? */
export function comprovanteDaMatricula(caminho: string, contaId: string, pacienteId: string): boolean {
  const c = String(caminho || "");
  return c.startsWith(`conta/${contaId}/${pacienteId}/`) && !c.includes("..") && /\.(jpg|png|webp|pdf)$/.test(c);
}

export function bucketComprovantes(schema: Schema): string {
  return schema === "staging" ? "comprovantes-staging" : "comprovantes";
}

// ───────────────────────── quem vê e quem mexe (spec 4.1 — P6) ─────────────────────────

export interface PapelNaMatricula {
  master: boolean;
  dono: boolean;
  /** responsável de treino ou de nutrição do aluno (com o papel valendo na conta) */
  responsavel: boolean;
  userId: string;
}

/** Financeiro do aluno: dono (e master) vê tudo; o profissional responsável vê as cobranças que criou (P6). */
export function podeVerCobranca(p: PapelNaMatricula, c: { criado_por: string | null; nutricionista_id: string | null }): boolean {
  if (p.master || p.dono) return true;
  if (!p.responsavel) return false;
  return c.criado_por === p.userId || c.nutricionista_id === p.userId;
}

/** Plano, valor, pausar, confirmar a mensalidade, reembolsar e a assinatura são do dono da conta (e do master). */
export function podeMexerNaMensalidade(p: PapelNaMatricula): boolean {
  return p.master || p.dono;
}

/** Cobrança avulsa: quem criou (responsável) ou o dono. */
export function podeMexerNaCobranca(p: PapelNaMatricula, c: { tipo: string; criado_por: string | null; nutricionista_id: string | null }): boolean {
  if (c.tipo === "mensalidade") return podeMexerNaMensalidade(p);
  return podeVerCobranca(p, c);
}

// ───────────────────────── valores ─────────────────────────

/** Valor em reais com 2 casas, positivo e dentro do numeric(10,2); outro → null. */
export function valorValido(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 99_999_999.99) return null;
  return Math.round(n * 100) / 100;
}

export function textoCurto(v: unknown, max: number): string {
  return String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}
