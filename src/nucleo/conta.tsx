/**
 * Papéis e módulos no app (W3, spec 4.1): a conta ativa do painel (o card da conta troca — NF13), os papéis da pessoa
 * nela, as matrículas e os módulos do aluno. Vem da `minha_situacao()` (src/nucleo/sessao.tsx); a escolha da conta ativa
 * fica guardada no aparelho, por pessoa.
 */
import { useCallback, useSyncExternalStore } from "react";
import { useSessao } from "./sessao";
import { ehProfissional, escolherConta, rotuloDoPapel, type ContaSituacao, type MatriculaSituacao, type Situacao } from "./situacao";
import type { Modulo } from "@/ui/casca/dadosCasca";

const CHAVE = "physiq_conta_ativa:";
const ouvintes = new Set<() => void>();

function lerPreferida(uid: string | null | undefined): string | null {
  if (!uid) return null;
  try {
    return localStorage.getItem(CHAVE + uid);
  } catch {
    return null;
  }
}

function assinar(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  return () => ouvintes.delete(aoMudar);
}

/** Troca a conta ativa (fora do React também: o card da conta chama pelo hook). */
export function escolherContaAtiva(uid: string, contaId: string): void {
  try {
    localStorage.setItem(CHAVE + uid, contaId);
  } catch {
    /* sem armazenamento: vale só nesta abertura */
  }
  ouvintes.forEach((f) => f());
}

export interface ContaValor {
  situacao: Situacao | null;
  contas: ContaSituacao[];
  conta: ContaSituacao | null;
  trocarConta: (id: string) => void;
  matriculas: MatriculaSituacao[];
  modulosAluno: Modulo[];
  ehProfissional: boolean;
  ehMaster: boolean;
  ehDono: boolean;
  papelRotulo: string;
}

export function useConta(): ContaValor {
  const { situacao, usuario } = useSessao();
  const uid = usuario?.id ?? null;
  const preferida = useSyncExternalStore(assinar, () => lerPreferida(uid), () => null);
  const conta = escolherConta(situacao, preferida);
  const trocarConta = useCallback((id: string) => {
    if (uid) escolherContaAtiva(uid, id);
  }, [uid]);
  return {
    situacao,
    contas: situacao?.contas ?? [],
    conta,
    trocarConta,
    matriculas: situacao?.matriculas ?? [],
    modulosAluno: situacao?.modulos_aluno ?? [],
    ehProfissional: ehProfissional(situacao),
    ehMaster: !!situacao?.master,
    ehDono: !!conta?.papeis.includes("dono"),
    papelRotulo: rotuloDoPapel(situacao, conta),
  };
}
