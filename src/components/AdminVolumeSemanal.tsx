import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  calcularVolumeSemanal,
  calcularVolumePraticado,
  formatarSeries,
  type ExercicioPraticado,
  type GrupoVolume,
  type SemanaRowVolume,
  type StatusVolume,
} from "@/lib/volumeSemanal";

interface Props { userId: string }

const BADGE: Record<StatusVolume, { label: string; cls: string; bar: string }> = {
  abaixo: { label: "abaixo do mínimo", cls: "bg-muted text-muted-foreground", bar: "bg-muted-foreground" },
  produtivo: { label: "ok", cls: "bg-green-500/15 text-green-500", bar: "bg-green-500" },
  perto: { label: "perto do limite", cls: "bg-yellow-500/15 text-yellow-500", bar: "bg-yellow-500" },
  limite: { label: "no limite", cls: "bg-red-500/15 text-red-500", bar: "bg-red-500" },
  neutro: { label: "sem faixa", cls: "bg-muted text-muted-foreground", bar: "bg-muted-foreground" },
};

interface Semana { inicio: string; fim: string; label: string }

const isoLocal = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const ddmm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Últimas N semanas (SEG–DOM), da atual pra trás */
function ultimasSemanas(n: number): Semana[] {
  const hoje = new Date();
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
  const out: Semana[] = [];
  for (let i = 0; i < n; i++) {
    const ini = new Date(seg);
    ini.setDate(seg.getDate() - 7 * i);
    const fim = new Date(ini);
    fim.setDate(ini.getDate() + 6);
    const inicio = isoLocal(ini);
    const fimIso = isoLocal(fim);
    const sufixo = i === 0 ? " (atual)" : i === 1 ? " (anterior)" : "";
    out.push({ inicio, fim: fimIso, label: `${ddmm(inicio)} – ${ddmm(fimIso)}${sufixo}` });
  }
  return out;
}

