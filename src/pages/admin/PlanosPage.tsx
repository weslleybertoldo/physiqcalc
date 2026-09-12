import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, RefreshCw } from "lucide-react";
import { usePlanoStatus } from "@/layouts/AdminLayout";
import { invokeMp, type MpPagamento } from "@/lib/mpClient";
import { planoComValor, type PlanoStatus } from "@/lib/saasApi";
import { PlanoResumoCard } from "@/components/pagamentos/PlanoResumoCard";
import { PlanoAtivarCard } from "@/components/pagamentos/PlanoAtivarCard";
import { PlanoPagarCard } from "@/components/pagamentos/PlanoPagarCard";
import { PlanoMudarCard } from "@/components/pagamentos/PlanoMudarCard";
import { PlanoHistorico } from "@/components/pagamentos/PlanoHistorico";
import { BTN_LINK, BTN_SECUNDARIO, CARD, TITULO_CARD, codigoErro, faixaAlunos, mensagemErroPlano } from "@/components/pagamentos/planoTexto";

// Aba Planos do PROFESSOR (e do master, que é isento): situação do plano, adesão / ciclo / assinatura /
// anual, troca de plano e histórico. O status vem do layout (usePlanoStatus); se ainda não chegou,
// a página busca `plano-status` sozinha. Toda ação → refetch aqui + recarregar() do layout (banner/trava).
const PlanosPage = () => {
  const ctx = usePlanoStatus();
  const navigate = useNavigate();
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
      ) : status.isento ? (
        <>
          <section className={CARD} data-plano-master>
            <div className="flex items-center gap-2">
              <Crown size={16} className="text-primary" />
              <h2 className={TITULO_CARD}>Conta master — sem cobrança</h2>
            </div>
            <p className="text-sm text-muted-foreground font-body">
              Você é o dono da plataforma: não paga adesão nem mensalidade. Os planos abaixo são os que os professores contratam.
            </p>
            <button type="button" onClick={() => navigate("/master/planos")} className={BTN_SECUNDARIO} data-plano-gerenciar>
              Gerenciar planos
            </button>
          </section>
          <section className={CARD} data-plano-lista-master>
            <h2 className={TITULO_CARD}>Planos disponíveis</h2>
            {status.planos.length === 0 ? (
              <p className="text-xs text-muted-foreground font-body">Nenhum plano ativo.</p>
            ) : (
              <ul>
                {status.planos.map((pl) => (
                  <li key={pl.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-muted-foreground/20 py-2 last:border-0" data-plano-opcao={pl.id}>
                    <span className="font-heading text-sm text-foreground">{planoComValor(pl)}</span>
                    <span className="text-xs text-muted-foreground font-body">{faixaAlunos(pl)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <>
          <PlanoResumoCard status={status} />
          {podeAgir && (
            !status.professor.adesao_paga_em
              ? <PlanoAtivarCard status={status} onAtualizar={atualizar} />
              : <PlanoPagarCard status={status} onAtualizar={atualizar} />
          )}
          <PlanoMudarCard status={status} onAtualizar={atualizar} />
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
