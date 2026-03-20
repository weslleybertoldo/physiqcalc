import { useState, useMemo, useEffect } from "react";
import InputField from "./InputField";
import TdeeTable from "./TdeeTable";
import ResultCards from "./ResultCards";

const LS_ABOVE = "physiqcalc-folds-above";
const LS_BELOW = "physiqcalc-folds-below";

function loadJson(key: string) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}

interface Props {
  gender: "male" | "female";
  age: number;
  weight: number;
  onResult?: (result: { bf: number; tmbKatch: number } | null) => void;
}

function calcBodyFat3(gender: "male" | "female", soma: number, age: number) {
  let density: number;
  if (gender === "male") {
    density = 1.10938 - 0.0008267 * soma + 0.0000016 * soma * soma - 0.0002574 * age;
  } else {
    density = 1.0994921 - 0.0009929 * soma + 0.0000023 * soma * soma - 0.0001392 * age;
  }
  const bf = ((4.95 / density) - 4.5) * 100;
  return bf > 0 && bf < 100 ? bf : null;
}

function calcBodyFat7(gender: "male" | "female", soma: number, age: number) {
  let density: number;
  if (gender === "male") {
    density = 1.112 - 0.00043499 * soma + 0.00000055 * soma * soma - 0.00028826 * age;
  } else {
    density = 1.097 - 0.00046971 * soma + 0.00000056 * soma * soma - 0.00012828 * age;
  }
  const bf = ((4.95 / density) - 4.5) * 100;
  return bf > 0 && bf < 100 ? bf : null;
}

const foldLabels7 = [
  "Peitoral", "Axilar Média", "Tríceps", "Subescapular",
  "Abdômen", "Supra-ilíaca", "Coxa",
];

