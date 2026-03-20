interface GenderToggleProps {
  value: "male" | "female";
  onChange: (v: "male" | "female") => void;
}

const GenderToggle = ({ value, onChange }: GenderToggleProps) => {
  return (
    <div className="flex gap-0">
      <button
        type="button"
        onClick={() => onChange("male")}
        className={`flex-1 py-3 px-6 font-heading text-sm uppercase tracking-widest transition-colors duration-200 ${
          value === "male" ? "toggle-active" : "toggle-inactive"
        }`}
      >
        Masculino
      </button>
      <button
        type="button"
        onClick={() => onChange("female")}
        className={`flex-1 py-3 px-6 font-heading text-sm uppercase tracking-widest transition-colors duration-200 ${
          value === "female" ? "toggle-active" : "toggle-inactive"
        }`}
      >
        Feminino
      </button>
    </div>
  );
};

export default GenderToggle;
