import { MEDIDA_FIELDS, MEDIDA_GROUPS } from "@/lib/medidas";

interface MedidasCorporaisDisplayProps {
  data: Record<string, any>;
}

const MedidasCorporaisDisplay = ({ data }: MedidasCorporaisDisplayProps) => {
  const hasAny = MEDIDA_FIELDS.some(f => data?.[f.key] != null);
  if (!hasAny) return null;

  return (
    <div>
      <h2 className="font-heading text-xl text-foreground mb-6">Medidas Corporais (cm)</h2>
      {MEDIDA_GROUPS.map(group => {
        const fields = MEDIDA_FIELDS.filter(f => f.group === group.key && data?.[f.key] != null);
        if (fields.length === 0) return null;
        return (
          <div key={group.key} className="mb-6">
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted-foreground/60 mb-3 pb-1.5 border-b border-muted-foreground/20">
              {group.label}
            </p>
            <div className={`grid ${group.key === 'tronco' ? 'grid-cols-3' : 'grid-cols-4'} gap-3`}>
              {fields.map(f => (
                <div key={f.key} className="result-card">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">{f.label}</p>
                  <p className="font-heading text-[15px] text-foreground">
                    {Number(data[f.key]).toFixed(1)} <span className="text-[11px] text-muted-foreground">cm</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MedidasCorporaisDisplay;
