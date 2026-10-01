import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ErroTreinoPainel } from "@/treino/editor/api";
import { mensagemDoErro as mensagemDoEditor } from "@/treino/editor/useEditorTreino";
import { carregarAlunos, carregarCatalogo, carregarQuemRecebe } from "./api";
import { montarModelos, montarPastas } from "./regras";
import type { PerfilRecebe, QuemMexe } from "./tipos";

/** Quem está no painel, pelo usuário do Treino (o papel vem no JWT da troca de token: master · professor · sem papel). */
export function useQuemMexe(): QuemMexe {
  const { user, papel } = useAuth();
  return useMemo(() => ({ meuId: user?.id ?? null, master: papel === "master", staff: papel === "master" || papel === "professor" }), [user?.id, papel]);
}

export const CHAVE_CATALOGO = "painel-treinos-catalogo";
export const CHAVE_ALUNOS = "painel-treinos-alunos";
export const CHAVE_RECEBE = "painel-treinos-quem-recebe";

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

export function useCatalogo(q: QuemMexe, habilitado = true) {
  return useQuery({
    queryKey: [CHAVE_CATALOGO, q.meuId],
    queryFn: () => carregarCatalogo(q.meuId),
    enabled: habilitado,
    staleTime: 30_000,
    retry: naoRepetir,
    networkMode: "online",
  });
}

/** Os alunos da lista do profissional ("Quem recebe", Histórico e Relatório). */
export function useAlunosDaLista(q: QuemMexe, habilitado = true) {
  return useQuery({
    queryKey: [CHAVE_ALUNOS, q.meuId, q.master],
    queryFn: () => carregarAlunos(q.master, q.meuId),
    enabled: habilitado && q.staff,
    staleTime: 5 * 60_000,
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

/** Tudo o que a aba Meus treinos mostra, montado (os números da tela saem daqui). */
export function useTreinosDaTela(q: QuemMexe, habilitado = true) {
  const catalogo = useCatalogo(q, habilitado);
  const alunos = useAlunosDaLista(q, habilitado);
  const idsModelos = useMemo(() => (catalogo.data?.modelos ?? []).map((m) => m.id), [catalogo.data]);
  const recebe = useQuemRecebe(q, idsModelos, habilitado && q.staff);
  const meusAlunos = useMemo(() => new Set((alunos.data ?? []).map((a) => a.id)), [alunos.data]);
  const perfis: PerfilRecebe[] = useMemo(() => recebe.data ?? [], [recebe.data]);
  const modelos = useMemo(() => (catalogo.data ? montarModelos(catalogo.data, q, perfis, meusAlunos) : []), [catalogo.data, q, perfis, meusAlunos]);
  const pastas = useMemo(() => (catalogo.data ? montarPastas(catalogo.data, q) : []), [catalogo.data, q]);
  // quantos alunos recebem cada modelo só vale depois de carregar a lista e o "quem recebe" (quem não tem papel no Treino não vê)
  const alunosProntos = q.staff && alunos.data !== undefined && (idsModelos.length === 0 || recebe.data !== undefined);
  return { catalogo, alunos, recebe, perfis, modelos, pastas, alunosProntos };
}

/** Recarrega o que a ação mudou (o catálogo e/ou quem recebe). */
export function useRecarregar() {
  const qc = useQueryClient();
  return {
    catalogo: () => qc.invalidateQueries({ queryKey: [CHAVE_CATALOGO] }),
    recebe: () => qc.invalidateQueries({ queryKey: [CHAVE_RECEBE] }),
    tudo: () => Promise.all([qc.invalidateQueries({ queryKey: [CHAVE_CATALOGO] }), qc.invalidateQueries({ queryKey: [CHAVE_RECEBE] })]),
  };
}
