/**
 * Painel › Alunos (W13) — regras puras da lista (C27, C31, N-10, N-66), das mensagens (spec 9) e do CSV. Sem rede: testadas
 * no Vitest (regras.test.ts). A lista vem da alunos_da_conta() do banco principal (P1: dono vê todos, membro só os seus).
 */
import { mensagemLimite } from "@/nucleo/cobranca/regras";
import { MENSAGEM_REPETIDO } from "@/nucleo/dadoRepetido";
import type { TomChip } from "@/ui/premium/Chip";

export type SituacaoFiltro = "ativos" | "bloqueados" | "desativados" | "excluidas" | "todos";
export type ModuloAluno = "treino" | "nutricao";
export type PagamentoFiltro = "" | "pago" | "pendente" | "comprovante";

export interface FiltrosAlunos {
  q: string;
  situacao: SituacaoFiltro;
  modulo: "" | ModuloAluno;
  /** id do responsável, "sem" (sem responsável) ou "" (todos) */
  responsavel: string;
  tag: string;
  pagamento: PagamentoFiltro;
}

/** Filtro padrão = o conjunto que o número do menu conta (ativos, sem bloqueio — o que ocupa vaga do plano). */
export const FILTROS_PADRAO: FiltrosAlunos = { q: "", situacao: "ativos", modulo: "", responsavel: "", tag: "", pagamento: "" };

export const TAMANHO_PAGINA = 20;

export const SITUACOES: { valor: SituacaoFiltro; rotulo: string }[] = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "bloqueados", rotulo: "Bloqueados" },
  { valor: "desativados", rotulo: "Desativados" },
  { valor: "excluidas", rotulo: "Conta excluída" },
  { valor: "todos", rotulo: "Todos" },
];

export function filtrosAtivos(f: FiltrosAlunos): boolean {
  return !!f.q.trim() || f.situacao !== "ativos" || !!f.modulo || !!f.responsavel || !!f.tag || !!f.pagamento;
}

/** O corpo que a alunos_da_conta() lê (só o que está preenchido). */
export function filtrosParaServidor(f: FiltrosAlunos): Record<string, string> {
  const r: Record<string, string> = { situacao: f.situacao };
  if (f.q.trim()) r.q = f.q.trim();
  if (f.modulo) r.modulo = f.modulo;
  if (f.responsavel) r.responsavel = f.responsavel;
  if (f.tag) r.tag = f.tag;
  if (f.pagamento) r.pagamento = f.pagamento;
  return r;
}

export interface PessoaResumo {
  id: string;
  nome: string | null;
}

export interface AlunoLinha {
  id: string;
  /** id da rota do perfil (/painel/alunos/:id): o do Treino para quem tem treino (as abas antigas usam), senão a matrícula */
  rota_id: string;
  treino_user_id: string | null;
  tem_login: boolean;
  nome: string;
  email: string | null;
  telefone: string | null;
  foto_url: string | null;
  tags: string[];
  ativo: boolean;
  bloqueado: boolean;
  bloqueado_em: string | null;
  bloqueio_msg: string | null;
  conta_excluida: boolean;
  origem: string | null;
  criado_em: string;
  atualizado_em: string;
  modulos: ModuloAluno[];
  personal: PessoaResumo | null;
  nutricionista: PessoaResumo | null;
  pagamento: { s: "pago" | "pendente"; ate: string | null } | null;
  comprovante: boolean;
  sou_eu: boolean;
}

export interface Responsavel {
  id: string;
  nome: string;
  papeis: ("personal" | "nutricionista")[];
  eu: boolean;
}

export interface ListaAlunos {
  total: number;
  itens: AlunoLinha[];
  contagens: Record<SituacaoFiltro, number>;
  vagas: { em_uso: number; limite: number | null; origem: string; faixa: string };
  conta: { id: string; nome: string; modulos: ModuloAluno[]; origem: string; travada: boolean; dono_nome: string | null };
  eu: { id: string; dono: boolean; personal: boolean; nutricionista: boolean };
  responsaveis: Responsavel[];
  tags: string[];
  pendentes: number;
  convites_pendentes: number;
}

