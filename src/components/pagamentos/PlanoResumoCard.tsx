import { fmtData, planoComValor, type PlanoStatus } from "@/lib/saasApi";
import { CARD, ROTULO, faixaAlunos, situacaoPlano } from "./planoTexto";

// Card "Seu plano": nome + valor, faixa e contagem de alunos, situação em linguagem simples, avisos.
export function PlanoResumoCard({ status }: { status: PlanoStatus }) {
  const sit = situacaoPlano(status);
  const p = status.professor;
  const plano = status.plano;
  const alunosTxt = !plano
    ? `${p.alunos} ${p.alunos === 1 ? "aluno" : "alunos"}`
    : plano.max_alunos === null || plano.max_alunos === undefined
      ? `${p.alunos} ${p.alunos === 1 ? "aluno" : "alunos"} (sem limite)`
      : `${p.alunos} de ${plano.max_alunos} alunos`;

  return (
    <section className={CARD} data-plano-resumo>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={ROTULO}>Seu plano</p>
          <p className="font-heading text-xl text-primary leading-tight" data-plano-nome>{planoComValor(plano)}</p>
          <p className="text-xs text-muted-foreground font-body" data-plano-alunos>
            {plano ? `${faixaAlunos(plano)} · ` : ""}{alunosTxt}
          </p>
        </div>
        <span className={sit.cls} data-plano-badge>{sit.badge}</span>
      </div>

      <p className="text-sm font-body text-foreground" data-plano-situacao>{sit.titulo}</p>
      {sit.detalhe && <p className="text-xs font-body text-muted-foreground">{sit.detalhe}</p>}
      {!plano && !status.isento && (
        <p className="text-xs font-body text-muted-foreground">
          O administrador ainda não definiu o seu plano — fale com ele para liberar os pagamentos.
        </p>
      )}

      {status.avisos.length > 0 && (
        <div className="border-t border-muted-foreground/20 pt-3" data-plano-avisos>
          <p className={`${ROTULO} mb-1`}>Avisos recebidos</p>
          <ul className="space-y-1">
            {status.avisos.slice(0, 5).map((a) => (
              <li key={a.id} className="text-xs font-body text-foreground/80">
                {new Date(a.enviado_em).toLocaleDateString("pt-BR")} — {a.mensagem || `Vencimento em ${fmtData(a.ciclo_vence_em)} (${a.dia === 0 ? "no dia" : `${a.dia} dia(s) depois`})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
