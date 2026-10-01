// Physiq W19 — o que as abas do Painel › Financeiro dividem: a conta ativa, quem é você nela, o padrão do recibo pelo seu papel,
// o nome com que você assina (o mesmo do site antigo: profiles.nome), as suas categorias e modelos (de cada profissional — P23),
// os alunos da conta para os seletores e, para o dono, quem é quem na equipe (assinatura e autor dos registros dos outros).
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { buscarResumoDaConta } from "@/financeiro/api";
import { buscarEquipe } from "@/painel/configuracoes/equipe/api";
import { garantirCategorias, garantirModelosRecibo, listarAlunosDaConta, nomeDoProfissional, ultimoNumeroRecibo } from "./dados";
import { padraoDoRecibo, rotuloAutor } from "./recibosUtil";

export const CHAVES = {
  transacoes: (conta: string, de: string, ate: string) => ["fin-transacoes", conta, de, ate] as const,
  transacoesTodas: ["fin-transacoes"] as const,
  categorias: (uid: string) => ["fin-categorias", uid] as const,
  alunos: (conta: string) => ["fin-alunos", conta] as const,
  recibos: (conta: string) => ["fin-recibos", conta] as const,
  modelos: (uid: string) => ["fin-modelos-recibo", uid] as const,
  ultimo: (uid: string) => ["fin-ultimo-recibo", uid] as const,
  /** a mesma chave da W6 (Configurações › Recebimento e o painel lateral "Cobrança"): confirmar um Pix atualiza os 2 */
  resumoConta: (conta: string) => ["financeiro-resumo-conta", conta] as const,
  cobrancas: (conta: string) => ["fin-cobrancas-resumo", conta] as const,
  resumoTransacoes: (conta: string) => ["fin-transacoes-resumo", conta] as const,
  nome: (uid: string) => ["fin-nome-profissional", uid] as const,
  equipe: (conta: string) => ["fin-equipe", conta] as const,
};

export interface Pessoa {
  nome: string;
  papeis: string[];
}

/** `alunos`/`categorias` desligados = quem só emite recibo (a aba Financeiro do aluno) não busca a lista da conta à toa. */
export function useFinanceiroConta(opcoes: { alunos?: boolean; categorias?: boolean } = {}) {
  const querAlunos = opcoes.alunos ?? true;
  const querCategorias = opcoes.categorias ?? true;
  const { conta, ehDono } = useConta();
  const { usuario, situacao } = useSessao();
  const qc = useQueryClient();
  const uid = usuario?.id ?? "";
  const contaId = conta?.id ?? "";
  const papeis = useMemo(() => (conta?.papeis ?? []) as string[], [conta?.papeis]);
  const padrao = useMemo(() => padraoDoRecibo(papeis), [papeis]);
  const pronto = !!uid && !!contaId;

  const nome = useQuery({ queryKey: CHAVES.nome(uid), queryFn: () => nomeDoProfissional(uid), enabled: !!uid, staleTime: 5 * 60_000 });
  const equipe = useQuery({ queryKey: CHAVES.equipe(contaId), queryFn: () => buscarEquipe(contaId), enabled: pronto && ehDono, staleTime: 60_000, retry: 1 });
  const categorias = useQuery({ queryKey: CHAVES.categorias(uid), queryFn: () => garantirCategorias(uid, contaId || null), enabled: pronto && querCategorias, staleTime: 60_000 });
  const alunos = useQuery({ queryKey: CHAVES.alunos(contaId), queryFn: () => listarAlunosDaConta(contaId), enabled: pronto && querAlunos, staleTime: 60_000 });
  const modelos = useQuery({ queryKey: CHAVES.modelos(uid), queryFn: () => garantirModelosRecibo(uid, contaId || null, padrao.conteudoModelo), enabled: pronto, staleTime: 60_000 });
  const ultimo = useQuery({ queryKey: CHAVES.ultimo(uid), queryFn: () => ultimoNumeroRecibo(uid), enabled: pronto });

  // a lista de categorias ainda não chegou (ou não veio): as telas mostram o esqueleto/o aviso, nunca "nenhuma categoria"
  const categoriasCarregando = !categorias.data && !categorias.isError;
  const categoriasErro = !categorias.data && categorias.isError;

  const nomeProfissional = nome.data ?? situacao?.nome ?? null;
  const pessoas = useMemo(() => {
    const mapa = new Map<string, Pessoa>();
    for (const m of equipe.data?.membros ?? []) if (m.user_id) mapa.set(m.user_id, { nome: m.nome, papeis: m.papeis });
    if (uid) mapa.set(uid, { nome: nomeProfissional ?? mapa.get(uid)?.nome ?? "Profissional", papeis });
    return mapa;
  }, [equipe.data, uid, nomeProfissional, papeis]);

  /** A assinatura de um registro: o nome e o título de quem o criou (o seu, quando é seu). */
  const assinaturaDe = useCallback((autorId: string | null | undefined) => {
    const p = (autorId && pessoas.get(autorId)) || null;
    const papeisAutor = p?.papeis ?? (autorId === uid ? papeis : []);
    return { nome: p?.nome ?? (autorId === uid ? nomeProfissional : null), padrao: padraoDoRecibo(papeisAutor), rotulo: rotuloAutor(p?.nome, papeisAutor) };
  }, [pessoas, uid, papeis, nomeProfissional]);

  const recarregar = useCallback(async (...grupos: Array<"transacoes" | "categorias" | "recibos" | "modelos" | "resumo" | "alunos">) => {
    const todos = grupos.length ? grupos : (["transacoes", "categorias", "recibos", "modelos", "resumo"] as const);
    const chaves: (readonly unknown[])[] = [];
    for (const g of todos) {
      if (g === "transacoes") chaves.push(CHAVES.transacoesTodas, CHAVES.resumoTransacoes(contaId));
      if (g === "categorias") chaves.push(CHAVES.categorias(uid), CHAVES.transacoesTodas);
      if (g === "recibos") chaves.push(CHAVES.recibos(contaId), CHAVES.ultimo(uid), CHAVES.transacoesTodas, ["financeiro-recibos"], ["financeiro-lancamentos"]);
      if (g === "modelos") chaves.push(CHAVES.modelos(uid), ["financeiro-modelos-recibo", uid]);
      if (g === "resumo") chaves.push(CHAVES.resumoConta(contaId), CHAVES.cobrancas(contaId), CHAVES.resumoTransacoes(contaId));
      if (g === "alunos") chaves.push(CHAVES.alunos(contaId));
    }
    await Promise.all(chaves.map((k) => qc.invalidateQueries({ queryKey: [...k] })));
  }, [qc, contaId, uid]);

  return {
    conta, contaId, uid, dono: ehDono, papeis, padrao, pronto, nomeProfissional, pessoas, assinaturaDe, recarregar,
    categorias, categoriasCarregando, categoriasErro, alunos, modelos, ultimo, equipe,
  };
}

export type FinanceiroConta = ReturnType<typeof useFinanceiroConta>;

/** Os alunos da conta com a mensalidade e os comprovantes aguardando (pagamentos-aluno › prof_resumo — W6), com a chave da W6. */
export function useResumoDaConta(f: Pick<FinanceiroConta, "contaId" | "pronto">) {
  return useQuery({ queryKey: CHAVES.resumoConta(f.contaId), enabled: f.pronto, queryFn: () => buscarResumoDaConta(f.contaId), staleTime: 15_000 });
}
