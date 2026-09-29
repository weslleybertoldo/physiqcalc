import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { CircleAlert, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSessao } from "@/nucleo/sessao";
import { MENSAGEM_TROCA, retentavel } from "@/nucleo/trocaToken";
import { TelaTrava } from "./pecas/TelaTrava";

/** Abas que dependem do Banco do Treino (as telas de hoje): a de abertura "/", Treino e Evolução. */
function precisaDoTreinoAqui(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/treino") || pathname.startsWith("/evolucao");
}

/**
 * Trava do app quando a troca de token não deu certo (spec 9): "Não foi possível abrir seu treino. Tentar de novo" na
 * aba Treino; conflito de conta → "Sua conta precisa de uma conferência" (o master resolve); muitas tentativas → "Tente
 * em alguns minutos". Só nas abas que usam o Banco do Treino — Dieta e Perfil (W7/W11) seguem abrindo.
 */
export default function GateSessaoTreino({ children }: { children: ReactNode }) {
  const { situacao, treino, tentarTreinoDeNovo } = useSessao();
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!situacao?.precisa_treino || user || treino.estado !== "erro" || !treino.erro || !precisaDoTreinoAqui(pathname)) {
    return <>{children}</>;
  }
  const podeTentar = retentavel(treino.erro) || treino.erro === "limite";
  return (
    <TelaTrava
      marca={`troca-${treino.erro}`}
      icone={CircleAlert}
      tom={treino.erro === "conflito" ? "var(--p-ambar-3)" : "var(--p-rosa-3)"}
      titulo={treino.erro === "conflito" ? "Sua conta precisa de uma conferência" : "Não foi possível abrir seu treino"}
      texto={
        treino.erro === "conflito"
          ? "Já avisamos o suporte: assim que a sua conta for conferida, o seu treino abre aqui. Se você entrava no app com o Google, saia e entre com o Google."
          : MENSAGEM_TROCA[treino.erro]
      }
      acoes={
        podeTentar ? (
          <button type="button" className="pq-botao pq-botao-w w-full" onClick={tentarTreinoDeNovo} data-troca-tentar>
            <RefreshCw aria-hidden /> Tentar de novo
          </button>
        ) : undefined
      }
    />
  );
}
