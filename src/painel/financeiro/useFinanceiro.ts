// Physiq W19 — o que as abas do Painel › Financeiro dividem: a conta ativa, quem é você nela, o padrão do recibo pelo seu papel,
// o nome com que você assina (o mesmo do site antigo: profiles.nome), as suas categorias e modelos (de cada profissional — P23),
// os alunos da conta para os seletores e, para o dono, quem é quem na equipe (assinatura e autor dos registros dos outros).
import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { buscarMensalidadesDaConta, buscarResumoDaConta } from "@/financeiro/api";
import { buscarEquipe } from "@/painel/configuracoes/equipe/api";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";
import { garantirCategorias, garantirModelosRecibo, listarAlunosDaConta, nomeDoProfissional, ultimoNumeroRecibo, type FiltrosLancamentos } from "./dados";
import { padraoDoRecibo, rotuloAutor } from "./recibosUtil";

export const CHAVES = {
  /** o prefixo de tudo que vem dos lançamentos: recarregar("transacoes") atualiza a página, os totais e as recentes */
  transacoesTodas: ["fin-transacoes"] as const,
  /** hml-14b: uma página de Lançamentos (o total vem junto) */
  lancamentos: (conta: string, de: string, ate: string, f: FiltrosLancamentos, pagina: number) =>
    ["fin-transacoes", conta, "pagina", de, ate, f.tipo, f.categoria, f.metodo, f.q, pagina] as const,
  /** hml-14b: os totais do período com os filtros (financeiro_resumo_periodo) */
  totais: (conta: string, de: string, ate: string, f: FiltrosLancamentos) => ["fin-transacoes", conta, "totais", de, ate, f.tipo, f.categoria, f.metodo, f.q] as const,
  /** as 6 movimentações mais recentes do Resumo */
  recentes: (conta: string, de: string, ate: string) => ["fin-transacoes", conta, "recentes", de, ate] as const,
  categorias: (uid: string) => ["fin-categorias", uid] as const,
  alunos: (conta: string) => ["fin-alunos", conta] as const,
  /** o prefixo dos recibos da conta: a página da aba Recibos e o "Recibos no mês" do Dashboard */
  recibos: (conta: string) => ["fin-recibos", conta] as const,
  recibosPagina: (conta: string, busca: string, pagina: number) => ["fin-recibos", conta, "pagina", busca, pagina] as const,
  recibosNoPeriodo: (conta: string, de: string, ate: string) => ["fin-recibos", conta, "periodo", de, ate] as const,
  modelos: (uid: string) => ["fin-modelos-recibo", uid] as const,
  ultimo: (uid: string) => ["fin-ultimo-recibo", uid] as const,
  /** a mesma chave da W6 (Configurações › Recebimento e o painel lateral "Cobrança"): confirmar um Pix atualiza os 2 */
  resumoConta: (conta: string) => ["financeiro-resumo-conta", conta] as const,
  /** hml-14b: a página de Mensalidades (prof_resumo com `pagina`) — debaixo da chave da W6, para atualizar junto */
  mensalidades: (conta: string, pagina: number, paginaSem: number, busca: string) => ["financeiro-resumo-conta", conta, "pagina", pagina, paginaSem, busca] as const,
  cobrancas: (conta: string) => ["fin-cobrancas-resumo", conta] as const,
  resumoTransacoes: (conta: string) => ["fin-transacoes-resumo", conta] as const,
  nome: (uid: string) => ["fin-nome-profissional", uid] as const,
  equipe: (conta: string) => ["fin-equipe", conta] as const,
};

export interface Pessoa {
  nome: string;
  papeis: string[];
}

/**
 * `categorias` desligadas = quem só emite recibo (a aba Financeiro do aluno) não busca a lista à toa. hml-14b (B19): os campos de
 * aluno dos diálogos buscam no banco (SeletorDeAluno) — a lista de até 1000 alunos da conta (`alunos`) só sai se alguém pedir
 * `alunos: true` (ninguém pede; ela e listarAlunosDaConta saem na integração, quando paginas/Financeiro.tsx parar de passá-la).
 */
export function useFinanceiroConta(opcoes: { alunos?: boolean; categorias?: boolean } = {}) {
  const querAlunos = opcoes.alunos ?? false;
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

/**
 * hml-14b (B21): a página de Mensalidades — prof_resumo com `pagina` (os com mensalidade), `pagina_sem` (os sem) e a `busca`: o
 * servidor filtra, ordena, conta e devolve só as 2 páginas, os números da conta e os comprovantes aguardando.
 */
export function useMensalidadesDaConta(f: Pick<FinanceiroConta, "contaId" | "pronto">, p: { pagina: number; paginaSem: number; busca: string }) {
  return useQuery({
    queryKey: CHAVES.mensalidades(f.contaId, p.pagina, p.paginaSem, p.busca),
    enabled: f.pronto,
    queryFn: () => buscarMensalidadesDaConta(f.contaId, p),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/**
 * hml-14b (B21 · D13): a página de uma lista do Financeiro no endereço (`chave`), com o total que chega na resposta da própria
 * página (`informarTotal` — página além do fim vai para a última). O filtro mudou → volta à 1 (usePaginaNaUrl).
 */
export function usePaginaComTotal(opcoes: { chave: string; filtro: unknown }) {
  const [total, informarTotal] = useState<number | null>(null);
  const { pagina, irPara } = usePaginaNaUrl({ chave: opcoes.chave, filtro: opcoes.filtro, total });
  return { pagina, irPara, informarTotal };
}
