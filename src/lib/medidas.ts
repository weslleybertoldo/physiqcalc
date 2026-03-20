// Shared measurement field definitions
export const MEDIDA_FIELDS = [
  { key: "medida_pescoco", label: "Pescoço", group: "tronco" },
  { key: "medida_ombro", label: "Ombro", group: "tronco" },
  { key: "medida_peitoral", label: "Peitoral", group: "tronco" },
  { key: "medida_cintura", label: "Cintura", group: "tronco" },
  { key: "medida_abdomen", label: "Abdômen", group: "tronco" },
  { key: "medida_quadril", label: "Quadril", group: "tronco" },
  { key: "medida_braco_d", label: "Braço D", group: "bracos" },
  { key: "medida_braco_e", label: "Braço E", group: "bracos" },
  { key: "medida_antebraco_d", label: "Antebraço D", group: "bracos" },
  { key: "medida_antebraco_e", label: "Antebraço E", group: "bracos" },
  { key: "medida_coxa_d", label: "Coxa D", group: "pernas" },
  { key: "medida_coxa_e", label: "Coxa E", group: "pernas" },
  { key: "medida_panturrilha_d", label: "Panturrilha D", group: "pernas" },
  { key: "medida_panturrilha_e", label: "Panturrilha E", group: "pernas" },
] as const;

export type MedidaKey = typeof MEDIDA_FIELDS[number]["key"];

export const MEDIDA_GROUPS = [
  { key: "tronco", label: "Tronco" },
  { key: "bracos", label: "Braços" },
  { key: "pernas", label: "Pernas" },
] as const;

// Metrics where lower values are "better" for evolution tracking
export const MEDIDA_LOWER_BETTER: MedidaKey[] = ["medida_cintura", "medida_abdomen", "medida_quadril"];
