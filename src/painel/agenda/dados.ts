// Physiq W20 — Painel › Agenda: acesso a dados no BANCO PRINCIPAL (porta de src/lib/agenda.ts do PhysiqNutri, main ca9f66f, para a
// conta: o dono vê a agenda da equipe; cada profissional, a dele — as políticas de hoje: dono do registro, dono da conta, master).
// Exclusão de calendário e de agendamento continua SOFT (deleted_at → Lixeira); bloqueio e trava são apagados de verdade.
// Slots, janela e pacote são do banco (agenda_horarios, aluno_compromissos, aluno_definir_pacote — migração da W20).
// W2: as TAGS da agenda (agenda_tags, por profissional; o banco cria as 3 base e mantém modulo = área da tag) e a tag padrão do
// calendário; quem entra sem calendário sendo personal E nutri nasce com 2 ("Treino" e "Nutrição").
import { principal } from "@/integrations/principal/client";
import {
  baseDaArea, calendariosIniciais, normalizarRegras, normalizarTag, temAsBases, type AreaTag, type RegrasAgenda, type TagAgenda,
  type TravaRecorrente,
} from "@/agenda/regras";
import type { PacoteSituacao } from "@/agenda/regras";

export interface Calendario {
  id: string;
  nutricionista_id: string;
  nome: string;
  cor: string;
  padrao: boolean;
  faixa_inicio: string;
  faixa_fim: string;
  slot_minutos: number | null;
  conta_id: string | null;
  /** W2: a tag sugerida no novo agendamento deste calendário (null = pelo papel, como antes) */
  tag_padrao_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface Agendamento {
  id: string;
  nutricionista_id: string;
  calendario_id: string;
  paciente_id: string | null;
  titulo: string;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  status: string;
  confirmacao: string;
  observacao: string | null;
  /** a ÁREA (treino · nutricao · geral) — W2: a área da tag; tudo que lia o tipo continua lendo aqui */
  modulo: string;
  /** W2: a tag da consulta (agenda_tags do profissional dela) */
  tag_id: string | null;
  conta_id: string | null;
  reagendamentos: number;
  mes_referencia: string | null;
  origem: string;
  aluno_respondeu_em: string | null;
  aviso_email_em: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Bloqueio {
  id: string;
  nutricionista_id: string;
  calendario_id: string | null;
  inicio: string;
  fim: string;
  motivo: string | null;
  conta_id: string | null;
}

export interface AlunoAgenda {
  id: string;
  nome: string;
  apelido: string | null;
  foto_url: string | null;
  personal_id: string | null;
  nutricionista_id: string | null;
  user_id: string | null;
  email: string | null;
}

export interface SlotDoDia {
  inicio: string;
  fim: string;
  estado: "livre" | "ocupado" | "travado" | "bloqueado" | "passado";
}

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

/** O filtro das listas: o que é meu + o que é da conta ativa (o dono vê a equipe; a política decide o resto). */
const minhaOuDaConta = (uid: string, contaId: string | null): string => (contaId ? `nutricionista_id.eq.${uid},conta_id.eq.${contaId}` : `nutricionista_id.eq.${uid}`);

export const NOME_CALENDARIO_PADRAO = "Calendário principal";

// ───────────────────────── calendários ─────────────────────────
export async function listarCalendarios(uid: string, contaId: string | null): Promise<Calendario[]> {
  const { data, error } = await principal.from("calendarios").select("*").is("deleted_at", null).or(minhaOuDaConta(uid, contaId))
    .order("created_at", { ascending: true });
  falhou(error);
  return (data ?? []) as unknown as Calendario[];
}

/**
 * Lista os calendários; sem nenhum SEU (1º acesso à agenda, ou excluiu o último — D2), cria os iniciais: personal E nutri na conta
 * ativa → "Treino" (padrão) e "Nutrição", cada um com a tag padrão da área; senão o "Calendário principal" com a tag padrão da área
 * do papel (como hoje). Sem as tags (o banco não respondeu), os calendários nascem sem tag padrão — a tag vem pelo papel.
 */
export async function garantirCalendarios(uid: string, contaId: string | null, papeis: readonly string[], modulos: readonly string[] | null): Promise<Calendario[]> {
  const lista = await listarCalendarios(uid, contaId);
  if (lista.some((c) => c.nutricionista_id === uid)) return lista;
  const minhas = await garantirMinhasTags(uid).catch(() => [] as TagAgenda[]);
  const novos: Calendario[] = [];
  for (const c of calendariosIniciais(papeis, modulos)) {
    const tag = c.area ? baseDaArea(minhas, uid, c.area) : null;
    novos.push(await criarCalendario(uid, contaId, { nome: c.nome, cor: c.cor, padrao: c.padrao, tag_padrao_id: tag?.id ?? null }));
  }
  return [...lista, ...novos];
}

export async function criarCalendario(dono: string, contaId: string | null, dados: Partial<Calendario>): Promise<Calendario> {
  const { data, error } = await principal.from("calendarios")
    .insert({ ...dados, nutricionista_id: dono, conta_id: contaId } as never).select("*").single();
  falhou(error);
  return data as unknown as Calendario;
}

export async function atualizarCalendario(id: string, patch: Partial<Calendario>): Promise<Calendario> {
  const { data, error } = await principal.from("calendarios").update(patch as never).eq("id", id).select("*").single();
  falhou(error);
  return data as unknown as Calendario;
}

/** Soft delete do calendário e dos agendamentos dele (vão para a Lixeira). */
export async function excluirCalendario(id: string): Promise<void> {
  const agora = new Date().toISOString();
  const ag = await principal.from("agendamentos").update({ deleted_at: agora } as never).eq("calendario_id", id).is("deleted_at", null);
  falhou(ag.error);
  const cal = await principal.from("calendarios").update({ deleted_at: agora } as never).eq("id", id);
  falhou(cal.error);
}

// ───────────────────────── tags (W2) ─────────────────────────
/** As tags vivas DESTES profissionais (o meu + os donos dos calendários que eu vejo). Sempre por profissional_id: o master lê
 * todas pela RLS. */
export async function listarTags(profissionais: readonly string[]): Promise<TagAgenda[]> {
  const ids = [...new Set(profissionais.filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await principal.from("agenda_tags" as never).select("*").in("profissional_id", ids).is("deleted_at", null)
    .order("ordem", { ascending: true }).order("created_at", { ascending: true });
  falhou(error);
  return ((data ?? []) as unknown[]).map(normalizarTag).filter((t): t is TagAgenda => !!t);
}

/** As 3 base de quem chama (o banco cria as que faltam) + as tags vivas dele. */
export async function garantirTags(): Promise<TagAgenda[]> {
  const { data, error } = await principal.rpc("agenda_garantir_tags" as never);
  falhou(error);
  const r = (data ?? {}) as { ok?: boolean; erro?: string; tags?: unknown[] };
  if (r.ok === false) throw new Error(r.erro ?? "erro_interno");
  return (r.tags ?? []).map(normalizarTag).filter((t): t is TagAgenda => !!t);
}

/** As minhas tags; faltando alguma base, pede ao banco (1ª vez na agenda) — só aí escreve. */
export async function garantirMinhasTags(uid: string): Promise<TagAgenda[]> {
  const minhas = await listarTags([uid]);
  if (temAsBases(minhas, uid)) return minhas;
  return garantirTags();
}

/**
 * As tags que a agenda usa: as minhas (com as 3 base garantidas) + as dos donos dos calendários da equipe (só leitura). Se o banco
 * não deixar criar as base agora, segue com o que leu (a consulta sem tag carregada mostra a área).
 */
export async function carregarTagsDaAgenda(uid: string, donos: readonly string[]): Promise<TagAgenda[]> {
  const ids = [...new Set([uid, ...donos].filter(Boolean))];
  const lidas = await listarTags(ids);
  if (!uid || temAsBases(lidas, uid)) return lidas;
  const minhas = await garantirTags().catch(() => null);
  if (!minhas) return lidas;
  return [...lidas.filter((t) => t.profissional_id !== uid), ...minhas];
}

export async function criarTag(dados: { profissional_id: string; nome: string; cor: string; area: AreaTag }): Promise<TagAgenda> {
  const { data, error } = await principal.from("agenda_tags" as never).insert({ ...dados, base: false } as never).select("*").single();
  falhou(error);
  const t = normalizarTag(data);
  if (!t) throw new Error("erro_interno");
  return t;
}

export async function atualizarTag(id: string, patch: Partial<Pick<TagAgenda, "nome" | "cor" | "area">>): Promise<TagAgenda> {
  const { data, error } = await principal.from("agenda_tags" as never).update(patch as never).eq("id", id).select("*").single();
  falhou(error);
  const t = normalizarTag(data);
  if (!t) throw new Error("erro_interno");
  return t;
}

/** Soft delete: o banco leva as consultas e os calendários dela para a base da mesma área (na mesma transação). */
export async function excluirTag(id: string): Promise<void> {
  const { error } = await principal.from("agenda_tags" as never).update({ deleted_at: new Date().toISOString() } as never).eq("id", id);
  falhou(error);
}

// ───────────────────────── agendamentos ─────────────────────────
/**
 * hml-14b (D18): a agenda lê uma JANELA de datas (a da visão: lista, semana ou mês; os números do topo; o Dashboard) — no máximo 1000
 * por janela (o teto do banco, agora escrito), os MAIS RECENTES; quando vem 1000, a tela avisa (`janelaNoLimite` + `AVISO_LIMITE_AGENDA`).
 */
export const LIMITE_JANELA_AGENDA = 1000;
export const AVISO_LIMITE_AGENDA = "Mostrando os 1000 mais recentes — encurte o período.";
/** A leitura da janela chegou ao teto (pode ter ficado agendamento de fora): a tela mostra o aviso. */
export const janelaNoLimite = (lista: readonly unknown[] | null | undefined): boolean => (lista?.length ?? 0) >= LIMITE_JANELA_AGENDA;

/** Os que tocam [inicio, fim), em ordem de início (o teto de 1000 guarda os mais recentes: lê do fim para o começo e desvira). */
export async function listarAgendamentos(inicio: Date, fim: Date, uid: string, contaId: string | null): Promise<Agendamento[]> {
  const { data, error } = await principal.from("agendamentos").select("*").is("deleted_at", null).or(minhaOuDaConta(uid, contaId))
    .lt("inicio", fim.toISOString()).gt("fim", inicio.toISOString())
    .order("inicio", { ascending: false }).order("id", { ascending: false }).limit(LIMITE_JANELA_AGENDA);
  falhou(error);
  return ((data ?? []) as unknown as Agendamento[]).reverse();
}

export type NovoAgendamento = Pick<Agendamento, "nutricionista_id" | "calendario_id" | "paciente_id" | "titulo" | "inicio" | "fim" | "dia_inteiro"
  | "status" | "confirmacao" | "observacao" | "modulo" | "conta_id"> & { tag_id?: string | null };

export async function criarAgendamento(dados: NovoAgendamento): Promise<Agendamento> {
  const { data, error } = await principal.from("agendamentos").insert(dados as never).select("*").single();
  falhou(error);
  return data as unknown as Agendamento;
}

export async function atualizarAgendamento(id: string, patch: Partial<NovoAgendamento>): Promise<Agendamento> {
  const { data, error } = await principal.from("agendamentos").update(patch as never).eq("id", id).select("*").single();
  falhou(error);
  return data as unknown as Agendamento;
}

export async function excluirAgendamento(id: string): Promise<void> {
  const { error } = await principal.from("agendamentos").update({ deleted_at: new Date().toISOString() } as never).eq("id", id);
  falhou(error);
}

// ───────────────────────── bloqueios (dias inteiros e travas avulsas) ─────────────────────────
export async function listarBloqueios(inicio: Date, fim: Date, uid: string, contaId: string | null): Promise<Bloqueio[]> {
  const { data, error } = await principal.from("bloqueios_agenda").select("*").or(minhaOuDaConta(uid, contaId))
    .lt("inicio", fim.toISOString()).gt("fim", inicio.toISOString()).order("inicio", { ascending: true });
  falhou(error);
  return (data ?? []) as unknown as Bloqueio[];
}

/** Os ainda vigentes ou futuros (a lista do painel lateral). */
export async function listarBloqueiosFuturos(uid: string, contaId: string | null): Promise<Bloqueio[]> {
  const { data, error } = await principal.from("bloqueios_agenda").select("*").or(minhaOuDaConta(uid, contaId))
    .gte("fim", new Date().toISOString()).order("inicio", { ascending: true }).limit(50);
  falhou(error);
  return (data ?? []) as unknown as Bloqueio[];
}

export async function criarBloqueio(dados: Omit<Bloqueio, "id">): Promise<Bloqueio> {
  const { data, error } = await principal.from("bloqueios_agenda").insert(dados as never).select("*").single();
  falhou(error);
  return data as unknown as Bloqueio;
}

export async function excluirBloqueio(id: string): Promise<void> {
  const { error } = await principal.from("bloqueios_agenda").delete().eq("id", id);
  falhou(error);
}

// ───────────────────────── travas recorrentes ─────────────────────────
const linhaTrava = (r: Record<string, unknown>): TravaRecorrente => ({
  id: String(r.id),
  profissional_id: String(r.profissional_id),
  calendario_id: (r.calendario_id as string | null) ?? null,
  dias: Array.isArray(r.dias) ? (r.dias as number[]).map(Number) : [0, 1, 2, 3, 4, 5, 6],
  hora_inicio: String(r.hora_inicio ?? "").slice(0, 5),
  hora_fim: String(r.hora_fim ?? "").slice(0, 5),
  motivo: (r.motivo as string | null) ?? null,
});

export async function listarTravas(uid: string, contaId: string | null): Promise<TravaRecorrente[]> {
  const filtro = contaId ? `profissional_id.eq.${uid},conta_id.eq.${contaId}` : `profissional_id.eq.${uid}`;
  const { data, error } = await principal.from("agenda_travas" as never).select("*").or(filtro).order("hora_inicio", { ascending: true });
  falhou(error);
  return ((data ?? []) as Record<string, unknown>[]).map(linhaTrava);
}

export async function criarTrava(dados: { profissional_id: string; conta_id: string | null; calendario_id: string | null; dias: number[];
  hora_inicio: string; hora_fim: string; motivo: string | null }): Promise<TravaRecorrente> {
  const { data, error } = await principal.from("agenda_travas" as never).insert(dados as never).select("*").single();
  falhou(error);
  return linhaTrava(data as Record<string, unknown>);
}

export async function excluirTrava(id: string): Promise<void> {
  const { error } = await principal.from("agenda_travas" as never).delete().eq("id", id);
  falhou(error);
}

// ───────────────────────── regras (agenda_config) ─────────────────────────
export async function lerRegras(profissionalId: string): Promise<RegrasAgenda> {
  const { data, error } = await principal.from("agenda_config" as never).select("*").eq("profissional_id", profissionalId).maybeSingle();
  falhou(error);
  const r = data as Record<string, unknown> | null;
  return normalizarRegras(r ? { ...r, configurada: true } : null);
}

export async function salvarRegras(profissionalId: string, r: RegrasAgenda): Promise<RegrasAgenda> {
  const linha = {
    profissional_id: profissionalId,
    slot_minutos: r.slot_minutos,
    atende_inicio: r.atende_inicio,
    atende_fim: r.atende_fim,
    dias: r.dias,
    reagendamentos_max: r.reagendamentos_max,
    janela_reagendamento: r.janela_reagendamento,
    desistencia: r.desistencia,
  };
  const { data, error } = await principal.from("agenda_config" as never).upsert(linha as never, { onConflict: "profissional_id" }).select("*").single();
  falhou(error);
  return normalizarRegras({ ...(data as Record<string, unknown>), configurada: true });
}

// ───────────────────────── slots do dia (a conta do banco) ─────────────────────────
export async function horariosDoDia(calendarioId: string, dia: string, duracao: number | null, ignorar: string | null): Promise<{ slots: SlotDoDia[]; regras: RegrasAgenda; slotCalendario: number | null }> {
  const { data, error } = await principal.rpc("agenda_horarios" as never, { p_calendario: calendarioId, p_de: dia, p_ate: dia, p_duracao: duracao, p_ignorar: ignorar } as never);
  falhou(error);
  const r = (data ?? {}) as { ok?: boolean; erro?: string; slots?: SlotDoDia[]; regras?: Record<string, unknown> };
  if (r.ok === false) throw new Error(r.erro ?? "erro_interno");
  return { slots: Array.isArray(r.slots) ? r.slots : [], regras: normalizarRegras(r.regras), slotCalendario: (r.regras?.slot_calendario as number | null) ?? null };
}

// ───────────────────────── alunos (seletor) ─────────────────────────
export async function listarAlunosDaAgenda(contaId: string | null, uid: string): Promise<AlunoAgenda[]> {
  let q = principal.from("pacientes").select("id, nome, apelido, foto_url, personal_id, nutricionista_id, user_id, email").is("deleted_at", null).eq("ativo", true);
  q = contaId ? q.or(`conta_id.eq.${contaId},nutricionista_id.eq.${uid}`) : q.eq("nutricionista_id", uid);
  const { data, error } = await q.order("nome", { ascending: true }).limit(1000);
  falhou(error);
  return (data ?? []) as unknown as AlunoAgenda[];
}

export async function buscarAluno(id: string): Promise<AlunoAgenda | null> {
  const { data, error } = await principal.from("pacientes").select("id, nome, apelido, foto_url, personal_id, nutricionista_id, user_id, email")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  falhou(error);
  return (data as unknown as AlunoAgenda | null) ?? null;
}

// ───────────────────────── avisos ao aluno: e-mail (o sino o banco já avisou) ─────────────────────────
export interface ResultadoEmail {
  enviado: boolean;
  motivo: string | null;
  teste?: boolean;
}

export async function avisarPorEmail(agendamentoId: string): Promise<ResultadoEmail> {
  const { data, error } = await principal.functions.invoke("agenda-avisar", { body: { agendamento: agendamentoId } });
  if (error) return { enviado: false, motivo: "falhou" };
  const e = ((data ?? {}) as { email?: { enviado?: boolean; motivo?: string | null; teste?: boolean } }).email ?? {};
  return { enviado: e.enviado === true, motivo: e.motivo ?? null, teste: e.teste };
}

// ───────────────────────── card "Próximos compromissos" e o pacote do aluno ─────────────────────────
export interface ConsultaDoAluno {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  status: string;
  modulo: string;
  profissional_id: string;
  profissional: string | null;
  reagendamentos: number;
  origem: string;
}

export interface CompromissosDoAluno {
  paciente_id: string;
  personal_id: string | null;
  nutricionista_id: string | null;
  consultas: ConsultaDoAluno[];
  pacotes: PacoteSituacao[];
}

export async function compromissosDoAluno(alunoId: string): Promise<CompromissosDoAluno> {
  const { data, error } = await principal.rpc("aluno_compromissos" as never, { p_aluno: alunoId } as never);
  falhou(error);
  const r = (data ?? {}) as Partial<CompromissosDoAluno>;
  return {
    paciente_id: String(r.paciente_id ?? ""),
    personal_id: r.personal_id ?? null,
    nutricionista_id: r.nutricionista_id ?? null,
    consultas: Array.isArray(r.consultas) ? r.consultas : [],
    pacotes: Array.isArray(r.pacotes) ? r.pacotes : [],
  };
}

export async function definirPacote(alunoId: string, profissionalId: string, total: number, mesInicio: string | null): Promise<PacoteSituacao | null> {
  const { data, error } = await principal.rpc("aluno_definir_pacote" as never, { p_aluno: alunoId, p_profissional: profissionalId, p_total: total, p_mes_inicio: mesInicio } as never);
  falhou(error);
  const r = (data ?? {}) as { ok?: boolean; erro?: string; pacote?: PacoteSituacao | null };
  if (r.ok === false) throw new Error(r.erro ?? "erro_interno");
  return r.pacote ?? null;
}
