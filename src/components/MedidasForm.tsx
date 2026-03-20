import { MedidasCorporais } from "@/types/medidas";

interface MedidasFormProps {
  medidas: MedidasCorporais;
  onChange: (medidas: MedidasCorporais) => void;
  colunas?: 2 | 3 | 4;
}

const MedidasForm = ({ medidas, onChange, colunas = 3 }: MedidasFormProps) => {
  const handleChange = (key: keyof MedidasCorporais, value: string) => {
    onChange({ ...medidas, [key]: value === '' ? '' : +value });
  };

  const troncoFields = [
    { label: 'Pescoço (cm)', key: 'pescoco' as const },
    { label: 'Ombro (cm)', key: 'ombro' as const },
    { label: 'Peitoral (cm)', key: 'peitoral' as const },
    { label: 'Cintura (cm)', key: 'cintura' as const },
    { label: 'Abdômen (cm)', key: 'abdomen' as const },
    { label: 'Quadril (cm)', key: 'quadril' as const },
  ];

  const bracosFields = [
    { label: 'Braço D (cm)', key: 'bracoD' as const },
    { label: 'Braço E (cm)', key: 'bracoE' as const },
    { label: 'Antebraço D (cm)', key: 'antebracoD' as const },
    { label: 'Antebraço E (cm)', key: 'antebracoE' as const },
  ];

  const pernasFields = [
    { label: 'Coxa D (cm)', key: 'coxaD' as const },
    { label: 'Coxa E (cm)', key: 'coxaE' as const },
    { label: 'Panturrilha D (cm)', key: 'panturrilhaD' as const },
    { label: 'Panturrilha E (cm)', key: 'panturrilhaE' as const },
  ];

  const gridClass = colunas === 2 ? 'grid-cols-2' : colunas === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3';

  const renderSection = (title: string, fields: { label: string; key: keyof MedidasCorporais }[], gridCols: string) => (
    <>
      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted-foreground/60 mb-3 pb-1.5 border-b border-muted-foreground/20">
        {title}
      </p>
      <div className={`grid ${gridCols} gap-4 mb-5`}>
        {fields.map(({ label, key }) => (
          <div key={key}>
            <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground block mb-1.5">
              {label}
            </label>
            <input
              type="number"
              step="0.1"
              placeholder="0"
              value={medidas[key]}
              onChange={e => handleChange(key, e.target.value)}
              className="w-full bg-transparent border-b border-muted-foreground/20 py-2 text-foreground text-[16px] outline-none focus:border-primary transition-colors"
            />
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div>
      {renderSection('TRONCO', troncoFields, gridClass)}
      {renderSection('BRAÇOS', bracosFields, colunas === 3 ? 'grid-cols-2 sm:grid-cols-4' : gridClass)}
      {renderSection('PERNAS', pernasFields, colunas === 3 ? 'grid-cols-2 sm:grid-cols-4' : gridClass)}
    </div>
  );
};

export default MedidasForm;
