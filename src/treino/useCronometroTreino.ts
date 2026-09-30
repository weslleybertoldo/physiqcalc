import { useCallback, useEffect, useRef, useState } from "react";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import { MARCOS_TREINO_LONGO_MIN, avisarTreinoLongoWeb, cancelarAvisosTreinoLongo, formatMarcoTreinoLongo } from "@/lib/nativeNotifications";
import { seriesDoTreino } from "@/lib/seriesAtivas";
import { buildTreinoResumo, type TreinoResumo } from "@/lib/treinoResumo";
import {
  EVENTO_CRONOMETRO,
  formatarDuracao,
  iniciarCronometro,
  lerCronometro,
  marcarAvisoTreinoLongo,
  pararCronometro,
  segundosDecorridos,
  type EstadoCronometro,
} from "./cronometro";

export interface SerieDoCronometro {
  exercicio_id: string;
  concluida?: boolean;
  numero_serie?: number;
  peso?: number;
  reps?: number;
  academia_nome?: string | null;
}

export interface AlvoCronometro {
  userId: string;
  dateKey: string;
  grupoNome: string;
  series: SerieDoCronometro[];
  /** exercícios que estão no treino (id → nome): série órfã de exercício trocado/removido não trava a pergunta */
  exerciciosMap: Record<string, { nome: string }>;
}

/**
 * O cronômetro do treino (C77, porte do WorkoutTimer): pílula vermelha que conta pelo relógio, avisos "Ainda está treinando?"
 * em 1h30/2h/3h, "Treino foi concluído?" quando a última série do treino recebe OK (1 vez por transição: "Não" continua
 * contando; refazer e concluir de novo pergunta de novo) e o fim, que grava o treino no histórico (`treino_historico`,
 * pelo PowerSync — funciona sem internet).
 */
