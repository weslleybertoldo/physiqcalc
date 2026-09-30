/**
 * Os dados que os cards do Início (W12) dividem com as outras abas — as MESMAS consultas, com as MESMAS chaves (o cache do
 * React Query é um só: abrir o Perfil › Agenda depois do Início não busca de novo, e os números batem):
 *   · "Meus profissionais" e o nome/foto do aluno → `["perfil-aluno", uid]` (a aba Perfil, W7);
 *   · a agenda → `["agenda-aluno", uid]` (Perfil › Agenda, W7);
 *   · a dieta, as metas e os ✓ → `useDieta()` (a aba Dieta, W11);
 *   · o treino → `useTreinoDoDia()` (a aba Treino, W8 — o SQLite do PowerSync, sem internet);
 *   · o peso → `useEvolucaoDoAluno()` (a aba Evolução, W10 — com o que já foi aberto guardado no aparelho).
 */
import { useQuery } from "@tanstack/react-query";
import { useSessao } from "@/nucleo/sessao";
import { matriculaDoApp, temAlimentacaoDoApp } from "@/nucleo/situacao";
import { meuPerfilAluno, minhaAgenda } from "@/app-aluno/perfil/pecas/api";
import { inicioDaAgenda } from "@/app-aluno/perfil/pecas/regras";
import { useDadosCasca } from "@/ui/casca/dadosCasca";

export function usePerfilDoAluno() {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  return useQuery({ queryKey: ["perfil-aluno", uid], queryFn: meuPerfilAluno, enabled: Boolean(uid), staleTime: 60_000, retry: 1, networkMode: "online" });
}

export function useAgendaDoAluno(ativo = true) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  return useQuery({
    queryKey: ["agenda-aluno", uid],
    queryFn: () => minhaAgenda(inicioDaAgenda()),
    enabled: Boolean(uid) && ativo,
    staleTime: 60_000,
    retry: 1,
    networkMode: "online",
  });
}

/**
 * O que o aluno tem (decide os cards — spec 4.3: aba sem módulo some, e o card dela também):
 *   · treino / nutricao = os módulos do aluno (os mesmos da barra de abas);
 *   · comNutricionista = alguma matrícula com nutricionista (a Dieta com plano, metas e ✓);
 *   · pratosProntos = aluno do app no Treino + Alimentação sem nutricionista (a Dieta dele são os pratos prontos — W7b);
 *   · semProfissional = aluno do app (W7b: sem agenda nem avaliação — os cards da consulta e do peso ficam de fora).
 */
export function useOQueOAlunoTem() {
  const { modulosAluno } = useDadosCasca();
  const { situacao } = useSessao();
  const doApp = matriculaDoApp(situacao);
  const matriculas = situacao?.matriculas ?? [];
  const comNutricionista = matriculas.some((m) => m.ativo !== false && !m.app && m.modulos.includes("nutricao"));
  const comPersonal = matriculas.some((m) => m.ativo !== false && !m.app && m.modulos.includes("treino"));
  const treino = modulosAluno.includes("treino");
  const nutricao = modulosAluno.includes("nutricao");
  return {
    treino,
    nutricao,
    comNutricionista: nutricao && comNutricionista,
    pratosProntos: nutricao && !comNutricionista && temAlimentacaoDoApp(doApp),
    semProfissional: !!doApp && !comNutricionista && !comPersonal,
    doApp,
  };
}
