import { createContext, useContext, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import PlanoBloqueado from "@/components/PlanoBloqueado";
import { invokeMp } from "@/lib/mpClient";
import { fmtBRL, fmtData, type PlanoStatus } from "@/lib/saasApi";
import { gatesPainel } from "@/rotas/registro";

// Status do plano do professor (isento pro master). Compartilhado com as páginas do Admin via contexto.
const PlanoCtx = createContext<{ status: PlanoStatus | null; recarregar: () => void }>({ status: null, recarregar: () => {} });
export const usePlanoStatus = () => useContext(PlanoCtx);

// A trava nova de plano legado (W3, src/painel/gates/GatePlanoLegado.tsx) substitui a faixa e a trava daqui.
const TRAVA_NOVA_DE_PLANO = gatesPainel.some((g) => g.nome === "GatePlanoLegado");

/**
 * Fallback das páginas antigas do painel do PROFESSOR (W1): o menu, o topo e a barra do celular agora
 * são da casca nova (src/painel/PainelLayout.tsx); aqui ficou só o que as páginas antigas precisam —
 * o status do plano (usePlanoStatus), a faixa de tolerância e a trava de plano vencido de hoje.
 */
const AdminLayout = ({ children }: { children?: ReactNode }) => {
  const { user, isStaff } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const plano = useQuery({
    queryKey: ["plano-status", user?.id],
    queryFn: () => invokeMp<PlanoStatus>("plano-status"),
    enabled: !!user && isStaff,
    staleTime: 60_000,
    retry: 1,
  });

  const conteudo = children ?? <Outlet />;
  if (!user || !isStaff) return <>{conteudo}</>;

  const status = plano.data ?? null;
  const naAbaPlanos = location.pathname.startsWith("/painel/configuracoes/plano") || location.pathname.startsWith("/admin/planos");
  const travado = !TRAVA_NOVA_DE_PLANO && !!status && !status.isento && status.travado;
  const emTolerancia = !TRAVA_NOVA_DE_PLANO && !!status && !status.isento && !status.travado && status.diasAtraso !== null && status.diasAtraso >= 0
    && !status.professor.cobranca_pausada && !(status.professor.acesso_liberado_ate && status.professor.acesso_liberado_ate >= status.hoje);
  const valorCiclo = status?.professor.ciclo_valor ?? status?.plano?.valor_mensal ?? null;
  const limite = status?.professor.ciclo_vence_em ? (() => { const d = new Date(`${status.professor.ciclo_vence_em}T00:00:00`); d.setDate(d.getDate() + status.tolerancia); return d.toLocaleDateString("pt-BR"); })() : "";

  return (
    <PlanoCtx.Provider value={{ status, recarregar: () => { void plano.refetch(); } }}>
      {emTolerancia && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ambar/30 px-3 py-2.5 text-[13px] text-texto"
          style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}
          data-banner-tolerancia
        >
          <Wallet size={18} className="shrink-0 text-ambar-3" />
          <span className="min-w-[200px] flex-1 font-medium">
            Mensalidade{valorCiclo ? ` de ${fmtBRL(valorCiclo)}` : ""} venceu em {fmtData(status!.professor.ciclo_vence_em)}. Pague até {limite} para não perder o acesso.
          </span>
          {!naAbaPlanos && (
            <button type="button" onClick={() => navigate("/painel/configuracoes/plano")} className="pq-botao pq-botao-g pq-botao-sm">
              Pagar
            </button>
          )}
        </div>
      )}
      {travado && !naAbaPlanos ? <PlanoBloqueado status={status!} /> : conteudo}
    </PlanoCtx.Provider>
  );
};

export default AdminLayout;
