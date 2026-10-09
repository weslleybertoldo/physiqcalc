// Physiq hml-14b (B21) — a página da tela Painel › Financeiro › Mensalidades no servidor: o prof_resumo com `pagina` (pagamentos-aluno).
// Antes a tela recebia TODOS os alunos da conta e fatiava 20 no navegador (e só achava pelo "Ver mais"); agora o servidor filtra
// (busca sem acento no nome e no e-mail), ordena como a tela ordenava, conta e devolve só a página — os números da conta (com
// mensalidade, em dia, pendentes) vêm à parte, sem a busca. Sem `pagina` no pedido a resposta é a de hoje (o APK antigo usa).
// Pura (sem rede e sem banco): o Vitest (src/financeiro/mensalidadesPagina.test.ts) e o deno test importam.

export const POR_PAGINA = 20;

/** A linha de aluno do prof_resumo (a mensalidade só vem para o dono — P6). */
export interface AlunoDoResumo {
  paciente_id: string;
  treino_user_id: string | null;
  nome: string;
  email: string | null;
  ativo: boolean;
  mensalidade_valor: number | null;
  plano: string | null;
  pausada: boolean;
  pago_ate: string | null;
  desde: string | null;
  aguardando: string | null;
  abertas: number;
}

/** `pagina` fora de 1, 2, 3… */
export class PaginaInvalida extends Error {
  constructor() {
    super("pagina_invalida");
  }
}

/** A página pedida: sem o campo (ou null) = a resposta de hoje (null); inteiro ≥ 1 (número ou texto) = a página; o resto lança. */
export function lerPagina(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 1_000_000) throw new PaginaInvalida();
  return n;
}

/** O selo da mensalidade, o MESMO da tela (src/financeiro/api.ts › badgeDoAluno): sem valor ou cobrança parada = nenhum. */
export function seloDaMensalidade(a: Pick<AlunoDoResumo, "mensalidade_valor" | "pausada" | "pago_ate">, agora: Date): "pago" | "pendente" | null {
  if (!a.mensalidade_valor || a.pausada) return null;
  return !!a.pago_ate && new Date(a.pago_ate).getTime() > agora.getTime() ? "pago" : "pendente";
}

const semAcento = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** As palavras da busca (até 6), sem acento e sem caixa. */
export function palavrasDaBusca(q: unknown): string[] {
  return semAcento(typeof q === "string" ? q.slice(0, 200) : "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
}

/** Todas as palavras aparecem no nome ou no e-mail. */
export function casaComABusca(a: Pick<AlunoDoResumo, "nome" | "email">, palavras: string[]): boolean {
  if (!palavras.length) return true;
  const alvo = semAcento(`${a.nome ?? ""} ${a.email ?? ""}`).toLowerCase();
  return palavras.every((p) => alvo.includes(p));
}

const nomeDe = (a: Pick<AlunoDoResumo, "nome" | "email">): string => a.nome || a.email || "";
/** Por nome (o da tela) e, no empate, pelo id: a mesma ordem em todas as páginas. */
const porNome = (a: AlunoDoResumo, b: AlunoDoResumo): number => nomeDe(a).localeCompare(nomeDe(b), "pt-BR") || a.paciente_id.localeCompare(b.paciente_id);

export interface PaginaDasMensalidades {
  pagina: number;
  por_pagina: number;
  /** quantos COM mensalidade passam na busca */
  total: number;
  alunos: AlunoDoResumo[];
  sem: { pagina: number; total: number; alunos: AlunoDoResumo[] };
  /** os números da conta inteira, sem a busca (os cartões da tela) */
  contagens: { alunos: number; com_mensalidade: number; em_dia: number; pendentes: number; sem_mensalidade: number };
}

/**
 * As 2 listas da tela: com mensalidade (comprovante para conferir primeiro, depois pendentes, em dia e cobrança parada; dentro,
 * por nome) e sem mensalidade (por nome) — cada uma com a busca e a sua página de 20.
 */
export function paginaDasMensalidades(
  alunos: AlunoDoResumo[],
  p: { pagina: number; paginaSem: number; busca: unknown; agora: Date },
): PaginaDasMensalidades {
  const com = alunos.filter((a) => Number(a.mensalidade_valor) > 0);
  const sem = alunos.filter((a) => !(Number(a.mensalidade_valor) > 0));
  const selos = new Map(com.map((a) => [a.paciente_id, seloDaMensalidade(a, p.agora)] as const));
  const peso = (a: AlunoDoResumo) => (a.aguardando ? 0 : selos.get(a.paciente_id) === "pendente" ? 1 : selos.get(a.paciente_id) === "pago" ? 2 : 3);
  const palavras = palavrasDaBusca(p.busca);
  const comBusca = com.filter((a) => casaComABusca(a, palavras)).sort((a, b) => peso(a) - peso(b) || porNome(a, b));
  const semBusca = sem.filter((a) => casaComABusca(a, palavras)).sort(porNome);
  const fatia = (l: AlunoDoResumo[], pagina: number) => l.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  return {
    pagina: p.pagina,
    por_pagina: POR_PAGINA,
    total: comBusca.length,
    alunos: fatia(comBusca, p.pagina),
    sem: { pagina: p.paginaSem, total: semBusca.length, alunos: fatia(semBusca, p.paginaSem) },
    contagens: {
      alunos: alunos.length,
      com_mensalidade: com.length,
      em_dia: com.filter((a) => selos.get(a.paciente_id) === "pago").length,
      pendentes: com.filter((a) => selos.get(a.paciente_id) === "pendente").length,
      sem_mensalidade: sem.length,
    },
  };
}
