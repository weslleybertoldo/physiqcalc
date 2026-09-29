// Physiq W2 — regras PURAS do resumo do núcleo (banco principal → Banco do Treino). Sem Deno e sem banco: usadas pela
// espelho-resumo e pela espelho-enviar e testadas no Vitest (src/lib/espelhoResumoRegras.test.ts). O formato do resumo é o
// contrato com o Treino (supabase/functions/_shared/espelho/regras.ts → ResumoNucleo); o teste confere que casam.

export type Modulo = "treino" | "nutricao";
export type Papel = "dono" | "personal" | "nutricionista";
export type Situacao = "teste" | "ativa" | "vencida" | "isenta" | "suspensa" | "cancelada";
export type Origem = "nova" | "legado_calc" | "legado_nutri";

export interface LinhaConta {
  id: string;
  nome: string;
  origem: Origem;
  plano: string;
  situacao: Situacao;
  teste_ate: string | null;
  vence_em: string | null;
  tolerancia_dias: number | null;
  cobranca_legada: boolean;
  alunos_bloqueados_em: string | null;
  alunos_bloqueados_msg: string | null;
}
export interface LinhaMembro {
  conta_id: string;
  papeis: string[];
  status: "convidado" | "ativo" | "removido";
  codigo_convite: string | null;
}
export interface LinhaMatricula {
  id: string;
  conta_id: string | null;
  ativo: boolean;
  deleted_at: string | null;
  acesso_bloqueado_em: string | null;
  personal_id: string | null;
  nome: string | null;
  genero: string | null;
  nascimento: string | null;
  created_at: string;
}
export interface LinhaAlunoDeTreino {
  user_id: string;
  conta_id: string;
}

export const ACESSO_SEM_LIMITE = "2999-12-31";
const PAPEIS: Papel[] = ["dono", "personal", "nutricionista"];

export function modulosDoPlano(plano: string | null | undefined): Modulo[] {
  if (plano === "treino") return ["treino"];
  if (plano === "nutricao") return ["nutricao"];
  if (plano === "treino_nutricao") return ["treino", "nutricao"];
  return [];
}

/** AAAA-MM-DD + n dias (sem fuso: conta de calendário). */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Até quando a conta tem acesso (inclusive). Isenta = sem limite; suspensa/cancelada = sem acesso; teste = teste_ate;
 * ativa/vencida = vence_em + tolerância (0 nas contas novas; 7 no legado Calc — spec 6.2/6.3).
 */
export function acessoAteDaConta(c: Pick<LinhaConta, "situacao" | "teste_ate" | "vence_em" | "tolerancia_dias">): string | null {
  switch (c.situacao) {
    case "isenta":
      return ACESSO_SEM_LIMITE;
    case "suspensa":
    case "cancelada":
      return null;
    case "teste":
      return c.teste_ate ? c.teste_ate.slice(0, 10) : null;
    default:
      return c.vence_em ? somarDias(c.vence_em, Math.max(0, c.tolerancia_dias ?? 0)) : null;
  }
}

export function contaResumo(c: LinhaConta) {
  return {
    id: c.id,
    nome: c.nome,
    origem: c.origem,
    modulos: modulosDoPlano(c.plano),
    situacao: c.situacao,
    cobranca_legada: !!c.cobranca_legada,
    acesso_ate: acessoAteDaConta(c),
    alunos_bloqueados_em: c.alunos_bloqueados_em,
    alunos_bloqueados_msg: c.alunos_bloqueados_msg,
  };
}

export interface EntradaResumo {
  principal_user_id: string;
  email: string | null;
  nome: string | null;
  role_perfil: string | null;
  role_jwt: string | null;
  membros: LinhaMembro[];
  contas: LinhaConta[];
  matriculas: LinhaMatricula[];
  alunos_de_treino: LinhaAlunoDeTreino[];
}

/** Monta o resumo do núcleo de uma pessoa (o que o Treino precisa pra espelhar papel, conta, acesso e matrícula). */
export function montarResumo(e: EntradaResumo) {
  const contas = new Map(e.contas.map((c) => [c.id, contaResumo(c)]));
  return {
    principal_user_id: e.principal_user_id,
    email: e.email,
    nome: e.nome,
    master: e.role_perfil === "master" || e.role_jwt === "master",
    membros: e.membros.map((m) => ({
      conta_id: m.conta_id,
      papeis: (m.papeis || []).filter((p): p is Papel => (PAPEIS as string[]).includes(p)),
      status: m.status,
      codigo_convite: m.codigo_convite,
      conta: contas.get(m.conta_id) ?? null,
    })),
    matriculas: e.matriculas.map((p) => ({
      paciente_id: p.id,
      conta_id: p.conta_id,
      ativo: !!p.ativo,
      excluida: !!p.deleted_at,
      bloqueada: !!p.acesso_bloqueado_em,
      personal_id: p.personal_id,
      nome: p.nome,
      genero: p.genero,
      nascimento: p.nascimento,
      criado_em: p.created_at,
      conta: p.conta_id ? contas.get(p.conta_id) ?? null : null,
    })),
    alunos_de_treino: e.alunos_de_treino.map((a) => ({ principal_user_id: a.user_id, conta_id: a.conta_id })),
  };
}

/** Contas em que a pessoa é personal ativa com o módulo Treino (os alunos delas entram em alunos_de_treino). */
export function contasOndeEPersonalComTreino(membros: LinhaMembro[], contas: LinhaConta[]): string[] {
  const porId = new Map(contas.map((c) => [c.id, c]));
  return membros
    .filter((m) => m.status === "ativo" && (m.papeis || []).includes("personal") && modulosDoPlano(porId.get(m.conta_id)?.plano).includes("treino"))
    .map((m) => m.conta_id);
}

/** Espera antes de tentar de novo uma pendência do espelho: 1, 2, 4, 8 min… (teto de 60 min). */
export function proximaTentativaMs(tentativas: number): number {
  return Math.min(60, 2 ** Math.max(0, tentativas - 1)) * 60_000;
}

export const MAX_TENTATIVAS_ESPELHO = 5;

/** Comparação de segredo em tempo constante (ESPELHO_SEGREDO). Segredo curto = sempre recusa. */
export function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  const a = recebido || "";
  const b = esperado || "";
  if (b.length < 32 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
