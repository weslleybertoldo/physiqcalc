/**
 * Situação da pessoa no Physiq (spec 7.4, passo 2): o que a função `minha_situacao()` do banco principal devolve —
 * contas, papéis, módulos, matrículas, bloqueios, se precisa do Banco do Treino, o legado do Nutri e o aviso "o Physiq
 * mudou". Fica guardada no aparelho para o app abrir sem internet (7.5). Aqui só há tipos, cache e regras puras
 * (testadas em situacao.test.ts); quem busca é o `sessao.tsx`.
 */
import type { Modulo } from "@/ui/casca/dadosCasca";
import { ehRotaDeExclusao } from "@/lib/pedidoExclusao";

export type Papel = "dono" | "personal" | "nutricionista";
/** "app" (W7b) = a conta do app: os alunos sem profissional pagam a mensalidade do app ao Physiq. */
export type OrigemConta = "nova" | "legado_calc" | "legado_nutri" | "app";
export type SituacaoConta = "teste" | "ativa" | "vencida" | "isenta" | "suspensa" | "cancelada";

export interface ContaSituacao {
  id: string;
  nome: string;
  origem: OrigemConta;
  plano: "treino" | "nutricao" | "treino_nutricao";
  modulos: Modulo[];
  faixa: string;
  periodicidade: string;
  situacao: SituacaoConta;
  teste_ate: string | null;
  vence_em: string | null;
  tolerancia_dias: number;
  cobranca_legada: boolean;
  isenta_motivo: string | null;
  alunos_bloqueados_em: string | null;
  alunos_bloqueados_msg: string | null;
  dono_id: string | null;
  dono_nome: string | null;
  membro_id: string;
  papeis: Papel[];
  codigo_convite: string | null;
  profissionais: number;
  alunos_ativos: number;
  limite_alunos: number | null;
  /** W4: a cobrança automática no cartão (card do plano "Renova em … · cartão"; recorrente não recebe a faixa de aviso). */
  assinatura?: { status: string; proximo_vencimento: string | null; valor: number | string | null } | null;
  /** W4: o valor mensal de hoje da conta (tabela de preços ou o valor travado). */
  valor_mensal?: number | string | null;
  /**
   * W28: a conta legada já cobrada pelo núcleo (cobranca_legada = false) segue o preço e as regras de hoje (tolerância de 7 dias
   * no Calc; Pix de 30 dias e sem limite de alunos no Nutri) até trocar de plano. Pode não vir (servidor antigo).
   */
  regras_legadas?: boolean;
  /** W28: o preço travado (o de hoje do legado ou o especial do master). Pode não vir (servidor antigo). */
  valor_travado?: number | string | null;
}

export interface PessoaRef {
  id: string;
  nome: string | null;
}

export interface MatriculaSituacao {
  id: string;
  conta_id: string | null;
  conta_nome: string | null;
  conta_origem: OrigemConta | null;
  ativo: boolean;
  origem: string | null;
  modulos: Modulo[];
  bloqueada: boolean;
  bloqueio_msg: string | null;
  /** W14 (R12, P15) — o ajuste "acesso ao app" desta matrícula (false = o profissional desligou; ausente = servidor antigo, vale ligado) */
  acesso_app?: boolean;
  bloqueado_por_pagamento: boolean;
  conta_alunos_bloqueados_em: string | null;
  conta_alunos_bloqueados_msg: string | null;
  personal: PessoaRef | null;
  nutricionista: PessoaRef | null;
  /** W7b — matrícula da conta do app (aluno sem profissional): o plano (app_treino · app_treino_alimentacao), o objetivo e o teste */
  app?: boolean;
  app_plano?: string | null;
  objetivo_app?: string | null;
  teste_ate?: string | null;
}