const SIT_VAZIA: Record<SituacaoFiltro, number> = { ativos: 0, bloqueados: 0, desativados: 0, excluidas: 0, todos: 0 };

/** Normaliza a resposta do banco (tolerante a campo faltando: nunca quebra a tela). */
export function normalizarLista(bruto: unknown): ListaAlunos | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  if (b.ok !== true) return null;
  const itens = (Array.isArray(b.itens) ? b.itens : []) as AlunoLinha[];
  const conta = (b.conta ?? {}) as ListaAlunos["conta"];
  return {
    total: Number(b.total) || 0,
    itens: itens.map((a) => ({
      ...a,
      tags: Array.isArray(a.tags) ? a.tags : [],
      modulos: (Array.isArray(a.modulos) ? a.modulos : []).filter((m): m is ModuloAluno => m === "treino" || m === "nutricao"),
    })),
    contagens: { ...SIT_VAZIA, ...((b.contagens ?? {}) as Partial<Record<SituacaoFiltro, number>>) },
    vagas: { em_uso: 0, limite: null, origem: "", faixa: "", ...((b.vagas ?? {}) as Partial<ListaAlunos["vagas"]>) },
    conta: { ...conta, modulos: (Array.isArray(conta.modulos) ? conta.modulos : []) as ModuloAluno[] },
    eu: { id: "", dono: false, personal: false, nutricionista: false, ...((b.eu ?? {}) as Partial<ListaAlunos["eu"]>) },
    responsaveis: (Array.isArray(b.responsaveis) ? b.responsaveis : []) as Responsavel[],
    tags: (Array.isArray(b.tags) ? b.tags : []) as string[],
    pendentes: Number(b.pendentes) || 0,
    convites_pendentes: Number(b.convites_pendentes) || 0,
  };
}

/** Primeiro nome ("Lucas Ferreira" → "LUCAS"), como os chips da tela 7 ("TREINO · LUCAS"). */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome || "").trim().split(/\s+/)[0] || "";
}

export interface ChipLinha {
  tom: TomChip;
  rotulo: string;
  marca: string;
}

/** Chips dos módulos com o responsável (tela 7) — ou "SEM RESPONSÁVEL" (W5: quem saiu da equipe deixou alunos sem ninguém). */
export function chipsDosModulos(a: Pick<AlunoLinha, "modulos" | "personal" | "nutricionista">): ChipLinha[] {
  const r: ChipLinha[] = [];
  if (a.modulos.includes("treino")) r.push({ tom: "t", rotulo: `TREINO${a.personal ? ` · ${primeiroNome(a.personal.nome).toUpperCase()}` : ""}`, marca: "treino" });
  if (a.modulos.includes("nutricao")) r.push({ tom: "n", rotulo: `NUTRIÇÃO${a.nutricionista ? ` · ${primeiroNome(a.nutricionista.nome).toUpperCase()}` : ""}`, marca: "nutricao" });
  if (!a.personal && !a.nutricionista) r.push({ tom: "a", rotulo: "SEM RESPONSÁVEL", marca: "sem-responsavel" });
  return r;
}

function ddmm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Selos da linha (C27): situação do acesso e do pagamento. */
export function selosDoAluno(a: Pick<AlunoLinha, "ativo" | "bloqueado" | "conta_excluida" | "pagamento" | "comprovante">): ChipLinha[] {
  const r: ChipLinha[] = [];
  if (a.conta_excluida) r.push({ tom: "r", rotulo: "CONTA EXCLUÍDA", marca: "conta-excluida" });
  else if (!a.ativo) r.push({ tom: "g", rotulo: "DESATIVADO", marca: "desativado" });
  if (a.bloqueado && a.ativo) r.push({ tom: "r", rotulo: "BLOQUEADO", marca: "bloqueado" });
  if (a.comprovante) r.push({ tom: "c", rotulo: "COMPROVANTE", marca: "comprovante" });
  if (a.pagamento?.s === "pago") r.push({ tom: "n", rotulo: a.pagamento.ate ? `PAGO ATÉ ${ddmm(a.pagamento.ate)}` : "PAGO", marca: "pago" });
  if (a.pagamento?.s === "pendente") r.push({ tom: "a", rotulo: "PENDENTE", marca: "pendente" });
  return r;
}

