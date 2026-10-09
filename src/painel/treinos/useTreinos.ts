import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ErroTreinoPainel } from "@/treino/editor/api";
import { mensagemDoErro as mensagemDoEditor } from "@/treino/editor/useEditorTreino";
import { buscarAlunosDoTreino, carregarModeloPorId, carregarMusculos, carregarPaginaDeModelos, carregarPastas, carregarQuemRecebe } from "./api";
import { ESPERA_BUSCA, montarModelos, montarPastas, naOrdemDaPagina, termoDaBusca } from "./regras";
import type { AlunoDaLista, Catalogo, FiltrosModelos, LinhaModelo, PerfilRecebe, QuemMexe } from "./tipos";

/** Quem está no painel, pelo usuário do Treino (o papel vem no JWT da troca de token: master · professor · sem papel). */
export function useQuemMexe(): QuemMexe {
  const { user, papel } = useAuth();
  return useMemo(() => ({ meuId: user?.id ?? null, master: papel === "master", staff: papel === "master" || papel === "professor" }), [user?.id, papel]);
}

// hml-14d (B21): cada lista vem do banco em páginas — uma chave por lista (o "recarregar" invalida as do que mudou)
export const CHAVE_MODELOS = "painel-treinos-modelos";
export const CHAVE_PASTAS = "painel-treinos-pastas";
export const CHAVE_MUSCULOS = "painel-treinos-musculos";
export const CHAVE_EXERCICIOS = "painel-treinos-exercicios";
export const CHAVE_RECEBE = "painel-treinos-quem-recebe";
export const CHAVE_RECEBE_LISTA = "painel-treinos-quem-recebe-lista";
/** a folha "Adicionar exercício" (src/treino/editor/folhas.tsx) */
export const CHAVE_BIBLIOTECA_FOLHA = "treino-biblioteca";

/** Frases das recusas (as do Treino + as das tabelas do catálogo). */
export function mensagemDoErro(e: unknown): string {
  const c = e instanceof ErroTreinoPainel ? e.codigo : e instanceof Error ? e.message : "";
  switch (c) {
    case "repetido":
      return "Já existe um com esse nome.";
    case "em_uso":
      return "Está em uso (nos treinos prontos do app ou em outro lugar): tire de lá antes de excluir.";
    case "sem_permissao":
    case "forbidden":
    case "somente_leitura":
      return "Você só vê isto: quem muda é o dono do treino (o personal) ou o master, no catálogo global.";
    case "grupo_nao_disponivel":
      return "Este aluno não recebe mais este treino. Atualize a página.";
    case "imagem_invalida":
      return "Escolha uma imagem ou um GIF.";
    case "imagem_grande":
      return "A imagem passa de 5 MB.";
    case "upload_falhou":
      return "Não deu para subir a imagem agora. Tente de novo.";
    default:
      return mensagemDoEditor(e);
  }
}

const naoRepetir = (n: number, e: unknown) => !(e instanceof ErroTreinoPainel && ["forbidden", "sem_permissao", "invalid_token"].includes(e.codigo)) && n < 1;

/** hml-14d: o termo digitado depois de `espera` ms sem tecla nova (a busca vai ao banco, não a cada letra). */
export function useTermoComEspera(busca: string, espera = ESPERA_BUSCA): string {
  const [termo, setTermo] = useState(() => termoDaBusca(busca));
  useEffect(() => {
    const t = setTimeout(() => setTermo(termoDaBusca(busca)), espera);
    return () => clearTimeout(t);
  }, [busca, espera]);
  return termo;
}

/** As pastas que a pessoa vê (inteiras — 2 por profissional hoje). */
export function usePastas(q: QuemMexe, habilitado = true) {
  return useQuery({
    queryKey: [CHAVE_PASTAS, q.meuId],
    queryFn: () => carregarPastas(q.meuId),
    enabled: habilitado,
    staleTime: 30_000,
    retry: naoRepetir,
    networkMode: "online",
  });
}

/** Os grupos musculares (globais e meus): o formulário do exercício e a folha "Grupos musculares" da Biblioteca. */
export function useMusculos(q: QuemMexe, habilitado = true) {
  return useQuery({
    queryKey: [CHAVE_MUSCULOS, q.meuId],
    queryFn: () => carregarMusculos(q.meuId),
    enabled: habilitado,
    staleTime: 60_000,
    retry: naoRepetir,
    networkMode: "online",
  });
}

