import { useState, useMemo, useEffect } from "react";
import { Trash2, FileDown, LogOut } from "lucide-react";
import { logout } from "./Login";
import SectionTMB from "@/components/SectionTMB";
import SectionBodyFat from "@/components/SectionBodyFat";
import SectionMacros from "@/components/SectionMacros";
import MedidasForm from "@/components/MedidasForm";
import TabelaReferenciaGordura from "@/components/TabelaReferenciaGordura";
import ComparativoTab from "@/components/ComparativoTab";
import { MedidasCorporais, medidasVazias } from "@/types/medidas";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { generateReport, type ReportData } from "@/lib/generateReport";

const LS_KEY = "physiqcalc-basic";
const LS_MEDIDAS_KEY = "physiqcalc-medidas";

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function loadMedidas(): MedidasCorporais {
  try {
    const raw = localStorage.getItem(LS_MEDIDAS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { ...medidasVazias };
}

const Index = ({ onBack }: { onBack?: () => void } = {}) => {
  const saved = loadSaved();
  const [activeTab, setActiveTab] = useState<"comp" | "comparativo" | "macros">(saved?.activeTab ?? "comp");
  const [name, setName] = useState<string>(saved?.name ?? "");
  const [gender, setGender] = useState<"male" | "female">(saved?.gender ?? "male");
  const [age, setAge] = useState<string>(saved?.age ?? "");
  const [height, setHeight] = useState<string>(saved?.height ?? "");
  const [weight, setWeight] = useState<string>(saved?.weight ?? "");
  const [resetKey, setResetKey] = useState(0);
  const [bodyFatResult, setBodyFatResult] = useState<{ bf: number; tmbKatch: number } | null>(null);
  const [macroData, setMacroData] = useState<ReportData["macros"]>(null);
  const [medidas, setMedidas] = useState<MedidasCorporais>(loadMedidas);

  // Persist basic data
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ activeTab, name, gender, age, height, weight }));
  }, [activeTab, name, gender, age, height, weight]);

  // Persist medidas
  useEffect(() => {
    localStorage.setItem(LS_MEDIDAS_KEY, JSON.stringify(medidas));
  }, [medidas]);

  const tmb = useMemo(() => {
    const a = parseFloat(age), h = parseFloat(height), w = parseFloat(weight);
    if (!a || !h || !w) return null;
    return gender === "male" ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  }, [gender, age, height, weight]);

  const numAge = parseFloat(age) || 0;
  const numWeight = parseFloat(weight) || 0;
  const numHeight = parseFloat(height) || 0;

  const handleClear = () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("physiqcalc"))
      .forEach((k) => localStorage.removeItem(k));
    setName("");
    setGender("male");
    setAge("");
    setHeight("");
    setWeight("");
    setActiveTab("comp");
    setBodyFatResult(null);
    setMacroData(null);
    setMedidas({ ...medidasVazias });
    setResetKey((k) => k + 1);
  };

  const handleExport = () => {
    // Build dobras data
    const savedAbove = localStorage.getItem("physiqcalc-folds-above");
    const savedBelow = localStorage.getItem("physiqcalc-folds-below");
    let dobras: { labels: string[]; values: number[] } | undefined;

    if (bodyFatResult && savedAbove) {
      try {
        const parsed = JSON.parse(savedAbove);
        const f1 = parseFloat(parsed.fold1), f2 = parseFloat(parsed.fold2), f3 = parseFloat(parsed.fold3);
        if (f1 && f2 && f3) {
          const labels3 = gender === "male" ? ["Peitoral", "Abdomen", "Coxa"] : ["Triceps", "Supra-iliaca", "Coxa"];
          dobras = { labels: labels3, values: [f1, f2, f3] };
        }
      } catch { /* ignore */ }
    }

    generateReport({
      name,
      gender,
      age: numAge,
      height: numHeight,
      weight: numWeight,
      tmbMifflin: tmb,
      bodyFatResult,
      macros: macroData,
      medidas,
      dobras,
    });
  };

  const tabs = [
    { key: "comp" as const, label: "Composição Corporal" },
    { key: "comparativo" as const, label: "Comparativo" },
    { key: "macros" as const, label: "Macronutrientes" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        {/* Header */}
        <header className="pt-12 sm:pt-20 pb-4 flex items-start justify-between">
          <div>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-sm text-muted-foreground hover:text-foreground font-body mb-2 flex items-center gap-1 transition-colors"
              >
                ← Voltar ao Painel
              </button>
            )}
            <h1 className="font-heading text-3xl sm:text-4xl text-foreground tracking-tight">
              PHYSIQ<span className="text-primary">CALC</span>
            </h1>
            <p className="text-sm text-muted-foreground font-body mt-2">
              Calculadora de composição corporal para atletas.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={handleExport}
              title="Exportar Relatório (PDF)"
              className="p-2 text-muted-foreground hover:text-primary transition-colors duration-200"
            >
              <FileDown size={18} />
            </button>
            {!onBack && (
              <button
                type="button"
                onClick={() => { logout(); window.location.href = "/"; }}
                title="Sair"
                className="p-2 text-muted-foreground hover:text-destructive transition-colors duration-200"
              >
                <LogOut size={18} />
              </button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  title="Limpar Dados"
                  className="p-2 text-muted-foreground hover:text-destructive transition-colors duration-200"
                >
                  <Trash2 size={18} />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-background border-muted-foreground/30">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-heading text-foreground">
                    Limpar todos os dados?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="font-body">
                    Tem certeza? Todos os dados serão apagados e não poderão ser recuperados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-muted-foreground/30 text-foreground">
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClear}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Limpar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <span className="text-xs text-muted-foreground font-body italic ml-1">
              By Weslley Bertoldo
            </span>
          </div>
        </header>

        {/* Main tabs */}
        <div className="flex border-b border-muted-foreground/30 mb-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`py-3 px-1 mr-6 font-heading text-sm uppercase tracking-widest transition-colors duration-200 border-b-2 whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "comp" ? (
          <>
            <SectionTMB
              name={name}
              setName={setName}
              gender={gender}
              setGender={setGender}
              age={age}
              setAge={setAge}
              height={height}
              setHeight={setHeight}
              weight={weight}
              setWeight={setWeight}
              tmb={tmb}
            />

            {/* Medidas Corporais */}
            <div className="mt-6 pt-6 border-t border-muted-foreground/20">
              <h2 className="font-heading text-2xl sm:text-3xl text-foreground mb-2">
                Medidas Corporais
              </h2>
              <p className="text-xs text-muted-foreground font-body mb-5 leading-relaxed">
                Opcional — preencha para incluir no relatório comparativo.
              </p>
              <MedidasForm medidas={medidas} onChange={setMedidas} colunas={3} />
            </div>

            {numAge > 0 && numWeight > 0 && (
              <SectionBodyFat
                key={resetKey}
                gender={gender}
                age={numAge}
                weight={numWeight}
                onResult={setBodyFatResult}
              />
            )}

            <TabelaReferenciaGordura sexoInicial={gender === "male" ? "M" : "F"} />
          </>
        ) : activeTab === "comparativo" ? (
          <ComparativoTab />
        ) : (
          <SectionMacros
            key={resetKey}
            tmbMifflin={tmb}
            tmbKatch={bodyFatResult?.tmbKatch ?? null}
            weight={numWeight}
            onDataChange={setMacroData}
          />
        )}

        <footer className="section-divider py-12 text-center">
          <p className="text-xs text-muted-foreground font-body">
            Fórmulas:{" "}
            <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Mifflin-St Jeor</a>
            {" · "}
            <a href="https://pubmed.ncbi.nlm.nih.gov/694835/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Jackson &amp; Pollock</a>
            {" · "}
            <a href="https://pubmed.ncbi.nlm.nih.gov/15212767/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Katch-McArdle</a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
