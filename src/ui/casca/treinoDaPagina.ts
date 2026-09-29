import { useAuth } from "@/hooks/useAuth";
import { useSessao } from "@/nucleo/sessao";
import { MENSAGEM_TROCA, type ErroTroca } from "@/nucleo/trocaToken";

/**
 * Páginas do painel que ainda são as do Calc (Banco do Treino) — W5, correção do "painel inteiro trava sem o Treino".
 * Só ELAS esperam a sessão do Treino (troca de token); o resto do painel (menu, Configurações, Plano, Equipe…) é do banco
 * principal e abre sempre. Estados do sistema visual (4.9): carregando, erro com "Tentar de novo" e sem papel no Treino.
 */
export type TreinoDaPagina = { tipo: "ok" } | { tipo: "carregando" } | { tipo: "erro"; erro: ErroTroca } | { tipo: "sem-papel" };

/** A página que usa o Banco do Treino pode abrir? (regra pura — testada em SemConexaoTreino.test.tsx) */
export function treinoDaPagina(p: {
  temUsuarioTreino: boolean;
  temSituacao: boolean;
  precisaTreino: boolean;
  estado: string;
  erro: ErroTroca | null;
}): TreinoDaPagina {
  if (p.temUsuarioTreino) return { tipo: "ok" };
  // sem a situação (principal fora do ar e nada guardado): vale o que o Treino sabe, como antes (spec 9)
  if (!p.temSituacao) return { tipo: "ok" };
  // quem não usa o Treino nesta conta (ex.: só nutricionista numa conta com Treino): a página é do módulo Treino
  if (!p.precisaTreino) return { tipo: "sem-papel" };
  if (p.estado === "erro" && p.erro) return { tipo: "erro", erro: p.erro };
  return { tipo: "carregando" };
}

export function useTreinoDaPagina(): TreinoDaPagina {
  const { situacao, treino } = useSessao();
  const { user } = useAuth();
  return treinoDaPagina({
    temUsuarioTreino: Boolean(user),
    temSituacao: Boolean(situacao),
    precisaTreino: Boolean(situacao?.precisa_treino),
    estado: treino.estado,
    erro: treino.erro,
  });
}

/** Frase do painel para cada erro da troca (as do app falam do "seu treino"; aqui são as páginas do Treino). */
export const MENSAGEM_TREINO_PAINEL: Record<ErroTroca, string> = {
  rede: "Não conseguimos falar com o Treino agora. Confira a internet e tente de novo.",
  indisponivel: "O Treino está fora do ar neste momento. As páginas dele voltam assim que ele voltar.",
  interno: "O Treino não respondeu direito agora. Tente de novo em instantes.",
  limite: "Muitas tentativas. Tente em alguns minutos.",
  conflito: "Já avisamos o suporte: assim que a sua conta for conferida, as páginas do Treino abrem aqui.",
  staging: MENSAGEM_TROCA.staging,
  email: MENSAGEM_TROCA.email,
  invalido: MENSAGEM_TROCA.invalido,
};
