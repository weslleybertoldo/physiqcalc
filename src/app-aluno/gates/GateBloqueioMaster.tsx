import type { ReactNode } from "react";
import { Ban } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMensalidadeStatus } from "@/hooks/useMensalidadeStatus";
import { useSessao } from "@/nucleo/sessao";
import { bloqueioDoMaster, ehProfissional } from "@/nucleo/situacao";
import { TelaTrava } from "./pecas/TelaTrava";

/**
 * Trava do app: o master bloqueou os alunos da conta (C101, spec 9 — "Acesso pausado" com a mensagem do master). Vale o
 * bloqueio do núcleo (contas.alunos_bloqueados_em) e o do painel master antigo, que fica no Treino (status-lite do
 * Calc). Profissional nunca é travado aqui. Substitui a BloqueioMasterGate da TreinosPage (que sai na W8).
 */
export default function GateBloqueioMaster({ children }: { children: ReactNode }) {
  const { situacao } = useSessao();
  const { user, isStaff } = useAuth();
  const profissional = isStaff || ehProfissional(situacao);
  const { status } = useMensalidadeStatus(profissional ? null : user?.id);
  const b = bloqueioDoMaster(situacao, status ? { bloqueadoPeloMaster: status.bloqueadoPeloMaster } : null);
  if (profissional || !b.bloqueado) return <>{children}</>;
  return (
    <TelaTrava
      marca="bloqueio-master"
      icone={Ban}
      tom="var(--p-rosa-3)"
      titulo="Acesso pausado"
      texto={b.mensagem || "O acesso dos alunos do seu profissional está pausado no momento. Fale com ele para regularizar."}
    />
  );
}
