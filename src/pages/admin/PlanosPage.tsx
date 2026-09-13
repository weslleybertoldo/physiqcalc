import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { usePlanoStatus } from "@/layouts/AdminLayout";
import { invokeMp, type MpPagamento } from "@/lib/mpClient";
import type { PlanoStatus } from "@/lib/saasApi";
import { PlanoResumoCard } from "@/components/pagamentos/PlanoResumoCard";
import { PlanoAtivarCard } from "@/components/pagamentos/PlanoAtivarCard";
import { PlanoPagarCard } from "@/components/pagamentos/PlanoPagarCard";
import { PlanoMudarCard } from "@/components/pagamentos/PlanoMudarCard";
import { PlanoHistorico } from "@/components/pagamentos/PlanoHistorico";
import { BTN_LINK, BTN_SECUNDARIO, CARD, codigoErro, mensagemErroPlano } from "@/components/pagamentos/planoTexto";

// Aba Planos do PROFESSOR — o master (isento) vê a MESMA tela, sem bloco nem atalho de master (pedido 13/09/2026): situação do plano, adesão / ciclo / assinatura /
// anual, troca de plano e histórico. O status vem do layout (usePlanoStatus); se ainda não chegou,
// a página busca `plano-status` sozinha. Toda ação → refetch aqui + recarregar() do layout (banner/trava).
const PlanosPage = () => {
  const ctx = usePlanoStatus();
  const [local, setLocal] = useState<PlanoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const status = local ?? ctx.status;

  // o layout recarregou (react-query) → o contexto volta a mandar
  useEffect(() => { if (ctx.status) setLocal(null); }, [ctx.status]);

  const buscar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setLocal(await invokeMp<PlanoStatus>("plano-status"));
    } catch (e) {
      console.error("[Planos] plano-status", e);
      setErro(codigoErro(e) || "erro");
    } finally {
      setLoading(false);
    }
  }, []);

  // sem status do layout → busca sozinho (com uma folga curta pra não duplicar a chamada do layout)
  useEffect(() => {
    if (ctx.status || local) return;
    const t = setTimeout(() => { void buscar(); }, 600);
    return () => clearTimeout(t);
  }, [ctx.status, local, buscar]);

  const atualizar = useCallback(async () => {
    await buscar();
    ctx.recarregar();
  }, [buscar, ctx]);

  const podeAgir = !!status && !status.isento && !!status.plano && status.professor.status !== "suspenso";

  return (
    <div className="max-w-2xl space-y-4" data-plano-page>
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-xl text-foreground uppercase tracking-wider">Planos</h1>
        <button type="button" onClick={() => void atualizar()} aria-label="Atualizar" disabled={loading}
          className="ml-auto text-muted-foreground hover:text-primary transition-colors disabled:opacity-50" data-plano-atualizar>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {!status ? (
        erro ? (
          <div className={CARD} data-plano-erro>
            <p className="text-sm text-destructive font-body">Não foi possível carregar seu plano: {mensagemErroPlano(erro, {}, erro)}</p>
            <button type="button" onClick={() => void buscar()} className={BTN_SECUNDARIO}>Tentar de novo</button>
          </div>
        ) : (
          <p className="text-muted-foreground font-body text-sm">Carregando...</p>
        )
      ) : (
        <>
          <PlanoResumoCard status={status} />
          {podeAgir && (
            !status.professor.adesao_paga_em
              ? <PlanoAtivarCard status={status} onAtualizar={atualizar} />
              : <PlanoPagarCard status={status} onAtualizar={atualizar} />
          )}
          {!status.isento && <PlanoMudarCard status={status} onAtualizar={atualizar} />}
          <PlanoHistorico pagamentos={status.pagamentos as MpPagamento[]} />
          {erro && (
            <p className="text-xs text-destructive font-body">
              A última atualização falhou ({erro}). <button type="button" onClick={() => void buscar()} className={BTN_LINK}>Tentar de novo</button>
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default PlanosPage;
