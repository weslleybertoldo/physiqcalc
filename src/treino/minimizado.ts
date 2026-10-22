import { useCallback, useState } from "react";
import { chaveData } from "./datas";

/**
 * Exercícios do treino minimizados (pedido do Weslley, 22/10/2026): tocar no nome do treino esconde a lista dos exercícios e
 * tocar de novo mostra. Fica guardado no aparelho por dia e por treino do dia — trocar de aba ou reabrir o app não desfaz —, e o
 * dia novo abre com a lista à mostra. Guarda só os últimos 14 dias.
 */
const CHAVE = "physiq_treino_minimizado";
const DIAS_GUARDADOS = 14;

const chaveDe = (dia: string, slot: number) => `${dia}|${slot}`;

function ler(): Record<string, true> {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const obj = bruto ? JSON.parse(bruto) : null;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function estaMinimizado(dia: string, slot: number): boolean {
  return ler()[chaveDe(dia, slot)] === true;
}

export function guardarMinimizado(dia: string, slot: number, minimizado: boolean, hoje = new Date()): void {
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() - DIAS_GUARDADOS);
  const corte = chaveData(limite);
  const prox: Record<string, true> = {};
  for (const [k, v] of Object.entries(ler())) if (v === true && k.slice(0, 10) >= corte) prox[k] = true;
  if (minimizado) prox[chaveDe(dia, slot)] = true;
  else delete prox[chaveDe(dia, slot)];
  try {
    localStorage.setItem(CHAVE, JSON.stringify(prox));
  } catch {
    /* sem armazenamento: vale só enquanto a tela está aberta */
  }
}

/** O estado da lista de um treino do dia, guardado no aparelho. */
export function useListaMinimizada(dia: string, slot: number): [boolean, (minimizado: boolean) => void] {
  const [estado, setEstado] = useState(() => ({ chave: chaveDe(dia, slot), valor: estaMinimizado(dia, slot) }));
  // trocou de dia/treino: relê o guardado (sem efeito, na própria renderização)
  const atual = estado.chave === chaveDe(dia, slot) ? estado.valor : estaMinimizado(dia, slot);
  if (estado.chave !== chaveDe(dia, slot)) setEstado({ chave: chaveDe(dia, slot), valor: atual });
  const mudar = useCallback(
    (minimizado: boolean) => {
      guardarMinimizado(dia, slot, minimizado);
      setEstado({ chave: chaveDe(dia, slot), valor: minimizado });
    },
    [dia, slot],
  );
  return [atual, mudar];
}
