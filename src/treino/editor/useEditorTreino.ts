import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { chaveData, datasDaSemana } from "@/treino/datas";
import {
  ErroTreinoPainel,
  acharAlunoNoTreino,
  adicionarExercicio,
  aplicarPadraoATodos,
  carregarEditor,
  carregarSemanaAtual,
  carregarVolume,
  novoTreino,
  ordenarExercicios,
  removerExercicio,
  salvarAlternado,
  salvarConfig,
  salvarDia,
  salvarExtras,
  salvarObservacao,
  salvarPrescricao,
  tirarTreino,
  usarTreino,
} from "./api";
import { idsDaChave, montarTreinos } from "./regras";
import type { ConfigTreinoAluno, DadosEditor, ExercicioEditor, PrescricaoEditavel, TreinoEditor } from "./tipos";

export const chaveEditor = (treinoUserId: string | null) => ["treino-editor", treinoUserId] as const;

/** Frases das recusas das funções do Treino (o resto vira "Não deu para salvar"). */
export function mensagemDoErro(e: unknown): string {
  const c = e instanceof ErroTreinoPainel ? e.codigo : e instanceof Error ? e.message : "";
  switch (c) {
    case "sem_internet":
      return "Sem internet: nada foi salvo. Tente quando a conexão voltar.";
    case "forbidden":
    case "somente_leitura":
      return "Você pode ver o treino deste aluno, mas quem muda é o personal responsável.";
    case "plano_vencido":
      return "O plano da conta venceu: o treino fica só para ver até pagar.";
    case "rate_limited":
      return "Muitas mudanças seguidas. Espere alguns segundos e tente de novo.";
    case "ja_no_treino":
      return "Esse exercício já está no treino.";
    case "exercicio_invisivel":
      return "Esse exercício não aparece no app deste aluno.";
    case "reps_invalidas":
      return "Repetições: um número (10) ou uma faixa (8-12).";
    case "descanso_invalido":
      return "Descanso entre 5 s e 15 min.";
    case "carga_invalida":
      return "Carga entre 0,25 e 999 kg.";
    case "nome_invalido":
      return "Dê um nome ao treino (até 60 letras).";
    case "data_invalida":
      return "Data inválida.";
    default:
      return "Não deu para salvar agora. Tente de novo.";
  }
}

/** O usuário do Banco do Treino do aluno da rota (null = ainda não entrou no app). */
export function useAlunoNoTreino(alunoIdDaRota: string, treinoUserId: string | null | undefined, temLogin: boolean, habilitado: boolean) {
  return useQuery({
    queryKey: ["treino-aluno-id", alunoIdDaRota, treinoUserId ?? null, temLogin],
    queryFn: () => acharAlunoNoTreino(alunoIdDaRota, treinoUserId ?? null, temLogin),
    enabled: habilitado && !!alunoIdDaRota,
    staleTime: 5 * 60_000,
    retry: (n, e) => !(e instanceof ErroTreinoPainel && ["forbidden", "sem_acesso", "aluno_inexistente"].includes(e.codigo)) && n < 1,
    networkMode: "online",
  });
}

/** Tudo o que o editor mostra (ação `get`) + os treinos montados. */
export function useDadosEditor(treinoUserId: string | null) {
  const q = useQuery({
    queryKey: chaveEditor(treinoUserId),
    queryFn: () => carregarEditor(treinoUserId!),
    enabled: !!treinoUserId,
    staleTime: 30_000,
    retry: (n, e) => !(e instanceof ErroTreinoPainel && ["forbidden", "invalid_token"].includes(e.codigo)) && n < 1,
    networkMode: "online",
  });
  const treinos = useMemo(() => montarTreinos(q.data), [q.data]);
  return { ...q, treinos };
}

