import { useState } from "react";

interface TabelaReferenciaGorduraProps {
  sexoInicial?: "M" | "F";
}

const FAIXAS_MASCULINO = [
  { faixa: 'Gordura Essencial', range: '< 5%', cor: '#ef4444' },
  { faixa: 'Atleta', range: '5 – 13%', cor: '#22c55e' },
  { faixa: 'Boa Forma', range: '14 – 17%', cor: '#4ade80' },
  { faixa: 'Aceitável', range: '18 – 24%', cor: '#facc15' },
  { faixa: 'Obesidade', range: '> 24%', cor: '#f97316' },
];

const FAIXAS_FEMININO = [
  { faixa: 'Gordura Essencial', range: '< 10%', cor: '#ef4444' },
  { faixa: 'Atleta', range: '10 – 20%', cor: '#22c55e' },
  { faixa: 'Boa Forma', range: '21 – 24%', cor: '#4ade80' },
  { faixa: 'Aceitável', range: '25 – 31%', cor: '#facc15' },
  { faixa: 'Obesidade', range: '> 31%', cor: '#f97316' },
];

const TabelaReferenciaGordura = ({ sexoInicial = "M" }: TabelaReferenciaGorduraProps) => {
  const [sexo, setSexo] = useState<"M" | "F">(sexoInicial);
  const faixas = sexo === "M" ? FAIXAS_MASCULINO : FAIXAS_FEMININO;

  return (
    <div className="result-card mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">
          Tabela de Referência — % Gordura
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSexo("M")}
            className={`px-3 py-1 text-[10px] font-heading uppercase tracking-wider rounded transition-colors ${
              sexo === "M" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            Masc
          </button>
          <button
            type="button"
            onClick={() => setSexo("F")}
            className={`px-3 py-1 text-[10px] font-heading uppercase tracking-wider rounded transition-colors ${
              sexo === "F" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            Fem
          </button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-muted-foreground/20">
            <th className="text-left py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Classificação</th>
            <th className="text-left py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Faixa</th>
          </tr>
        </thead>
        <tbody>
          {faixas.map((f) => (
            <tr key={f.faixa} className="border-b border-muted-foreground/10 last:border-b-0">
              <td className="py-2.5 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: f.cor }} />
                <span className="font-heading text-foreground text-sm">{f.faixa}</span>
              </td>
              <td className="py-2.5 text-muted-foreground font-body text-sm">{f.range}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[8px] text-muted-foreground/60 font-body italic mt-3 leading-relaxed">
        📚 Gallagher et al. (2000) · ACE · Lohman (1993) · ACSM — Valores base para adultos 20-39 anos. 
        Acima de 40 anos: +2%. Acima de 60 anos: +4%.
      </p>
    </div>
  );
};

export default TabelaReferenciaGordura;
