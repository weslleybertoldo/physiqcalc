// Physiq W25 — regras PURAS do Painel › Dashboard (tela 6; spec §4.4 "Dashboard", N-9, NF6, P1, P28). Sem rede: testadas em
// regras.test.ts. Os números saem das MESMAS regras das telas de origem (lição da W10: número = tela):
//   · Alunos ativos = o total da página Alunos no filtro "Ativos" (alunos_da_conta — o mesmo número do menu); "+N este mês" = o mês
//     atual do card "Novos alunos por mês" da página Alunos (alunos_novos_por_mes);
//   · Receita do mês = o "Recebido em <mês>" do Resumo do Financeiro (resumo.ts: kpis), comparado com o MESMO período do mês anterior
//     (comparacaoDoMes — a regra única do herdado da W19);
//   · Consultas hoje = o "Consultas hoje" da Agenda (numerosDaAgenda), e a "Agenda de hoje" é a lista desse número;
//   · Adesão média (NF6) = treinos feitos ÷ programados (os dias da regra do "N de M na semana" — diasTreinoDoAluno/resumoDaSemana) e
//     refeições marcadas ÷ marcáveis (adesaoDoPeriodo, a do card Dieta do Resumo do aluno), nos últimos 7 dias;
//   · Precisam de atenção (P28): Pix aguardando e cobrança vencida (os do Resumo do Financeiro), 7 dias sem treinar, avaliação vencida
//     pela data marcada (sem data, 60 dias da última), 3 dias sem marcar a dieta, cadastros pendentes do link /c/ (o "Pendentes" de
//     Alunos), respostas novas da pré-consulta (o número do menu) e os aniversariantes da semana (a regra do Dashboard do Nutri);
//     H4: + as fotos do diário aguardando reação (o "Só não reagidas" de Dietas › Diário nos 7 dias — só para quem vê o diário);
//   · H4: Recibos no mês = os recibos de Financeiro › Recibos com a data no mês de hoje (o KPI do Nutri) — hml-14b: contado no
//     banco (financeiro_recibos, a função da aba Recibos, só o total — useDashboard), não mais aqui;
//   · H1: a "Agenda de hoje" mostra a pílula da TAG da consulta (a da página Agenda), lendo só as tags dos profissionais dela.
import { primeiroNome, resumoDaSemana } from "@/app-aluno/inicio/pecas/regras";
import { cancelado, diaSP, somarDias } from "@/agenda/regras";
import { planoAtivo } from "@/nutricao/app/dia";
import { refeicaoMarcavel } from "@/nutricao/app/refeicaoConcluidaUtil";
import { adesaoDoPeriodo, type Concluida } from "@/nutricao/editor/lib/adesao";
import { diasTreinoDoAluno } from "@/treino/editor/regras";
import type { ConfigDia, GrupoDisponivel, LinhaSemana } from "@/treino/editor/tipos";
import type { ItemAtencao as AtencaoFinanceiro } from "@/painel/financeiro/resumo";
import type { TomChip } from "@/ui/premium/Chip";

// ───────────────────────── o que vem dos 2 bancos ─────────────────────────

export interface RefeicaoResumo {
  id: string;
  nome: string;
  horario: string | null;
  ordem: number;
  dias_semana: number[] | null;
  /** nº de alimentos da refeição (só a refeição com alimento ganha o ✓) */
  itens: number;
}

export interface PlanoResumo {
  id: string;
  favorito: boolean;
  created_at: string;
  refeicoes: RefeicaoResumo[];
}

export interface DietaResumo {
  planos: PlanoResumo[];
  concluidas: Concluida[];
  ultima_marcacao: string | null;
}

/** Um aluno ATIVO que você vê (painel_resumo do principal). */
export interface AlunoPrincipal {
  id: string;
  rota_id: string;
  user_id: string | null;
  treino_user_id: string | null;
  nome: string;
  apelido: string | null;
  foto_url: string | null;
  nascimento: string | null;
  criado_em: string;
  modulos: ("treino" | "nutricao")[];
  personal_id: string | null;
  nutricionista_id: string | null;
  tem_login: boolean;
  acesso_app: boolean;
  ultima_antropometria: string | null;
  /** null = você não vê a dieta dele (regra clínica: só a nutricionista da conta e o master) */
  dieta: DietaResumo | null;
}

