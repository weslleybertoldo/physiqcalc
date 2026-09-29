import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Ban, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMensalidadeStatus } from "@/hooks/useMensalidadeStatus";
import { useSessao } from "@/nucleo/sessao";
import { bloqueioDoMaster, ehProfissional } from "@/nucleo/situacao";
import { PerfilReduzido } from "./pecas/PerfilReduzido";
import { ROTA_PERFIL_REDUZIDO } from "./pecas/modoReduzido";
import { TelaTrava } from "./pecas/TelaTrava";

const TEXTO_PADRAO = "O acesso dos alunos do seu profissional está pausado no momento. Fale com ele para regularizar.";

/**
 * Trava do app: o master bloqueou os alunos da conta (C101, spec 9 — "Acesso pausado" com a mensagem do master). Vale o
 * bloqueio do núcleo (contas.alunos_bloqueados_em) e o do painel master antigo, que fica no Treino (status-lite do
 * Calc). Profissional nunca é travado aqui. Substitui a BloqueioMasterGate da TreinosPage (que sai na W8).
 * W7 (spec 9): com o app fechado, o Perfil segue abrindo, reduzido a Sair, Exportar e Excluir.
 */
export default function GateBloqueioMaster({ children }: { children: ReactNode }) {
  const { situacao } = useSessao();
  const { user, isStaff } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const profissional = isStaff || ehProfissional(situacao);
  const { status } = useMensalidadeStatus(profissional ? null : user?.id);
  const b = bloqueioDoMaster(situacao, status ? { bloqueadoPeloMaster: status.bloqueadoPeloMaster } : null);
  if (profissional || !b.bloqueado) return <>{children}</>;
  const texto = b.mensagem || TEXTO_PADRAO;
  if (pathname === ROTA_PERFIL_REDUZIDO) {
    return (
      <PerfilReduzido motivo="bloqueio-master" titulo="Acesso pausado" mensagem={texto}>
        {children}
      </PerfilReduzido>
    );
  }
  return (
    <TelaTrava
      marca="bloqueio-master"
      icone={Ban}
      tom="var(--p-rosa-3)"
      titulo="Acesso pausado"
      texto={texto}
      acoes={
        <button type="button" className="pq-botao pq-botao-g w-full" onClick={() => navigate(ROTA_PERFIL_REDUZIDO)} data-trava-meus-dados>
          <UserRound aria-hidden /> Exportar ou excluir meus dados
        </button>
      }
    />
  );
}
