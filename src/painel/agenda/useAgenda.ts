// Physiq W20 — o que a página Agenda divide: a conta ativa e quem é você nela (o dono vê a agenda da equipe), os calendários (o 1º
// acesso cria o "Calendário principal"), as consultas do período da visão e das últimas 8 semanas (os números do topo), bloqueios,
// travas, as suas regras (e as da equipe, para o dono) e os alunos dos seletores.
// W2: as TAGS — as minhas (com as 3 base garantidas) + as dos donos dos calendários que eu vejo (a equipe, só leitura), sempre
// filtradas por profissional_id; personal E nutri sem calendário nasce com "Treino" e "Nutrição".
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, startOfDay } from "date-fns";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { buscarEquipe } from "@/painel/configuracoes/equipe/api";
import { REGRAS_PADRAO, inicioDaSemana, hojeSP, somarDias, type RegrasAgenda, type TagAgenda } from "@/agenda/regras";
import {
  carregarTagsDaAgenda, garantirCalendarios, lerRegras, listarAgendamentos, listarAlunosDaAgenda, listarBloqueios, listarBloqueiosFuturos,
  listarTravas, type AlunoAgenda, type Calendario,
} from "./dados";
import { intervaloVisao, paraBloqueio, paraEvento, type EventoPainel, type Visao } from "./visao";

export const CHAVES_AGENDA = {
  tudo: ["agenda-painel"] as const,
  calendarios: (uid: string, conta: string) => ["agenda-painel", "calendarios", uid, conta] as const,
  agendamentos: (uid: string, conta: string, de: string, ate: string) => ["agenda-painel", "agendamentos", uid, conta, de, ate] as const,
  estatisticas: (uid: string, conta: string, de: string) => ["agenda-painel", "estatisticas", uid, conta, de] as const,
  bloqueios: (uid: string, conta: string, de: string, ate: string) => ["agenda-painel", "bloqueios", uid, conta, de, ate] as const,
  bloqueiosFuturos: (uid: string, conta: string) => ["agenda-painel", "bloqueios-futuros", uid, conta] as const,
  travas: (uid: string, conta: string) => ["agenda-painel", "travas", uid, conta] as const,
  regras: (prof: string) => ["agenda-painel", "regras", prof] as const,
  alunos: (uid: string, conta: string) => ["agenda-painel", "alunos", uid, conta] as const,
  /** W2: as tags do painel (as minhas + as dos donos dos calendários que eu vejo) */
  tags: (uid: string, donos: string) => ["agenda-painel", "tags", uid, donos] as const,
  /** H1: só LER as tags destes profissionais (o Dashboard, sem criar as base); no prefixo da Agenda: mexer numa tag lá invalida aqui */
  tagsLeitura: (profissionais: string) => ["agenda-painel", "tags-leitura", profissionais] as const,
  equipe: (conta: string) => ["agenda-painel", "equipe", conta] as const,
  /** o card "Próximos compromissos" do Resumo do aluno */
  compromissos: (aluno: string) => ["agenda-compromissos", aluno] as const,
};

export interface PessoaAgenda {
  id: string;
  nome: string;
  papeis: string[];
}

export function useContextoAgenda() {
  const { conta, ehDono } = useConta();
  const { usuario, situacao } = useSessao();
  const uid = usuario?.id ?? "";
  const contaId = conta?.id ?? "";
  const papeis = useMemo(() => (conta?.papeis ?? []) as string[], [conta?.papeis]);
  const modulos = useMemo(() => (conta?.modulos ?? []) as string[], [conta?.modulos]);
  const equipe = useQuery({ queryKey: CHAVES_AGENDA.equipe(contaId), queryFn: () => buscarEquipe(contaId), enabled: !!contaId && ehDono, staleTime: 5 * 60_000, retry: 1 });
  const pessoas = useMemo(() => {
    const mapa = new Map<string, PessoaAgenda>();
    for (const m of equipe.data?.membros ?? []) if (m.user_id) mapa.set(m.user_id, { id: m.user_id, nome: m.nome, papeis: m.papeis as string[] });
    if (uid) mapa.set(uid, { id: uid, nome: situacao?.nome ?? mapa.get(uid)?.nome ?? "Você", papeis });
    return mapa;
  }, [equipe.data, uid, situacao?.nome, papeis]);
  return { uid, contaId, conta, dono: ehDono, papeis, modulos, pessoas, pronto: !!uid };
}

export type ContextoAgenda = ReturnType<typeof useContextoAgenda>;

