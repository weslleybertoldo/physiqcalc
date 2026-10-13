// Physiq W-A P3 — as rotinas do aluno no React Query: a MESMA consulta no card do Início, na página /perfil/rotinas, no aviso global dos
// lembretes e (P5) na seção da Dieta — aluno-dia { acao: "ler", q: "rotinas", de: ontem, ate: hoje } (as vivas + as feitas de ontem e de
// hoje, o dia de São Paulo). A chave leva o dia: virou o dia, a consulta é outra. O ✓ é otimista (volta se a função recusar).
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ErroAlunoDia, lerMinhasRotinas, marcarRotina, mensagemErroAlunoDia } from "@/aluno-dia/api";
import { hojeSP, ontemSP } from "@/aluno-dia/regras";
import type { MinhasRotinas } from "@/aluno-dia/tipos";
import { useSessao } from "@/nucleo/sessao";
import { comFeita } from "./regras";

export const CHAVE_ROTINAS = "rotinas-aluno";

/** A frase fixa do erro (a do código da função; nunca a mensagem crua). */
export const fraseDoErro = (e: unknown): string => (e instanceof ErroAlunoDia ? e.message : mensagemErroAlunoDia(null));

/** Relê as rotinas deste login (todas as chaves de dia). */
export const atualizarRotinas = (qc: QueryClient, uid: string | null): Promise<void> => qc.invalidateQueries({ queryKey: [CHAVE_ROTINAS, uid] });

export function useMinhasRotinas(ativo = true) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  const hoje = hojeSP();
  return useQuery({
    queryKey: [CHAVE_ROTINAS, uid, hoje],
    queryFn: () => lerMinhasRotinas(ontemSP(), hoje),
    enabled: Boolean(uid) && ativo,
    staleTime: 60_000,
    // a nova tentativa é a do app (1, com 1 s — src/integrations/consultas.ts); sem rede, espera ela voltar
    networkMode: "online",
  });
}

export interface MarcarRotina {
  id: string;
  dia: string;
  feita: boolean;
}

/** O ✓ (hoje ou ontem — o banco recusa outro dia): otimista em todas as chaves deste login; erro → volta; no fim, relê. */
export function useMarcarRotina() {
  const qc = useQueryClient();
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  return useMutation({
    mutationFn: (v: MarcarRotina) => marcarRotina(v.id, v.dia, v.feita),
    onMutate: async (v: MarcarRotina) => {
      await qc.cancelQueries({ queryKey: [CHAVE_ROTINAS, uid] });
      const antes = qc.getQueriesData<MinhasRotinas>({ queryKey: [CHAVE_ROTINAS, uid] });
      qc.setQueriesData<MinhasRotinas>({ queryKey: [CHAVE_ROTINAS, uid] }, (d) => (d ? comFeita(d, v.id, v.dia, v.feita) : d));
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      for (const [chave, d] of ctx?.antes ?? []) qc.setQueryData(chave, d);
    },
    onSettled: () => atualizarRotinas(qc, uid),
  });
}
