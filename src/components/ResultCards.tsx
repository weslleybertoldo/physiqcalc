import { classificarGordura } from "@/utils/composicaoCorporal";

interface ResultCardsProps {
  bodyFatPercent: number | null;
  weight: number;
  gender: "male" | "female";
  age?: number;
}

const ResultCards = ({ bodyFatPercent, weight, gender, age }: ResultCardsProps) => {
  if (bodyFatPercent === null || bodyFatPercent <= 0 || bodyFatPercent >= 100) return null;

  const fatMass = weight * (bodyFatPercent / 100);
  const leanMass = weight - fatMass;
  const sexo = gender === "male" ? "M" : "F";
  const cls = classificarGordura(bodyFatPercent, sexo as "M" | "F", age || 25);

  const items = [
    { label: "% Gordura Corporal", value: `${bodyFatPercent.toFixed(1)}%` },
    { label: "Massa Gorda", value: `${fatMass.toFixed(1)} kg` },
    { label: "Massa Magra", value: `${leanMass.toFixed(1)} kg` },
  ];

  return (
    <div className="mt-10 space-y-6">
      <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">
        Resultados
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.label} className="result-card">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2">
              {item.label}
            </p>
            <p className="font-heading text-2xl text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      {/* New classification card - Gallagher et al. 2000 */}
      <div className="result-card">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full" style={{ background: cls.cor }} />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-heading">
            Classificação
          </span>
        </div>
        <p className="font-heading text-xl" style={{ color: cls.cor }}>{cls.label}</p>
        <p className="text-xs text-muted-foreground font-body mt-1">{cls.descricao}</p>
        <p className="text-[8px] text-muted-foreground/60 font-body italic mt-2 leading-relaxed">
          📚 Gallagher et al. (2000) Am J Clin Nutr 72:694–701 · ACE · Lohman (1993) · ACSM
          {cls.ajuste > 0 && ` · Ajuste etário: +${cls.ajuste}%`}
        </p>
      </div>
    </div>
  );
};

export default ResultCards;
