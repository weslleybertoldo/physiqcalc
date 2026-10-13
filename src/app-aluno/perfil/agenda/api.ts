/**
 * Perfil › Agenda (W20) — as ações do aluno, todas no BANCO PRINCIPAL por funções que conferem as regras do profissional (o app só
 * mostra; quem decide é o banco):
 *   minha_agenda(p_desde)          a agenda (W7) + quem marcou, quantas vezes já reagendou, o mês da consulta e as regras
 *   minhas_regras_agenda()         as regras e o pacote de cada profissional do aluno
 *   aluno_agenda_horarios(…)       os horários LIVRES para reagendar uma consulta (na janela) ou marcar a do pacote
 *   aluno_agenda_confirmar/desistir/reagendar/marcar
 * hml-21b (H-43 · jeito 2, etapa 3): as MESMAS funções do banco, chamadas pela função conta COM A SESSÃO do aluno (o banco segue decidindo
 * tudo pelo auth.uid()): as leituras pelo lerConta (minhas_regras_agenda, aluno_agenda_horarios), as 4 ações pelo acaoConta
 * (agenda_confirmar|desistir|reagendar|marcar). O erro é o código (a rede que caiu = sem_internet — o PADRÃO da hml-20a/21a); a frase é a
 * de hoje (mensagemErroAgenda; o código que ela não conhece = a de erro_interno, como hoje).
 */
import { acaoConta, codigoDaGravacao, type AcaoConta } from "@/conta/gravar";
import { codigoDaLeitura, lerConta, type ConsultaDaConta } from "@/conta/ler";
import { normalizarRegras, type JanelaDatas, type PacoteSituacao, type RegrasAgenda } from "@/agenda/regras";
import type { AgendamentoAluno, PapelProfissional } from "../pecas/regras";

export interface ConsultaAluno extends AgendamentoAluno {
  profissional_id?: string | null;
  reagendamentos?: number | null;
  origem?: string | null;
  mes_referencia?: string | null;
  regras?: unknown;
}

export interface ProfissionalDaAgenda {
  profissional_id: string;
  paciente_id: string;
  papel: PapelProfissional;
  profissional: string | null;
  regras: RegrasAgenda;
  pacote: PacoteSituacao | null;
  tem_calendario: boolean;
}

export interface HorarioLivre {
  inicio: string;
  fim: string;
}

export interface HorariosDoAluno {
  /** o prazo da escolha; `ate` null = sem fim ("Sem trava" — H5) */
  janela: JanelaDatas | null;
  horarios: HorarioLivre[];
}

export class ErroAgenda extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

/** O { ok: false, erro } que a função do banco devolve vira o ErroAgenda com o código dela (como hoje); o resto volta como veio. */
function conferir<T>(valor: unknown): T {
  const d = (valor ?? {}) as { ok?: boolean; erro?: string };
  if (d && typeof d === "object" && !Array.isArray(d) && d.ok === false) throw new ErroAgenda(String(d.erro ?? "erro_interno"));
  return valor as T;
}

/** Uma leitura da Agenda do aluno pela conta (no lote da volta); o erro → ErroAgenda com o código (sem internet antes de chamar). */
async function ler<T>(q: ConsultaDaConta, params: Record<string, unknown> = {}): Promise<T> {
  let valor: unknown;
  try {
    valor = (await lerConta(q, params)).valor;
  } catch (e) {
    throw new ErroAgenda(codigoDaLeitura(e));
  }
  return conferir<T>(valor);
}

/** Uma ação da Agenda do aluno pela conta (1 chamada, sem repetir); o erro → ErroAgenda com o código; o valor da função no `resultado`. */
async function agir<T>(acao: AcaoConta, corpo: Record<string, unknown>): Promise<T> {
  let r: { resultado?: unknown };
  try {
    r = await acaoConta<{ resultado?: unknown }>(acao, corpo);
  } catch (e) {
    throw new ErroAgenda(codigoDaGravacao(e));
  }
  return conferir<T>(r.resultado ?? null);
}

