interface InputFieldProps {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const InputField = ({ label, unit, value, onChange, placeholder }: InputFieldProps) => {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">
        {label} <span className="text-muted-foreground/60">({unit})</span>
      </label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "0"}
        className="input-underline"
      />
    </div>
  );
};

export default InputField;
