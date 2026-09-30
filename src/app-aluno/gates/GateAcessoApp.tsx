import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PowerOff, RefreshCw, UserRound } from "lucide-react";
import { useSessao } from "@/nucleo/sessao";
import { useOnline } from "@/ui/premium/useOnline";
import { acessoAppDesligado, TEXTO_ACESSO_APP, TITULO_ACESSO_APP } from "./pecas/acessoApp";
import { PerfilReduzido } from "./pecas/PerfilReduzido";
import { ROTA_PERFIL_REDUZIDO } from "./pecas/modoReduzido";
import { TelaTrava } from "./pecas/TelaTrava";

/**
 * Trava do app: o profissional desligou o "Acesso ao app" do aluno (W14 — R12, spec 9: "Seu acesso ao app está desligado. Fale
 * com seu profissional"). Vem logo depois das travas de bloqueio (GateBloqueioMaster, GateBloqueioAluno) e antes da de pagamento
 * — ver ./pecas/acessoApp.ts. O Perfil continua abrindo reduzido a Sair, Exportar e Excluir (LGPD, como nas travas de bloqueio).
 */
export default function GateAcessoApp({ children }: { children: ReactNode }) {
  const { situacao, recarregarSituacao } = useSessao();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  if (!acessoAppDesligado(situacao)) return <>{children}</>;
  if (pathname === ROTA_PERFIL_REDUZIDO) {
    return (
      <PerfilReduzido motivo="acesso-app" titulo={TITULO_ACESSO_APP} mensagem={TEXTO_ACESSO_APP}>
        {children}
      </PerfilReduzido>
    );
  }
  return (
    <TelaTrava
      marca="acesso-app-desligado"
      icone={PowerOff}
      tom="var(--p-ambar-3)"
      titulo={TITULO_ACESSO_APP}
      texto={TEXTO_ACESSO_APP}
      acoes={
        <>
          <button type="button" className="pq-botao pq-botao-g w-full" onClick={() => navigate(ROTA_PERFIL_REDUZIDO)} data-trava-meus-dados>
            <UserRound aria-hidden /> Exportar ou excluir meus dados
          </button>
          {online && (
            <button type="button" className="pq-botao pq-botao-g w-full" onClick={() => void recarregarSituacao()} data-trava-conferir>
              <RefreshCw aria-hidden /> Conferir de novo
            </button>
          )}
        </>
      }
    />
  );
}