export async function minhasRegrasAgenda(): Promise<ProfissionalDaAgenda[]> {
  const lista = await ler<unknown[]>("minhas_regras_agenda");
  return (Array.isArray(lista) ? lista : []).map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return {
      profissional_id: String(r.profissional_id ?? ""),
      paciente_id: String(r.paciente_id ?? ""),
      papel: (r.papel === "nutricionista" ? "nutricionista" : "personal") as PapelProfissional,
      profissional: (r.profissional as string | null) ?? null,
      regras: normalizarRegras(r.regras),
      pacote: (r.pacote as PacoteSituacao | null) ?? null,
      tem_calendario: r.tem_calendario === true,
    };
  });
}

function horarios(d: unknown): HorariosDoAluno {
  const r = (d ?? {}) as { janela?: { de?: string | null; ate?: string | null }; horarios?: HorarioLivre[] };
  const janela = r.janela?.de ? { de: String(r.janela.de).slice(0, 10), ate: r.janela.ate ? String(r.janela.ate).slice(0, 10) : null } : null;
  return { janela, horarios: Array.isArray(r.horarios) ? r.horarios : [] };
}

/** As datas da janela só quando a tela manda (sem elas, o nulo da função: a janela inteira — a 1ª abertura da folha). */
const janela = (de?: string, ate?: string): Record<string, string> => ({ ...(de ? { de } : {}), ...(ate ? { ate } : {}) });

export const horariosParaReagendar = async (agendamento: string, de?: string, ate?: string): Promise<HorariosDoAluno> =>
  horarios(await ler("aluno_agenda_horarios", { agendamento, ...janela(de, ate) }));

export const horariosParaMarcar = async (profissional: string, de?: string, ate?: string): Promise<HorariosDoAluno> =>
  horarios(await ler("aluno_agenda_horarios", { profissional, ...janela(de, ate) }));

export const confirmarConsulta = (agendamento: string) => agir<{ ok: true; ja_confirmada?: boolean }>("agenda_confirmar", { agendamento });
export const desistirConsulta = (agendamento: string) => agir<{ ok: true; pacote: PacoteSituacao | null }>("agenda_desistir", { agendamento });
export const reagendarConsulta = (agendamento: string, inicio: string) =>
  agir<{ ok: true; inicio: string; fim: string; reagendamentos: number; reagendamentos_max: number }>("agenda_reagendar", { agendamento, inicio });
export const marcarConsulta = (profissional: string, inicio: string) =>
  agir<{ ok: true; id: string; inicio: string; fim: string }>("agenda_marcar", { profissional, inicio });

/** Códigos das funções → frase para o aluno. */
export const MENSAGEM_ERRO_AGENDA: Record<string, string> = {
  sem_internet: "Sem internet agora. Conecte-se e tente de novo.",
  horario_ocupado: "Esse horário acabou de ser ocupado. Escolha outro.",
  horario_invalido: "Esse horário não está mais disponível. Escolha outro.",
  fora_da_janela: "Essa data está fora do prazo para reagendar.",
  sem_reagendamentos: "Você já usou os reagendamentos desta consulta.",
  nao_reagenda: "Esta consulta não pode mais ser reagendada.",
  nao_confirma: "Esta consulta não pode mais ser confirmada.",
  nao_desiste: "Esta consulta não pode mais ser desmarcada pelo app.",
  desistencia_desligada: "Desistir pelo app não está liberado. Fale com o seu profissional.",
  sem_pacote: "Você não tem pacote de consultas com este profissional.",
  pacote_sem_mes_livre: "Todas as consultas do seu pacote já foram usadas ou marcadas.",
  mes_sem_consulta_livre: "Você já tem a consulta deste mês. Escolha um dia de outro mês do pacote.",
  sem_calendario: "O seu profissional ainda não abriu a agenda.",
  nao_responsavel: "Este profissional não está mais com você.",
  agendamento_inexistente: "Esta consulta não está mais na sua agenda.",
  sem_login: "Sua sessão expirou. Saia e entre de novo.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemErroAgenda(e: unknown): string {
  const codigo = e instanceof ErroAgenda ? e.codigo : "erro_interno";
  return MENSAGEM_ERRO_AGENDA[codigo] ?? MENSAGEM_ERRO_AGENDA.erro_interno;
}