/** A semana de hoje (Seg–Dom): trocas do dia e treinos feitos — o "N de M na semana". */
export function useSemanaAtual(treinoUserId: string | null, hoje: Date = new Date()) {
  const dias = datasDaSemana(hoje);
  const inicio = chaveData(dias[0]);
  const fim = chaveData(dias[6]);
  return useQuery({
    queryKey: ["treino-semana-atual", treinoUserId, inicio],
    queryFn: () => carregarSemanaAtual(treinoUserId!, inicio, fim),
    enabled: !!treinoUserId,
    staleTime: 60_000,
    retry: 1,
    networkMode: "online",
  });
}

/** Séries por semana por bloco muscular (o Volume Semanal — programado). */
export function useVolumeDoAluno(treinoUserId: string | null) {
  return useQuery({
    queryKey: ["treino-volume", treinoUserId],
    queryFn: () => carregarVolume(treinoUserId!),
    enabled: !!treinoUserId,
    staleTime: 60_000,
    retry: 1,
    networkMode: "online",
  });
}

const alvoDoTreino = (t: Pick<TreinoEditor, "chave">) => idsDaChave(t.chave);

/**
 * As mudanças do editor: cada uma grava na hora (como o Configurar › Treino antigo). Prescrição, observação e config trocam o
 * que está na tela antes de a resposta chegar; a lista de exercícios e os treinos recarregam (o id pode mudar quando o treino
 * compartilhado vira cópia só do aluno).
 */