export interface ResumoPrincipal {
  ok: true;
  hoje: string;
  alunos: AlunoPrincipal[];
  conta: { id: string; nome: string; modulos: ("treino" | "nutricao")[] };
  eu: { id: string; dono: boolean; personal: boolean; nutricionista: boolean; master: boolean };
}

/** Um aluno no Banco do Treino (painel_resumo_treino, pela função painel-resumo-treino). */
export interface AlunoTreino {
  id: string;
  principal_user_id: string | null;
  nome: string | null;
  criado_em: string | null;
  proxima_avaliacao: string | null;
  ultima_avaliacao: string | null;
  ultimo_treino: string | null;
  semana: LinhaSemana[];
  dias_config: ConfigDia[];
  grupos_catalogo: string[];
  grupos_pessoais: string[];
  overrides: { data_treino: string; slot_idx: number | null; grupo_id: string | null; grupo_usuario_id: string | null }[];
  concluidos: { data_treino: string; slot_idx: number | null }[];
}

export interface TreinoHistorico {
  user_id: string;
  nome_treino: string;
  concluido_em: string;
}

export interface SerieRecorde {
  user_id: string;
  exercicio: string | null;
  exercicio_id: string | null;
  exercicio_usuario_id: string | null;
  data_treino: string;
  peso: number | string;
  anterior: number | string | null;
  quando: string | null;
}

export interface ResumoTreino {
  ok: true;
  hoje: string;
  de: string;
  todos: boolean;
  alunos: AlunoTreino[];
  historico: TreinoHistorico[];
  recordes: SerieRecorde[];
}

/** O aluno do Dashboard: a matrícula do principal + o treino dele no Banco do Treino (quando você tem a sessão do Treino). */
export interface AlunoDash extends AlunoPrincipal {
  treino: AlunoTreino | null;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Junta as 2 partes: pelo usuário do Treino guardado na matrícula ou pelo vínculo de identidade (login do principal). */
export function juntarAlunos(principal: readonly AlunoPrincipal[], treino: ResumoTreino | null | undefined): AlunoDash[] {
  const porId = new Map((treino?.alunos ?? []).map((t) => [t.id, t]));
  const porLogin = new Map((treino?.alunos ?? []).filter((t) => t.principal_user_id).map((t) => [t.principal_user_id as string, t]));
  return principal.map((a) => ({
    ...a,
    treino: (a.treino_user_id && porId.get(a.treino_user_id)) || (a.user_id && porLogin.get(a.user_id)) || null,
  }));
}

/** Nome da tela: o apelido (se houver) ou o primeiro nome — "Rafael concluiu o Treino A". */
export function nomeCurto(a: Pick<AlunoPrincipal, "nome" | "apelido">): string {
  const ap = (a.apelido ?? "").trim();
  return ap || primeiroNome(a.nome) || "Aluno";
}

export const rotaDoAluno = (a: Pick<AlunoPrincipal, "rota_id">, aba?: string): string =>
  `/painel/alunos/${encodeURIComponent(a.rota_id)}${aba ? `/${aba}` : ""}`;

// ───────────────────────── datas ─────────────────────────

const DIAS_LONGOS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const diaDaSemana = (dia: string): number => new Date(`${dia}T12:00:00Z`).getUTCDay();

/** "2026-07-16" → "Quinta-feira, 16 de julho de 2026" (o subtítulo da tela 6). */
export function dataPorExtenso(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  if (!a || !m || !d) return "";
  return `${DIAS_LONGOS[diaDaSemana(dia)]}, ${d} de ${MESES[m - 1]} de ${a}`;
}

/** Dias inteiros entre 2 datas AAAA-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(ta) && Number.isFinite(tb) ? Math.round((tb - ta) / 86_400_000) : 0;
}

/** Os N dias que terminam em `hoje` (AAAA-MM-DD), do mais antigo para hoje. */
export function ultimosDiasAte(hoje: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => somarDias(hoje, i - (n - 1)));
}