export function formatarTelefone(v: string | null | undefined): string {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length < 10) return d;
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/** "aluno desde mar/2026" (tela 7). */
export function desde(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mes = d.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
  return `desde ${mes}/${d.toLocaleDateString("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" })}`;
}

/** Linha fina embaixo do nome: e-mail (ou telefone) · desde. */
export function linhaFina(a: Pick<AlunoLinha, "email" | "telefone" | "criado_em" | "tem_login">): string {
  const contato = a.email || formatarTelefone(a.telefone) || (a.tem_login ? "" : "sem contato");
  return [contato, desde(a.criado_em)].filter(Boolean).join(" · ");
}

export function rotaDoAluno(a: Pick<AlunoLinha, "rota_id">): string {
  return `/painel/alunos/${encodeURIComponent(a.rota_id)}`;
}

/** Vagas do plano (C96): "9 de 10 alunos ativos" · "12 alunos ativos · sem limite". */
export function textoVagas(v: ListaAlunos["vagas"]): string {
  const n = v.em_uso;
  if (v.limite === null || v.limite === undefined) return `${n} ${n === 1 ? "aluno ativo" : "alunos ativos"} · sem limite`;
  return `${n} de ${v.limite} alunos ativos`;
}

export function limiteAtingido(v: ListaAlunos["vagas"]): boolean {
  return v.limite !== null && v.limite !== undefined && v.em_uso >= v.limite;
}

/** O que o menu ⋮ oferece (C31 + N-10): quem pode é o dono, o responsável ou o master (a regra também está no banco). */
export interface AcoesDisponiveis {
  abrir: boolean;
  pdf: boolean;
  bloquear: boolean;
  desbloquear: boolean;
  desativar: boolean;
  reativar: boolean;
  remover: boolean;
}

export function acoesDoAluno(a: AlunoLinha, eu: ListaAlunos["eu"]): AcoesDisponiveis {
  const gere = eu.dono || a.personal?.id === eu.id || a.nutricionista?.id === eu.id;
  return {
    abrir: true,
    pdf: !!a.treino_user_id,
    bloquear: gere && a.ativo && !a.bloqueado && !a.conta_excluida,
    desbloquear: gere && a.ativo && a.bloqueado,
    desativar: gere && a.ativo,
    reativar: gere && !a.ativo && !a.conta_excluida,
    remover: gere,
  };
}

