import InputField from "@/components/InputField";
import { BIO_CAMPOS, METODOS_AVALIACAO, rotulosDobras, type Sexo, type ValoresAvaliacao } from "@/lib/avaliacao";

interface Props {
  valores: ValoresAvaliacao;
  onChange: (v: ValoresAvaliacao) => void;
  sexo: Sexo;
  /** popup estreito (Registrar Avaliação): grade de 2 colunas */
  compacto?: boolean;
}

// Seletor 3 dobras / 7 dobras / Bioimpedância + os campos do tipo escolhido (25/09/2026). Cada tipo guarda os
// próprios valores: trocar de 3 pra 7 não reaproveita a dobra 1 com outro significado.
const CamposAvaliacao = ({ valores, onChange, sexo, compacto = false }: Props) => {
  const lista = valores.metodo === "dobras_7" ? "dobras7" : "dobras3";
  const rotulos = rotulosDobras(valores.metodo, sexo);

  const mudarDobra = (i: number, texto: string) => {
    const nova = [...valores[lista]];
    nova[i] = texto;
    onChange({ ...valores, [lista]: nova });
  };

  const grade = compacto
    ? `grid ${valores.metodo === "dobras_3" ? "grid-cols-3" : "grid-cols-2"} gap-4`
    : valores.metodo === "dobras_3" ? "grid grid-cols-1 sm:grid-cols-3 gap-8" : "grid grid-cols-2 sm:grid-cols-4 gap-8";

  return (
    <div data-campos-avaliacao>
      <p className="text-sm text-muted-foreground font-body uppercase tracking-wider mb-2">Tipo de avaliação</p>
      <div className="flex gap-0 mb-6" role="radiogroup" aria-label="Tipo de avaliação">
        {METODOS_AVALIACAO.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={valores.metodo === m.key}
            data-metodo={m.key}
            onClick={() => onChange({ ...valores, metodo: m.key })}
            className={`flex-1 py-3 px-2 font-heading text-xs sm:text-sm uppercase tracking-widest transition-colors duration-200 ${
              valores.metodo === m.key ? "toggle-active" : "toggle-inactive"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {valores.metodo === "bioimpedancia" ? (
        <>
          <p className="text-xs text-muted-foreground font-body mb-6">Digite o que a balança de bioimpedância mostrou.</p>
          <div className={compacto ? "grid grid-cols-2 gap-4" : "grid grid-cols-2 sm:grid-cols-3 gap-8"}>
            {BIO_CAMPOS.map((c) => (
              <InputField
                key={c.key}
                label={c.label}
                unit={c.unidade}
                value={valores.bio[c.key]}
                onChange={(t) => onChange({ ...valores, bio: { ...valores.bio, [c.key]: t } })}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground font-body mb-6">
            Protocolo Jackson &amp; Pollock — {valores.metodo === "dobras_3" ? `3 dobras (${sexo === "male" ? "masculino" : "feminino"})` : "7 dobras"}.
          </p>
          <div className={grade}>
            {rotulos.map((r, i) => (
              <InputField key={`${valores.metodo}-${r}`} label={r} unit="mm" value={valores[lista][i]} onChange={(t) => mudarDobra(i, t)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default CamposAvaliacao;
