// Physiq W24 — o que as 3 abas do Painel › Dietas dividem: a conta ativa e quem é você nela. Escrever (alimento, receita, reação)
// exige ser nutricionista numa conta com Nutrição (a restritiva da W3 — spec §8.1, linha "Nutrição"); o master passa sempre (como no
// site antigo). Quem vê o quê é do banco: TACO de todos; alimento e receita próprios de quem criou; diário pela regra clínica da W18.
import { useMemo } from "react";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";

export interface ContextoDietas {
  uid: string;
  contaId: string;
  contaNome: string;
  /** nutricionista da conta ativa com o módulo Nutrição (ou o master): cadastra alimentos e receitas e reage no diário */
  souNutri: boolean;
  master: boolean;
  dono: boolean;
  pronto: boolean;
}

/** Regra pura (testada): papel de nutricionista + módulo Nutrição na conta, ou master. */
export function podeEscreverNutricao(papeis: readonly string[], modulos: readonly string[], master: boolean): boolean {
  return master || (papeis.includes("nutricionista") && modulos.includes("nutricao"));
}

export function useContextoDietas(): ContextoDietas {
  const { conta, ehMaster, ehDono } = useConta();
  const { usuario } = useSessao();
  const uid = usuario?.id ?? "";
  const contaId = conta?.id ?? "";
  const papeis = useMemo(() => (conta?.papeis ?? []) as string[], [conta?.papeis]);
  const modulos = useMemo(() => (conta?.modulos ?? []) as string[], [conta?.modulos]);
  return {
    uid,
    contaId,
    contaNome: conta?.nome ?? "",
    souNutri: podeEscreverNutricao(papeis, modulos, ehMaster),
    master: ehMaster,
    dono: ehDono,
    pronto: !!uid && !!contaId,
  };
}
