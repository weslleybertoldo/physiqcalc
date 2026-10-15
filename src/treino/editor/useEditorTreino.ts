import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { chaveData, datasDaSemana } from "@/treino/datas";
import {
  ErroTreinoPainel,
  acharAlunoNoTreino,
  adicionarExercicio,
  aplicarPadraoATodos,
  carregarEditor,
  carregarEditorLeitura,
  carregarSemanaAtual,
  carregarSemanaAtualLeitura,
  carregarVolume,
  carregarVolumeLeitura,
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
import { criarFila, vigiarSaida, type Valor } from "./filaDaLinha";
import {
  alternadoDoDia,
  comAlternadoDoDia,
  comDia,
  comLinha,
  comObservacao,
  comPrescricao,
  extrasParaGravar,
  idsDaChave,
  linhaDaChave,
  montarTreinos,
  treinosPorDia,
  type ExtraDoDia,
} from "./regras";
import type { ConfigTreinoAluno, DadosEditor, ExercicioEditor, PrescricaoEditavel, TreinoEditor } from "./tipos";

export const chaveEditor = (treinoUserId: string | null) => ["treino-editor", treinoUserId] as const;

// ───────────────────────── hml-24 (H-127): a fila por chave das gravações que mandam o estado INTEIRO ─────────────────────────
// FORA do React (o módulo): a gravação de uma chave termina mesmo saindo da tela, dentro do app; com algo pendente, o navegador
// pergunta antes de fechar ou recarregar a aba. As chaves:
//   "<aluno>|<treino>|<exercício>"   a prescrição de um exercício      (setPrescricao)
//   "<aluno>|<treino>|geral"         a observação do treino            (setObservacao)
//   "<aluno>|semana:<DIA>|treinos"   a lista de treinos do dia         (setDia — apaga e grava a lista inteira)
//   "<aluno>|semana:<DIA>|alternado" o alternado do dia e os extras    (setDiaConfig + setExtras: desligar o alternado apaga os extras,
//                                                                       então os 2 andam na MESMA fila — nunca 2 no ar do mesmo dia)
// As ações pontuais (adicionar/tirar exercício, usar modelo, criar e tirar treino, a config, o padrão N) seguem pelo rodar.

type AlvoTreino = { grupo_id?: string; grupo_usuario_id?: string };
type IdsExercicio = { exercicio_id: string | null; exercicio_usuario_id: string | null };
/** O que a tela precisa para mostrar a chave pendente por cima do que o servidor devolveu (e refazer o "Tentar de novo"). */
type Meta =
  | { tipo: "prescricao"; alvo: AlvoTreino; ex: IdsExercicio }
  | { tipo: "observacao"; alvo: AlvoTreino }
  | { tipo: "dia"; dia: string }
  | { tipo: "alternado"; dia: string };
/** O que estava salvo na chave (o "voltar ao salvo" do erro): a linha do aluno (prescrição e observação) ou o valor do dia (a semana). */
type Retrato = { linha: DadosEditor["seriesPadrao"][number] | null } | { valor: Valor };

export const filaDoEditor = criarFila<Valor, unknown>();
const metas = new Map<string, Meta>();
/** O retrato do servidor (o último confirmado) de cada chave com algo pendente: o "voltar ao salvo" do erro. */
const salvas = new Map<string, Retrato>();
if (typeof window !== "undefined") vigiarSaida(filaDoEditor, window);

export const chaveDaPrescricao = (treinoUserId: string, t: Pick<TreinoEditor, "chave">, ex: Pick<ExercicioEditor, "chave">) =>
  `${treinoUserId}|${t.chave}|${ex.chave}`;
export const chaveDaObservacao = (treinoUserId: string, t: Pick<TreinoEditor, "chave">) => `${treinoUserId}|${t.chave}|geral`;
export const chaveDoDia = (treinoUserId: string, dia: string) => `${treinoUserId}|semana:${dia}|treinos`;
export const chaveDoAlternado = (treinoUserId: string, dia: string) => `${treinoUserId}|semana:${dia}|alternado`;

// na semana, as listas vão como TEXTO (JSON) no valor da fila: a fila compara campo a campo, e a mesma lista não conta como mudança
const valorDoDia = (chaves: string[]): Valor => ({ chaves: JSON.stringify(chaves) });
const valorDoAlternado = (a: { alternado: boolean; inicio: string | null; extras: ExtraDoDia[] }): Valor => ({
  alternado: a.alternado,
  inicio: a.inicio,
  extras: JSON.stringify(a.extras),
});
const chavesDoValor = (v: Valor): string[] => JSON.parse(String(v.chaves ?? "[]")) as string[];
const extrasDoValor = (v: Valor): ExtraDoDia[] => JSON.parse(String(v.extras ?? "[]")) as ExtraDoDia[];

const aplicarMeta = (d: DadosEditor, m: Meta, v: Valor): DadosEditor => {
  switch (m.tipo) {
    case "prescricao":
      return comPrescricao(d, m.alvo, m.ex, v as unknown as PrescricaoEditavel);
    case "observacao":
      return comObservacao(d, m.alvo, (v.observacao as string | null) ?? null);
    case "dia":
      return comDia(d, m.dia, chavesDoValor(v));
    case "alternado":
      return comAlternadoDoDia(d, m.dia, { alternado: v.alternado === true, inicio: (v.inicio as string | null) ?? null, extras: extrasDoValor(v) });
  }
};

/** O valor da chave da semana no que a tela mostra (a lista do dia; o alternado e os extras do dia). */
function valorDaSemana(d: DadosEditor, m: Extract<Meta, { tipo: "dia" | "alternado" }>): Valor {
  return m.tipo === "dia" ? valorDoDia(treinosPorDia(d)[m.dia] ?? []) : valorDoAlternado(alternadoDoDia(d, m.dia));
}

function retrato(d: DadosEditor | undefined, m: Meta): Retrato | null {
  if (m.tipo === "prescricao" || m.tipo === "observacao") return { linha: linhaDaChave(d, m.alvo, m.tipo === "prescricao" ? m.ex : null) };
  return d ? { valor: valorDaSemana(d, m) } : null;
}

function voltar(d: DadosEditor, m: Meta, r: Retrato): DadosEditor {
  if ("linha" in r) return m.tipo === "prescricao" || m.tipo === "observacao" ? comLinha(d, m.alvo, m.tipo === "prescricao" ? m.ex : null, r.linha) : d;
  return aplicarMeta(d, m, r.valor);
}

/**
 * A chave do alternado do dia grava em até 2 ações, só o que o envio mudou: o alternado (ligado e o início — setDiaConfig; desligar
 * apaga os extras no banco) e, com o alternado ligado, os extras (setExtras). O "Tentar de novo" leva todos os campos: as 2.
 */
async function enviarAlternado(treinoUserId: string, dia: string, v: Valor, campos: ReadonlySet<string>): Promise<{ ok: true }> {
  const ligado = v.alternado === true;
  if (campos.has("alternado") || campos.has("inicio")) await salvarAlternado(treinoUserId, dia, ligado, (v.inicio as string | null) ?? "");
  if (campos.has("extras") && ligado) await salvarExtras(treinoUserId, dia, extrasParaGravar(extrasDoValor(v)));
  return { ok: true };
}

/** O que o servidor devolveu + as linhas deste aluno com gravação pendente por cima (uma releitura no meio não apaga o que grava). */
function comPendentes(d: DadosEditor, treinoUserId: string, pendentes: ReadonlyArray<readonly [string, Valor]>): DadosEditor {
  let saida = d;
  for (const [chave, desejado] of pendentes) {
    const m = chave.startsWith(`${treinoUserId}|`) ? metas.get(chave) : undefined;
    if (m) saida = aplicarMeta(saida, m, desejado);
  }
  return saida;
}

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

/** Tudo o que o editor mostra (ação `get`) + os treinos montados. `leituraAluno` (W16): só ler pelo principal (a nutricionista). */
export function useDadosEditor(treinoUserId: string | null, leituraAluno?: string | null) {
  const q = useQuery({
    queryKey: leituraAluno ? (["treino-editor-leitura", leituraAluno] as const) : chaveEditor(treinoUserId),
    queryFn: () => (leituraAluno ? carregarEditorLeitura(leituraAluno) : carregarEditor(treinoUserId!)),
    enabled: !!leituraAluno || !!treinoUserId,
    staleTime: 30_000,
    retry: (n, e) => !(e instanceof ErroTreinoPainel && ["forbidden", "invalid_token"].includes(e.codigo)) && n < 1,
    networkMode: "online",
  });
  // hml-24: as linhas com gravação pendente na fila aparecem com o valor que a pessoa quer (o servidor ainda não tem)
  const pendentes = useSyncExternalStore(filaDoEditor.assinar, filaDoEditor.pendentes, filaDoEditor.pendentes);
  const data = useMemo(
    () => (q.data && treinoUserId && !leituraAluno && pendentes.length ? comPendentes(q.data, treinoUserId, pendentes) : q.data),
    [q.data, treinoUserId, leituraAluno, pendentes],
  );
  const treinos = useMemo(() => montarTreinos(data), [data]);
  return { ...q, data, treinos };
}

/** A semana de hoje (Seg–Dom): trocas do dia e treinos feitos — o "N de M na semana". */
export function useSemanaAtual(treinoUserId: string | null, hoje: Date = new Date(), leituraAluno?: string | null) {
  const dias = datasDaSemana(hoje);
  const inicio = chaveData(dias[0]);
  const fim = chaveData(dias[6]);
  return useQuery({
    queryKey: ["treino-semana-atual", leituraAluno ? `leitura:${leituraAluno}` : treinoUserId, inicio],
    queryFn: () => (leituraAluno ? carregarSemanaAtualLeitura(leituraAluno, inicio, fim) : carregarSemanaAtual(treinoUserId!, inicio, fim)),
    enabled: !!leituraAluno || !!treinoUserId,
    staleTime: 60_000,
    retry: 1,
    networkMode: "online",
  });
}

/** Séries por semana por bloco muscular (o Volume Semanal — programado). */
export function useVolumeDoAluno(treinoUserId: string | null, leituraAluno?: string | null) {
  return useQuery({
    queryKey: ["treino-volume", leituraAluno ? `leitura:${leituraAluno}` : treinoUserId],
    queryFn: () => (leituraAluno ? carregarVolumeLeitura(leituraAluno) : carregarVolume(treinoUserId!)),
    enabled: !!leituraAluno || !!treinoUserId,
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
      // revisão hml-24 (⚪3): sem otimista, o retrato volta igual — o cancelamento de uma leitura cujo "voltar" um setQueryData no meio
      // apagou (o aoOk da fila) deixaria a consulta em erro, e a tela em "Não deu para abrir o treino" até a releitura do fim
      if (antes) qc.setQueryData<DadosEditor>(chave, opts.otimista ? opts.otimista(antes) : antes);
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

  /**
   * hml-24 (H-127): a prescrição e a observação vão pela FILA POR LINHA (filaDaLinha.ts) — 1 pedido por vez por linha, juntando os
   * campos que chegarem enquanto ele voa; a tela troca na hora (o otimista de hoje). Ok → o onMudou e o volume quando as séries
   * mudaram. Erro → só aquela linha volta ao salvo, o aviso com "Tentar de novo" e a releitura (as outras linhas pendentes ficam por
   * cima). A promessa resolve com o envio que levou a mudança (a folha espera e fecha no ok) ou null.
   */
  const gravarNaFila = useCallback(
    (
      chaveFila: string,
      meta: Meta,
      base: Valor,
      novo: Valor,
      enviar: (v: Valor, campos: ReadonlySet<string>) => Promise<unknown>,
      ok?: string,
    ): Promise<unknown | null> => {
      if (!treinoUserId) return Promise.resolve(null);
      metas.set(chaveFila, meta);
      const guardar = () => {
        const r = retrato(qc.getQueryData<DadosEditor>(chave), meta);
        if (r) salvas.set(chaveFila, r);
        else salvas.delete(chaveFila);
      };
      // o retrato do servidor antes do 1º pendente (o "voltar ao salvo"); com algo pendente, ele já está guardado
      if (!filaDoEditor.pendente(chaveFila)) guardar();
      void qc.cancelQueries({ queryKey: chave });
      const tentarDeNovo = () => {
        if (!filaDoEditor.temErro(chaveFila)) return;
        guardar();
        void filaDoEditor.tentarDeNovo(chaveFila);
        const v = filaDoEditor.pendente(chaveFila);
        if (v) qc.setQueryData<DadosEditor>(chave, (d) => (d ? aplicarMeta(d, meta, v) : d));
      };
      const promessa = filaDoEditor.mudar(chaveFila, base, novo, {
        enviar,
        aoOk: (_r, envio) => {
          // o servidor tem o valor: o cache também e este vira o retrato salvo
          qc.setQueryData<DadosEditor>(chave, (d) => (d ? aplicarMeta(d, meta, envio.valor) : d));
          guardar();
          // revisão hml-24 (🟡1): uma releitura que começou ANTES desta confirmação traria o valor velho e apagaria o confirmado (a linha
          // já saiu da fila: a sobreposição não a cobre; a próxima mudança da linha regravaria os outros campos com o velho). Ela é
          // cancelada em silêncio (o cancelRefetch do invalidate) e a leitura sai de novo, depois da gravação — ativa ou não
          if (qc.isFetching({ queryKey: chave }) > 0) void qc.invalidateQueries({ queryKey: chave, refetchType: "all" });
          if (ok) toast.success(ok);
          onMudou?.();
          if (meta.tipo === "dia" || meta.tipo === "alternado") {
            // a semana muda o "N de M" e o volume (o depois "semana" de antes)
            void qc.invalidateQueries({ queryKey: ["treino-volume", treinoUserId] });
            void qc.invalidateQueries({ queryKey: ["treino-semana-atual", treinoUserId] });
          } else if (envio.campos.has("series")) void qc.invalidateQueries({ queryKey: ["treino-volume", treinoUserId] });
        },
        aoErro: (e) => {
          // só esta chave volta ao que o servidor tinha; as outras pendentes seguem por cima da releitura
          const salva = salvas.get(chaveFila) ?? (meta.tipo === "prescricao" || meta.tipo === "observacao" ? { linha: null } : null);
          if (salva) qc.setQueryData<DadosEditor>(chave, (d) => (d ? voltar(d, meta, salva) : d));
          salvas.delete(chaveFila);
          toast.error(mensagemDoErro(e), { id: `fila:${chaveFila}`, action: { label: "Tentar de novo", onClick: tentarDeNovo } });
          void recarregar();
        },
        aoDescartar: () => salvas.delete(chaveFila),
      });
      const v = filaDoEditor.pendente(chaveFila);
      if (v) qc.setQueryData<DadosEditor>(chave, (d) => (d ? aplicarMeta(d, meta, v) : d));
      return promessa;
    },
    [qc, chave, treinoUserId, recarregar, onMudou],
  );

  const prescrever = useCallback(
    (t: TreinoEditor, ex: ExercicioEditor, p: PrescricaoEditavel) => {
      if (!treinoUserId) return Promise.resolve(null);
      const alvo = alvoDoTreino(t);
      const ids = { exercicio_id: ex.exercicio_id, exercicio_usuario_id: ex.exercicio_usuario_id };
      const base = { series: ex.series, reps: ex.reps, descanso: ex.descanso, carga: ex.carga };
      return gravarNaFila(chaveDaPrescricao(treinoUserId, t, ex), { tipo: "prescricao", alvo, ex: ids }, base, { ...p },
        (v) => salvarPrescricao(treinoUserId, alvo, ids, v as unknown as PrescricaoEditavel));
    },
    [gravarNaFila, treinoUserId],
  );

  const observar = useCallback(
    (t: TreinoEditor, texto: string) => {
      if (!treinoUserId) return Promise.resolve(null);
      const obs = texto.trim() ? texto.trim() : null;
      const alvo = alvoDoTreino(t);
      return gravarNaFila(chaveDaObservacao(treinoUserId, t), { tipo: "observacao", alvo }, { observacao: t.observacao ?? null }, { observacao: obs },
        (v) => salvarObservacao(treinoUserId, alvo, (v.observacao as string | null) ?? null), "Observação salva.");
    },
    [gravarNaFila, treinoUserId],
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
      // hml-24: o exercício que sai leva a fila dele (o que ainda ia gravar nele não vai mais)
      if (treinoUserId) filaDoEditor.descartar(chaveDaPrescricao(treinoUserId, t, ex));
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
    // a semana (ampliação da hml-24): cada ação manda o estado INTEIRO de uma chave do dia → pela fila (1 no ar por chave; o desejado
    // mais novo; o "Tentar de novo"). A base é o que a tela mostra da chave (o desejado pendente ou o cache)
    salvarDia: (dia: string, chaves: string[]) => {
      if (!treinoUserId) return Promise.resolve(null);
      const k = chaveDoDia(treinoUserId, dia);
      const meta = { tipo: "dia" as const, dia };
      const d = qc.getQueryData<DadosEditor>(chave);
      const base = filaDoEditor.pendente(k) ?? (d ? valorDaSemana(d, meta) : valorDoDia([]));
      return gravarNaFila(k, meta, base, valorDoDia(chaves), (v) => salvarDia(treinoUserId, dia, chavesDoValor(v).map(idsDaChave)));
    },
    salvarAlternado: (dia: string, ligar: boolean, inicio: string) => {
      if (!treinoUserId) return Promise.resolve(null);
      const k = chaveDoAlternado(treinoUserId, dia);
      const meta = { tipo: "alternado" as const, dia };
      const d = qc.getQueryData<DadosEditor>(chave);
      const base = filaDoEditor.pendente(k) ?? (d ? valorDaSemana(d, meta) : valorDoAlternado({ alternado: false, inicio: null, extras: [] }));
      // desligar o alternado apaga os extras do dia (o setDiaConfig faz) — o desejado já vai sem eles
      const novo = { ...base, alternado: ligar, inicio: ligar ? inicio : null, ...(ligar ? {} : { extras: "[]" }) };
      return gravarNaFila(k, meta, base, novo, (v, campos) => enviarAlternado(treinoUserId, dia, v, campos));
    },
    salvarExtras: (dia: string, extras: ExtraDoDia[]) => {
      if (!treinoUserId) return Promise.resolve(null);
      const k = chaveDoAlternado(treinoUserId, dia);
      const meta = { tipo: "alternado" as const, dia };
      const d = qc.getQueryData<DadosEditor>(chave);
      const base = filaDoEditor.pendente(k) ?? (d ? valorDaSemana(d, meta) : valorDoAlternado({ alternado: true, inicio: null, extras: [] }));
      return gravarNaFila(k, meta, base, { ...base, extras: JSON.stringify(extras) }, (v, campos) => enviarAlternado(treinoUserId, dia, v, campos));
    },
    aplicarPadrao: (n: number) =>
      rodar("padrao", () => aplicarPadraoATodos(treinoUserId!, n), { ok: `${n} ${n === 1 ? "série" : "séries"} em todos os exercícios (a prescrição fica).` }),
  };
}

export type AcoesEditor = ReturnType<typeof useAcoesEditor>;