/** O meio-dia LOCAL do dia (a mesma âncora do datasDaSemana da aba Treino: trocar de horário de verão não pula dia). */
function meioDia(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d, 12, 0, 0, 0);
}

// ───────────────────────── adesão (NF6) ─────────────────────────

export interface AdesaoAluno {
  /** treinos: dias feitos ÷ dias com treino (null = sem treino para medir) */
  treino: { feitos: number; total: number } | null;
  /** dieta: refeições marcadas ÷ marcáveis (null = sem dieta para medir) */
  dieta: { feitas: number; total: number } | null;
  /** a adesão do aluno: a média dos módulos medidos (0 a 1; null = nada para medir) */
  fracao: number | null;
  /** por dia (os 7 dias): a média dos módulos medidos naquele dia (null = nada naquele dia) */
  porDia: (number | null)[];
}

/** Os dias da janela com o treino programado e o feito (a MESMA regra do "N de M na semana" do app e do Resumo do aluno). */
export function adesaoTreino(t: AlunoTreino, dias: readonly string[]): { feitos: number; total: number; porDia: { total: number; feito: number }[] } {
  const grupos: GrupoDisponivel[] = [
    ...t.grupos_catalogo.map((id) => ({ id, nome: "", tipo: "catalogo" as const })),
    ...t.grupos_pessoais.map((id) => ({ id, nome: "", tipo: "pessoal" as const })),
  ];
  const lista = diasTreinoDoAluno({ semana: t.semana, gruposDisponiveis: grupos, diasConfig: t.dias_config },
    { overrides: t.overrides, concluidos: t.concluidos }, dias.map(meioDia));
  const r = resumoDaSemana(lista);
  return {
    ...r,
    porDia: lista.map((d) => {
      const feito = d.feito || !!d.algumFeito;
      return { total: d.treinos.length > 0 || feito ? 1 : 0, feito: feito ? 1 : 0 };
    }),
  };
}

/** A dieta da janela: refeições marcáveis do plano atual × as marcadas (adesaoDoPeriodo, a do card Dieta do Resumo do aluno). */
export function adesaoDieta(d: DietaResumo, dias: readonly string[]) {
  const plano = planoAtivo(d.planos);
  if (!plano) return null;
  const refeicoes = plano.refeicoes.map((r) => ({ ...r, itens: Array.from({ length: num(r.itens) }) }));
  if (!refeicoes.some(refeicaoMarcavel)) return null;
  return adesaoDoPeriodo(refeicoes, d.concluidas, [...dias]);
}

/**
 * A adesão de 1 aluno nos dias (só os módulos dele que você vê e que têm o que medir). Só conta quem USA o app: o treino de quem tem o
 * perfil no Banco do Treino (a sessão do app) e a dieta de quem tem login com o app ligado — sem login ninguém marca a refeição, e um 0 %
 * de quem nem entra puxaria a média para baixo sem dizer nada (os mesmos alunos do "sem marcar a dieta").
 */
export function adesaoDoAluno(a: AlunoDash, dias: readonly string[]): AdesaoAluno {
  const t = a.modulos.includes("treino") && a.treino ? adesaoTreino(a.treino, dias) : null;
  const d = a.modulos.includes("nutricao") && a.dieta && a.tem_login && a.acesso_app ? adesaoDieta(a.dieta, dias) : null;
  const treino = t && t.total > 0 ? { feitos: t.feitos, total: t.total } : null;
  const dieta = d && d.total > 0 ? { feitas: d.feitas, total: d.total } : null;
  const partes = [treino ? treino.feitos / treino.total : null, dieta ? dieta.feitas / dieta.total : null].filter((x): x is number => x !== null);
  const porDia = dias.map((_, i) => {
    const v: number[] = [];
    if (treino && t) {
      const x = t.porDia[i];
      if (x && x.total > 0) v.push(x.feito / x.total);
    }
    if (dieta && d) {
      const x = d.dias[i];
      if (x && x.total > 0) v.push(x.feitas / x.total);
    }
    return v.length ? v.reduce((s, y) => s + y, 0) / v.length : null;
  });
  return { treino, dieta, fracao: partes.length ? partes.reduce((s, x) => s + x, 0) / partes.length : null, porDia };
}