/** A assinatura do site antigo do Nutri. W28: o servidor ainda manda; o app não usa mais (a cobrança do Nutri legado é a do núcleo). */
export interface LegadoNutri {
  role: string | null;
  teste_ate: string | null;
  pago_ate: string | null;
  isento_assinatura: boolean;
  assinatura: { status: string; valor?: number | string | null; proximo_vencimento?: string | null } | null;
}

export interface AvisoMudancaSituacao {
  publico: "calc" | "nutri";
  ativo: boolean;
  titulo: string | null;
  texto: string | null;
  versao: string;
  visto: boolean;
}

/** hml-12 (H-30) — a trava de idade das matrículas de profissional: menor de 16, ou de 16 a 17 sem o consentimento do responsável. */
export type MenorSituacao = "menor_16" | "sem_responsavel";

/**
 * hml-12 (H-30) — o aceite dos textos legais e os consentimentos, como o banco vê (o `legal` da minha_situacao). `versao` nula =
 * desligado neste schema (a produção até a virada): nada pendente. Senão, o que falta a esta pessoa: o aceite da versão vigente dos
 * Termos e da Política, o consentimento de saúde e a data de nascimento (os 2 só do aluno do app) e a trava de idade. Aqui é só
 * dado (vai para todos os builds); a tela é a porta do aceite (src/publico/legal/aceite/, só no build de staging até a virada).
 */
export interface LegalSituacao {
  versao: string | null;
  aceite_pendente: boolean;
  saude_pendente: boolean;
  nascimento_pendente: boolean;
  menor: MenorSituacao | null;
}

export interface Situacao {
  versao: number;
  user_id: string;
  email: string | null;
  nome: string | null;
  foto_url: string | null;
  master: boolean;
  papel_legado: string | null;
  calc: boolean;
  contas: ContaSituacao[];
  matriculas: MatriculaSituacao[];
  modulos_aluno: Modulo[];
  precisa_treino: boolean;
  sem_nada: boolean;
  legado_nutri: LegadoNutri | null;
  aviso_mudanca: AvisoMudancaSituacao | null;
  /** W7b — id da conta do app (a dos alunos sem profissional) */
  conta_app?: string | null;
  /** hml-12 — o aceite e os consentimentos. Pode não vir (servidor antigo, cache de antes): vale null = nada a pedir. */
  legal?: LegalSituacao | null;
  gerado_em: string;
}

// ───────────────────────── cache no aparelho (abre sem internet — 7.5) ─────────────────────────

const PREFIXO = "physiq_situacao:";

export function lerSituacaoGuardada(userId: string | null | undefined): Situacao | null {
  if (!userId) return null;
  try {
    const bruto = localStorage.getItem(PREFIXO + userId);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Situacao;
    return s && s.user_id === userId && Array.isArray(s.contas) ? s : null;
  } catch {
    return null;
  }
}

export function guardarSituacao(s: Situacao): void {
  try {
    localStorage.setItem(PREFIXO + s.user_id, JSON.stringify(s));
  } catch {
    /* sem armazenamento: busca de novo na próxima abertura */
  }
}

export function limparSituacoes(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXO)) localStorage.removeItem(k);
    }
  } catch {
    /* noop */
  }
}

// ───────────────────────── regras puras ─────────────────────────

const MODULOS: Modulo[] = ["treino", "nutricao"];

function soModulos(v: unknown): Modulo[] {
  return Array.isArray(v) ? (v.filter((m) => MODULOS.includes(m as Modulo)) as Modulo[]) : [];
}

const MENORES: MenorSituacao[] = ["menor_16", "sem_responsavel"];
const VERSAO_LEGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * hml-12 — o `legal` da minha_situacao (e da resposta do aceitar_no_acesso). Falta ou forma estranha → null: a porta do aceite deixa
 * passar (só o "não" claro barra). `menor` desconhecido vale null.
 */