export function useQuemRecebe(q: QuemMexe, grupos: string[], habilitado = true) {
  const chave = useMemo(() => [...grupos].sort().join(","), [grupos]);
  return useQuery({
    queryKey: [CHAVE_RECEBE, q.meuId, chave],
    queryFn: () => carregarQuemRecebe(grupos),
    enabled: habilitado && grupos.length > 0,
    staleTime: 30_000,
    retry: naoRepetir,
    networkMode: "online",
  });
}

/**
 * Tudo o que a aba Meus treinos mostra — hml-14d (B21 · D23): a página de treinos vem do banco (modelos_da_lista: 20, o total, o
 * total sem filtro e os números das pastas) com os detalhes SÓ dos 20; o `?treino=` fora da página é lido pelo id; quem recebe,
 * só dos treinos à vista. Os modelos saem do montarModelos de hoje, na ordem do banco.
 */
export function useTreinosDaTela(q: QuemMexe, filtros: FiltrosModelos, pagina: number, treinoId: string | null) {
  const paginaQ = useQuery({
    queryKey: [CHAVE_MODELOS, q.meuId, "pagina", filtros.q, filtros.pasta ?? "", pagina],
    queryFn: () => carregarPaginaDeModelos(q.meuId, filtros, pagina),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: naoRepetir,
    networkMode: "online",
  });
  const pastasQ = usePastas(q);
  const idsDaPagina = useMemo(() => (paginaQ.data?.itens ?? []).map((m) => m.id), [paginaQ.data]);
  const foraDaPagina = !!treinoId && !!paginaQ.data && !idsDaPagina.includes(treinoId);
  const abertoQ = useQuery({
    queryKey: [CHAVE_MODELOS, q.meuId, "aberto", treinoId ?? ""],
    queryFn: () => carregarModeloPorId(q.meuId, treinoId as string),
    enabled: foraDaPagina,
    staleTime: 30_000,
    retry: naoRepetir,
    networkMode: "online",
  });
  const extra = foraDaPagina ? abertoQ.data ?? null : null;
  const ids = useMemo(() => (extra?.modelo ? [...idsDaPagina, extra.modelo.id] : idsDaPagina), [idsDaPagina, extra]);
  const recebe = useQuemRecebe(q, ids, q.staff);
  const perfis: PerfilRecebe[] = useMemo(() => recebe.data ?? [], [recebe.data]);
  const catalogo: Catalogo | null = useMemo(() => {
    if (!paginaQ.data) return null;
    const d = paginaQ.data.detalhes;
    const x = extra?.modelo ? extra.detalhes : null;
    return {
      modelos: extra?.modelo ? [...paginaQ.data.itens, extra.modelo] : paginaQ.data.itens,
      pastas: pastasQ.data ?? [],
      vinculos: x ? [...d.vinculos, ...x.vinculos] : d.vinculos,
      linhas: x ? [...d.linhas, ...x.linhas] : d.linhas,
      exercicios: x ? [...d.exercicios, ...x.exercicios] : d.exercicios,
      musculos: [],
    };
  }, [paginaQ.data, pastasQ.data, extra]);
  const todos = useMemo(() => (catalogo ? naOrdemDaPagina(montarModelos(catalogo, q, perfis), ids) : []), [catalogo, q, perfis, ids]);
  const modelos = useMemo(() => todos.filter((m) => idsDaPagina.includes(m.id)), [todos, idsDaPagina]);
  const porPasta = paginaQ.data?.porPasta;
  const pastas = useMemo(() => montarPastas(pastasQ.data ?? [], porPasta ?? {}, q), [pastasQ.data, porPasta, q]);
  // quantos alunos recebem cada modelo só vale depois do "quem recebe" (quem não tem papel no Treino não vê)
  const alunosProntos = q.staff && (ids.length === 0 || recebe.data !== undefined);
  return {
    pagina: paginaQ,
    pastasQ,
    abertoQ,
    recebe,
    perfis,
    /** os treinos da página, montados, na ordem do banco */
    modelos,
    /** os da página + o aberto por id (fora da página) */
    todos,
    pastas,
    linhas: catalogo?.linhas ?? [],
    total: paginaQ.data?.total ?? 0,
    totalGeral: paginaQ.data?.totalGeral ?? 0,
    alunosProntos,
  };
}

