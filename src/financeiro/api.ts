// Physiq W6 — acesso a dados da cobrança aluno → profissional: a função pagamentos-aluno do banco principal (tudo o que é
// cobrança, comprovante e Mercado Pago), o financeiro_do_aluno() (resumo leve do app, guardado no aparelho) e o envio do
// comprovante pelo link assinado (o servidor escolhe o caminho no Storage).
import { principal } from "@/integrations/principal/client";
import type { AlunoResumo, FinanceiroProfissional, MensalidadesDaConta, ResumoConta, ResumoMatricula, StatusAluno } from "./tipos";

export class ErroFinanceiro extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** Chama uma ação da pagamentos-aluno; erro vira ErroFinanceiro com o código da função (a tela traduz). */
export async function acaoFinanceiro<T = Record<string, unknown>>(acao: string, corpo: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroFinanceiro("sem_internet");
  const { data, error } = await principal.functions.invoke("pagamentos-aluno", { body: { acao, ...corpo } });
  if (error) {
    const c = await corpoDoErro(error);
    throw new ErroFinanceiro(String(c?.erro ?? "erro_interno"), c ?? {});
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === false) throw new ErroFinanceiro(String(d.erro ?? "erro_interno"), d);
  return d as T;
}

export const buscarStatusAluno = () => acaoFinanceiro<StatusAluno>("aluno_status");
export const buscarFinanceiroDoAluno = (aluno: string) => acaoFinanceiro<FinanceiroProfissional>("prof_aluno", { aluno });
export const buscarResumoDaConta = (contaId: string) => acaoFinanceiro<ResumoConta>("prof_resumo", { conta_id: contaId });
/** hml-14b (B21): a página da tela Mensalidades (prof_resumo com `pagina`): 20 com mensalidade, 20 sem, a busca e os números. */
export const buscarMensalidadesDaConta = (contaId: string, p: { pagina: number; paginaSem: number; busca: string }) =>
  acaoFinanceiro<MensalidadesDaConta>("prof_resumo", { conta_id: contaId, pagina: p.pagina, pagina_sem: p.paginaSem, busca: p.busca });

export const LIMITE_PDF_BYTES = 5 * 1024 * 1024;

/**
 * Comprovante do Pix: foto/print vira JPEG comprimido; PDF vai como está (até 5 MB). Sobe pelo link assinado que a função dá
 * (conta/<conta>/<aluno>/…) e devolve o caminho para o "Já paguei".
 */
export async function subirComprovante(pacienteId: string, arquivo: File): Promise<{ caminho: string; pdf: boolean; previa: string | null }> {
  const pdf = arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name);
  const imagem = arquivo.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(arquivo.name);
  if (!pdf && !imagem) throw new ErroFinanceiro("tipo_invalido");
  if (pdf && arquivo.size > LIMITE_PDF_BYTES) throw new ErroFinanceiro("arquivo_grande");
  // sob demanda: o módulo das fotos é do Banco do Treino — o financeiro (banco principal) não o carrega na abertura
  const blob: Blob = pdf ? arquivo : await (await import("@/lib/registrosFotos")).comprimirImagem(arquivo);
  const tipo = pdf ? "application/pdf" : "image/jpeg";
  const r = await acaoFinanceiro<{ bucket: string; caminho: string; token: string }>("aluno_upload", { paciente_id: pacienteId, tipo, tamanho: blob.size });
  const { error } = await principal.storage.from(r.bucket).uploadToSignedUrl(r.caminho, r.token, blob, { contentType: tipo, upsert: false });
  if (error) throw new ErroFinanceiro("upload_falhou", { detalhe: error.message });
  return { caminho: r.caminho, pdf, previa: pdf ? null : URL.createObjectURL(blob) };
}

// ───────────────────────── resumo leve do app (guardado no aparelho — como o status-lite do Calc) ─────────────────────────

const CHAVE = "physiq_financeiro_resumo";
export const RESUMO_TTL_MS = 10 * 60 * 1000;
const ouvintes = new Set<() => void>();
let emVoo: Promise<ResumoMatricula[]> | null = null;

interface Guardado {
  uid: string;
  em: number;
  lista: ResumoMatricula[];
}

export function lerResumoGuardado(uid: string | null | undefined, agora = Date.now(), aceitarVencido = false): ResumoMatricula[] | null {
  if (!uid) return null;
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE) || "null") as Guardado | null;
    if (!g || g.uid !== uid || !Array.isArray(g.lista)) return null;
    if (!aceitarVencido && (agora < g.em || agora - g.em > RESUMO_TTL_MS)) return null;
    return g.lista;
  } catch {
    return null;
  }
}

export function guardarResumo(uid: string, lista: ResumoMatricula[], agora = Date.now()): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ uid, em: agora, lista } satisfies Guardado));
  } catch {
    /* sem armazenamento: busca de novo na próxima abertura */
  }
  ouvintes.forEach((f) => f());
}

/** Depois de pagar/enviar comprovante: o resumo guardado deixa de valer e quem mostra busca de novo. */
export function invalidarResumo(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* noop */
  }
  ouvintes.forEach((f) => f());
}

export function assinarResumo(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** 1 chamada em voo por vez (faixa, trava e chip pedem juntos). */
export async function buscarResumo(uid: string): Promise<ResumoMatricula[]> {
  if (!emVoo) {
    emVoo = (async () => {
      const { data, error } = await principal.rpc("financeiro_do_aluno" as never);
      if (error) throw error;
      const lista = (Array.isArray(data) ? data : []) as ResumoMatricula[];
      guardarResumo(uid, lista);
      return lista;
    })().finally(() => {
      emVoo = null;
    });
  }
  return emVoo;
}

// ───────────────────────── selos da lista antiga de alunos (Calc) ─────────────────────────

export interface BadgesAlunos {
  badgesData: Record<string, { s: string; ate: string | null }>;
  aguardando: Record<string, string>;
}

/**
 * Selos "pago até / pendente desde" e "comprovante para conferir" por aluno, no formato que a lista antiga do Calc usa
 * (chave = id do Treino, ou o da matrícula para quem não tem treino). Lê o banco principal (W6).
 */
export async function badgesDaConta(contaId: string, agora = new Date()): Promise<BadgesAlunos> {
  return badgesDoResumo(await buscarResumoDaConta(contaId), agora);
}

/** Selo de um aluno: "pago até" (coberto agora) ou "pendente desde"; sem mensalidade ou com a cobrança parada, nenhum. */
export function badgeDoAluno(a: Pick<AlunoResumo, "mensalidade_valor" | "pausada" | "pago_ate" | "desde">, agora = new Date()): { s: "pago" | "pendente"; ate: string | null } | null {
  if (!a.mensalidade_valor || a.pausada) return null;
  const coberta = !!a.pago_ate && new Date(a.pago_ate).getTime() > agora.getTime();
  return { s: coberta ? "pago" : "pendente", ate: a.pago_ate ?? a.desde };
}

export function badgesDoResumo(r: Pick<ResumoConta, "alunos">, agora = new Date()): BadgesAlunos {
  const badgesData: BadgesAlunos["badgesData"] = {};
  const aguardando: BadgesAlunos["aguardando"] = {};
  for (const a of r.alunos) {
    const id = a.treino_user_id ?? a.paciente_id;
    const b = badgeDoAluno(a, agora);
    if (b) badgesData[id] = b;
    if (a.aguardando) aguardando[id] = a.aguardando;
  }
  return { badgesData, aguardando };
}
