// Physiq W20 — Painel › Agenda: acesso a dados no BANCO PRINCIPAL (porta de src/lib/agenda.ts do PhysiqNutri, main ca9f66f, para a
// conta: o dono vê a agenda da equipe; cada profissional, a dele — as políticas de hoje: dono do registro, dono da conta, master).
// Exclusão de calendário e de agendamento continua SOFT (deleted_at → Lixeira); bloqueio e trava são apagados de verdade.
// Slots, janela e pacote são do banco (agenda_horarios, aluno_compromissos, aluno_definir_pacote — migração da W20).
// W2: as TAGS da agenda (agenda_tags, por profissional; o banco cria as 3 base e mantém modulo = área da tag) e a tag padrão do
// calendário; quem entra sem calendário sendo personal E nutri nasce com 2 ("Treino" e "Nutrição").
// hml-21b (H-43 · jeito 2, etapa 3): as 28 leituras e gravações saem do navegador e vão pela função conta, COM A SESSÃO de quem está logado
// (o RLS de hoje segue decidindo) — as leituras pelo lerConta (o lote da volta: a Agenda abre com 1 `ler` + as tags, que dependem dos
// calendários), as gravações pelo acaoConta. As MESMAS funções, assinaturas e tipos de hoje (os componentes, as chaves e o staleTime não
// mudam). O "meu" das listas (o minhaOuDaConta) é o user do token no servidor (o uid que a tela passa é o de quem está logado); o dono do que
// se cria também (o da consulta = o dono do calendário, lido no servidor). Excluir calendário e o 1º acesso são 1 transação cada (as RPCs
// agenda_excluir_calendario e agenda_garantir_inicio — migration 20261013100000). O e-mail ao aluno segue pela agenda-avisar. Erro: o texto
// fixo do código (a mensagem do banco não chega mais à tela — decisão 20); as tags com as frases de hoje (mensagemErroTag).
import { principal } from "@/integrations/principal/client";
import { acaoConta, ErroGravacaoConta } from "@/conta/gravar";
import { lerConta } from "@/conta/ler";
import { NOME_TAG_MAX, normalizarRegras, normalizarTag, temAsBases, type AreaTag, type RegrasAgenda, type TagAgenda, type TravaRecorrente } from "@/agenda/regras";
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

