// Physiq W25 — o que o Dashboard junta (tela 6). Reaproveita as MESMAS consultas das telas de origem, com as MESMAS chaves do
// react-query (o número do Dashboard e o da tela que ele abre saem do mesmo dado — lição da W10):
//   Alunos      alunos_da_conta no filtro "Ativos" (o número do menu e da página) + alunos_novos_por_mes (o card da página Alunos);
//   Financeiro  as 3 leituras do Resumo (o recebido por dia desde 1º/jan do ano passado — financeiro_resumo_periodo, hml-14b —, as
//               cobranças em aberto e do mês e o prof_resumo da W6) e as regras dele;
//   Agenda      os agendamentos da conta (o recorte da Agenda) e os alunos dela; os calendários escondidos na Agenda ficam fora aqui também;
//               H1: + as tags dos profissionais dessas consultas (só ler; a pílula da TAG na "Agenda de hoje", como na página Agenda);
//   Diário      useDiarioDaConta(conta, você, 1) da W24 (só para a nutricionista da conta — a regra clínica); H4: + a de 7 dias (a MESMA
//               do número da aba Diário e do "Só não reagidas" no período padrão) para as fotos aguardando reação;
//   Recibos     H4: o "Recibos no mês" — hml-14b: contado no banco (financeiro_recibos, a função da aba Recibos, só o total);
//   Pré-consulta o contador do menu (respostas novas);
//   e as 2 leituras novas: painel_resumo (principal) e painel-resumo-treino (Treino, com a sessão do Treino).
// Nada aqui grava: o Dashboard só lê (nem cria o calendário padrão, nem as categorias padrão do Financeiro).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, startOfDay } from "date-fns";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { hojeSP } from "@/financeiro/regras";
import { numerosDaAgenda } from "@/agenda/regras";
import { listarAlunos } from "@/painel/alunos/api";
import { useNovosPorMes } from "@/painel/alunos/novosPorMes";
import { FILTROS_PADRAO } from "@/painel/alunos/regras";
import { listarAgendamentos, listarAlunosDaAgenda, listarTags } from "@/painel/agenda/dados";
import { CHAVES_AGENDA } from "@/painel/agenda/useAgenda";
import { paraEvento, type EventoPainel } from "@/painel/agenda/visao";
import { useDiarioDaConta } from "@/painel/dietas/useDiario";
import { podeEscreverNutricao } from "@/painel/dietas/contexto";
import { contarNaoReagidas } from "@/painel/dietas/diarioPainel";
import { contarRecibos, listarCobrancasDoResumo, resumoDoPeriodo } from "@/painel/financeiro/dados";
import { aReceber, fimDoMes, inicioDoMes, kpis, precisamDeAtencao, recebimentos } from "@/painel/financeiro/resumo";
import { CHAVES, useResumoDaConta } from "@/painel/financeiro/useFinanceiro";
import { CHAVES_PRECONSULTA, contarRespostasNovas } from "@/painel/preconsulta/novas";
import { useTreinoDaPagina } from "@/ui/casca/treinoDaPagina";
import { buscarResumoPrincipal, buscarResumoTreino, listarRespostasRecentes } from "./dados";
import {
  adesaoMedia, atencaoDoFinanceiro, atividadeRecente, avaliacoesVencidas, cadastrosPendentes, consultasDeHoje, fotosSemReacao, itensAniversario, juntarAlunos,
  juntarAtencao, preConsultasNovas, profissionaisDasConsultas, semMarcarDieta, semTreinar, ultimosDiasAte,
} from "./regras";

export const CHAVES_DASHBOARD = {
  tudo: ["painel-dashboard"] as const,
  principal: (conta: string, uid: string) => ["painel-dashboard", "principal", conta, uid] as const,
  treino: (conta: string, uid: string) => ["painel-dashboard", "treino", conta, uid] as const,
  alunos: (conta: string) => ["painel-dashboard", "alunos", conta] as const,
  agenda: (uid: string, conta: string, de: string) => ["painel-dashboard", "agenda", uid, conta, de] as const,
  respostas: (conta: string, uid: string, de: string) => ["painel-dashboard", "respostas", conta, uid, de] as const,
};

/** Os calendários que a pessoa escondeu na Agenda (a mesma preferência do aparelho: o "Consultas hoje" bate com o da Agenda). */
const CHAVE_OCULTOS_AGENDA = "physiq.agenda.ocultos";
function calendariosOcultos(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_OCULTOS_AGENDA) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

const paraResumoAgenda = (e: EventoPainel) => ({
  id: e.id, inicio: e.inicio.toISOString(), fim: e.fim.toISOString(), status: e.status, confirmacao: e.confirmacao, modulo: e.modulo,
  paciente_id: e.pacienteId, dia_inteiro: e.diaInteiro,
});

