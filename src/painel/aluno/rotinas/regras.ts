// Physiq W-A P6 — regras PURAS das rotinas no PAINEL (o card "Rotinas" do Resumo e o "Ver tudo"; o "Dia a dia" da Dieta lê as rotinas do dia
// daqui também): a janela (os últimos 14 dias de São Paulo — a MESMA consulta do card e do dia a dia), as rotinas de hoje com o ✓ que o ALUNO
// deu (só leitura), as rotinas que valiam num dia passado (as apagadas depois também), o selo de quem criou, as apagadas ("apagada pelo aluno
// em 12/10"), o histórico em frases ("horário 08:00 → 09:00") e o estado do card. Sem rede; testado em regras.test.ts. Quem vê o quê é o
// servidor (rotinas_do_aluno, wa2 — padrão 9): as do aluno + as de profissional das matrículas que quem chama vê; `pode_editar` = as de
// profissional DESTA matrícula, vivas, com o w14_pode_editar (P8b: o aluno muda e apaga todas; o profissional, só as dele daqui).
import { hojeSP, rotinasDoDia, type RotinaDoDia } from "@/aluno-dia/regras";
import type { EventoDaRotina, RotinaDoProfissional, RotinaFeita, RotinasDoAluno } from "@/aluno-dia/tipos";
import { somarDias } from "@/nutricao/app/dia";
import { diaDaSemana, textoDias } from "@/nutricao/app/metasUtil";
import { ROTULO_TIPO } from "@/rotinas/textos";

/** O card e o dia a dia leem os últimos 14 dias (spec §4.5: "escolhe o dia (últimos 14)"); o servidor aceita até 31. */
export const JANELA_DIAS = 14;
/** O card mostra até 4 rotinas de hoje + "+N" (o mesmo do card do Início do app — P3). */
export const NO_CARD = 4;

export const TEXTOS = {
  titulo: "Rotinas",
  nova: "Nova rotina",
  verTudo: "Ver tudo",
  todas: "Todas as rotinas",
  hoje: "Hoje — o ✓ é o que o aluno marcou no app.",
  // = MENSAGEM_ERRO_ALUNO_DIA.sem_login_do_aluno (spec §4.5; o teste confere)
  semLogin: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos.",
  abrirAcessos: "Abrir Acessos",
  vazio: "Nenhuma rotina ainda.",
  vazioTexto: "Crie uma rotina (creatina, remédio, água…): ele recebe o aviso no app.",
  nenhumaHoje: "Nenhuma rotina hoje.",
  erroLer: "Não deu para carregar as rotinas.",
  semInternetLer: "Sem conexão: as rotinas aparecem quando a internet voltar.",
  semInternet: "Sem conexão: criar e mudar rotinas voltam quando a internet voltar.",
  soDoAluno: "As rotinas do aluno só ele muda; as de profissional desta conta você muda tocando nelas.",
  doAluno: "do aluno",
  doProfissional: "do profissional",
  vivas: "Rotinas",
  apagadas: "Apagadas",
  historico: "Histórico",
  nenhumaViva: "Nenhuma rotina viva.",
  nenhumaApagada: "Nenhuma rotina apagada.",
  nenhumEvento: "Nada mudou ainda.",
  feitaPeloAluno: "feita pelo aluno",
  naoFeita: "ainda não feita",
  apagada: "apagada",
  semHorario: "Sem horário",
} as const;

/** Os últimos JANELA_DIAS dias de São Paulo, terminando hoje. */
export function janelaDoPainel(agora: Date = new Date()): { de: string; ate: string } {
  const ate = hojeSP(agora);
  return { de: somarDias(ate, -(JANELA_DIAS - 1)), ate };
}

/** O dia de São Paulo de um instante (yyyy-mm-dd). */
export const diaSP = (iso: string): string => hojeSP(new Date(iso));

