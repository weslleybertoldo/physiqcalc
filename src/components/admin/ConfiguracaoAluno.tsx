import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, LockOpen, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SERIES_PADRAO_DEFAULT, SERIES_PADRAO_MAX, SERIES_PADRAO_MIN, clampSeries } from "@/lib/seriesPadrao";

/** Mesmo valor que o app usava fixo (`useState(120)` em TreinosPage) e o default da coluna. */
export const DESCANSO_PADRAO_SEGUNDOS = 120;
export const DESCANSO_ATALHOS = [60, 90, 120, 180] as const;
export const DESCANSO_MIN = 10;
export const DESCANSO_MAX = 600;
export type SeriesModo = "padrao" | "personalizada";

export interface ConfigAluno {
  tempo_descanso_segundos: number;
  series_modo: SeriesModo;
  series_padrao_qtd: number;
  series_travadas: boolean;
}

/** Perfil (admin-get-user / admin-update-user) → config, com os padrões do app quando a coluna vem vazia. */
export function configDoPerfil(p: Record<string, unknown> | null | undefined): ConfigAluno {
  const desc = Number(p?.tempo_descanso_segundos);
  const qtd = Number(p?.series_padrao_qtd);
  return {
    tempo_descanso_segundos: Number.isFinite(desc) && desc > 0 ? clampDescanso(desc) : DESCANSO_PADRAO_SEGUNDOS,
    series_modo: p?.series_modo === "personalizada" ? "personalizada" : "padrao",
    series_padrao_qtd: Number.isFinite(qtd) && qtd >= 1 ? clampSeries(qtd) : SERIES_PADRAO_DEFAULT,
    series_travadas: p?.series_travadas === true || p?.series_travadas === 1 || p?.series_travadas === "true",
  };
}

export function clampDescanso(seg: number): number {
  const v = Math.round(Number.isFinite(seg) ? seg : DESCANSO_PADRAO_SEGUNDOS);
  return Math.min(DESCANSO_MAX, Math.max(DESCANSO_MIN, v));
}

/** "45 s" · "2 min" · "1 min 30 s" */
export function textoDescanso(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const min = Math.floor(s / 60);
  const resto = s % 60;
  if (min === 0) return `${resto} s`;
  return resto === 0 ? `${min} min` : `${min} min ${resto} s`;
}

interface Props {
  userId: string;
  /** "Personalizada" → leva pra aba Treino (onde fica o ajuste por exercício) */
  onIrParaTreino?: () => void;
}

const btnStep =
  "h-9 w-9 flex items-center justify-center border border-muted-foreground/40 text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed";
const chip = (ativo: boolean) =>
  `px-3 h-9 font-heading text-sm tracking-wider border transition-colors ${
    ativo ? "border-primary bg-primary/15 text-primary" : "border-muted-foreground/40 text-foreground hover:border-primary/60"
  }`;
const btnPrimario =
  "h-10 px-4 bg-primary text-primary-foreground font-heading uppercase tracking-wider text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2";

/**
 * Aba "Configuração" do aluno (18/09/2026): tempo de descanso, nº de séries (Padrão N pra todos ×
 * Personalizada por exercício na aba Treino) e o cadeado que impede o aluno de mudar o nº de séries no app.
 * Cada bloco salva sozinho (sem o botão "Salvar" global do AdminUserConfig).
 */
