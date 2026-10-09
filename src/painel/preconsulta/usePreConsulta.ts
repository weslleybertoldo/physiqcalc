// Physiq W21 — o que as 2 abas do Painel › Pré-consulta dividem: a conta ativa e quem é você nela (dono vê o da conta; membro, o seu —
// P1; nutricionista com o módulo Nutrição monta a partir da anamnese/questionário e importa), os formulários e as respostas do recorte
// da conta e, para o dono, quem é quem na equipe (o autor dos formulários dos outros). hml-14b (B19): o "Ligar a um aluno" busca no
// banco (SeletorDeAluno) — a lista de até 2000 alunos da conta que vinha daqui saiu.
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { buscarEquipe } from "@/painel/configuracoes/equipe/api";
import { listarFormularios, listarModelosAnamnese, listarQuestionarios, listarRespostas } from "./dados";
import { CHAVE_NOVAS, CHAVES_PRECONSULTA } from "./novas";

export interface PessoaPreConsulta {
  nome: string;
  papeis: string[];
}

export function useContextoPreConsulta() {
  const { conta, ehDono } = useConta();
  const { usuario, situacao } = useSessao();
  const uid = usuario?.id ?? "";
  const contaId = conta?.id ?? "";
  const papeis = useMemo(() => (conta?.papeis ?? []) as string[], [conta?.papeis]);
  const modulos = useMemo(() => (conta?.modulos ?? []) as string[], [conta?.modulos]);
  /** nutricionista da conta COM o módulo Nutrição (a regra do banco: tenho_papel) — monta da anamnese/questionário e importa */
  const souNutri = papeis.includes("nutricionista") && modulos.includes("nutricao");
  const equipe = useQuery({ queryKey: CHAVES_PRECONSULTA.equipe(contaId), queryFn: () => buscarEquipe(contaId), enabled: !!contaId && ehDono, staleTime: 5 * 60_000, retry: 1 });
  /** quem é quem na equipe (para o dono): o nome do autor dos formulários dos outros e se ele é nutricionista da conta */
  const pessoas = useMemo(() => {
    const mapa = new Map<string, PessoaPreConsulta>();
    for (const m of equipe.data?.membros ?? []) if (m.user_id) mapa.set(m.user_id, { nome: m.nome, papeis: m.papeis as string[] });
    if (uid) mapa.set(uid, { nome: situacao?.nome ?? mapa.get(uid)?.nome ?? "Você", papeis });
    return mapa;
  }, [equipe.data, uid, situacao?.nome, papeis]);
  return { uid, contaId, conta, dono: ehDono, souNutri, papeis, modulos, pessoas, pronto: !!uid && !!contaId };
}

export type ContextoPreConsulta = ReturnType<typeof useContextoPreConsulta>;

export function useDadosPreConsulta(ctx: ContextoPreConsulta) {
  const qc = useQueryClient();
  const { uid, contaId, pronto, souNutri } = ctx;
  const formularios = useQuery({ queryKey: CHAVES_PRECONSULTA.formularios(contaId, uid), queryFn: () => listarFormularios(contaId, uid), enabled: pronto, staleTime: 30_000 });
  const respostas = useQuery({ queryKey: CHAVES_PRECONSULTA.respostas(contaId, uid), queryFn: () => listarRespostas(contaId, uid), enabled: pronto, staleTime: 15_000 });
  // origens clínicas (modelos de anamnese e questionários): só para a nutricionista (decisão da W21 — o resto monta em branco)
  const modelos = useQuery({ queryKey: CHAVES_PRECONSULTA.modelos(uid), queryFn: listarModelosAnamnese, enabled: pronto && souNutri, staleTime: 5 * 60_000 });
  const questionarios = useQuery({ queryKey: CHAVES_PRECONSULTA.questionarios(uid), queryFn: () => listarQuestionarios(), enabled: pronto && souNutri, staleTime: 5 * 60_000 });

  /** Depois de gravar: as listas da página e o número do menu. */
  const recarregar = useCallback(async (o: "formularios" | "respostas" | "tudo" = "tudo") => {
    const alvos = o === "tudo" ? [CHAVES_PRECONSULTA.tudo] : [o === "formularios" ? CHAVES_PRECONSULTA.formularios(contaId, uid) : CHAVES_PRECONSULTA.respostas(contaId, uid)];
    await Promise.all([...alvos.map((queryKey) => qc.invalidateQueries({ queryKey })), qc.invalidateQueries({ queryKey: CHAVE_NOVAS })]);
  }, [qc, contaId, uid]);

  return {
    formulariosQ: formularios,
    respostasQ: respostas,
    formularios: formularios.data ?? [],
    respostas: respostas.data ?? [],
    modelos: modelos.data ?? [],
    questionarios: questionarios.data ?? [],
    recarregar,
  };
}

export type DadosPreConsulta = ReturnType<typeof useDadosPreConsulta>;
