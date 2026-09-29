import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSessao } from "@/nucleo/sessao";
import { MENSAGEM_TROCA, retentavel } from "@/nucleo/trocaToken";
import { EstadoErro } from "@/ui/premium/Estados";

/**
 * Trava do painel quando a troca de token não deu certo (spec 9): as páginas de hoje do painel são as do Calc e usam o
 * Banco do Treino — sem a sessão dele, mostra o erro com "Tentar de novo" no lugar da página (o menu segue).
 */
export default function GateSessaoTreino({ children }: { children: ReactNode }) {
  const { situacao, treino, tentarTreinoDeNovo } = useSessao();
  const { user } = useAuth();
  if (!situacao?.precisa_treino || user || treino.estado !== "erro" || !treino.erro) return <>{children}</>;
  const podeTentar = retentavel(treino.erro) || treino.erro === "limite";
  return (
    <div className="mx-auto mt-6 max-w-lg" data-troca-painel={treino.erro}>
      <EstadoErro
        titulo={treino.erro === "conflito" ? "Sua conta precisa de uma conferência" : "Não foi possível abrir o painel"}
        texto={treino.erro === "conflito" ? "Já avisamos o suporte: assim que a sua conta for conferida, o painel abre aqui." : MENSAGEM_TROCA[treino.erro]}
        aoTentar={podeTentar ? tentarTreinoDeNovo : undefined}
      />
      {!podeTentar && (
        <p className="mt-3 text-center text-[12.5px] text-texto-3">
          <RefreshCw aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          O suporte já foi avisado.
        </p>
      )}
    </div>
  );
}