export function useDadosAgenda(ctx: ContextoAgenda, visao: Visao, ancora: Date, ocultos: Set<string>) {
  const qc = useQueryClient();
  const { uid, contaId, pronto, papeis, modulos } = ctx;
  const { inicio, fim } = useMemo(() => intervaloVisao(ancora, visao), [ancora, visao]);
  const de = inicio.toISOString();
  const ate = fim.toISOString();
  const hoje = hojeSP();
  // os números do topo: da segunda de 8 semanas atrás até o fim desta semana (+1 dia de folga do fuso)
  const desdeEstat = somarDias(inicioDaSemana(hoje), -49);

  const calendarios = useQuery({
    queryKey: CHAVES_AGENDA.calendarios(uid, contaId),
    queryFn: () => garantirCalendarios(uid, contaId || null, papeis, modulos),
    enabled: pronto,
    staleTime: 60_000,
  });
  // os donos dos calendários que eu vejo (eu + a equipe, para o dono): as tags de cada um
  const donos = useMemo(() => [...new Set([uid, ...(calendarios.data ?? []).map((c) => c.nutricionista_id)])].filter(Boolean).sort(), [uid, calendarios.data]);
  const tags = useQuery({
    queryKey: CHAVES_AGENDA.tags(uid, donos.join(",")),
    queryFn: () => carregarTagsDaAgenda(uid, donos),
    enabled: pronto && !!calendarios.data,
    staleTime: 60_000,
  });
  const agendamentos = useQuery({
    queryKey: CHAVES_AGENDA.agendamentos(uid, contaId, de, ate),
    queryFn: () => listarAgendamentos(inicio, fim, uid, contaId || null),
    enabled: pronto,
    staleTime: 15_000,
  });
  const estatisticas = useQuery({
    queryKey: CHAVES_AGENDA.estatisticas(uid, contaId, desdeEstat),
    queryFn: () => listarAgendamentos(startOfDay(new Date(`${desdeEstat}T00:00:00`)), addDays(startOfDay(new Date(`${somarDias(inicioDaSemana(hoje), 7)}T00:00:00`)), 1), uid, contaId || null),
    enabled: pronto,
    staleTime: 15_000,
  });
  const bloqueios = useQuery({ queryKey: CHAVES_AGENDA.bloqueios(uid, contaId, de, ate), queryFn: () => listarBloqueios(inicio, fim, uid, contaId || null), enabled: pronto, staleTime: 30_000 });
  const bloqueiosFuturos = useQuery({ queryKey: CHAVES_AGENDA.bloqueiosFuturos(uid, contaId), queryFn: () => listarBloqueiosFuturos(uid, contaId || null), enabled: pronto, staleTime: 30_000 });
  const travas = useQuery({ queryKey: CHAVES_AGENDA.travas(uid, contaId), queryFn: () => listarTravas(uid, contaId || null), enabled: pronto, staleTime: 30_000 });
  const regras = useQuery({ queryKey: CHAVES_AGENDA.regras(uid), queryFn: () => lerRegras(uid), enabled: pronto, staleTime: 60_000 });
  const alunos = useQuery({ queryKey: CHAVES_AGENDA.alunos(uid, contaId), queryFn: () => listarAlunosDaAgenda(contaId || null, uid), enabled: pronto, staleTime: 60_000 });

  const lista = useMemo(() => calendarios.data ?? [], [calendarios.data]);
  const cores = useMemo(() => new Map(lista.map((c) => [c.id, c.cor])), [lista]);
  const mapaAlunos = useMemo(() => new Map((alunos.data ?? []).map((a) => [a.id, a])), [alunos.data]);
  const listaTags = useMemo<TagAgenda[]>(() => tags.data ?? [], [tags.data]);
  const mapaTags = useMemo(() => new Map(listaTags.map((t) => [t.id, t])), [listaTags]);
  const visiveis = useMemo(() => lista.filter((c) => !ocultos.has(c.id)), [lista, ocultos]);
  const eventos = useMemo<EventoPainel[]>(
    () => (agendamentos.data ?? []).filter((a) => !ocultos.has(a.calendario_id)).map((a) => paraEvento(a, cores, mapaAlunos, mapaTags)),
    [agendamentos.data, ocultos, cores, mapaAlunos, mapaTags],
  );
  const eventosEstat = useMemo<EventoPainel[]>(
    () => (estatisticas.data ?? []).filter((a) => !ocultos.has(a.calendario_id)).map((a) => paraEvento(a, cores, mapaAlunos, mapaTags)),
    [estatisticas.data, ocultos, cores, mapaAlunos, mapaTags],
  );
  const listaBloqueios = useMemo(
    () => (bloqueios.data ?? []).map(paraBloqueio).filter((b) => b.calendarioId === null || !ocultos.has(b.calendarioId)),
    [bloqueios.data, ocultos],
  );

  const recarregar = useCallback(() => qc.invalidateQueries({ queryKey: CHAVES_AGENDA.tudo }), [qc]);

  return {
    inicio,
    fim,
    calendarios: lista,
    visiveis,
    calendariosQ: calendarios,
    agendamentosQ: agendamentos,
    estatisticasQ: estatisticas,
    eventos,
    eventosEstat,
    bloqueios: listaBloqueios,
    bloqueiosFuturos: bloqueiosFuturos.data ?? [],
    travas: travas.data ?? [],
    regras: regras.data ?? REGRAS_PADRAO,
    regrasQ: regras,
    /** as regras ainda não chegaram: a tela NÃO mostra os padrões no lugar (nem deixa editar e gravar os padrões por cima) */
    regrasCarregando: !regras.data && !regras.isError,
    alunos: alunos.data ?? [],
    mapaAlunos,
    /** W2: as tags que a agenda vê (filtre por profissional_id antes de listar) */
    tags: listaTags,
    mapaTags,
    tagsQ: tags,
    recarregar,
    erro: calendarios.error ?? agendamentos.error ?? bloqueios.error ?? null,
    carregando: calendarios.isLoading || (agendamentos.isLoading && !agendamentos.data),
  };
}

export type DadosAgenda = ReturnType<typeof useDadosAgenda>;

/** O calendário sugerido no novo agendamento: o seu padrão, senão o seu primeiro, senão o primeiro visível. */
export function calendarioSugerido(calendarios: readonly Calendario[], uid: string): Calendario | null {
  const meus = calendarios.filter((c) => c.nutricionista_id === uid);
  return meus.find((c) => c.padrao) ?? meus[0] ?? calendarios[0] ?? null;
}

export function regrasPara(regrasMinhas: RegrasAgenda | undefined): RegrasAgenda {
  return regrasMinhas ?? REGRAS_PADRAO;
}

export type { AlunoAgenda };
