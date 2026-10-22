import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Play, Square, X } from "lucide-react";
import { toast } from "sonner";
import { deveVibrar, lerSomDescanso, temSom, tocarSom, vibrarNoNavegador } from "@/lib/somDescanso";
import { cn } from "@/lib/utils";
import { chaveDaSerie, lerCronometroSerie as lerSalvo, salvarCronometroSerie as salvar, type CronometroSalvo } from "../cronometroSerie";
import { estadoDoCronometro, lerSegundos, relogio } from "../porTempo";
import type { SerieComMemoria } from "../tipos";

const CLASSE_CAMPO =
  "h-10 min-w-0 rounded-xl border border-linha-2 bg-superficie px-2 text-center text-[15px] font-semibold tabular-nums text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-violeta-2";

type Trava = { release: () => Promise<void> } | null;

/** A tela não apaga enquanto o aluno segura a prancha (quando o aparelho deixa; senão segue sem). */
async function pedirTelaAcesa(): Promise<Trava> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    return wl ? await wl.request("screen") : null;
  } catch {
    return null;
  }
}

/**
 * Uma série por TEMPO (Prancha e Prancha Lateral, decisão do Weslley 21/10/2026): o campo Tempo (o aluno corrige na mão:
 * "45", "0:45", "1:30") e o ▶ que liga o cronômetro — com meta do profissional conta pra BAIXO a partir dela e, no fim, apita
 * (o mesmo som do descanso) e conclui a série com a meta; sem meta conta pra CIMA até o Parar, que conclui com o tempo segurado.
 * Parar antes da meta conclui com o que segurou; o × cancela sem gravar. A série grava só o tempo.
 */