const DATA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const HORA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "12/10" (o dia de São Paulo). */
export const fmtDiaMes = (iso: string): string => DATA_SP.format(new Date(iso));
/** "12/10 17:20" (São Paulo). */
export const fmtDiaMesHora = (iso: string): string => `${fmtDiaMes(iso)} ${HORA_SP.format(new Date(iso))}`;

const primeiroNome = (nome: string | null | undefined): string => (nome ?? "").trim().split(/\s+/)[0] ?? "";

export type RotinaDoDiaNoPainel = RotinaDoDia & RotinaDoProfissional;
export interface RotinaNoDia extends RotinaDoDiaNoPainel {
  /** apagada depois (o dia a dia mostra o que valia naquele dia) */
  apagada: boolean;
}

/** As de HOJE no card: vivas, do dia da semana, na ordem do app, com o ✓ que o aluno deu (a regra do app — rotinasDoDia da P2). */
export const rotinasDeHoje = (d: Pick<RotinasDoAluno, "rotinas" | "feitas">, hoje: string): RotinaDoDiaNoPainel[] =>
  rotinasDoDia(d.rotinas, d.feitas, hoje) as RotinaDoDiaNoPainel[];

/** O card: primeiro as que faltam (pela hora), depois as feitas; até `limite` e o "+N" do resto (o molde do card do Início — P3). */
export function proximasNoCard<T extends { feita: boolean }>(lista: readonly T[], limite = NO_CARD): { visiveis: T[]; resto: number } {
  const ordem = [...lista.filter((r) => !r.feita), ...lista.filter((r) => r.feita)];
  return { visiveis: ordem.slice(0, limite), resto: Math.max(0, ordem.length - limite) };
}

/**
 * As rotinas que valiam num dia (o dia a dia): criadas até aquele dia, vivas ou apagadas a partir dele, com o dia da semana marcado — na ordem
 * da tela, com o ✓ daquele dia. A apagada depois aparece com o selo "apagada".
 */
export function rotinasNoDia(rotinas: readonly RotinaDoProfissional[], feitas: readonly RotinaFeita[], dia: string): RotinaNoDia[] {
  const dow = diaDaSemana(dia);
  const doDia = new Map(feitas.filter((f) => f.dia === dia).map((f) => [f.rotina_id, f.feita_em]));
  return rotinas
    .filter((r) => diaSP(r.criada_em) <= dia && (!r.arquivada_em || diaSP(r.arquivada_em) >= dia) && r.dias_semana.includes(dow))
    .map((r) => ({ ...r, feita: doDia.has(r.id), feita_em: doDia.get(r.id) ?? null, apagada: !!r.arquivada_em }))
    .sort((a, b) => (a.horario ?? "99:99").localeCompare(b.horario ?? "99:99") || a.ordem - b.ordem || a.criada_em.localeCompare(b.criada_em));
}

export const vivasDoAluno = (rotinas: readonly RotinaDoProfissional[]): RotinaDoProfissional[] => rotinas.filter((r) => !r.arquivada_em);
export const apagadasDoAluno = (rotinas: readonly RotinaDoProfissional[]): RotinaDoProfissional[] =>
  rotinas.filter((r) => !!r.arquivada_em).sort((a, b) => (b.arquivada_em ?? "").localeCompare(a.arquivada_em ?? ""));

/** O selo de quem criou: "do aluno" · "de Ana" (o profissional que criou) · "do profissional" (sem o nome). */
export function seloDaRotina(r: Pick<RotinaDoProfissional, "origem" | "criada_por_nome">): string {
  if (r.origem === "aluno") return TEXTOS.doAluno;
  const nome = primeiroNome(r.criada_por_nome);
  return nome ? `de ${nome}` : TEXTOS.doProfissional;
}