/** O que vai ao servidor de um conjunto de colunas: só as que vieram (o null também — limpa a coluna, como a tela manda). */
function soAs<T extends object>(dados: T, chaves: readonly string[]): Record<string, unknown> {
  const o = dados as Record<string, unknown>;
  return Object.fromEntries(chaves.filter((k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined).map((k) => [k, o[k]]));
}
/** A conta ativa no pedido de leitura (sem ela, só o que é meu — o contaId || null da tela). */
const daConta = (contaId: string | null): Record<string, string> => (contaId ? { conta: contaId } : {});
/** As colunas do calendário que a tela manda (o CalendarioDialog: o "dados"; o dono e a conta vão à parte). */
const COLUNAS_DO_CALENDARIO = ["nome", "cor", "padrao", "faixa_inicio", "faixa_fim", "slot_minutos", "tag_padrao_id"] as const;

// ───────────────────────── calendários ─────────────────────────
export async function listarCalendarios(uid: string, contaId: string | null): Promise<Calendario[]> {
  const r = await lerConta("agenda_calendarios", daConta(contaId));
  return (r.linhas ?? []) as Calendario[];
}

/**
 * Lista os calendários; sem nenhum SEU (1º acesso à agenda, ou excluiu o último — D2), cria os iniciais: personal E nutri na conta
 * ativa → "Treino" (padrão) e "Nutrição", cada um com a tag padrão da área; senão o "Calendário principal" com a tag padrão da área
 * do papel (como hoje). Sem as tags (o banco não deixou criar), os calendários nascem sem tag padrão — a tag vem pelo papel.
 * hml-21b: a criação (as 3 tags base + os calendários) é UMA ação no servidor, numa transação (agenda_garantir → a RPC agenda_garantir_inicio
 * com as MESMAS regras do calendariosIniciais), só nas MESMAS condições de hoje (nenhum calendário meu na lista).
 */
export async function garantirCalendarios(uid: string, contaId: string | null, papeis: readonly string[], modulos: readonly string[] | null): Promise<Calendario[]> {
  const lista = await listarCalendarios(uid, contaId);
  if (lista.some((c) => c.nutricionista_id === uid)) return lista;
  const r = await acaoConta<{ criados?: Calendario[] }>("agenda_garantir", { conta_id: contaId, papeis: [...papeis], modulos: [...(modulos ?? [])] });
  return [...lista, ...(Array.isArray(r.criados) ? r.criados : [])];
}

/** O dono é quem está logado (o servidor usa o user do token — a tela passa o uid dele); a conta é a da tela. */
export async function criarCalendario(dono: string, contaId: string | null, dados: Partial<Calendario>): Promise<Calendario> {
  const r = await acaoConta<{ linha: Calendario }>("calendario_criar", { ...soAs(dados, COLUNAS_DO_CALENDARIO), conta_id: contaId });
  return r.linha;
}

export async function atualizarCalendario(id: string, patch: Partial<Calendario>): Promise<Calendario> {
  const r = await acaoConta<{ linha: Calendario }>("calendario_editar", { ...soAs(patch, COLUNAS_DO_CALENDARIO), id });
  return r.linha;
}

/** Soft delete do calendário e dos agendamentos dele (vão para a Lixeira) — hml-21b: juntos, numa transação (agenda_excluir_calendario). */
export async function excluirCalendario(id: string): Promise<void> {
  await acaoConta("calendario_excluir", { id });
}

// ───────────────────────── tags (W2) ─────────────────────────
/** O teto de profissionais por leitura (o DONOS_MAX do servidor): uma equipe maior vai em mais itens do MESMO lote. */
const DONOS_POR_LEITURA = 200;

/** As tags vivas DESTES profissionais (o meu + os donos dos calendários que eu vejo). Sempre por profissional_id: o master lê
 * todas pela RLS. */
export async function listarTags(profissionais: readonly string[]): Promise<TagAgenda[]> {
  const ids = [...new Set(profissionais.filter(Boolean))];
  if (!ids.length) return [];
  const partes: string[][] = [];
  for (let i = 0; i < ids.length; i += DONOS_POR_LEITURA) partes.push(ids.slice(i, i + DONOS_POR_LEITURA));
  const lidas = await Promise.all(partes.map((donos) => lerConta("agenda_tags", { donos })));
  const linhas = lidas.flatMap((r) => r.linhas ?? []) as Array<{ ordem?: number; created_at?: string }>;
  // mais de uma parte: a ordem do banco (ordem, criação) entre as partes
  if (partes.length > 1) linhas.sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  return (linhas as unknown[]).map(normalizarTag).filter((t): t is TagAgenda => !!t);
}

/** As 3 base de quem chama (o banco cria as que faltam) + as tags vivas dele. */
export async function garantirTags(): Promise<TagAgenda[]> {
  const r = await acaoConta<{ resultado?: unknown }>("tags_garantir");
  const v = (r.resultado ?? {}) as { ok?: boolean; erro?: string; tags?: unknown[] };
  if (v.ok === false) throw new Error(v.erro ?? "erro_interno");
  return (v.tags ?? []).map(normalizarTag).filter((t): t is TagAgenda => !!t);
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

/**
 * O erro de uma gravação de tag com a FRASE de hoje (a tela passa a mensagem pelo mensagemErroTag, que a devolve igual): o nome repetido,
 * as base que não saem/não mudam de área, o RLS, o nome fora do tamanho; o resto, a frase fixa do código. O código fica no `codigo`.
 */
const FRASE_DA_TAG: Record<string, string> = {
  conflito: "Você já tem uma tag com esse nome",
  tag_base_nao_exclui: "As tags prontas (Treino, Nutrição e Geral) não podem ser excluídas",
  tag_base_area_fixa: "A área das tags prontas não muda",
  tag_base_fixa: "A área das tags prontas não muda",
  // hoje a tela mostrava o próprio código (o mensagemErroTag não tinha frase para ele)
  tag_de_outro_profissional: "tag_de_outro_profissional",
  sem_acesso: "Você não pode mudar as tags de outro profissional",
  dados_invalidos: `O nome precisa ter de 1 a ${NOME_TAG_MAX} caracteres`,
};
function erroDaTag(e: unknown): never {
  if (e instanceof ErroGravacaoConta && FRASE_DA_TAG[e.codigo]) throw Object.assign(new Error(FRASE_DA_TAG[e.codigo]), { codigo: e.codigo });
  throw e;
}

/** A tag nova é de quem está logado (o servidor usa o user do token — a tela passa o uid dele em profissional_id). */
export async function criarTag(dados: { profissional_id: string; nome: string; cor: string; area: AreaTag }): Promise<TagAgenda> {
  const r = await acaoConta<{ linha: unknown }>("tag_criar", { nome: dados.nome, cor: dados.cor, area: dados.area }).catch(erroDaTag);
  const t = normalizarTag(r.linha);
  if (!t) throw new Error("erro_interno");
  return t;
}

export async function atualizarTag(id: string, patch: Partial<Pick<TagAgenda, "nome" | "cor" | "area">>): Promise<TagAgenda> {
  const r = await acaoConta<{ linha: unknown }>("tag_editar", { ...soAs(patch, ["nome", "cor", "area"]), id }).catch(erroDaTag);
  const t = normalizarTag(r.linha);
  if (!t) throw new Error("erro_interno");
  return t;
}

/** Soft delete: o banco leva as consultas e os calendários dela para a base da mesma área (na mesma transação). */
export async function excluirTag(id: string): Promise<void> {
  await acaoConta("tag_excluir", { id }).catch(erroDaTag);
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
  const r = await lerConta("agenda_agendamentos", { de: inicio.toISOString(), ate: fim.toISOString(), ...daConta(contaId) });
  return ((r.linhas ?? []) as Agendamento[]).reverse();
}

export type NovoAgendamento = Pick<Agendamento, "nutricionista_id" | "calendario_id" | "paciente_id" | "titulo" | "inicio" | "fim" | "dia_inteiro"
  | "status" | "confirmacao" | "observacao" | "modulo" | "conta_id"> & { tag_id?: string | null };

/** As colunas da consulta que a tela manda (o AgendamentoDialog: o "registro"); o DONO vai do calendário, no servidor (nunca da tela). */
const COLUNAS_DA_CONSULTA = [
  "calendario_id", "paciente_id", "titulo", "inicio", "fim", "dia_inteiro", "status", "confirmacao", "observacao", "modulo", "tag_id", "conta_id",
] as const;

export async function criarAgendamento(dados: NovoAgendamento): Promise<Agendamento> {
  const r = await acaoConta<{ linha: Agendamento }>("agendamento_criar", soAs(dados, COLUNAS_DA_CONSULTA));
  return r.linha;
}

/** Editar: as colunas que vieram; com o calendário, o servidor põe o dono dele (o mesmo de hoje quando a consulta muda de profissional). */
export async function atualizarAgendamento(id: string, patch: Partial<NovoAgendamento>): Promise<Agendamento> {
  const r = await acaoConta<{ linha: Agendamento }>("agendamento_editar", { ...soAs(patch, COLUNAS_DA_CONSULTA), id });
  return r.linha;
}

export async function excluirAgendamento(id: string): Promise<void> {
  await acaoConta("agendamento_excluir", { id });
}

// ───────────────────────── bloqueios (dias inteiros e travas avulsas) ─────────────────────────
export async function listarBloqueios(inicio: Date, fim: Date, uid: string, contaId: string | null): Promise<Bloqueio[]> {
  const r = await lerConta("agenda_bloqueios", { de: inicio.toISOString(), ate: fim.toISOString(), ...daConta(contaId) });
  return (r.linhas ?? []) as Bloqueio[];
}

/** Os ainda vigentes ou futuros (a lista do painel lateral): fim ≥ o agora DESTA tela, os 50 primeiros. */
export async function listarBloqueiosFuturos(uid: string, contaId: string | null): Promise<Bloqueio[]> {
  const r = await lerConta("agenda_bloqueios_futuros", { agora: new Date().toISOString(), ...daConta(contaId) });
  return (r.linhas ?? []) as Bloqueio[];
}

/** O bloqueio é de quem está logado (o servidor usa o user do token — a tela passa o uid dele em nutricionista_id). */
export async function criarBloqueio(dados: Omit<Bloqueio, "id">): Promise<Bloqueio> {
  const r = await acaoConta<{ linha: Bloqueio }>("bloqueio_criar", soAs(dados, ["conta_id", "calendario_id", "inicio", "fim", "motivo"]));
  return r.linha;
}

export async function excluirBloqueio(id: string): Promise<void> {
  await acaoConta("bloqueio_excluir", { id });
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
  const r = await lerConta("agenda_travas", daConta(contaId));
  return ((r.linhas ?? []) as Record<string, unknown>[]).map(linhaTrava);
}

/** A trava é de quem está logado (o servidor usa o user do token — a tela passa o uid dele em profissional_id). */
export async function criarTrava(dados: { profissional_id: string; conta_id: string | null; calendario_id: string | null; dias: number[];
  hora_inicio: string; hora_fim: string; motivo: string | null }): Promise<TravaRecorrente> {
  const r = await acaoConta<{ linha: Record<string, unknown> }>("trava_criar", soAs(dados, ["conta_id", "calendario_id", "dias", "hora_inicio", "hora_fim", "motivo"]));
  return linhaTrava(r.linha);
}

export async function excluirTrava(id: string): Promise<void> {
  await acaoConta("trava_excluir", { id });
}

// ───────────────────────── regras (agenda_config) ─────────────────────────
export async function lerRegras(profissionalId: string): Promise<RegrasAgenda> {
  const lido = await lerConta("agenda_regras", { profissional: profissionalId });
  const r = ((lido.linhas ?? [])[0] ?? null) as Record<string, unknown> | null;
  return normalizarRegras(r ? { ...r, configurada: true } : null);
}

/** As regras de quem está logado (o servidor usa o user do token — a tela passa o uid dele), as 7, num upsert. */
export async function salvarRegras(profissionalId: string, r: RegrasAgenda): Promise<RegrasAgenda> {
  const linha = {
    slot_minutos: r.slot_minutos,
    atende_inicio: r.atende_inicio,
    atende_fim: r.atende_fim,
    dias: r.dias,
    reagendamentos_max: r.reagendamentos_max,
    janela_reagendamento: r.janela_reagendamento,
    desistencia: r.desistencia,
  };
  const salvo = await acaoConta<{ linha: Record<string, unknown> }>("regras_salvar", linha);
  return normalizarRegras({ ...salvo.linha, configurada: true });
}

// ───────────────────────── slots do dia (a conta do banco) ─────────────────────────
export async function horariosDoDia(calendarioId: string, dia: string, duracao: number | null, ignorar: string | null): Promise<{ slots: SlotDoDia[]; regras: RegrasAgenda; slotCalendario: number | null }> {
  const lido = await lerConta("agenda_horarios", { calendario: calendarioId, dia, ...(duracao !== null ? { duracao } : {}), ...(ignorar ? { ignorar } : {}) });
  const r = (lido.valor ?? {}) as { ok?: boolean; erro?: string; slots?: SlotDoDia[]; regras?: Record<string, unknown> };
  if (r.ok === false) throw new Error(r.erro ?? "erro_interno");
  return { slots: Array.isArray(r.slots) ? r.slots : [], regras: normalizarRegras(r.regras), slotCalendario: (r.regras?.slot_calendario as number | null) ?? null };
}

// ───────────────────────── alunos (seletor) ─────────────────────────
export async function listarAlunosDaAgenda(contaId: string | null, uid: string): Promise<AlunoAgenda[]> {
  const r = await lerConta("agenda_alunos", daConta(contaId));
  return (r.linhas ?? []) as AlunoAgenda[];
}

export async function buscarAluno(id: string): Promise<AlunoAgenda | null> {
  const r = await lerConta("agenda_aluno", { id });
  return ((r.linhas ?? [])[0] as AlunoAgenda | undefined) ?? null;
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
  const lido = await lerConta("aluno_compromissos", { aluno: alunoId });
  const r = (lido.valor ?? {}) as Partial<CompromissosDoAluno>;
  return {
    paciente_id: String(r.paciente_id ?? ""),
    personal_id: r.personal_id ?? null,
    nutricionista_id: r.nutricionista_id ?? null,
    consultas: Array.isArray(r.consultas) ? r.consultas : [],
    pacotes: Array.isArray(r.pacotes) ? r.pacotes : [],
  };
}

export async function definirPacote(alunoId: string, profissionalId: string, total: number, mesInicio: string | null): Promise<PacoteSituacao | null> {
  const feito = await acaoConta<{ resultado?: unknown }>("pacote_definir", { aluno: alunoId, profissional: profissionalId, total, mes_inicio: mesInicio });
  const r = (feito.resultado ?? {}) as { ok?: boolean; erro?: string; pacote?: PacoteSituacao | null };
  if (r.ok === false) throw new Error(r.erro ?? "erro_interno");
  return r.pacote ?? null;
}
