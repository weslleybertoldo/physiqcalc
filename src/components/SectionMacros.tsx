import { useState, useMemo, useEffect } from "react";
import InputField from "./InputField";
import { levels } from "./TdeeTable";

const LS_KEY = "physiqcalc-macros";

function loadSaved() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}

interface Props {
  tmbMifflin: number | null;
  tmbKatch: number | null;
  weight: number;
  onDataChange?: (data: {
    totalCalories: number;
    baseCalories: number;
    calorieAdjust: number;
    calorieSource: string;
    tmbSourceLabel: string;
    activityLabel: string;
    proteinG: number; proteinKcal: number; proteinPct: number;
    fatG: number; fatKcal: number; fatPct: number;
    carbG: number; carbKcal: number; carbPct: number;
  } | null) => void;
}

const SectionMacros = ({ tmbMifflin, tmbKatch, weight, onDataChange }: Props) => {
  const saved = loadSaved();
  const [tmbSource, setTmbSource] = useState<"mifflin" | "katch">(saved?.tmbSource ?? "mifflin");
  const [activityFactor, setActivityFactor] = useState<number>(saved?.activityFactor ?? 1.55);
  const [proteinMultiplier, setProteinMultiplier] = useState(saved?.proteinMultiplier ?? "2.2");
  const [fatPercent, setFatPercent] = useState(saved?.fatPercent ?? "15");
  const [carbOverride, setCarbOverride] = useState(saved?.carbOverride ?? "");
  const [calorieAdjust, setCalorieAdjust] = useState(saved?.calorieAdjust ?? "0");

  // Persist settings
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ tmbSource, activityFactor, proteinMultiplier, fatPercent, carbOverride, calorieAdjust }));
  }, [tmbSource, activityFactor, proteinMultiplier, fatPercent, carbOverride, calorieAdjust]);

  const baseTmb = tmbSource === "katch" && tmbKatch ? tmbKatch : tmbMifflin;
  const baseCalories = baseTmb ? Math.round(baseTmb * activityFactor) : null;
  const adjustVal = parseInt(calorieAdjust) || 0;
  const totalCalories = baseCalories ? baseCalories + adjustVal : null;
  const calorieSource = `${tmbSource === "katch" ? "Katch-McArdle" : "Mifflin-St Jeor"} × ${levels.find((l) => l.factor === activityFactor)?.label ?? activityFactor}`;

  const macros = useMemo(() => {
    if (!totalCalories || !weight) return null;

    const pm = parseFloat(proteinMultiplier) || 0;
    const fp = parseFloat(fatPercent) || 0;

    const proteinG = pm * weight;
    const proteinKcal = proteinG * 4;
    const fatKcal = totalCalories * (fp / 100);
    const fatG = fatKcal / 9;

    const carbOverrideVal = parseFloat(carbOverride);
    let carbG: number, carbKcal: number;
    if (carbOverrideVal > 0) {
      carbG = carbOverrideVal;
      carbKcal = carbG * 4;
    } else {
      carbKcal = totalCalories - proteinKcal - fatKcal;
      carbG = carbKcal / 4;
    }

    const totalMacroKcal = proteinKcal + fatKcal + carbKcal;
    const diff = baseCalories ? totalMacroKcal - baseCalories : 0;

    return {
      proteinG, proteinKcal, fatG, fatKcal, carbG, carbKcal,
      totalMacroKcal, diff,
      proteinPct: (proteinKcal / totalMacroKcal) * 100,
      fatPct: (fatKcal / totalMacroKcal) * 100,
      carbPct: (carbKcal / totalMacroKcal) * 100,
    };
  }, [weight, totalCalories, proteinMultiplier, fatPercent, carbOverride]);

  // Notify parent
  useEffect(() => {
    if (macros && totalCalories && baseCalories) {
      const tmbSourceLabel = tmbSource === "katch" ? "Katch-McArdle" : "Mifflin-St Jeor";
      const activityLabel = levels.find((l) => l.factor === activityFactor)?.label ?? String(activityFactor);
      onDataChange?.({
        totalCalories,
        baseCalories,
        calorieAdjust: adjustVal,
        calorieSource,
        tmbSourceLabel,
        activityLabel,
        proteinG: macros.proteinG, proteinKcal: macros.proteinKcal, proteinPct: macros.proteinPct,
        fatG: macros.fatG, fatKcal: macros.fatKcal, fatPct: macros.fatPct,
        carbG: macros.carbG, carbKcal: macros.carbKcal, carbPct: macros.carbPct,
      });
    } else {
      onDataChange?.(null);
    }
  }, [macros, totalCalories, calorieSource, onDataChange]);

  const hasMifflin = tmbMifflin !== null;
  const hasKatch = tmbKatch !== null;

  if (!hasMifflin && !hasKatch) {
    return (
      <section className="py-16 sm:py-24">
        <h2 className="font-heading text-2xl sm:text-3xl text-foreground mb-8">Macronutrientes</h2>
        <div className="result-card border-destructive/50">
          <p className="text-sm text-destructive font-body">
            Preencha os dados na aba "Composição Corporal" (peso, idade e altura) para calcular os macronutrientes.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 sm:py-24">
      <h2 className="font-heading text-2xl sm:text-3xl text-foreground mb-12">Macronutrientes</h2>

      {/* TMB Source Selector */}
      <div className="space-y-6 mb-12">
        <div>
          <label className="text-sm text-muted-foreground font-body uppercase tracking-wider mb-2 block">
            Fonte da TMB
          </label>
          <div className="flex gap-0">
            <button
              type="button"
              onClick={() => setTmbSource("mifflin")}
              disabled={!hasMifflin}
              className={`flex-1 py-3 px-4 font-heading text-sm uppercase tracking-widest transition-colors duration-200 ${
                tmbSource === "mifflin" ? "toggle-active" : "toggle-inactive"
              } ${!hasMifflin ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              Mifflin-St Jeor
              {hasMifflin && <span className="block text-xs font-body normal-case tracking-normal mt-1 opacity-70">{Math.round(tmbMifflin!)} kcal</span>}
            </button>
            <button
              type="button"
              onClick={() => setTmbSource("katch")}
              disabled={!hasKatch}
              className={`flex-1 py-3 px-4 font-heading text-sm uppercase tracking-widest transition-colors duration-200 ${
                tmbSource === "katch" ? "toggle-active" : "toggle-inactive"
              } ${!hasKatch ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              Katch-McArdle
              {hasKatch ? (
                <span className="block text-xs font-body normal-case tracking-normal mt-1 opacity-70">{Math.round(tmbKatch!)} kcal</span>
              ) : (
                <span className="block text-xs font-body normal-case tracking-normal mt-1 opacity-50">Preencha as dobras</span>
              )}
            </button>
          </div>
        </div>

        {/* Activity Level */}
        <div>
          <label className="text-sm text-muted-foreground font-body uppercase tracking-wider mb-2 block">
            Nível de Atividade
          </label>
          <div className="space-y-0">
            {levels.map((l) => {
              const isSelected = activityFactor === l.factor;
              return (
                <div
                  key={l.factor}
                  onClick={() => setActivityFactor(l.factor)}
                  className={`flex items-center justify-between py-3 px-2 border-b border-muted-foreground/30 cursor-pointer transition-colors duration-200 hover:bg-muted/20 ${
                    isSelected ? "bg-primary/10 border-primary/50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-200 ${
                      isSelected ? "bg-primary" : "bg-muted-foreground/30"
                    }`} />
                    <span className="font-body text-sm text-foreground/80">{l.label}</span>
                    <span className="text-xs text-muted-foreground">×{l.factor}</span>
                  </div>
                  {baseTmb && (
                    <div className="flex items-baseline gap-2">
                      <span className={`font-heading text-lg ${isSelected ? "text-primary" : "text-foreground"}`}>
                        {Math.round(baseTmb * l.factor)}
                      </span>
                      <span className="text-xs text-muted-foreground">kcal</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Calorie target display */}
      {baseCalories && (
        <div className="result-card border-primary/50 mb-12">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-1">Meta calórica</p>
              <p className="font-heading text-4xl sm:text-5xl text-primary">
                {totalCalories}
                <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
              </p>
              {adjustVal !== 0 && (
                <p className="text-sm text-muted-foreground font-body mt-2">
                  {baseCalories} <span className="text-muted-foreground/60">(base)</span>
                  {" "}{adjustVal >= 0 ? "+" : "−"} {Math.abs(adjustVal)} <span className="text-muted-foreground/60">(ajuste)</span>
                  {" "}= <span className="text-foreground font-heading">{totalCalories}</span> kcal/dia
                </p>
              )}
              <p className="text-xs text-muted-foreground font-body mt-1">{calorieSource}</p>
            </div>
            <div className="sm:w-48 shrink-0">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2 block">
                Ajuste (kcal)
              </label>
              <div className="flex items-center gap-0">
                <button
                  type="button"
                  onClick={() => setCalorieAdjust(String((parseInt(calorieAdjust) || 0) - 50))}
                  className="h-10 w-10 flex items-center justify-center bg-secondary text-foreground font-heading text-lg hover:bg-muted transition-colors duration-200 shrink-0"
                >
                  −
                </button>
                <input
                  type="number"
                  value={calorieAdjust}
                  onChange={(e) => setCalorieAdjust(e.target.value)}
                  className="h-10 w-full bg-transparent border-b border-t border-muted-foreground text-center text-foreground font-heading text-lg outline-none focus:border-primary transition-colors"
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={() => setCalorieAdjust(String((parseInt(calorieAdjust) || 0) + 50))}
                  className="h-10 w-10 flex items-center justify-center bg-secondary text-foreground font-heading text-lg hover:bg-muted transition-colors duration-200 shrink-0"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
        <div className="result-card">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-1">Calorias utilizadas</p>
          <p className="font-heading text-3xl text-primary">
            {totalCalories ? Math.round(totalCalories) : "—"}
            <span className="text-sm text-muted-foreground ml-2">kcal</span>
          </p>
        </div>
        <div className="result-card">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-1">Peso utilizado</p>
          <p className="font-heading text-3xl text-foreground">
            {weight || "—"}
            <span className="text-sm text-muted-foreground ml-2">kg</span>
          </p>
        </div>
      </div>

      {/* Macro inputs */}
      {totalCalories && weight > 0 && (
        <div className="space-y-10">
          {/* Proteína */}
          <div className="result-card">
            <h3 className="font-heading text-sm uppercase tracking-widest text-primary mb-6">Proteína</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end">
              <InputField label="Multiplicador" unit="g/kg" value={proteinMultiplier} onChange={setProteinMultiplier} placeholder="2.2" />
              {macros && (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-body">Gramas</span>
                    <span className="font-heading text-2xl text-foreground">{macros.proteinG.toFixed(1)}g</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-body">Calorias</span>
                    <span className="font-heading text-2xl text-foreground">{Math.round(macros.proteinKcal)} kcal</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Gordura */}
          <div className="result-card">
            <h3 className="font-heading text-sm uppercase tracking-widest text-primary mb-6">Gordura</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end">
              <InputField label="% das calorias" unit="%" value={fatPercent} onChange={setFatPercent} placeholder="15" />
              {macros && (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-body">Gramas</span>
                    <span className="font-heading text-2xl text-foreground">{macros.fatG.toFixed(1)}g</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-body">Calorias</span>
                    <span className="font-heading text-2xl text-foreground">{Math.round(macros.fatKcal)} kcal</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Carboidrato */}
          <div className="result-card">
            <h3 className="font-heading text-sm uppercase tracking-widest text-primary mb-6">Carboidrato</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end">
              <InputField label="Override (opcional)" unit="g" value={carbOverride} onChange={setCarbOverride} placeholder="auto" />
              {macros && (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-body">Gramas</span>
                    <span className="font-heading text-2xl text-foreground">{macros.carbG.toFixed(1)}g</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-body">Calorias</span>
                    <span className="font-heading text-2xl text-foreground">{Math.round(macros.carbKcal)} kcal</span>
                  </div>
                </>
              )}
            </div>
            {!carbOverride && (
              <p className="text-xs text-muted-foreground font-body mt-4">
                Calculado automaticamente com as calorias restantes após proteína e gordura.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Resumo */}
      {macros && totalCalories && (
        <div className="mt-12 space-y-6">
          <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">Resumo</h3>

          <div className={`result-card ${
            Math.abs(macros.diff) < 1
              ? "border-classify-green/50"
              : macros.diff > 0 ? "border-classify-red/50" : "border-classify-yellow/50"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-1">Total dos macros</p>
                <p className="font-heading text-3xl text-foreground">
                  {Math.round(macros.totalMacroKcal)}<span className="text-sm text-muted-foreground ml-2">kcal</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-1">Meta</p>
                <p className="font-heading text-3xl text-primary">
                  {baseCalories ? Math.round(baseCalories) : "—"}<span className="text-sm text-muted-foreground ml-2">kcal</span>
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-muted-foreground/30">
              {Math.abs(macros.diff) < 1 ? (
                <p className="text-sm font-body text-classify-green">✓ Dentro da meta calórica</p>
              ) : macros.diff > 0 ? (
                <p className="text-sm font-body text-classify-red">↑ {Math.round(macros.diff)} kcal acima da meta calórica</p>
              ) : (
                <p className="text-sm font-body text-classify-yellow">↓ {Math.round(Math.abs(macros.diff))} kcal abaixo da meta calórica</p>
              )}
            </div>
          </div>

          <div className="space-y-0">
            <div className="flex items-center py-3 border-b border-muted-foreground/30">
              <span className="flex-1 text-xs uppercase tracking-wider text-muted-foreground font-heading">Macro</span>
              <span className="w-24 text-right text-xs uppercase tracking-wider text-muted-foreground font-heading">Gramas</span>
              <span className="w-24 text-right text-xs uppercase tracking-wider text-muted-foreground font-heading">Kcal</span>
              <span className="w-20 text-right text-xs uppercase tracking-wider text-muted-foreground font-heading">%</span>
            </div>
            {[
              { name: "Proteína", g: macros.proteinG, kcal: macros.proteinKcal, pct: macros.proteinPct },
              { name: "Gordura", g: macros.fatG, kcal: macros.fatKcal, pct: macros.fatPct },
              { name: "Carboidrato", g: macros.carbG, kcal: macros.carbKcal, pct: macros.carbPct },
            ].map((row) => (
              <div key={row.name} className="flex items-center py-3 border-b border-muted-foreground/30">
                <span className="flex-1 font-body text-sm text-foreground">{row.name}</span>
                <span className="w-24 text-right font-heading text-foreground">{row.g.toFixed(1)}g</span>
                <span className="w-24 text-right font-heading text-foreground">{Math.round(row.kcal)}</span>
                <span className="w-20 text-right font-body text-muted-foreground">{row.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default SectionMacros;