/** "apagada pelo aluno em 12/10" · "apagada por Ana em 12/10" (quem apagou, pelo histórico) · "apagada em 12/10". */
export function textoApagada(r: Pick<RotinaDoProfissional, "id" | "arquivada_em" | "arquivada_pelo_aluno">, historico: readonly EventoDaRotina[]): string {
  if (!r.arquivada_em) return "";
  const quando = fmtDiaMes(r.arquivada_em);
  if (r.arquivada_pelo_aluno) return `apagada pelo aluno em ${quando}`;
  const ev = historico.find((e) => e.rotina_id === r.id && e.o_que === "arquivou");
  const nome = ev?.quem === "profissional" ? primeiroNome(ev.por_nome) : "";
  return nome ? `apagada por ${nome} em ${quando}` : `apagada em ${quando}`;
}

const ROTULO_CAMPO: Record<string, string> = {
  nome: "nome", detalhe: "detalhe", tipo: "tipo", horario: "horário", dias_semana: "dias", lembrete: "lembrete",
};
const ORDEM_CAMPOS = ["nome", "detalhe", "tipo", "horario", "dias_semana", "lembrete"];

/** Um valor do histórico como a tela mostra. */
export function valorDoCampo(campo: string, v: unknown): string {
  if (campo === "horario") return typeof v === "string" && v ? v : "sem horário";
  if (campo === "detalhe") return typeof v === "string" && v ? v : "sem detalhe";
  if (campo === "tipo") return ROTULO_TIPO[v as keyof typeof ROTULO_TIPO] ?? String(v ?? "");
  if (campo === "dias_semana") return textoDias(v);
  if (campo === "lembrete") return v ? "ligado" : "desligado";
  return typeof v === "string" ? v : String(v ?? "");
}

export interface EventoNaTela {
  quem: string;
  /** criou · mudou · apagou */
  acao: string;
  /** "horário 08:00 → 09:00" (só no mudou, um por campo, na ordem da folha) */
  mudancas: string[];
  quando: string;
}

/** O evento do histórico em frases: "Ana" / "O aluno" + "criou" / "mudou" / "apagou" + as mudanças campo a campo. */
export function eventoNaTela(e: EventoDaRotina): EventoNaTela {
  const quem = e.quem === "aluno" ? "O aluno" : primeiroNome(e.por_nome) || "Um profissional";
  const acao = e.o_que === "criou" ? "criou" : e.o_que === "mudou" ? "mudou" : "apagou";
  const depois = (e.depois ?? {}) as Record<string, unknown>;
  const antes = (e.antes ?? {}) as Record<string, unknown>;
  const mudancas = e.o_que !== "mudou" ? [] : ORDEM_CAMPOS.filter((k) => k in depois)
    .map((k) => `${ROTULO_CAMPO[k]} ${valorDoCampo(k, antes[k])} → ${valorDoCampo(k, depois[k])}`);
  return { quem, acao, mudancas, quando: fmtDiaMesHora(e.em) };
}

/** O nome da rotina de um evento (a lista traz as vivas e as 50 apagadas mais novas; fora disso, "Rotina apagada"). */
export const nomeDaRotina = (rotinas: readonly Pick<RotinaDoProfissional, "id" | "nome">[], id: string): string =>
  rotinas.find((r) => r.id === id)?.nome ?? "Rotina apagada";

export type EstadoDoCard = "carregando" | "sem-internet" | "erro" | "sem-login" | "vazio" | "nenhuma-hoje" | "lista";

/**
 * O estado do card (o data-card-rotinas dos E2E). Sem o dado: sem internet a consulta espera a rede ("sem-internet", não o erro); senão, o
 * erro. Com o dado (mesmo se uma releitura falhou depois), o dado.
 */
export function estadoDoCard(
  q: { isLoading: boolean; isError: boolean; fetchStatus?: string; data?: Pick<RotinasDoAluno, "tem_login" | "rotinas" | "feitas"> | null },
  hoje: string,
): EstadoDoCard {
  if (q.isLoading) return "carregando";
  if (!q.data) return !q.isError && q.fetchStatus === "paused" ? "sem-internet" : "erro";
  if (!q.data.tem_login) return "sem-login";
  if (vivasDoAluno(q.data.rotinas).length === 0) return "vazio";
  return rotinasDeHoje(q.data, hoje).length ? "lista" : "nenhuma-hoje";
}