export interface AdesaoMedia {
  /** 0 a 100 (null = ninguém com o que medir) */
  pct: number | null;
  alunos: number;
  temTreino: boolean;
  temDieta: boolean;
  /** a média de cada dia (para o mini gráfico), em % */
  serie: number[];
}

/** "Adesão média": a média, entre os alunos com o que medir, da adesão de cada um (os módulos dele valem igual). */
export function adesaoMedia(alunos: readonly AlunoDash[], dias: readonly string[]): AdesaoMedia {
  const lista = alunos.map((a) => adesaoDoAluno(a, dias)).filter((x) => x.fracao !== null);
  const pct = lista.length ? Math.round((lista.reduce((s, x) => s + (x.fracao as number), 0) / lista.length) * 100) : null;
  const serie = dias.map((_, i) => {
    const v = lista.map((x) => x.porDia[i]).filter((y): y is number => y !== null);
    return v.length ? Math.round((v.reduce((s, y) => s + y, 0) / v.length) * 100) : 0;
  });
  return { pct, alunos: lista.length, temTreino: lista.some((x) => x.treino), temDieta: lista.some((x) => x.dieta), serie };
}

/** "treinos feitos e dieta marcada" (o que houver). */
export function textoAdesao(m: Pick<AdesaoMedia, "temTreino" | "temDieta" | "pct">): string {
  if (m.pct === null) return "sem treino nem dieta para medir";
  if (m.temTreino && m.temDieta) return "treinos feitos e dieta marcada";
  return m.temTreino ? "treinos feitos · 7 dias" : "dieta marcada · 7 dias";
}

// ───────────────────────── "Precisam de atenção" (P28) ─────────────────────────

export const LIMIAR_SEM_TREINAR = 7;
export const LIMIAR_SEM_DIETA = 3;
export const LIMIAR_AVALIACAO_SEM_DATA = 60;

export type TipoAtencao = "pix" | "cobranca" | "treino" | "avaliacao" | "dieta" | "diario" | "cadastro" | "preconsulta" | "aniversario";

export interface ItemAtencao {
  chave: string;
  tipo: TipoAtencao;
  nome: string;
  foto: string | null;
  texto: string;
  chip: string;
  tom: TomChip;
  /** a tela de origem (lição da W10: o número abre a tela que mostra o mesmo número) */
  link: string;
  /** para ordenar: o tipo e a gravidade */
  ordem: string;
}