const SectionBodyFat = ({ gender, age, weight, onResult }: Props) => {
  const savedAbove = loadJson(LS_ABOVE);
  const savedBelow = loadJson(LS_BELOW);

  const [activeTab, setActiveTab] = useState<"above" | "below">("above");
  const [animClass, setAnimClass] = useState("");

  const [aboveFold1, setAboveFold1] = useState(savedAbove?.fold1 ?? "");
  const [aboveFold2, setAboveFold2] = useState(savedAbove?.fold2 ?? "");
  const [aboveFold3, setAboveFold3] = useState(savedAbove?.fold3 ?? "");

  const [belowFolds, setBelowFolds] = useState<string[]>(savedBelow ?? ["", "", "", "", "", "", ""]);

  // Save folds to localStorage
  useEffect(() => {
    localStorage.setItem(LS_ABOVE, JSON.stringify({ fold1: aboveFold1, fold2: aboveFold2, fold3: aboveFold3 }));
  }, [aboveFold1, aboveFold2, aboveFold3]);

  useEffect(() => {
    localStorage.setItem(LS_BELOW, JSON.stringify(belowFolds));
  }, [belowFolds]);

  const handleTabChange = (tab: "above" | "below") => {
    if (tab === activeTab) return;
    setAnimClass("animate-slide-left");
    setTimeout(() => {
      setActiveTab(tab);
      setAnimClass("animate-slide-right-in");
    }, 200);
  };

  const updateBelowFold = (index: number, value: string) => {
    setBelowFolds((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const maleLabels3 = ["Peitoral", "Abdômen", "Coxa"];
  const femaleLabels3 = ["Tríceps", "Supra-ilíaca", "Coxa"];
  const labels3 = gender === "male" ? maleLabels3 : femaleLabels3;

  const aboveResult = useMemo(() => {
    const f1 = parseFloat(aboveFold1), f2 = parseFloat(aboveFold2), f3 = parseFloat(aboveFold3);
    if (!f1 || !f2 || !f3 || !age || !weight) return null;
    const bf = calcBodyFat3(gender, f1 + f2 + f3, age);
    if (bf === null) return null;
    const fatMass = weight * (bf / 100);
    const leanMass = weight - fatMass;
    const tmbKatch = 370 + 21.6 * leanMass;
    return { bf, tmbKatch };
  }, [aboveFold1, aboveFold2, aboveFold3, age, weight, gender]);

  const belowResult = useMemo(() => {
    const values = belowFolds.map((v) => parseFloat(v));
    if (values.some((v) => !v || v <= 0) || !age || !weight) return null;
    const soma = values.reduce((a, b) => a + b, 0);
    const bf = calcBodyFat7(gender, soma, age);
    if (bf === null) return null;
    const fatMass = weight * (bf / 100);
    const leanMass = weight - fatMass;
    const tmbKatch = 370 + 21.6 * leanMass;
    return { bf, tmbKatch };
  }, [belowFolds, age, weight, gender]);

  // Notify parent of active result
  useEffect(() => {
    const result = activeTab === "above" ? aboveResult : belowResult;
    onResult?.(result);
  }, [activeTab, aboveResult, belowResult, onResult]);

  return (
    <section className="py-16 sm:py-24 section-divider">
      <h2 className="font-heading text-2xl sm:text-3xl text-foreground mb-12">
        Cálculo de % Gordura Corporal
      </h2>

      <div className="flex border-b border-muted-foreground/30 mb-10">
        <button
          type="button"
          onClick={() => handleTabChange("above")}
          className={`py-3 px-1 mr-8 font-heading text-sm uppercase tracking-widest transition-colors duration-200 border-b-2 ${
            activeTab === "above" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
        >
          Acima de 7%
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("below")}
          className={`py-3 px-1 font-heading text-sm uppercase tracking-widest transition-colors duration-200 border-b-2 ${
            activeTab === "below" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
        >
          Abaixo de 7%
        </button>
      </div>

      <div className={`overflow-hidden ${animClass}`} onAnimationEnd={() => setAnimClass("")}>
        {activeTab === "above" ? (
          <div>
            <p className="text-sm text-muted-foreground font-body mb-8">
              Protocolo Jackson &amp; Pollock — 3 dobras cutâneas.
              {gender === "male" ? " Masculino." : " Feminino."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              <InputField label={labels3[0]} unit="mm" value={aboveFold1} onChange={setAboveFold1} />
              <InputField label={labels3[1]} unit="mm" value={aboveFold2} onChange={setAboveFold2} />
              <InputField label={labels3[2]} unit="mm" value={aboveFold3} onChange={setAboveFold3} />
            </div>
            {aboveResult && (
              <div className="mt-12 space-y-12">
                <ResultCards bodyFatPercent={aboveResult.bf} weight={weight} gender={gender} age={age} />
                <div className="result-card border-primary/30">
                  <p className="text-xs uppercase tracking-wider text-primary font-heading mb-2">
                    TMB Específico
                  </p>
                  <p className="font-heading text-5xl sm:text-6xl text-primary">
                    {Math.round(aboveResult.tmbKatch)}
                    <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
                  </p>
                  <TdeeTable tmb={aboveResult.tmbKatch} />
                  <p className="text-xs text-muted-foreground font-body mt-6 leading-relaxed">
                    A TMB Específico usa sua massa magra real para calcular o gasto energético, sendo mais precisa para atletas.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground font-body mb-8">
              Para atletas com menos de 7% de gordura, a fórmula de Katch-McArdle
              oferece maior precisão pois trabalha diretamente com a massa magra.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8">
              {foldLabels7.map((label, i) => (
                <InputField
                  key={label}
                  label={label}
                  unit="mm"
                  value={belowFolds[i]}
                  onChange={(v) => updateBelowFold(i, v)}
                />
              ))}
            </div>
            {belowResult && (
              <div className="mt-12 space-y-12">
                <ResultCards bodyFatPercent={belowResult.bf} weight={weight} gender={gender} age={age} />
                <div className="result-card border-primary/30">
                  <p className="text-xs uppercase tracking-wider text-primary font-heading mb-2">
                    TMB Específico
                  </p>
                  <p className="font-heading text-5xl sm:text-6xl text-primary">
                    {Math.round(belowResult.tmbKatch)}
                    <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
                  </p>
                  <TdeeTable tmb={belowResult.tmbKatch} />
                  <p className="text-xs text-muted-foreground font-body mt-6 leading-relaxed">
                    A TMB Específico usa sua massa magra real para calcular o gasto energético, sendo mais precisa para atletas.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default SectionBodyFat;