export default function ConfiguracaoAluno({ userId, onIrParaTreino }: Props) {
  const [cfg, setCfg] = useState<ConfigAluno | null>(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [descanso, setDescanso] = useState<number>(DESCANSO_PADRAO_SEGUNDOS);
  const [descansoTexto, setDescansoTexto] = useState<string>(String(DESCANSO_PADRAO_SEGUNDOS));
  const [qtd, setQtd] = useState<number>(SERIES_PADRAO_DEFAULT);
  /** linhas em tb_series_padrao_usuario do aluno (ajustes por exercício/treino); null = não carregou */
  const [ajustes, setAjustes] = useState<number | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErroCarga(false);
    const [perfilRes, seriesRes] = await Promise.all([
      supabase.functions.invoke("admin-get-user", { body: { userId } }),
      supabase.functions.invoke("admin-semana-treinos", { body: { action: "getSeriesPadrao", userId } }),
    ]);
    if (perfilRes.error || !perfilRes.data?.profile) {
      setErroCarga(true);
      return;
    }
    const c = configDoPerfil(perfilRes.data.profile);
    setCfg(c);
    setDescanso(c.tempo_descanso_segundos);
    setDescansoTexto(String(c.tempo_descanso_segundos));
    setQtd(c.series_padrao_qtd);
    setAjustes(seriesRes.error ? null : (seriesRes.data?.seriesPadrao?.length ?? 0));
  }, [userId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const salvarPerfil = async (data: Partial<ConfigAluno>, chave: string, msgOk: string): Promise<boolean> => {
    setSalvando(chave);
    try {
      const { data: r, error } = await supabase.functions.invoke("admin-update-user", { body: { userId, data } });
      if (error || !r?.profile) throw error ?? new Error("sem perfil na resposta");
      const c = configDoPerfil(r.profile);
      setCfg(c);
      setDescanso(c.tempo_descanso_segundos);
      setDescansoTexto(String(c.tempo_descanso_segundos));
      toast.success(msgOk);
      return true;
    } catch (e) {
      console.error("[ConfiguracaoAluno] salvar", chave, e);
      toast.error("Não foi possível salvar. Tente de novo.");
      return false;
    } finally {
      setSalvando(null);
    }
  };

  const escolherDescanso = (seg: number) => {
    const v = clampDescanso(seg);
    setDescanso(v);
    setDescansoTexto(String(v));
  };
  const salvarDescanso = () =>
    salvarPerfil({ tempo_descanso_segundos: descanso }, "descanso", `Descanso do aluno: ${textoDescanso(descanso)}.`);

  const alternarCadeado = () => {
    if (!cfg) return;
    const travar = !cfg.series_travadas;
    return salvarPerfil(
      { series_travadas: travar },
      "cadeado",
      travar ? "Séries travadas: o aluno não altera o nº de séries." : "Séries liberadas: o aluno pode ajustar o nº de séries.",
    );
  };

  const escolherPersonalizada = () =>
    salvarPerfil({ series_modo: "personalizada" }, "modo", "Modo personalizado: ajuste por exercício na aba Treino.");

  /** Padrão N: grava no perfil e APAGA os ajustes por exercício/treino do aluno — N passa a valer em tudo. */
  const aplicarPadrao = async () => {
    setSalvando("padrao");
    try {
      const { data: r, error } = await supabase.functions.invoke("admin-update-user", {
        body: { userId, data: { series_modo: "padrao", series_padrao_qtd: qtd } },
      });
      if (error || !r?.profile) throw error ?? new Error("sem perfil na resposta");
      const { error: e2 } = await supabase.functions.invoke("admin-semana-treinos", {
        body: { action: "limparSeriesAluno", userId },
      });
      if (e2) throw e2;
      setCfg(configDoPerfil(r.profile));
      setAjustes(0);
      toast.success(`${qtd} ${qtd === 1 ? "série" : "séries"} em todos os exercícios do aluno.`);
    } catch (e) {
      console.error("[ConfiguracaoAluno] aplicarPadrao", e);
      toast.error("Não foi possível aplicar o padrão. Tente de novo.");
    } finally {
      setSalvando(null);
    }
  };

  if (erroCarga) {
    return (
      <p className="text-muted-foreground font-body pt-10" data-config-erro>
        Não foi possível carregar a configuração.{" "}
        <button type="button" onClick={() => void carregar()} className="text-primary underline">Tentar de novo</button>
      </p>
    );
  }
  if (!cfg) return <p className="text-muted-foreground font-body pt-10" data-config-loading>Carregando...</p>;

  const descansoMudou = descanso !== cfg.tempo_descanso_segundos;
  const padraoAtivo = cfg.series_modo === "padrao";
  const padraoMudou = !padraoAtivo || qtd !== cfg.series_padrao_qtd || (ajustes ?? 0) > 0;

  return (
    <div data-config-aluno>
      {/* ── Descanso ── */}
      <section className="section-divider pt-10" data-config-descanso>
        <h2 className="font-heading text-lg text-foreground">Tempo de descanso</h2>
        <p className="text-xs text-muted-foreground font-body mt-1">
          Tempo que o cronômetro de descanso do aluno começa entre as séries. Hoje:{" "}
          <span className="text-foreground" data-config-descanso-atual>{textoDescanso(cfg.tempo_descanso_segundos)}</span>.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {DESCANSO_ATALHOS.map((seg) => (
            <button key={seg} type="button" onClick={() => escolherDescanso(seg)} className={chip(descanso === seg)}
              data-config-descanso-atalho={seg} aria-pressed={descanso === seg}>
              {textoDescanso(seg)}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="number" inputMode="numeric" min={DESCANSO_MIN} max={DESCANSO_MAX} step={5}
              value={descansoTexto}
              onChange={(e) => {
                setDescansoTexto(e.target.value);
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setDescanso(clampDescanso(n));
              }}
              onBlur={() => setDescansoTexto(String(descanso))}
              aria-label="Tempo de descanso em segundos"
              data-config-descanso-input
              className="h-9 w-20 bg-transparent border-b border-muted-foreground text-center text-foreground font-heading outline-none focus:border-primary transition-colors"
            />
            <span className="text-xs text-muted-foreground font-body">s</span>
          </div>
        </div>
        <div className="mt-4">
          <button type="button" onClick={() => void salvarDescanso()} disabled={!descansoMudou || salvando !== null}
            className={btnPrimario} data-config-descanso-salvar>
            {salvando === "descanso" && <Loader2 size={16} className="animate-spin" />}
            Salvar descanso
          </button>
        </div>
      </section>

      {/* ── Séries ── */}
      <section className="section-divider pt-10" data-config-series>
        <h2 className="font-heading text-lg text-foreground">Número de séries</h2>
        <p className="text-xs text-muted-foreground font-body mt-1">
          Quantas séries de cada exercício aparecem no app do aluno.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {/* Padrão */}
          <div className={`border p-4 ${padraoAtivo ? "border-primary bg-primary/5" : "border-muted-foreground/30"}`}
            data-config-modo="padrao" data-ativo={padraoAtivo}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm uppercase tracking-wider text-foreground">Padrão</h3>
              {padraoAtivo && <span className="text-[10px] font-heading uppercase tracking-wider text-primary">ativo</span>}
            </div>
            <p className="text-xs text-muted-foreground font-body mt-1">Um número só, igual pra todos os exercícios.</p>
            <div className="flex items-center gap-3 mt-4">
              <button type="button" onClick={() => setQtd((v) => clampSeries(v - 1))} disabled={qtd <= SERIES_PADRAO_MIN}
                aria-label="Menos uma série" className={btnStep}><Minus size={16} /></button>
              <span className="min-w-[2ch] text-center font-heading text-3xl text-primary" data-config-series-qtd>{qtd}</span>
              <button type="button" onClick={() => setQtd((v) => clampSeries(v + 1))} disabled={qtd >= SERIES_PADRAO_MAX}
                aria-label="Mais uma série" className={btnStep}><Plus size={16} /></button>
              <span className="text-xs text-muted-foreground font-body">séries</span>
            </div>
            <button type="button" onClick={() => void aplicarPadrao()} disabled={!padraoMudou || salvando !== null}
              className={`${btnPrimario} mt-4`} data-config-aplicar-padrao>
              {salvando === "padrao" && <Loader2 size={16} className="animate-spin" />}
              Aplicar a todos
            </button>
            <p className="text-[11px] text-muted-foreground font-body mt-2" data-config-ajustes>
              {ajustes === null
                ? "Zera os ajustes por exercício deste aluno."
                : ajustes === 0
                  ? "Sem ajustes por exercício hoje."
                  : `Zera ${ajustes} ${ajustes === 1 ? "ajuste" : "ajustes"} por exercício/treino deste aluno.`}
            </p>
          </div>

          {/* Personalizada */}
          <div className={`border p-4 ${!padraoAtivo ? "border-primary bg-primary/5" : "border-muted-foreground/30"}`}
            data-config-modo="personalizada" data-ativo={!padraoAtivo}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm uppercase tracking-wider text-foreground">Personalizada</h3>
              {!padraoAtivo && <span className="text-[10px] font-heading uppercase tracking-wider text-primary">ativo</span>}
            </div>
            <p className="text-xs text-muted-foreground font-body mt-1">
              Você ajusta exercício por exercício na aba Treino (botão "Séries" de cada treino).
            </p>
            {!padraoAtivo ? (
              <button type="button" onClick={onIrParaTreino} className={`${btnPrimario} mt-4`} data-config-ir-treino>
                Ajustar na aba Treino
              </button>
            ) : (
              <button type="button" onClick={() => void escolherPersonalizada()} disabled={salvando !== null}
                className={`${btnPrimario} mt-4`} data-config-escolher-personalizada>
                {salvando === "modo" && <Loader2 size={16} className="animate-spin" />}
                Usar personalizada
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Cadeado ── */}
      <section className="section-divider pt-10" data-config-cadeado-secao>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg text-foreground">Aluno pode mudar o nº de séries?</h2>
            <p className="text-xs text-muted-foreground font-body mt-1" data-config-cadeado-texto>
              {cfg.series_travadas
                ? "Travado: o aluno não adiciona nem remove série no app."
                : "Destravado: o aluno pode adicionar e remover séries no app."}
            </p>
          </div>
          <button type="button" onClick={() => void alternarCadeado()} disabled={salvando !== null}
            aria-pressed={cfg.series_travadas} aria-label={cfg.series_travadas ? "Destravar séries" : "Travar séries"}
            data-config-cadeado data-travado={cfg.series_travadas}
            className={`h-12 w-12 shrink-0 flex items-center justify-center border transition-colors ${
              cfg.series_travadas ? "border-primary bg-primary/15 text-primary" : "border-muted-foreground/40 text-muted-foreground hover:border-primary/60"
            } disabled:opacity-50`}>
            {salvando === "cadeado" ? <Loader2 size={20} className="animate-spin" /> : cfg.series_travadas ? <Lock size={20} /> : <LockOpen size={20} />}
          </button>
        </div>
      </section>
    </div>
  );
}