export function normalizarLegal(bruto: unknown): LegalSituacao | null {
  if (!bruto || typeof bruto !== "object") return null;
  const l = bruto as Record<string, unknown>;
  if (l.versao === null) return { versao: null, aceite_pendente: false, saude_pendente: false, nascimento_pendente: false, menor: null };
  if (typeof l.versao !== "string" || !VERSAO_LEGAL.test(l.versao)) return null;
  if ([l.aceite_pendente, l.saude_pendente, l.nascimento_pendente].some((f) => typeof f !== "boolean")) return null;
  return {
    versao: l.versao,
    aceite_pendente: l.aceite_pendente === true,
    saude_pendente: l.saude_pendente === true,
    nascimento_pendente: l.nascimento_pendente === true,
    menor: MENORES.includes(l.menor as MenorSituacao) ? (l.menor as MenorSituacao) : null,
  };
}

/** Normaliza o JSON da função (tolerante a campo faltando: nunca quebra a casca). */
export function normalizarSituacao(bruto: unknown): Situacao | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  if (typeof b.user_id !== "string") return null;
  const contas = (Array.isArray(b.contas) ? b.contas : []) as ContaSituacao[];
  const matriculas = (Array.isArray(b.matriculas) ? b.matriculas : []) as MatriculaSituacao[];
  return {
    versao: Number(b.versao) || 1,
    user_id: b.user_id,
    email: (b.email as string) ?? null,
    nome: (b.nome as string) ?? null,
    foto_url: (b.foto_url as string) ?? null,
    master: b.master === true,
    papel_legado: (b.papel_legado as string) ?? null,
    calc: b.calc === true,
    contas: contas.map((c) => ({ ...c, modulos: soModulos(c.modulos), papeis: (Array.isArray(c.papeis) ? c.papeis : []) as Papel[] })),
    matriculas: matriculas.map((m) => ({ ...m, modulos: soModulos(m.modulos) })),
    modulos_aluno: soModulos(b.modulos_aluno),
    precisa_treino: b.precisa_treino === true,
    sem_nada: b.sem_nada === true,
    legado_nutri: (b.legado_nutri as LegadoNutri) ?? null,
    aviso_mudanca: (b.aviso_mudanca as AvisoMudancaSituacao) ?? null,
    conta_app: (b.conta_app as string) ?? null,
    legal: normalizarLegal(b.legal),
    gerado_em: String(b.gerado_em ?? new Date().toISOString()),
  };
}

/**
 * W7b — a matrícula ATIVA do aluno sem profissional (conta do app), se ele está no app agora (quem tem profissional não tem).
 * O aluno do app paga a mensalidade do app ao Physiq e usa os treinos prontos (e os pratos prontos no Treino + Alimentação).
 */
export function matriculaDoApp(s: Situacao | null | undefined): MatriculaSituacao | null {
  return s?.matriculas.find((m) => m.app === true && m.ativo) ?? null;
}

/** O aluno do app tem a Alimentação (plano Treino + Alimentação)? */
export function temAlimentacaoDoApp(m: MatriculaSituacao | null | undefined): boolean {
  return !!m && m.modulos.includes("nutricao");
}

/** Pode abrir o painel: master ou membro ativo de alguma conta. */
export function ehProfissional(s: Situacao | null | undefined): boolean {
  return !!s && (s.master || s.contas.length > 0);
}

/** Conta ativa do painel: a escolhida (se ainda é membro), senão a 1ª (as com Treino vêm primeiro). */
export function escolherConta(s: Situacao | null | undefined, preferida: string | null | undefined): ContaSituacao | null {
  if (!s || s.contas.length === 0) return null;
  return s.contas.find((c) => c.id === preferida) ?? s.contas[0];
}

/** Rótulo do papel no menu do usuário (tela 6: "Personal trainer"). */
export function rotuloDoPapel(s: Situacao | null | undefined, conta: ContaSituacao | null): string {
  if (!s) return "";
  if (s.master) return "Master";
  const p = conta?.papeis ?? [];
  if (p.includes("personal") && p.includes("nutricionista")) return "Personal e nutricionista";
  if (p.includes("personal")) return "Personal trainer";
  if (p.includes("nutricionista")) return "Nutricionista";
  if (p.includes("dono")) return "Dono da conta";
  return "Aluno";
}