const ORDEM_TIPO: Record<TipoAtencao, number> = { pix: 0, cobranca: 1, treino: 2, avaliacao: 3, dieta: 4, diario: 5, cadastro: 6, preconsulta: 7, aniversario: 8 };
const ordem = (tipo: TipoAtencao, gravidade: number, nome: string) => `${ORDEM_TIPO[tipo]}:${String(99999 - Math.min(99999, Math.max(0, gravidade))).padStart(5, "0")}:${nome.toLowerCase()}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Pix aguardando e cobrança vencida: os MESMOS itens do "Precisam de atenção" do Resumo do Financeiro (abrem as Mensalidades). */
export function atencaoDoFinanceiro(itens: readonly AtencaoFinanceiro[], alunos: readonly Pick<AlunoPrincipal, "id" | "foto_url">[]): ItemAtencao[] {
  const fotos = new Map(alunos.map((a) => [a.id, a.foto_url]));
  return itens.map((i, k) => {
    const pix = i.chip === "PIX";
    return {
      chave: `fin:${i.chave}`, tipo: pix ? "pix" : "cobranca", nome: i.nome, foto: fotos.get(i.paciente_id) ?? null, texto: i.texto,
      chip: pix ? "PIX" : "VENCIDA", tom: pix ? "a" : "r",
      link: pix ? "/painel/financeiro?aba=mensalidades&ver=comprovantes" : "/painel/financeiro?aba=mensalidades",
      ordem: `${ORDEM_TIPO[pix ? "pix" : "cobranca"]}:${String(k).padStart(5, "0")}`,
    };
  });
}

/** 7 dias sem treinar (P28): o aluno com Treino e a semana montada, sem treino concluído há 7 dias ou mais (sem nenhum, desde que entrou). */
export function semTreinar(alunos: readonly AlunoDash[], hoje: string): ItemAtencao[] {
  const saida: ItemAtencao[] = [];
  for (const a of alunos) {
    const t = a.treino;
    if (!t || !a.modulos.includes("treino") || !t.semana.length) continue;
    const desde = t.ultimo_treino ?? (t.criado_em ? t.criado_em.slice(0, 10) : null);
    if (!desde) continue;
    const n = diasEntre(desde, hoje);
    if (n < LIMIAR_SEM_TREINAR) continue;
    saida.push({
      chave: `treino:${a.id}`, tipo: "treino", nome: a.nome, foto: a.foto_url, chip: "TREINO", tom: "r", link: rotaDoAluno(a, "treino"),
      texto: t.ultimo_treino ? `Sem treinar há ${n} dias` : `Nenhum treino desde que entrou (${n} dias)`, ordem: ordem("treino", n, a.nome),
    });
  }
  return saida;
}

/**
 * A avaliação venceu? Pela data marcada (passou dela); sem data, 60 dias da última (Treino ou antropometria). null = em dia ou sem base.
 * `comTreino` = quem olha tem o resumo do Treino (a data marcada e as avaliações físicas moram lá): sem ele, o aluno com o módulo Treino
 * fica de fora (a conta sairia sem a data marcada — número inventado); o aluno só de Nutrição usa as antropometrias, que são tudo.
 */
export function avaliacaoVencidaHa(a: AlunoDash, hoje: string, comTreino = true): number | null {
  if (!comTreino && a.modulos.includes("treino")) return null;
  const proxima = a.treino?.proxima_avaliacao?.slice(0, 10) ?? null;
  if (proxima) {
    const n = diasEntre(proxima, hoje);
    return n > 0 ? n : null;
  }
  const datas = [a.treino?.ultima_avaliacao, a.ultima_antropometria].filter((x): x is string => !!x).map((x) => x.slice(0, 10)).sort();
  const ultima = datas[datas.length - 1];
  if (!ultima) return null;
  const n = diasEntre(somarDias(ultima, LIMIAR_AVALIACAO_SEM_DATA), hoje);
  return n > 0 ? n : null;
}

export function avaliacoesVencidas(alunos: readonly AlunoDash[], hoje: string, comTreino = true): ItemAtencao[] {
  const saida: ItemAtencao[] = [];
  for (const a of alunos) {
    const n = avaliacaoVencidaHa(a, hoje, comTreino);
    if (n === null) continue;
    saida.push({
      chave: `avaliacao:${a.id}`, tipo: "avaliacao", nome: a.nome, foto: a.foto_url, chip: "AVALIAÇÃO", tom: "t", link: rotaDoAluno(a, "avaliacao"),
      texto: `Avaliação vencida há ${plural(n, "dia", "dias")}`, ordem: ordem("avaliacao", n, a.nome),
    });
  }
  return saida;
}

/**
 * 3 dias sem marcar a dieta (P28): o aluno com login e o app ligado, com plano atual que tem refeição para marcar, sem nenhum ✓ há 3
 * dias ou mais — contando do último ✓ ou, se ele nunca marcou (ou o plano é mais novo), do dia em que o plano atual foi criado.
 */
export function semMarcarDieta(alunos: readonly AlunoDash[], hoje: string): ItemAtencao[] {
  const saida: ItemAtencao[] = [];
  for (const a of alunos) {
    const d = a.dieta;
    if (!d || !a.modulos.includes("nutricao") || !a.tem_login || !a.acesso_app) continue;
    const plano = planoAtivo(d.planos);
    if (!plano || !plano.refeicoes.some((r) => r.itens > 0)) continue;
    const inicio = diaSP(plano.created_at);
    const ref = [d.ultima_marcacao?.slice(0, 10), inicio].filter((x): x is string => !!x).sort().pop();
    if (!ref) continue;
    const n = diasEntre(ref, hoje);
    if (n < LIMIAR_SEM_DIETA) continue;
    saida.push({
      chave: `dieta:${a.id}`, tipo: "dieta", nome: a.nome, foto: a.foto_url, chip: "DIETA", tom: "n", link: rotaDoAluno(a, "dieta"),
      texto: `Sem marcar a dieta há ${n} dias`, ordem: ordem("dieta", n, a.nome),
    });
  }
  return saida;
}

/** Dietas › Diário com o período padrão (7 dias) e "Só não reagidas" ligado: a tela que mostra o mesmo número. */
export const LINK_FOTOS_SEM_REACAO = "/painel/dietas?aba=diario&dias=7&nao_reagidas=1";

/**
 * H4 (o Nutri mostrava em "Precisam de atenção"): as fotos do diário sem a reação da nutricionista nos últimos 7 dias — o MESMO
 * número do "Só não reagidas (N)" de Dietas › Diário (e do número da aba Diário), da mesma consulta. 1 item com o número.
 */
export function fotosSemReacao(n: number): ItemAtencao[] {
  if (!(n > 0)) return [];
  return [{
    chave: "diario", tipo: "diario", nome: plural(n, "foto do diário", "fotos do diário"), foto: null, chip: "DIÁRIO", tom: "n",
    texto: "Aguardando a sua reação (últimos 7 dias)", link: LINK_FOTOS_SEM_REACAO, ordem: ordem("diario", n, ""),
  }];
}

/** O "Pendentes" da página Alunos (auto-cadastros pelo link /c/): 1 item com o número. */
export function cadastrosPendentes(n: number): ItemAtencao[] {
  if (!(n > 0)) return [];
  return [{
    chave: "cadastro", tipo: "cadastro", nome: plural(n, "cadastro pendente", "cadastros pendentes"), foto: null, chip: "CADASTRO", tom: "c",
    texto: "Pelo seu link: aprove ou recuse em Alunos › Pendentes", link: "/painel/alunos?pendentes=1", ordem: ordem("cadastro", n, ""),
  }];
}

/** As respostas novas da pré-consulta (o número do menu): 1 item com o número. */
export function preConsultasNovas(n: number): ItemAtencao[] {
  if (!(n > 0)) return [];
  return [{
    chave: "preconsulta", tipo: "preconsulta", nome: plural(n, "resposta nova", "respostas novas"), foto: null, chip: "PRÉ-CONSULTA", tom: "c",
    texto: "Pré-consulta sem aluno ligado: abra e ligue ao aluno", link: "/painel/pre-consulta?aba=respostas", ordem: ordem("preconsulta", n, ""),
  }];
}

export interface Aniversariante {
  id: string;
  nome: string;
  dia: string;
  idade: number;
  ehHoje: boolean;
}

/** Ano bissexto (29/02 cai em 28/02 nos outros anos, como no Nutri). */
const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** Os alunos ativos que fazem aniversário de segunda a domingo desta semana (a regra do Dashboard do Nutri). */
export function aniversariantesDaSemana(alunos: readonly Pick<AlunoPrincipal, "id" | "nome" | "nascimento">[], hoje: string): Aniversariante[] {
  const seg = somarDias(hoje, -((diaDaSemana(hoje) + 6) % 7));
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
  const saida: Aniversariante[] = [];
  for (const a of alunos) {
    const nasc = (a.nascimento ?? "").slice(0, 10);
    if (nasc.length < 10) continue;
    const mmdd = nasc.slice(5);
    for (const dia of dias) {
      const alvo = mmdd === "02-29" && !bissexto(Number(dia.slice(0, 4))) ? "02-28" : mmdd;
      if (dia.slice(5) !== alvo) continue;
      const anos = Number(dia.slice(0, 4)) - Number(nasc.slice(0, 4));
      saida.push({ id: a.id, nome: a.nome, dia, idade: anos, ehHoje: dia === hoje });
      break;
    }
  }
  return saida.sort((x, y) => x.dia.localeCompare(y.dia) || x.nome.localeCompare(y.nome, "pt-BR"));
}

export function itensAniversario(alunos: readonly AlunoDash[], hoje: string): ItemAtencao[] {
  const porId = new Map(alunos.map((a) => [a.id, a]));
  return aniversariantesDaSemana(alunos, hoje).map((x) => {
    const a = porId.get(x.id)!;
    const quando = x.ehHoje ? "hoje" : `${DIAS_CURTOS[diaDaSemana(x.dia)]}, ${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}`;
    return {
      chave: `aniversario:${x.id}`, tipo: "aniversario" as const, nome: x.nome, foto: a.foto_url, chip: "ANIVERSÁRIO", tom: "g" as TomChip,
      link: rotaDoAluno(a), texto: `Aniversário ${quando} · ${plural(x.idade, "ano", "anos")}`,
      ordem: ordem("aniversario", 7 - diasEntre(hoje, x.dia), x.nome),
    };
  });
}

/** Junta e ordena (o tipo pela ordem da tela 6 e, dentro dele, o mais grave primeiro). */
export function juntarAtencao(...listas: ItemAtencao[][]): ItemAtencao[] {
  return listas.flat().sort((a, b) => a.ordem.localeCompare(b.ordem));
}

// ───────────────────────── "Atividade recente" ─────────────────────────

export type TipoAtividade = "treino" | "recorde" | "comprovante" | "preconsulta" | "foto";

export interface ItemAtividade {
  chave: string;
  tipo: TipoAtividade;
  /** o nome em negrito ("Rafael") */
  quem: string;
  /** o resto da frase ("concluiu o Treino A") */
  texto: string;
  quando: string;
  link: string;
}

/** Recorde = a maior carga do exercício no dia passou a maior carga de antes (precisa ter feito o exercício antes). 1 por exercício. */
export function recordes(series: readonly SerieRecorde[]): SerieRecorde[] {
  const melhores = new Map<string, SerieRecorde>();
  for (const s of series) {
    const antes = s.anterior === null || s.anterior === undefined ? 0 : num(s.anterior);
    if (!(antes > 0) || !(num(s.peso) > antes)) continue;
    const chave = `${s.user_id}|${s.exercicio_id ?? ""}|${s.exercicio_usuario_id ?? ""}`;
    const atual = melhores.get(chave);
    if (!atual || s.data_treino > atual.data_treino) melhores.set(chave, s);
  }
  return [...melhores.values()];
}

/** "70 kg", "72,5 kg" */
export function textoCarga(peso: number | string): string {
  const v = num(peso);
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

/** O nome do exercício como está no catálogo ("Supino Reto com Barra"); sem nome, "exercício". */
const nomeDoExercicio = (s: string | null | undefined) => (s ?? "").trim() || "exercício";

/** "mandou foto do almoço" — o artigo certo de cada refeição do diário (src/nutricao/app/diarioUtil.ts). */
const DA_REFEICAO: Record<string, string> = {
  cafe_manha: "do café da manhã", lanche_manha: "do lanche da manhã", almoco: "do almoço", lanche_tarde: "do lanche da tarde", jantar: "do jantar",
  ceia: "da ceia",
};

export interface FontesAtividade {
  alunos: readonly AlunoDash[];
  historico: readonly TreinoHistorico[];
  recordes: readonly SerieRecorde[];
  comprovantes: readonly { id: string; paciente_id: string; nome: string; enviado_em: string | null }[];
  preConsultas: readonly { id: string; nome: string; respondido_em: string; paciente_id: string | null }[];
  fotos: readonly { id: string; paciente_id: string; refeicao: string; data_hora: string }[];
}

/** As 5 coisas mais recentes (treino concluído, recorde, comprovante enviado, pré-consulta respondida, foto do diário), cada uma com a tela de origem. */
export function atividadeRecente(f: FontesAtividade, max = 5): ItemAtividade[] {
  const porTreino = new Map<string, AlunoDash>();
  const porMatricula = new Map<string, AlunoDash>();
  for (const a of f.alunos) {
    porMatricula.set(a.id, a);
    if (a.treino) porTreino.set(a.treino.id, a);
  }
  const itens: ItemAtividade[] = [];
  for (const h of f.historico) {
    const a = porTreino.get(h.user_id);
    if (!a) continue;
    itens.push({ chave: `treino:${h.user_id}:${h.concluido_em}`, tipo: "treino", quem: nomeCurto(a), texto: `concluiu o ${h.nome_treino}`, quando: h.concluido_em, link: rotaDoAluno(a, "treino") });
  }
  for (const s of recordes(f.recordes)) {
    const a = porTreino.get(s.user_id);
    if (!a) continue;
    itens.push({
      chave: `recorde:${s.user_id}:${s.exercicio_id ?? s.exercicio_usuario_id}:${s.data_treino}`, tipo: "recorde", quem: nomeCurto(a),
      texto: `bateu recorde no ${nomeDoExercicio(s.exercicio)} (${textoCarga(s.peso)})`, quando: s.quando ?? `${s.data_treino}T12:00:00-03:00`, link: rotaDoAluno(a, "treino"),
    });
  }
  for (const c of f.comprovantes) {
    if (!c.enviado_em) continue;
    const a = porMatricula.get(c.paciente_id);
    itens.push({
      chave: `comprovante:${c.id}`, tipo: "comprovante", quem: a ? nomeCurto(a) : primeiroNome(c.nome) || "Aluno", texto: "enviou o comprovante do Pix",
      quando: c.enviado_em, link: "/painel/financeiro?aba=mensalidades&ver=comprovantes",
    });
  }
  for (const r of f.preConsultas) {
    const a = r.paciente_id ? porMatricula.get(r.paciente_id) : undefined;
    itens.push({
      chave: `preconsulta:${r.id}`, tipo: "preconsulta", quem: a ? nomeCurto(a) : primeiroNome(r.nome) || "Alguém", texto: "respondeu a pré-consulta",
      quando: r.respondido_em, link: "/painel/pre-consulta?aba=respostas",
    });
  }
  for (const ft of f.fotos) {
    const a = porMatricula.get(ft.paciente_id);
    itens.push({
      chave: `foto:${ft.id}`, tipo: "foto", quem: a ? nomeCurto(a) : "Aluno", texto: `mandou foto ${DA_REFEICAO[ft.refeicao] ?? "do diário"}`,
      quando: ft.data_hora, link: `/painel/dietas?aba=diario&dias=7&aluno=${encodeURIComponent(ft.paciente_id)}`,
    });
  }
  return itens
    .filter((i) => Number.isFinite(Date.parse(i.quando)))
    .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
    .slice(0, max);
}

// ───────────────────────── "Agenda de hoje" ─────────────────────────

/** As consultas do dia (a lista do "Consultas hoje" da Agenda: não desmarcadas e com horário), por hora. */
export function consultasDeHoje<T extends { inicio: Date; diaInteiro: boolean; status: string }>(eventos: readonly T[], hoje: string): T[] {
  return eventos
    .filter((e) => !e.diaInteiro && !cancelado(e.status) && diaSP(e.inicio) === hoje)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/**
 * H1: os profissionais das consultas (sem repetir, em ordem) — as tags que a "Agenda de hoje" lê são SÓ as deles (filtro por
 * profissional_id: o master lê todas as tags pela RLS e o dono vê as consultas da equipe).
 */
export function profissionaisDasConsultas(consultas: readonly { nutricionista_id?: string | null }[]): string[] {
  return [...new Set(consultas.map((c) => c.nutricionista_id ?? "").filter(Boolean))].sort();
}