export function useDashboard() {
  const { conta, ehMaster } = useConta();
  const { usuario } = useSessao();
  const sessaoTreino = useTreinoDaPagina();
  const uid = usuario?.id ?? "";
  const contaId = conta?.id ?? "";
  const pronto = !!uid && !!contaId;
  const modulos = useMemo(() => (conta?.modulos ?? []) as ("treino" | "nutricao")[], [conta?.modulos]);
  const papeis = useMemo(() => (conta?.papeis ?? []) as string[], [conta?.papeis]);
  const temTreino = modulos.includes("treino");
  const temNutricao = modulos.includes("nutricao");
  // a regra clínica (W18/W24): o "Diário de hoje" e os itens de dieta só para a nutricionista da conta (ou o master)
  const souNutri = podeEscreverNutricao(papeis, modulos, ehMaster);
  const hoje = hojeSP();

  // ── Alunos ──
  const alunosQ = useQuery({
    queryKey: CHAVES_DASHBOARD.alunos(contaId),
    queryFn: () => listarAlunos(contaId, FILTROS_PADRAO, 0, 0),
    enabled: pronto, staleTime: 60_000, retry: 1,
  });
  const novosQ = useNovosPorMes(pronto ? contaId : null);

  // ── as 2 leituras novas ──
  const principalQ = useQuery({
    queryKey: CHAVES_DASHBOARD.principal(contaId, uid),
    queryFn: () => buscarResumoPrincipal(contaId),
    enabled: pronto, staleTime: 60_000, retry: 1,
  });
  const treinoLigado = pronto && temTreino && sessaoTreino.tipo === "ok";
  const treinoQ = useQuery({
    queryKey: CHAVES_DASHBOARD.treino(contaId, uid),
    queryFn: () => buscarResumoTreino(contaId),
    enabled: treinoLigado, staleTime: 60_000, retry: 1,
  });

  // ── Financeiro (as leituras do Resumo, com as chaves dele) ──
  // hml-14b (D14): o recebido chega somado do banco por dia (financeiro_resumo_periodo — antes: até 1000 lançamentos somados aqui)
  const desdeFin = `${Number(hoje.slice(0, 4)) - 1}-01-01`;
  const transQ = useQuery({ queryKey: CHAVES.resumoTransacoes(contaId), queryFn: () => resumoDoPeriodo(contaId, desdeFin, hoje), enabled: pronto, staleTime: 15_000 });
  const cobsQ = useQuery({
    queryKey: CHAVES.cobrancas(contaId),
    queryFn: () => listarCobrancasDoResumo(contaId, uid, inicioDoMes(hoje), fimDoMes(hoje)),
    enabled: pronto,
    staleTime: 15_000,
  });
  const resumoFinQ = useResumoDaConta({ contaId, pronto });
  // H4: "Recibos no mês" — os recibos da aba Recibos com a data neste mês (o dono vê os da conta; o membro, os dele — a regra do
  // banco); hml-14b: só o total, contado no banco (financeiro_recibos com o período), em vez de baixar a lista (até 1000)
  const recibosQ = useQuery({
    queryKey: CHAVES.recibosNoPeriodo(contaId, inicioDoMes(hoje), fimDoMes(hoje)),
    queryFn: () => contarRecibos(contaId, inicioDoMes(hoje), fimDoMes(hoje)),
    enabled: pronto,
    staleTime: 15_000,
  });
  const recibosMes = recibosQ.data ?? null;

  // ── Agenda: os últimos 14 dias até hoje (o mini gráfico e o "hoje") ──
  const deAgenda = useMemo(() => startOfDay(addDays(new Date(`${hoje}T12:00:00`), -13)), [hoje]);
  const ateAgenda = useMemo(() => startOfDay(addDays(new Date(`${hoje}T12:00:00`), 1)), [hoje]);
  const agendaQ = useQuery({
    queryKey: CHAVES_DASHBOARD.agenda(uid, contaId, deAgenda.toISOString()),
    queryFn: () => listarAgendamentos(deAgenda, ateAgenda, uid, contaId || null),
    enabled: pronto, staleTime: 15_000,
  });
  const alunosAgendaQ = useQuery({ queryKey: CHAVES_AGENDA.alunos(uid, contaId), queryFn: () => listarAlunosDaAgenda(contaId || null, uid), enabled: pronto, staleTime: 60_000 });
  // H1: a pílula da TAG na "Agenda de hoje" — só LER as tags dos profissionais dessas consultas, sempre por profissional_id (o master
  // lê todas pela RLS); sem criar as base (o Dashboard não grava): a consulta sem a tag carregada mostra a base da área
  const profsAgenda = useMemo(() => profissionaisDasConsultas(agendaQ.data ?? []), [agendaQ.data]);
  const tagsAgendaQ = useQuery({
    queryKey: CHAVES_AGENDA.tagsLeitura(profsAgenda.join(",")),
    queryFn: () => listarTags(profsAgenda),
    enabled: pronto && profsAgenda.length > 0, staleTime: 60_000, retry: 1,
  });

  // ── Diário de hoje (W24) e Pré-consulta (o contador do menu) ──
  const diario = useDiarioDaConta(contaId, uid, 1, pronto && temNutricao && souNutri);
  // H4: as fotos sem reação dos últimos 7 dias (a mesma consulta e o mesmo número da aba Diário)
  const diario7 = useDiarioDaConta(contaId, uid, 7, pronto && temNutricao && souNutri);
  const fotosAguardando = temNutricao && souNutri ? contarNaoReagidas(diario7.registros) : 0;
  const novasQ = useQuery({
    queryKey: CHAVES_PRECONSULTA.novas(contaId, uid),
    queryFn: () => contarRespostasNovas(contaId, uid),
    enabled: pronto, staleTime: 60_000, retry: 1,
  });
  const desde7 = useMemo(() => new Date(Date.parse(`${ultimosDiasAte(hoje, 7)[0]}T00:00:00-03:00`)).toISOString(), [hoje]);
  const respostasQ = useQuery({
    queryKey: CHAVES_DASHBOARD.respostas(contaId, uid, desde7),
    queryFn: () => listarRespostasRecentes(contaId, uid, desde7),
    enabled: pronto, staleTime: 60_000, retry: 1,
  });

  // ── as contas ──
  const alunos = useMemo(() => juntarAlunos(principalQ.data?.alunos ?? [], treinoQ.data ?? null), [principalQ.data, treinoQ.data]);
  const dias7 = useMemo(() => ultimosDiasAte(hoje, 7), [hoje]);
  const adesao = useMemo(() => adesaoMedia(alunos, dias7), [alunos, dias7]);

  const financeiro = useMemo(() => {
    if (!transQ.data || !cobsQ.data) return null;
    const recs = recebimentos(transQ.data);
    const lista = aReceber(cobsQ.data, resumoFinQ.data?.alunos ?? [], hoje, new Date());
    return { recs, k: kpis(recs, lista, hoje), atencao: precisamDeAtencao(resumoFinQ.data?.pendentes ?? [], lista) };
  }, [transQ.data, cobsQ.data, resumoFinQ.data, hoje]);

  const agenda = useMemo(() => {
    if (!agendaQ.data) return null;
    const ocultos = calendariosOcultos();
    const mapa = new Map((alunosAgendaQ.data ?? []).map((a) => [a.id, a]));
    const tags = new Map((tagsAgendaQ.data ?? []).map((t) => [t.id, t]));
    const eventos = agendaQ.data.filter((a) => !ocultos.has(a.calendario_id)).map((a) => paraEvento(a, new Map(), mapa, tags));
    return { n: numerosDaAgenda(eventos.map(paraResumoAgenda), hoje), deHoje: consultasDeHoje(eventos, hoje) };
  }, [agendaQ.data, alunosAgendaQ.data, tagsAgendaQ.data, hoje]);
  // a lista do dia espera as tags na 1ª carga (sem piscar "Geral" → "Reunião"); se elas falharem, vale a base da área
  const tagsCarregando = tagsAgendaQ.isLoading;

  const atencao = useMemo(() => {
    const fin = financeiro ? atencaoDoFinanceiro(financeiro.atencao, alunos) : [];
    return juntarAtencao(
      fin,
      semTreinar(alunos, hoje),
      // a data marcada mora no Treino: sem o resumo dele (a nutricionista), só os alunos só de Nutrição
      avaliacoesVencidas(alunos, hoje, Boolean(treinoQ.data)),
      semMarcarDieta(alunos, hoje),
      fotosSemReacao(fotosAguardando),
      cadastrosPendentes(alunosQ.data?.pendentes ?? 0),
      preConsultasNovas(novasQ.data ?? 0),
      itensAniversario(alunos, hoje),
    );
  }, [financeiro, alunos, hoje, alunosQ.data, novasQ.data, treinoQ.data, fotosAguardando]);

  const atividade = useMemo(
    () => atividadeRecente({
      alunos,
      historico: treinoQ.data?.historico ?? [],
      recordes: treinoQ.data?.recordes ?? [],
      comprovantes: (resumoFinQ.data?.pendentes ?? []).map((p) => ({ id: p.id, paciente_id: p.paciente_id, nome: p.aluno?.nome ?? "", enviado_em: p.enviado_em })),
      preConsultas: respostasQ.data ?? [],
      fotos: diario.registros.map((r) => ({ id: r.id, paciente_id: r.paciente_id, refeicao: r.refeicao, data_hora: r.data_hora })),
    }),
    [alunos, treinoQ.data, resumoFinQ.data, respostasQ.data, diario.registros],
  );

  return {
    conta, contaId, uid, pronto, hoje, modulos, temTreino, temNutricao, souNutri, sessaoTreino,
    alunosQ, novosQ, principalQ, treinoQ, treinoLigado, transQ, cobsQ, resumoFinQ, agendaQ, tagsAgendaQ, tagsCarregando, diario, novasQ, respostasQ,
    alunos, adesao, financeiro, agenda, atencao, atividade, diario7, fotosAguardando, recibosQ, recibosMes,
  };
}

export type DadosDashboard = ReturnType<typeof useDashboard>;