export function useCronometroTreino(alvo: AlvoCronometro | null, aoConcluir?: () => void | Promise<void>) {
  const db = usePowerSync();
  const [estado, setEstado] = useState<EstadoCronometro | null>(() => {
    const s = lerCronometro();
    return s?.ativo ? s : null;
  });
  const [segundos, setSegundos] = useState(() => (estado ? segundosDecorridos(estado) : 0));
  const [perguntarFim, setPerguntarFim] = useState(false);
  const [concluido, setConcluido] = useState<{ resumo: TreinoResumo; duracao: number } | null>(null);
  const avisadosRef = useRef<Set<number>>(new Set(estado?.avisos ?? []));
  const segAnteriorRef = useRef<number | null>(null);
  const todasRef = useRef(false);

  // iniciado/encerrado por fora (OK numa série, outra aba do app) → relê do aparelho
  useEffect(() => {
    const sincronizar = () => {
      const s = lerCronometro();
      const ativo = s?.ativo ? s : null;
      setEstado((antes) => {
        if (ativo && (!antes || antes.startedAt !== ativo.startedAt)) {
          avisadosRef.current = new Set(ativo.avisos ?? []);
          segAnteriorRef.current = null;
        }
        return ativo;
      });
      if (ativo) setSegundos(segundosDecorridos(ativo));
    };
    sincronizar();
    window.addEventListener(EVENTO_CRONOMETRO, sincronizar);
    window.addEventListener("storage", sincronizar);
    return () => {
      window.removeEventListener(EVENTO_CRONOMETRO, sincronizar);
      window.removeEventListener("storage", sincronizar);
    };
  }, []);

  // tick: recalcula pelo início (em segundo plano o WebView suspende os timers) e avisa o treino longo ao CRUZAR o marco
  const startedAt = estado?.startedAt ?? null;
  const nomeRodando = estado?.grupoNome ?? "";
  useEffect(() => {
    if (startedAt === null) return;
    const verificar = (seg: number) => {
      for (const min of MARCOS_TREINO_LONGO_MIN) {
        if (seg < min * 60 || avisadosRef.current.has(min)) continue;
        avisadosRef.current.add(min);
        marcarAvisoTreinoLongo(min);
        const cruzouAgora = segAnteriorRef.current !== null && segAnteriorRef.current < min * 60;
        if (cruzouAgora) {
          toast(`Ainda está treinando? ${formatMarcoTreinoLongo(min)} de ${nomeRodando}`, {
            description: "Se já terminou, conclua o treino para parar o cronômetro.",
            duration: 12000,
          });
          avisarTreinoLongoWeb(nomeRodando, min);
        }
      }
      segAnteriorRef.current = seg;
    };
    const tick = () => {
      const seg = segundosDecorridos({ startedAt });
      setSegundos(seg);
      verificar(seg);
    };
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [startedAt, nomeRodando]);

  const rodandoAqui = !!(estado && alvo && estado.dateKey === alvo.dateKey);
  const doTreino = alvo ? seriesDoTreino(alvo.series, alvo.exerciciosMap) : [];
  const todasConcluidas = doTreino.length > 0 && doTreino.every((s) => s.concluida);
  useEffect(() => {
    if (rodandoAqui && todasConcluidas && !todasRef.current) setPerguntarFim(true);
    todasRef.current = todasConcluidas;
  }, [rodandoAqui, todasConcluidas]);

  const iniciar = useCallback(() => {
    if (!alvo) return;
    iniciarCronometro(alvo.dateKey, alvo.grupoNome);
  }, [alvo]);

  const concluir = useCallback(async (): Promise<TreinoResumo | null> => {
    const s = lerCronometro();
    if (!s?.ativo || !alvo) return null;
    pararCronometro();
    setEstado(null);
    setPerguntarFim(false);
    void cancelarAvisosTreinoLongo();
    const agora = new Date();
    const inicio = new Date(s.startedAt);
    const duracao = Math.round((agora.getTime() - inicio.getTime()) / 1000);

    // peso/reps de cada série e a academia, para o detalhe e a imagem do treino (formato de hoje do exercicios_concluidos)
    const academia = alvo.series.find((x) => x.academia_nome)?.academia_nome ?? null;
    const porExercicio: Record<string, {
      nome: string;
      series_concluidas: number;
      concluido_em: string;
      academia_nome: string | null;
      series: { numero_serie: number; peso: number; reps: number }[];
    }> = {};
    for (const x of alvo.series.filter((y) => y.concluida)) {
      const nome = alvo.exerciciosMap[x.exercicio_id]?.nome || `Exercício ${x.exercicio_id.slice(0, 6)}`;
      const item = (porExercicio[x.exercicio_id] ??= { nome, series_concluidas: 0, concluido_em: agora.toISOString(), academia_nome: academia, series: [] });
      item.series_concluidas++;
      item.series.push({ numero_serie: x.numero_serie ?? item.series.length + 1, peso: x.peso ?? 0, reps: x.reps ?? 0 });
    }
    const exercicios = Object.entries(porExercicio).map(([exercicio_id, d]) => ({ exercicio_id, ...d }));
    await db.execute(
      `INSERT INTO treino_historico (id, user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos, exercicios_concluidos, created_at)
       VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)`,
      [alvo.userId, alvo.grupoNome, inicio.toISOString(), agora.toISOString(), duracao, JSON.stringify(exercicios), agora.toISOString()],
    );
    const resumo = buildTreinoResumo({
      nome_treino: alvo.grupoNome,
      iniciado_em: inicio.toISOString(),
      concluido_em: agora.toISOString(),
      duracao_segundos: duracao,
      exercicios_concluidos: exercicios,
    });
    setConcluido({ resumo, duracao });
    // no topo: embaixo ele cobriria os botões da folha "Treino finalizado!" (Fechar / Compartilhar)
    toast.success(`Treino concluído em ${formatarDuracao(duracao)}!`, { position: "top-center" });
    await aoConcluir?.();
    return resumo;
  }, [alvo, db, aoConcluir]);

  return {
    /** o treino que está rodando (de qualquer dia) */
    estado,
    segundos,
    /** o cronômetro roda no dia que está na tela */
    rodandoAqui,
    iniciar,
    concluir,
    perguntarFim,
    setPerguntarFim,
    concluido,
    fecharConcluido: () => setConcluido(null),
  };
}
