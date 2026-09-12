import { useState } from "react";
import { toast } from "sonner";
import { invokeMp } from "@/lib/mpClient";
import { fmtBRL, fmtData, planoComValor, type PlanoProfessor, type PlanoStatus } from "@/lib/saasApi";
import { ConfirmarDialog } from "./ConfirmarDialog";
import { BADGE_OK, BTN_SECUNDARIO, CARD, TITULO_CARD, codigoErro, faixaAlunos, mensagemErroPlano } from "./planoTexto";

interface RespMudar { ok: boolean; plano?: PlanoProfessor; assinaturaAtualizada?: boolean | null }

// Lista dos planos ativos com o atual marcado; escolher outro → confirmar → plano-mudar.
// Regra: upgrade vale na hora; o valor novo vale a partir do próximo ciclo; downgrade só se os alunos couberem.
export function PlanoMudarCard({ status, onAtualizar }: { status: PlanoStatus; onAtualizar: () => Promise<void> }) {
  const [escolhido, setEscolhido] = useState<PlanoProfessor | null>(null);
  const [busy, setBusy] = useState(false);
  const atualId = status.professor.plano_id;
  const semPlano = !status.plano; // a edge devolve `sem_plano` pra qualquer plano-* nesse caso
  const assinaturaAtiva = !!status.assinatura && status.assinatura.status === "authorized";

  const confirmar = async () => {
    if (!escolhido) return;
    setBusy(true);
    try {
      const r = await invokeMp<RespMudar>("plano-mudar", { planoId: escolhido.id });
      const nome = planoComValor(r.plano ?? escolhido);
      toast.success(`Plano alterado para ${nome}.${r.assinaturaAtualizada === false ? " Não foi possível atualizar a assinatura no cartão — o administrador vai ajustar." : ""}`);
      setEscolhido(null);
      await onAtualizar();
    } catch (e) {
      const cod = codigoErro(e);
      toast.error(mensagemErroPlano(cod, {}, "Não foi possível mudar de plano."));
      if (cod === "mesmo_plano") { setEscolhido(null); await onAtualizar(); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={CARD} data-plano-mudar>
      <h2 className={TITULO_CARD}>Mudar de plano</h2>
      <p className="text-xs text-muted-foreground font-body">
        Upgrade vale na hora; o valor novo vale a partir do próximo ciclo. Para um plano menor, seus alunos precisam caber no limite.
      </p>
      {semPlano && (
        <p className="text-xs text-muted-foreground font-body">Seu plano inicial é definido pelo administrador — fale com ele.</p>
      )}

      {status.planos.length === 0 ? (
        <p className="text-xs text-muted-foreground font-body">Nenhum plano disponível no momento.</p>
      ) : (
        <ul className="space-y-2">
          {status.planos.map((pl) => {
            const atual = pl.id === atualId;
            const cabe = pl.max_alunos === null || pl.max_alunos === undefined || status.professor.alunos <= Number(pl.max_alunos);
            return (
              <li key={pl.id}
                className={`flex flex-wrap items-center justify-between gap-2 border p-3 ${atual ? "border-primary/60 bg-primary/5" : "border-muted-foreground/20"}`}
                data-plano-opcao={pl.id} data-plano-atual={atual ? "1" : undefined}>
                <div className="min-w-0">
                  <p className="font-heading text-sm text-foreground">{planoComValor(pl)}</p>
                  <p className="text-xs text-muted-foreground font-body">
                    {faixaAlunos(pl)}{!atual && !cabe ? " · seus alunos podem não caber" : ""}
                  </p>
                </div>
                {atual ? (
                  <span className={BADGE_OK}>Atual</span>
                ) : !semPlano ? (
                  <button type="button" onClick={() => setEscolhido(pl)} disabled={busy} className={BTN_SECUNDARIO} data-plano-escolher={pl.id}>
                    Escolher
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmarDialog
        open={!!escolhido}
        titulo={`Mudar para ${escolhido ? planoComValor(escolhido) : ""}?`}
        descricao={escolhido ? (
          <>
            Upgrade vale na hora. O valor novo ({fmtBRL(escolhido.valor_mensal)}/mês) vale a partir do próximo ciclo
            {status.professor.ciclo_vence_em ? ` (${fmtData(status.professor.ciclo_vence_em)})` : ""}.
            {assinaturaAtiva ? " Sua assinatura no cartão será atualizada para o novo valor." : ""}
            {" "}Faixa: {faixaAlunos(escolhido)}.
          </>
        ) : ""}
        confirmar="Confirmar mudança"
        busy={busy}
        onConfirmar={confirmar}
        onCancelar={() => setEscolhido(null)}
        testid="mudar-plano"
      />
    </section>
  );
}
