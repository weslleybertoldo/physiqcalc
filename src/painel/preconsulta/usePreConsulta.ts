// Physiq W21 — o que as 2 abas do Painel › Pré-consulta dividem: a conta ativa e quem é você nela (dono vê o da conta; membro, o seu —
// P1; nutricionista com o módulo Nutrição monta a partir da anamnese/questionário e importa), os formulários e as respostas do recorte
// da conta e, para o dono, quem é quem na equipe (o autor dos formulários dos outros). hml-14b (B19): o "Ligar a um aluno" busca no
// banco (SeletorDeAluno) — a lista de até 2000 alunos da conta que vinha daqui saiu. hml-14d (B21 · D35): os números do topo, da aba
// Respostas e dos formulários vêm contados do banco (preconsulta_numeros) — a leitura de até 1000 respostas que vinha daqui saiu.
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { buscarEquipe } from "@/painel/configuracoes/equipe/api";
import { buscarNumerosPreConsulta, listarFormularios, listarModelosAnamnese, listarQuestionarios } from "./dados";
import { CHAVE_NOVAS, CHAVES_PRECONSULTA } from "./novas";
import { inicioDoMesLocal } from "./respostasUtil";

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
  // o mês do navegador (muda a chave na virada do mês); dentro da chave das respostas: ligar, importar ou excluir uma resposta recarrega
  const inicioMes = inicioDoMesLocal().toISOString();
  const numeros = useQuery({
    queryKey: [...CHAVES_PRECONSULTA.respostas(contaId, uid), "numeros", inicioMes],
    queryFn: () => buscarNumerosPreConsulta(contaId, new Date(inicioMes)),
    enabled: pronto,
    staleTime: 15_000,
  });
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
    numerosQ: numeros,
    formularios: formularios.data ?? [],
    /** os números contados no banco (null enquanto carrega ou se falhou — a tela não inventa zero) */
    numeros: numeros.data ?? null,
    modelos: modelos.data ?? [],
    questionarios: questionarios.data ?? [],
    recarregar,
  };
}

export type DadosPreConsulta = ReturnType<typeof useDadosPreConsulta>;
