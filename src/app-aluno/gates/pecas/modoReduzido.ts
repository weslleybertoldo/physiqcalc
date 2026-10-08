import { createContext, useContext } from "react";

/**
 * Perfil reduzido (spec 9, W7): quando uma trava fecha o app por BLOQUEIO (o master pausou os alunos da conta — a
 * GateBloqueioMaster; e o "Bloquear acesso" do profissional, R10, na W13), o Perfil continua abrindo só com Sair, Exportar e
 * Excluir (LGPD: a pessoa sempre consegue levar os dados e apagar a conta). A trava deixa passar a rota /perfil dentro deste
 * contexto (componente PerfilReduzido) e a aba Perfil lê daqui. hml-11 (D14): a trava do inadimplente (GatePagamentoPendente) também.
 */
export interface ModoReduzido {
  motivo: string;
  titulo: string;
  mensagem: string;
}

export const CtxPerfilReduzido = createContext<ModoReduzido | null>(null);

/** null = Perfil completo. */
export function usePerfilReduzido(): ModoReduzido | null {
  return useContext(CtxPerfilReduzido);
}

/** A rota que a trava de bloqueio deixa abrir (só a aba, não os itens: /perfil/pagamentos, /perfil/conta… seguem fechados). */
export const ROTA_PERFIL_REDUZIDO = "/perfil";