export default function AdminVolumeSemanal({ userId }: Props) {
  const [semana, setSemana] = useState<SemanaRowVolume[]>([]);
  const [grupos, setGrupos] = useState<Record<string, GrupoVolume>>({});
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  const semanas = useMemo(() => ultimasSemanas(8), []);
  const [modo, setModo] = useState<"programado" | "praticado">("programado");
  // default do praticado = semana anterior
  const [semanaSel, setSemanaSel] = useState<string>(semanas[1]?.inicio ?? semanas[0].inicio);
  const [praticado, setPraticado] = useState<Record<string, ExercicioPraticado[]>>({});
  const [loadingPraticado, setLoadingPraticado] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("admin-semana-treinos", {
          body: { action: "volume", userId },
        });
        if (error) throw error;
        if (!ativo) return;
        setSemana((data?.semana as SemanaRowVolume[]) || []);
        setGrupos((data?.grupos as Record<string, GrupoVolume>) || {});
      } catch {
        if (ativo) toast.error("Erro ao carregar o volume semanal.");
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [userId]);

  useEffect(() => {
    if (modo !== "praticado" || praticado[semanaSel]) return;
    const sem = semanas.find((s) => s.inicio === semanaSel);
    if (!sem) return;
    let ativo = true;
    (async () => {
      setLoadingPraticado(true);
      try {
        const { data, error } = await supabase.functions.invoke("admin-semana-treinos", {
          body: { action: "volumePraticado", userId, inicio: sem.inicio, fim: sem.fim },
        });
        if (error) throw error;
        if (!ativo) return;
        setPraticado((prev) => ({ ...prev, [sem.inicio]: (data?.exercicios as ExercicioPraticado[]) || [] }));
      } catch {
        if (ativo) toast.error("Erro ao carregar o volume praticado.");
      } finally {
        if (ativo) setLoadingPraticado(false);
      }
    })();
    return () => { ativo = false; };
  }, [modo, semanaSel, userId, semanas, praticado]);

  const volumes = useMemo(
    () =>
      modo === "programado"
        ? calcularVolumeSemanal(semana, grupos)
        : calcularVolumePraticado(praticado[semanaSel] ?? []),
    [modo, semana, grupos, praticado, semanaSel],
  );
  const temPadrao = modo === "programado" && volumes.some((v) => v.detalhes.some((d) => d.seriesEhPadrao));
  const carregando = loading || (modo === "praticado" && loadingPraticado && !praticado[semanaSel]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["programado", "praticado"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`text-xs font-heading uppercase tracking-wider rounded px-2.5 py-1 border transition-colors ${
              modo === m
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "programado" ? "Programado" : "Praticado"}
          </button>
        ))}
        {modo === "praticado" && (
          <select
            value={semanaSel}
            onChange={(e) => setSemanaSel(e.target.value)}
            className="text-xs font-body bg-background text-foreground border border-border rounded px-2 py-1"
          >
            {semanas.map((s) => (
              <option key={s.inicio} value={s.inicio}>{s.label}</option>
            ))}
          </select>
        )}
      </div>

      <p className="text-xs text-muted-foreground font-body">
        {modo === "programado"
          ? "Séries semanais programadas por grupo muscular, com base nos treinos marcados na semana. Séries por exercício = último treino registrado."
          : "Séries CONCLUÍDAS no app na semana escolhida, por grupo muscular."}
        {" "}Faixas científicas MEV–MRV (volume landmarks, RP/Israetel); músculo secundário conta meia série.
      </p>

      {carregando ? (
        <p className="text-sm text-muted-foreground font-body">Carregando…</p>
      ) : volumes.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body">
          {modo === "programado"
            ? "Nenhum treino marcado na semana deste usuário. Marque os treinos na aba Treino Diário."
            : "Nenhuma série concluída nessa semana."}
        </p>
      ) : (
        <>
          {volumes.map((v) => {
            const badge = BADGE[v.status];
            const isOpen = aberto === v.bloco.key;
            const pct = v.landmark ? Math.min(v.total / v.landmark.mrv, 1) * 100 : 0;
            return (
              <div key={v.bloco.key} className="border border-border rounded-md p-3">
                <button
                  type="button"
                  onClick={() => setAberto(isOpen ? null : v.bloco.key)}
                  className="flex items-center justify-between w-full text-left gap-2"
                >
                  <span className="text-sm font-heading uppercase tracking-wider text-foreground">
                    {v.bloco.emoji} {v.bloco.nome}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-body text-foreground">
                      {formatarSeries(v.total)} séries
                    </span>
                    <span className={`text-[10px] font-body uppercase tracking-wider rounded px-1.5 py-0.5 ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
                  </span>
                </button>

                {v.landmark && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded bg-muted overflow-hidden">
                      <div className={`h-full rounded ${badge.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="block text-[10px] text-muted-foreground font-body mt-0.5">
                      faixa {v.landmark.mev}–{v.landmark.mrv} séries/semana
                    </span>
                  </div>
                )}

                {isOpen && (
                  <div className="flex flex-col gap-1 pl-1 mt-2 border-t border-border pt-2">
                    {v.detalhes.map((d, i) => (
                      <span key={i} className="text-xs font-body text-foreground">
                        {d.nome} — {formatarSeries(d.series)} {d.series === 1 ? "série" : "séries"}{d.seriesEhPadrao ? "*" : ""}
                        {modo === "programado" ? ` × ${d.vezes}×/sem` : ""}
                        {d.fator !== 1 ? " (secundário ×0,5)" : ""}
                        {" = "}
                        <span className="text-muted-foreground">{formatarSeries(d.subtotal)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {temPadrao && (
            <p className="text-[10px] text-muted-foreground font-body">
              * exercício sem treino registrado — considera as 3 séries padrão.
            </p>
          )}
        </>
      )}
    </div>
  );
}