type ComDetalhes = { detalhes?: { linhas: LinhaModelo[] } };

/** A linha do modelo no cache (a página ou o treino aberto por id): o que a tela mostra agora (a gravação anterior já aplicada). */
export function linhaNoCache(qc: QueryClient, grupoId: string, exercicioId: string | null | undefined): LinhaModelo | undefined {
  for (const [, d] of qc.getQueriesData<ComDetalhes>({ queryKey: [CHAVE_MODELOS] })) {
    const l = d?.detalhes?.linhas.find((x) => x.grupo_id === grupoId && x.exercicio_id === exercicioId);
    if (l) return l;
  }
  return undefined;
}

/** Muda a linha do modelo em todo cache de Meus treinos (a tela atualiza na hora; o próximo campo parte do valor novo). */
export function mudarLinhaNoCache(qc: QueryClient, grupoId: string, exercicioId: string | null | undefined, colunas: Partial<LinhaModelo>): void {
  qc.setQueriesData<ComDetalhes>({ queryKey: [CHAVE_MODELOS] }, (d) =>
    d?.detalhes
      ? { ...d, detalhes: { ...d.detalhes, linhas: d.detalhes.linhas.map((l) => (l.grupo_id === grupoId && l.exercicio_id === exercicioId ? { ...l, ...colunas } : l)) } }
      : d,
  );
}

/** Recarrega o que a ação mudou (o catálogo — treinos, pastas, biblioteca, músculos — e/ou quem recebe). */
export function useRecarregar() {
  const qc = useQueryClient();
  return useMemo(() => {
    const inv = (k: string) => qc.invalidateQueries({ queryKey: [k] });
    const catalogo = () => Promise.all([inv(CHAVE_MODELOS), inv(CHAVE_PASTAS), inv(CHAVE_EXERCICIOS), inv(CHAVE_MUSCULOS), inv(CHAVE_BIBLIOTECA_FOLHA)]);
    const recebe = () => Promise.all([inv(CHAVE_RECEBE), inv(CHAVE_RECEBE_LISTA)]);
    return { catalogo, recebe, tudo: () => Promise.all([catalogo(), recebe()]) };
  }, [qc]);
}

// ───────────────────────── seletor de aluno do Treino (B19 · D26) ─────────────────────────

export interface ResultadoSeletorTreino {
  /** o termo que o banco respondeu (já normalizado) */
  termo: string;
  itens: AlunoDaLista[];
  /** quantos alunos a busca tem no banco (o "20 de N") */
  total: number;
}

/**
 * A busca do seletor de aluno do Histórico e do Relatório: espera `espera` ms depois da última tecla (ao abrir a lista, sai na
 * hora), pede os 20 primeiros e o total à lista de alunos do Treino (admin-list-users, em ordem de nome) e DESCARTA resposta velha
 * — cada pedido leva um número e só o último muda a tela (o molde do seletor da 14b).
 */
export function useBuscaDeAlunosTreino({ q, termo, ligada, espera = ESPERA_BUSCA }: { q: QuemMexe; termo: string; ligada: boolean; espera?: number }) {
  const [resultado, setResultado] = useState<ResultadoSeletorTreino | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [buscando, setBuscando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const pedido = useRef(0);
  const ligadaAntes = useRef(false);
  const t = termoDaBusca(termo);

  useEffect(() => {
    const acabouDeAbrir = ligada && !ligadaAntes.current;
    ligadaAntes.current = ligada;
    if (!ligada) return;
    const meu = ++pedido.current;
    setBuscando(true);
    const timer = setTimeout(() => {
      setErro(null);
      buscarAlunosDoTreino(q, t).then(
        (r) => {
          if (meu !== pedido.current) return; // resposta velha: já saiu um pedido depois deste
          setResultado({ termo: t, itens: r.itens, total: r.total });
          setErro(null);
          setBuscando(false);
        },
        (e: unknown) => {
          if (meu !== pedido.current) return;
          setErro(e);
          setBuscando(false);
        },
      );
    }, acabouDeAbrir ? 0 : espera);
    return () => clearTimeout(timer);
  }, [q, t, ligada, espera, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  return { resultado, erro, buscando, tentarDeNovo };
}
