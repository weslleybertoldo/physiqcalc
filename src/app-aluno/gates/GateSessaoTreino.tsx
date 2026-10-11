import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { CircleAlert, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSessao } from "@/nucleo/sessao";
import { MENSAGEM_TROCA, retentavel } from "@/nucleo/trocaToken";
import { CLASSE_PAGINA_APP, TituloApp } from "@/app-aluno/perfil/pecas/TopoItem";
import { EstadoCarregando, Esqueleto } from "@/ui/premium/Estados";
import { TelaTrava } from "./pecas/TelaTrava";

/**
 * Abas que dependem do Banco do Treino: Treino e Evolução. O Início (W12, em "/") NÃO espera a troca: o card do treino mostra a
 * espera ou o erro no próprio lugar e os cards da dieta, da consulta e do peso seguem (spec 9: "Dieta e Perfil seguem").
 */
function precisaDoTreinoAqui(pathname: string): boolean {
  return pathname.startsWith("/treino") || pathname.startsWith("/evolucao");
}

/**
 * hml-18b (H-54, F): enquanto a troca de token do Treino não chega, o lugar da aba com o TÍTULO (o h1 da página, no mesmo lugar dele) e
 * o esqueleto — antes era a tela cheia "Abrindo seu treino": o h1 (o maior texto, o LCP) só pintava depois da troca (~6 s no staging).
 */
function EsperaDaAba({ pathname }: { pathname: string }) {
  const treino = pathname.startsWith("/treino");
  return (
    <div className={CLASSE_PAGINA_APP} data-espera-sessao-treino={treino ? "treino" : "evolucao"}>
      <div className="mt-1 flex min-h-10 items-center justify-between gap-2">
        <TituloApp>{treino ? "Treino" : "Evolução"}</TituloApp>
        {treino && (
          <div className="flex items-center gap-2" aria-hidden>
            <Esqueleto className="h-10 w-10 rounded-[14px]" />
            <Esqueleto className="h-10 w-10 rounded-[14px]" />
          </div>
        )}
      </div>
      <EstadoCarregando linhas={4} rotulo={treino ? "Abrindo seu treino" : "Abrindo sua evolução"} />
    </div>
  );
}

/**
 * Trava do app quando a troca de token não deu certo (spec 9): "Não foi possível abrir seu treino. Tentar de novo" na
 * aba Treino; conflito de conta → "Sua conta precisa de uma conferência" (o master resolve); muitas tentativas → "Tente
 * em alguns minutos". Só nas abas que usam o Banco do Treino — Dieta e Perfil (W7/W11) seguem abrindo.
 *
 * W5: a casca não espera mais a troca (o painel travava inteiro); enquanto ela não chega, SÓ as abas do Treino mostram a
 * abertura ("Abrindo seu treino") — a mesma tela de antes, agora no lugar certo.
 */
export default function GateSessaoTreino({ children }: { children: ReactNode }) {
  const { situacao, treino, tentarTreinoDeNovo } = useSessao();
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!situacao?.precisa_treino || user || !precisaDoTreinoAqui(pathname)) return <>{children}</>;
  if (treino.estado !== "erro" || !treino.erro) return <EsperaDaAba pathname={pathname} />;
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