/** Mensagem da tela para cada erro do servidor (spec 9). */
export function mensagemErroAlunos(codigo: string | null | undefined, extra: Record<string, unknown> = {}): string {
  switch (codigo) {
    case "limite_plano": {
      const limite = Number(extra.limite);
      const base = Number.isFinite(limite) && limite > 0
        ? mensagemLimite(limite, extra.sou_dono !== false, (extra.dono_nome as string) ?? null)
        : "O plano da conta chegou ao limite de alunos ativos.";
      const uso = Number(extra.em_uso);
      // o uso é da conta inteira: só o dono vê todos os alunos (número = tela); o membro recebe só o limite e o "fale com"
      return extra.sou_dono !== false && Number.isFinite(uso) && Number.isFinite(limite) && limite > 0 ? `${base} (${uso} de ${limite} em uso)` : base;
    }
    case "outro_profissional": return "Este aluno já está com outro profissional.";
    case "ja_e_aluno": return "Este e-mail já é de um aluno ativo da conta.";
    case "ja_cadastrado": return "Já existe um aluno com este e-mail na conta.";
    // W16b: e-mail/CPF de outro aluno, em qualquer conta (o formulário mostra embaixo do campo; aqui é a frase das outras telas)
    case "email_repetido": case "paciente_email_repetido": return MENSAGEM_REPETIDO.email;
    case "cpf_repetido": case "paciente_cpf_repetido": return MENSAGEM_REPETIDO.cpf;
    case "conta_travada": return "O plano da conta está vencido. Regularize em Configurações › Plano para cadastrar e convidar alunos.";
    case "conta_real_no_staging": return "Este é o ambiente de teste: só e-mails de teste.";
    case "email_invalido": return "Confira o e-mail.";
    case "nome_invalido": return "Escreva o nome do aluno.";
    case "telefone_invalido": return "O telefone precisa ter DDD e 8 ou 9 números.";
    case "nascimento_invalido": return "Confira a data de nascimento.";
    case "proprio_email": return "Este é o seu e-mail.";
    case "sem_modulo": return "Escolha Treino, Nutrição ou os dois.";
    case "responsavel_invalido": return "Escolha quem vai acompanhar o aluno (um profissional da equipe com esse papel).";
    case "muitos_convites": return "Muitos convites seguidos. Espere alguns minutos.";
    case "muitas_acoes": return "Muitas ações seguidas. Espere um instante.";
    case "sem_acesso": case "so_dono": return "Só o dono da conta ou o profissional responsável pode fazer isso.";
    case "conta_excluida": return "O aluno excluiu a conta: não dá para reativar.";
    case "convite_nao_pendente": return "Este convite já foi aceito ou cancelado.";
    case "cadastro_nao_encontrado": return "Este cadastro já foi decidido.";
    case "profissional_inativo": return "A conta do profissional não está ativa.";
    case "selecao_invalida": return "Selecione de 1 a 200 alunos.";
    case "sem_internet": return "Sem conexão. Tente de novo quando a internet voltar.";
    case "sem_login": return "Sua sessão terminou. Entre de novo.";
    default: return "Não deu certo agora. Tente de novo.";
  }
}

// ───────────────────────── exportar CSV (N-66) ─────────────────────────

function celula(v: string): string {
  const t = v.replace(/\r?\n/g, " ").trim();
  // fórmula no Excel (=, +, -, @) vira texto
  const seguro = /^[=+\-@]/.test(t) ? `'${t}` : t;
  return /[;"]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

function situacaoTexto(a: AlunoLinha): string {
  if (a.conta_excluida) return "Conta excluída";
  if (!a.ativo) return "Desativado";
  if (a.bloqueado) return "Bloqueado";
  return "Ativo";
}

/** CSV (separador ";" e BOM, abre certo no Excel em português) com o que a lista mostra. */
export function montarCSV(itens: AlunoLinha[]): string {
  const cab = ["Nome", "E-mail", "Telefone", "Módulos", "Personal", "Nutricionista", "Tags", "Situação", "Pagamento", "Cadastro"];
  const linhas = itens.map((a) => [
    a.nome,
    a.email ?? "",
    formatarTelefone(a.telefone),
    a.modulos.map((m) => (m === "treino" ? "Treino" : "Nutrição")).join(" + "),
    a.personal?.nome ?? "",
    a.nutricionista?.nome ?? "",
    a.tags.join(", "),
    situacaoTexto(a),
    a.pagamento ? (a.pagamento.s === "pago" ? `Pago até ${ddmm(a.pagamento.ate)}` : "Pendente") : "",
    a.criado_em ? new Date(a.criado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "",
  ].map(celula).join(";"));
  return "﻿" + [cab.join(";"), ...linhas].join("\r\n") + "\r\n";
}

export function nomeDoCSV(agora = new Date()): string {
  const d = agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return `alunos-${d}.csv`;
}
