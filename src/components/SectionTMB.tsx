import GenderToggle from "./GenderToggle";
import InputField from "./InputField";
import TdeeTable from "./TdeeTable";

interface SectionTMBProps {
  name: string;
  setName: (v: string) => void;
  gender: "male" | "female";
  setGender: (v: "male" | "female") => void;
  age: string;
  setAge: (v: string) => void;
  height: string;
  setHeight: (v: string) => void;
  weight: string;
  setWeight: (v: string) => void;
  tmb: number | null;
}

const SectionTMB = ({
  name, setName, gender, setGender, age, setAge, height, setHeight, weight, setWeight, tmb,
}: SectionTMBProps) => {
  return (
    <section className="py-16 sm:py-24">
      <h2 className="font-heading text-2xl sm:text-3xl text-foreground mb-12">
        Calculadora de TMB
      </h2>

      <div className="space-y-8">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Digite seu nome"
            className="input-underline"
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground font-body uppercase tracking-wider mb-2 block">
            Sexo
          </label>
          <GenderToggle value={gender} onChange={setGender} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <InputField label="Idade" unit="anos" value={age} onChange={setAge} />
          <InputField label="Altura" unit="cm" value={height} onChange={setHeight} />
          <InputField label="Peso" unit="kg" value={weight} onChange={setWeight} />
        </div>
      </div>

      {tmb && (
        <div className="mt-12">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2">
            Taxa Metabólica Basal (Mifflin-St Jeor)
          </p>
          <p className="font-heading text-5xl sm:text-6xl text-primary">
            {Math.round(tmb)}
            <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
          </p>
          <TdeeTable tmb={tmb} />
        </div>
      )}
    </section>
  );
};

export default SectionTMB;