export function LinhaSerieTempo({
  serie,
  exercicioId,
  nome,
  meta,
  rotulo,
  aoSalvar,
  aoConcluir,
  botoes,
}: {
  serie: SerieComMemoria;
  exercicioId: string;
  nome: string;
  /** a meta do profissional em segundos (null = conta pra cima) */
  meta: number | null;
  rotulo: ReactNode;
  aoSalvar: (tempo: number) => void;
  aoConcluir: (tempo: number) => void;
  /** OK e − (o − some com o cadeado do profissional) */
  botoes: (concluirComOCampo: () => void) => ReactNode;
}) {
  const chave = chaveDaSerie(exercicioId, serie.slot_idx, serie.numero_serie);
  const inicial = serie.salva && serie.tempo_segundos ? serie.tempo_segundos : meta ?? serie.tempo_segundos ?? null;
  const [tempo, setTempo] = useState(inicial ? relogio(inicial) : "");
  const [rodando, setRodando] = useState<CronometroSalvo | null>(() => {
    const s = lerSalvo();
    return s && s.chave === chave ? s : null;
  });
  const [, setTique] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const travaRef = useRef<Trava>(null);
  const terminouRef = useRef(false);
  // o pai recria as funções a cada render: a contagem usa sempre a última, sem reiniciar
  const aoConcluirRef = useRef(aoConcluir);
  useEffect(() => {
    aoConcluirRef.current = aoConcluir;
  }, [aoConcluir]);

  // o campo acompanha o que foi gravado (ou a meta) — sem passar por cima do que a pessoa digita
  useEffect(() => {
    if (rodando) return;
    const v = serie.salva && serie.tempo_segundos ? serie.tempo_segundos : meta ?? serie.tempo_segundos ?? null;
    setTempo(v ? relogio(v) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o gravado ou a meta mudam
  }, [serie.tempo_segundos, serie.salva, meta]);

  const soltarTela = useCallback(() => {
    const t = travaRef.current;
    travaRef.current = null;
    if (t) void t.release().catch(() => {});
  }, []);

  // a tela acesa chega depois (promessa): se o cronômetro já parou nesse meio-tempo, solta na hora
  const segurarTela = useCallback(() => {
    void pedirTelaAcesa().then((t) => {
      if (t && lerSalvo()?.chave === chave && !travaRef.current) travaRef.current = t;
      else if (t) void t.release().catch(() => {});
    });
  }, [chave]);

  const apitar = useCallback(async () => {
    const som = lerSomDescanso();
    try {
      if (temSom(som)) {
        const ctx = audioRef.current || new AudioContext();
        audioRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        tocarSom(ctx, som);
      }
    } catch {
      /* sem áudio */
    }
    if (deveVibrar(som)) vibrarNoNavegador(som);
  }, []);

  const encerrar = useCallback(
    (gravar: number | null) => {
      salvar(null);
      setRodando(null);
      soltarTela();
      if (gravar && gravar >= 1) {
        setTempo(relogio(gravar));
        aoConcluirRef.current(gravar);
      }
    },
    [soltarTela],
  );

  // contagem: o número da tela sai do relógio real; a meta acabou → apita e conclui com a meta (uma vez só)
  useEffect(() => {
    if (!rodando) return;
    const tique = () => {
      const e = estadoDoCronometro({ inicio: rodando.inicio, meta: rodando.meta });
      if (e.acabou && !terminouRef.current) {
        terminouRef.current = true;
        void apitar();
        encerrar(e.segurado);
        return;
      }
      setTique((x) => x + 1);
    };
    tique();
    const id = setInterval(tique, 250);
    // voltou ao primeiro plano: a tela acesa caiu sozinha (o navegador solta) → pede de novo
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      tique();
      if (!travaRef.current && !terminouRef.current) segurarTela();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [rodando, apitar, encerrar, segurarTela]);

  // a linha saiu da tela com o cronômetro correndo: solta a tela acesa (o início fica salvo e a linha retoma quando voltar)
  useEffect(() => () => soltarTela(), [soltarTela]);

  const iniciar = () => {
    // o toque do aluno libera o som do fim (o navegador só toca áudio criado num gesto)
    try {
      audioRef.current = audioRef.current || new AudioContext();
      if (audioRef.current.state === "suspended") void audioRef.current.resume();
    } catch {
      audioRef.current = null;
    }
    const novo: CronometroSalvo = { chave, inicio: Date.now(), meta: meta && meta > 0 ? meta : null };
    terminouRef.current = false;
    salvar(novo);
    setRodando(novo);
    segurarTela();
  };

  const parar = () => {
    if (!rodando) return;
    const e = estadoDoCronometro({ inicio: rodando.inicio, meta: rodando.meta });
    terminouRef.current = true;
    encerrar(e.segurado);
  };

  const cancelar = () => {
    terminouRef.current = true;
    encerrar(null);
  };

  const gravarCampo = () => {
    const s = lerSegundos(tempo);
    if (s) {
      setTempo(relogio(s));
      if (s !== serie.tempo_segundos) aoSalvar(s);
    } else {
      const v = serie.salva && serie.tempo_segundos ? serie.tempo_segundos : meta ?? serie.tempo_segundos ?? null;
      setTempo(v ? relogio(v) : "");
    }
  };

  const concluirComOCampo = () => {
    const s = lerSegundos(tempo);
    if (!s) {
      toast.error("Marque o tempo da série: toque no ▶ ou digite (ex.: 45 ou 1:30).");
      return;
    }
    if (lerSalvo()?.chave === chave) salvar(null);
    aoConcluir(s);
  };

  if (rodando) {
    const e = estadoDoCronometro({ inicio: rodando.inicio, meta: rodando.meta });
    return (
      <div data-serie={serie.numero_serie} data-serie-cronometro={rodando.meta ? "meta" : "livre"} className="flex items-center gap-2">
        {rotulo}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[10.5px] font-medium text-violeta-3">{rodando.meta ? `Falta · meta ${relogio(rodando.meta)}` : "Segurando"}</span>
          <span role="timer" aria-live="off" aria-label={`Cronômetro da série ${serie.numero_serie} de ${nome}`} data-cronometro-mostrado={e.mostrado}
            className={cn(CLASSE_CAMPO, "flex items-center justify-center border-violeta-2 bg-violeta/10 text-[17px] text-forte")}>
            {relogio(e.mostrado)}
          </span>
        </div>
        <div className="flex flex-none items-center gap-1 self-end">
          <button type="button" onClick={parar} data-serie-parar
            className="flex h-10 flex-none items-center gap-1 rounded-xl border border-violeta/40 bg-violeta/12 px-3 text-[13px] font-bold text-violeta-3 hover:bg-violeta/20">
            <Square aria-hidden className="h-3.5 w-3.5" strokeWidth={2.6} /> Parar
          </button>
          <button type="button" onClick={cancelar} aria-label="Cancelar o cronômetro (não grava)" title="Cancelar (não grava)" data-serie-cancelar
            className="flex h-10 w-8 flex-none items-center justify-center rounded-xl text-texto-3 hover:text-rosa-3">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-serie={serie.numero_serie} data-serie-tempo className="flex items-center gap-2">
      {rotulo}
      <label className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[10.5px] font-medium text-texto-3">{meta ? `Tempo · meta ${relogio(meta)}` : "Tempo"}</span>
        <input type="text" inputMode="numeric" value={tempo} onChange={(ev) => setTempo(ev.target.value)} onBlur={gravarCampo} placeholder="00:00"
          aria-label={`Tempo da série ${serie.numero_serie} de ${nome} (segundos ou MM:SS)`} className={CLASSE_CAMPO} />
      </label>
      <div className="flex flex-none items-center gap-1 self-end">
        <button type="button" onClick={iniciar} data-serie-iniciar aria-label={`Iniciar o cronômetro da série ${serie.numero_serie}`}
          title={meta ? `Contar ${relogio(meta)} pra baixo` : "Contar o tempo"}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-violeta/40 bg-violeta/12 text-violeta-3 hover:bg-violeta/20">
          <Play aria-hidden className="h-4 w-4" strokeWidth={2.6} />
        </button>
        {botoes(concluirComOCampo)}
      </div>
    </div>
  );
}
