import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@powersync/react";
import { PauseCircle, RefreshCw, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSessao } from "@/nucleo/sessao";
import { useOnline } from "@/ui/premium/useOnline";
import { PerfilReduzido } from "./pecas/PerfilReduzido";
import { ROTA_PERFIL_REDUZIDO } from "./pecas/modoReduzido";
import { TelaTrava } from "./pecas/TelaTrava";
import { TEXTO_BLOQUEIO_PROFISSIONAL, TITULO_BLOQUEIO_PROFISSIONAL, bloqueioDoProfissional } from "./pecas/bloqueioAluno";

/**
 * Trava do app: o profissional bloqueou o acesso do aluno (W13, falha F5 — R10, spec 9: "Acesso pausado pelo seu profissional").
 * Lê a situação do banco principal e o espelho do Treino pelo PowerSync (vale sem internet depois da 1ª sincronização — ver
 * ./pecas/bloqueioAluno.ts). O Perfil continua abrindo, reduzido a Sair, Exportar e Excluir (spec 9). Diferente da trava do
 * master (GateBloqueioMaster, que vem antes) e da do inadimplente (GatePagamentoPendente, que só abre Pagamentos).
 */
export default function GateBloqueioAluno({ children }: { children: ReactNode }) {
  const { situacao, recarregarSituacao, treino, tentarTreinoDeNovo } = useSessao();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const { data } = useQuery<{ status: string | null }>("SELECT status FROM physiq_profiles WHERE id = ?", [user?.id ?? ""]);
  const statusTreino = user?.id ? (data?.[0]?.status ?? null) : null;
  // o espelho do aparelho diz "bloqueado" e o principal não: com internet, confere a situação no servidor uma vez
  const [confirmado, setConfirmado] = useState(false);
  const conferindo = useRef(false);
  const semConfirmar = bloqueioDoProfissional(situacao, { status: statusTreino }, false);
  useEffect(() => {
    if (!online || semConfirmar.fonte !== "treino" || confirmado || conferindo.current) return;
    conferindo.current = true;
    void recarregarSituacao()
      .then((nova) => {
        if (nova && !bloqueioDoProfissional(nova, null, true).bloqueado) {
          setConfirmado(true);
          // desbloqueado: a sessão do Treino (encerrada no bloqueio) volta pela troca de token
          if (treino.estado === "erro") tentarTreinoDeNovo();
        }
      })
      .finally(() => {
        conferindo.current = false;
      });
  }, [online, semConfirmar.fonte, confirmado, recarregarSituacao, treino.estado, tentarTreinoDeNovo]);
  // o espelho voltou a "ativo" (desbloqueio sincronizado): a confirmação antiga não vale mais para o próximo bloqueio
  useEffect(() => {
    if (statusTreino !== "bloqueado") setConfirmado(false);
  }, [statusTreino]);

  const b = bloqueioDoProfissional(situacao, { status: statusTreino }, confirmado);
  if (!b.bloqueado) return <>{children}</>;
  const texto = b.mensagem || TEXTO_BLOQUEIO_PROFISSIONAL;
  if (pathname === ROTA_PERFIL_REDUZIDO) {
    return (
      <PerfilReduzido motivo="bloqueio-profissional" titulo={TITULO_BLOQUEIO_PROFISSIONAL} mensagem={texto}>
        {children}
      </PerfilReduzido>
    );
  }
  return (
    <TelaTrava
      marca="bloqueio-profissional"
      icone={PauseCircle}
      tom="var(--p-ambar-3)"
      titulo={TITULO_BLOQUEIO_PROFISSIONAL}
      texto={texto}
      acoes={
        <>
          <button type="button" className="pq-botao pq-botao-g w-full" onClick={() => navigate(ROTA_PERFIL_REDUZIDO)} data-trava-meus-dados>
            <UserRound aria-hidden /> Exportar ou excluir meus dados
          </button>
          {online && (
            <button
              type="button"
              className="pq-botao pq-botao-g w-full"
              onClick={() => {
                setConfirmado(false);
                void recarregarSituacao().then((nova) => {
                  if (nova && !bloqueioDoProfissional(nova, null, true).bloqueado) {
                    setConfirmado(true);
                    if (treino.estado === "erro") tentarTreinoDeNovo();
                  }
                });
              }}
              data-trava-conferir
            >
              <RefreshCw aria-hidden /> Conferir de novo
            </button>
          )}
        </>
      }
    />
  );
}
