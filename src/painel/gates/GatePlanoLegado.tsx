import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Lock, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { invokeMp } from "@/lib/mpClient";
import { fmtBRL, fmtData, type PlanoStatus } from "@/lib/saasApi";
import { useConta } from "@/nucleo/conta";
import { ASSINATURA_NUTRI, situacaoNutri, textoTravaNutri } from "@/nucleo/planoLegado";
import { useSessao } from "@/nucleo/sessao";
import { regraDoPlano } from "@/nucleo/situacao";
import { Cartao } from "@/ui/premium/Cartao";

function Trava({ titulo, texto, nota, acao }: { titulo: string; texto: ReactNode; nota: string; acao: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-8" data-plano-bloqueado>
      <Cartao brilho className="flex w-full max-w-lg flex-col items-center gap-4 px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie text-rosa-3">
          <Lock aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.8} />
        </span>
        <h2 className="font-body text-[19px] font-semibold normal-case tracking-[-0.02em] text-texto">{titulo}</h2>
        <p className="max-w-md text-[13.5px] leading-relaxed text-texto-2">{texto}</p>
        <p className="text-[12.5px] text-texto-3">{nota}</p>
        {acao}
      </Cartao>
    </div>
  );
}

/**
 * Travas de plano LEGADAS do painel (W3, spec 11.3; substitui a faixa e a trava do AdminLayout antigo), pela conta ativa — só
 * enquanto a cobrança dela é a antiga (cobranca_legada; W28: depois do script da virada a legada é do núcleo — GatePlano):
 *   · 'legado_calc' → o plano-status do Calc de hoje: faixa "pague até" nos 7 dias de tolerância e trava depois (só a
 *     aba Plano abre); os alunos continuam treinando;
 *   · 'legado_nutri' → a regra do assinaturaUtil.ts do Nutri: "Assinatura pendente" com o caminho para pagar no site do
 *     PhysiqNutri até a W28 (os dados ficam guardados);
 *   · conta nova ou isenta → nada (a cobrança das contas novas é da W4).
 */
export default function GatePlanoLegado({ children }: { children: ReactNode }) {
  const { situacao } = useSessao();
  const { conta } = useConta();
  const { user, isStaff } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const regra = regraDoPlano(conta, situacao);
  const naAbaPlano = pathname.startsWith("/painel/configuracoes/plano");

  const plano = useQuery({
    queryKey: ["plano-status", user?.id],
    queryFn: () => invokeMp<PlanoStatus>("plano-status"),
    enabled: regra === "calc" && Boolean(user) && isStaff,
    staleTime: 60_000,
    retry: 1,
  });

  if (regra === "calc") {
    const s = plano.data;
    if (!s || s.isento) return <>{children}</>;
    if (s.travado && !naAbaPlano) {
      const valor = s.professor.ciclo_valor ?? s.plano?.valor_mensal ?? null;
      return (
        <Trava
          titulo="Acesso suspenso"
          texto={<>Sua mensalidade{valor ? ` de ${fmtBRL(valor)}` : ""} venceu em <b className="text-rosa-3">{fmtData(s.professor.ciclo_vence_em)}</b> e passou dos {s.tolerancia} dias de tolerância. Regularize para voltar ao painel.</>}
          nota="Seus alunos continuam treinando normalmente."
          acao={<button type="button" className="pq-botao pq-botao-w" onClick={() => navigate("/painel/configuracoes/plano")}>Pagar agora</button>}
        />
      );
    }
    const emTolerancia = !s.travado && s.diasAtraso !== null && s.diasAtraso >= 0 && !s.professor.cobranca_pausada
      && !(s.professor.acesso_liberado_ate && s.professor.acesso_liberado_ate >= s.hoje);
    if (emTolerancia) {
      const valor = s.professor.ciclo_valor ?? s.plano?.valor_mensal ?? null;
      const limite = s.professor.ciclo_vence_em
        ? (() => { const d = new Date(`${s.professor.ciclo_vence_em}T00:00:00`); d.setDate(d.getDate() + s.tolerancia); return d.toLocaleDateString("pt-BR"); })()
        : "";
      return (
        <>
          <div data-banner-tolerancia className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ambar/30 px-3 py-2.5 text-[13px] text-texto"
            style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}>
            <Wallet aria-hidden size={18} className="shrink-0 text-ambar-3" />
            <span className="min-w-[200px] flex-1 font-medium">
              Mensalidade{valor ? ` de ${fmtBRL(valor)}` : ""} venceu em {fmtData(s.professor.ciclo_vence_em)}. Pague até {limite} para não perder o acesso.
            </span>
            {!naAbaPlano && (
              <button type="button" onClick={() => navigate("/painel/configuracoes/plano")} className="pq-botao pq-botao-g pq-botao-sm">Pagar</button>
            )}
          </div>
          {children}
        </>
      );
    }
    return <>{children}</>;
  }

  if (regra === "nutri") {
    const e = situacaoNutri(situacao?.legado_nutri);
    if (e.bloqueado && !naAbaPlano) {
      return (
        <Trava
          titulo="Assinatura pendente"
          texto={<>{textoTravaNutri(e)} Até o Physiq trazer a cobrança para cá, a assinatura continua no site do PhysiqNutri.</>}
          nota="Seus pacientes e registros continuam guardados — nada é apagado."
          acao={
            <a href={ASSINATURA_NUTRI} target="_blank" rel="noopener noreferrer" className="pq-botao pq-botao-w">
              <ExternalLink aria-hidden /> Pagar no PhysiqNutri
            </a>
          }
        />
      );
    }
  }
  return <>{children}</>;
}