/** Para onde vai quem acabou de entrar (spec 4.2). `de` = a página que pediu o login. */
export function destinoDepoisDoLogin(s: Situacao | null | undefined, de?: string | null): string {
  // W2 da loja: quem entrou pela página /excluir-conta volta para ela — mesmo sem nada (sem conta e sem matrícula), que iria para as
  // Boas-vindas: a página leva cada um à tela de exclusão certa
  if (ehRotaDeExclusao(de)) return de as string;
  if (s?.sem_nada) return "/boas-vindas";
  if (de && de.startsWith("/") && !de.startsWith("/entrar") && !de.startsWith("/boas-vindas")) return de;
  return "/";
}

/**
 * Bloqueio dos alunos pelo master (C101, spec 9: "Acesso pausado" com a mensagem do master). Vale quando TODAS as
 * matrículas ativas estão em conta bloqueada (no caso comum, a única). W28: só o do núcleo (contas.alunos_bloqueados_em, que o
 * espelho grava também no Treino) — o status-lite do Calc antigo saiu.
 */
export function bloqueioDoMaster(s: Situacao | null | undefined): { bloqueado: boolean; mensagem: string | null } {
  if (!s || ehProfissional(s)) return { bloqueado: false, mensagem: null };
  const ativas = s.matriculas.filter((m) => m.ativo);
  const bloqueadas = ativas.filter((m) => !!m.conta_alunos_bloqueados_em);
  if (ativas.length > 0 && bloqueadas.length === ativas.length) {
    return { bloqueado: true, mensagem: bloqueadas.find((m) => m.conta_alunos_bloqueados_msg)?.conta_alunos_bloqueados_msg ?? null };
  }
  return { bloqueado: false, mensagem: null };
}

// ───────────────────────── código do profissional (vincular-aluno) ─────────────────────────

export type ErroVinculo =
  | "codigo_invalido"
  | "profissional_inativo"
  | "proprio_codigo"
  | "outro_profissional"
  | "limite_plano"
  | "rate_limited"
  | "conta_real_no_staging"
  | "sem_internet"
  | "erro_interno";

export interface ResultadoVinculo {
  ok: boolean;
  erro?: ErroVinculo;
  jaEra?: boolean;
  profissional?: string | null;
  conta?: string | null;
}

/** Frase para a pessoa (spec 9 e as de hoje do Calc). */
export const MENSAGEM_VINCULO: Record<ErroVinculo, string> = {
  codigo_invalido: "Não achamos esse código. Confira com o seu profissional.",
  profissional_inativo: "Este profissional não está mais ativo no Physiq.",
  proprio_codigo: "Esse é o seu próprio código de profissional.",
  outro_profissional: "Este aluno já está com outro profissional.",
  limite_plano: "Este profissional atingiu o limite de alunos do plano dele.",
  rate_limited: "Muitas tentativas. Tente em alguns minutos.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste entram.",
  sem_internet: "Conecte-se à internet para usar o código.",
  erro_interno: "Não foi possível usar o código agora. Tente de novo.",
};

export function erroDoVinculo(codigo: unknown): ErroVinculo {
  const c = String(codigo ?? "");
  return (Object.keys(MENSAGEM_VINCULO) as ErroVinculo[]).includes(c as ErroVinculo) ? (c as ErroVinculo) : "erro_interno";
}

/** "PROF-NOME-SOBRENOME" digitado de qualquer jeito → formato do código (maiúsculas, sem espaços nas pontas). */
export function normalizarCodigo(texto: string): string {
  return texto.trim().toUpperCase().replace(/\s+/g, "-").slice(0, 60);
}