export function useAcoesEditor(treinoUserId: string | null, onMudou?: () => void) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const chave = chaveEditor(treinoUserId);

  const recarregar = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: chave }),
      qc.invalidateQueries({ queryKey: ["treino-volume", treinoUserId] }),
      qc.invalidateQueries({ queryKey: ["treino-semana-atual", treinoUserId] }),
    ]);
  }, [qc, chave, treinoUserId]);

  /**
   * Uma mudança: cancela a leitura em andamento (uma resposta velha não pode apagar o que a tela acabou de mostrar), troca a
   * tela na hora (otimista), grava e recarrega só o que depende dela ("tudo" = o treino inteiro; "semana" = o N de M e o
   * volume; "volume" = as séries por grupo; "nada"). Erro: volta como estava, avisa e relê do servidor.
   */
  const rodar = useCallback(
    async <T,>(
      rotulo: string,
      fn: () => Promise<T>,
      opts: { otimista?: (d: DadosEditor) => DadosEditor; ok?: string; depois?: "tudo" | "semana" | "volume" | "nada" } = {},
    ): Promise<T | null> => {
      if (!treinoUserId) return null;
      await qc.cancelQueries({ queryKey: chave });
      const antes = qc.getQueryData<DadosEditor>(chave);
      if (opts.otimista && antes) qc.setQueryData<DadosEditor>(chave, opts.otimista(antes));
      setOcupado(rotulo);
      try {
        const r = await fn();
        if (opts.ok) toast.success(opts.ok);
        onMudou?.();
        const depois = opts.depois ?? "tudo";
        if (depois === "tudo") await recarregar();
        if (depois === "semana") {
          void qc.invalidateQueries({ queryKey: ["treino-volume", treinoUserId] });
          void qc.invalidateQueries({ queryKey: ["treino-semana-atual", treinoUserId] });
        }
        if (depois === "volume") void qc.invalidateQueries({ queryKey: ["treino-volume", treinoUserId] });
        return r;
      } catch (e) {
        if (antes) qc.setQueryData<DadosEditor>(chave, antes);
        toast.error(mensagemDoErro(e));
        await recarregar();
        return null;
      } finally {
        setOcupado(null);
      }
    },
    [qc, chave, treinoUserId, recarregar, onMudou],
  );

  const prescrever = useCallback(
    (t: TreinoEditor, ex: ExercicioEditor, p: PrescricaoEditavel) =>
      rodar(`presc:${t.chave}:${ex.chave}`, () => salvarPrescricao(treinoUserId!, alvoDoTreino(t), ex, p), {
        depois: p.series !== ex.series ? "volume" : "nada",
        otimista: (d) => {
          const alvo = alvoDoTreino(t);
          const mesma = (r: DadosEditor["seriesPadrao"][number]) =>
            (r.grupo_id ?? null) === (alvo.grupo_id ?? null) && (r.grupo_usuario_id ?? null) === (alvo.grupo_usuario_id ?? null)
            && (r.exercicio_id ?? null) === ex.exercicio_id && (r.exercicio_usuario_id ?? null) === ex.exercicio_usuario_id;
          const linha = {
            grupo_id: alvo.grupo_id ?? null, grupo_usuario_id: alvo.grupo_usuario_id ?? null, exercicio_id: ex.exercicio_id,
            exercicio_usuario_id: ex.exercicio_usuario_id, num_series: p.series, reps_alvo: p.reps, descanso_segundos: p.descanso,
            carga_sugerida_kg: p.carga, observacao: d.seriesPadrao.find(mesma)?.observacao ?? null,
          };
          return { ...d, seriesPadrao: [...d.seriesPadrao.filter((r) => !mesma(r)), linha] };
        },
      }),
    [rodar, treinoUserId],
  );

  const observar = useCallback(
    (t: TreinoEditor, texto: string) => {
      const obs = texto.trim() ? texto.trim() : null;
      return rodar(`obs:${t.chave}`, () => salvarObservacao(treinoUserId!, alvoDoTreino(t), obs), {
        ok: "Observação salva.",
        depois: "nada",
        otimista: (d) => {
          const alvo = alvoDoTreino(t);
          const geral = (r: DadosEditor["seriesPadrao"][number]) =>
            (r.grupo_id ?? null) === (alvo.grupo_id ?? null) && (r.grupo_usuario_id ?? null) === (alvo.grupo_usuario_id ?? null) && !r.exercicio_id && !r.exercicio_usuario_id;
          const atual = d.seriesPadrao.find(geral);
          if (atual) return { ...d, seriesPadrao: d.seriesPadrao.map((r) => (geral(r) ? { ...r, observacao: obs } : r)) };
          if (!obs) return d;
          const n = Number(d.config?.series_padrao_qtd) || 3;
          return { ...d, seriesPadrao: [...d.seriesPadrao, { grupo_id: alvo.grupo_id ?? null, grupo_usuario_id: alvo.grupo_usuario_id ?? null, exercicio_id: null, exercicio_usuario_id: null, num_series: n, observacao: obs }] };
        },
      });
    },
    [rodar, treinoUserId],
  );

  const configurar = useCallback(
    (campos: Partial<ConfigTreinoAluno>, ok?: string) =>
      rodar(`cfg:${Object.keys(campos).join(",")}`, () => salvarConfig(treinoUserId!, campos as never), {
        ok,
        depois: "series_padrao_qtd" in campos ? "volume" : "nada",
        otimista: (d) => ({ ...d, config: { ...(d.config ?? ({} as ConfigTreinoAluno)), ...campos } }),
      }),
    [rodar, treinoUserId],
  );

  const avisoCopia = (r: { personalizado?: boolean } | null, nome: string) => {
    if (r?.personalizado) toast.success(`"${nome}" agora é uma cópia só deste aluno: os outros continuam com o treino de antes.`);
  };

  return {
    ocupado,
    prescrever,
    observar,
    configurar,
    adicionar: async (t: TreinoEditor, exercicioId: string) => {
      const r = await rodar(`add:${t.chave}`, () => adicionarExercicio(treinoUserId!, t.id, exercicioId), { ok: "Exercício adicionado." });
      avisoCopia(r, t.nome);
      return r;
    },
    remover: async (t: TreinoEditor, ex: ExercicioEditor) => {
      const r = await rodar(`rem:${t.chave}:${ex.chave}`, () => removerExercicio(treinoUserId!, t.id, ex.exercicio_id!), { ok: "Exercício tirado do treino." });
      avisoCopia(r, t.nome);
      return r;
    },
    ordenar: async (t: TreinoEditor, ordem: string[]) => {
      const r = await rodar(`ord:${t.chave}`, () => ordenarExercicios(treinoUserId!, t.id, ordem), {
        otimista: (d) => {
          const lista = d.exerciciosPorTreino[t.chave] ?? [];
          const pos = new Map(ordem.map((id, i) => [id, i]));
          return { ...d, exerciciosPorTreino: { ...d.exerciciosPorTreino, [t.chave]: lista.map((e) => ({ ...e, ordem: pos.get(e.exercicio_id ?? "") ?? e.ordem })) } };
        },
      });
      avisoCopia(r, t.nome);
      return r;
    },
    criarTreino: (nome: string) => rodar("novo", () => novoTreino(treinoUserId!, nome), { ok: "Treino criado." }),
    usarModelo: (grupoId: string) => rodar(`usar:${grupoId}`, () => usarTreino(treinoUserId!, grupoId), { ok: "Treino dado ao aluno." }),
    tirar: (t: TreinoEditor) => rodar(`tirar:${t.chave}`, () => tirarTreino(treinoUserId!, t.id), { ok: `"${t.nome}" saiu do aluno.` }),
    salvarDia: (dia: string, chaves: string[]) =>
      rodar(`dia:${dia}`, () => salvarDia(treinoUserId!, dia, chaves.map(idsDaChave)), {
        depois: "semana",
        otimista: (d) => ({
          ...d,
          semana: [
            ...d.semana.filter((r) => r.dia_semana !== dia || r.extra),
            ...chaves.map((k, i) => ({ dia_semana: dia, slot_idx: i, grupo_id: idsDaChave(k).grupo_id ?? null, grupo_usuario_id: idsDaChave(k).grupo_usuario_id ?? null, extra: false })),
          ],
        }),
      }),
    salvarAlternado: (dia: string, ligar: boolean, inicio: string) =>
      rodar(`alt:${dia}`, () => salvarAlternado(treinoUserId!, dia, ligar, inicio), {
        depois: "semana",
        otimista: (d) => ({
          ...d,
          diasConfig: [...d.diasConfig.filter((c) => c.dia_semana !== dia), { dia_semana: dia, alternado: ligar, alternado_inicio: ligar ? inicio : null }],
          semana: ligar ? d.semana : d.semana.filter((r) => r.dia_semana !== dia || !r.extra),
        }),
      }),
    salvarExtras: (dia: string, extras: { chave: string; atrelado: string | null }[]) =>
      rodar(
        `ext:${dia}`,
        () =>
          salvarExtras(
            treinoUserId!,
            dia,
            extras.map((e) => {
              const at = e.atrelado ? idsDaChave(e.atrelado) : {};
              return { ...idsDaChave(e.chave), ...(at.grupo_id ? { atrelado_grupo_id: at.grupo_id } : {}), ...(at.grupo_usuario_id ? { atrelado_grupo_usuario_id: at.grupo_usuario_id } : {}) };
            }),
          ),
        {
          depois: "semana",
          otimista: (d) => ({
            ...d,
            semana: [
              ...d.semana.filter((r) => r.dia_semana !== dia || !r.extra),
              ...extras.map((e, i) => {
                const k = idsDaChave(e.chave);
                const at = e.atrelado ? idsDaChave(e.atrelado) : {};
                return {
                  dia_semana: dia, slot_idx: 100 + i, extra: true, grupo_id: k.grupo_id ?? null, grupo_usuario_id: k.grupo_usuario_id ?? null,
                  extra_atrelado_grupo_id: at.grupo_id ?? null, extra_atrelado_grupo_usuario_id: at.grupo_usuario_id ?? null,
                };
              }),
            ],
          }),
        },
      ),
    aplicarPadrao: (n: number) =>
      rodar("padrao", () => aplicarPadraoATodos(treinoUserId!, n), { ok: `${n} ${n === 1 ? "série" : "séries"} em todos os exercícios (a prescrição fica).` }),
  };
}

export type AcoesEditor = ReturnType<typeof useAcoesEditor>;
