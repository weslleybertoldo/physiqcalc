import { MedidasCorporais, medidasVazias } from "@/types/medidas";

const CHAVE = 'physiqcalc_comparativo_v1';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

interface RefData {
  nome: string;
  data: string;
  peso: number | '';
  pctGordura: number | '';
  medidas: MedidasCorporais;
}

interface NovoData {
  data: string;
  peso: number | '';
  pctGordura: number | '';
  medidas: MedidasCorporais;
}

interface DadosComuns {
  sexo: 'M' | 'F';
  idade: number | '';
  altura: number | '';
}

export interface ComparativoStorage {
  timestamp: number;
  refData: RefData;
  novoData: NovoData;
  dadosComuns: DadosComuns;
}

export function salvarComparativo(data: Omit<ComparativoStorage, 'timestamp'>) {
  const payload: ComparativoStorage = { ...data, timestamp: Date.now() };
  localStorage.setItem(CHAVE, JSON.stringify(payload));
}

export function carregarComparativo(): Omit<ComparativoStorage, 'timestamp'> | null {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return null;
    const parsed: ComparativoStorage = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > TTL_MS) {
      localStorage.removeItem(CHAVE);
      return null;
    }
    const { timestamp, ...rest } = parsed;
    return rest;
  } catch {
    return null;
  }
}

export function limparComparativo() {
  localStorage.removeItem(CHAVE);
}
