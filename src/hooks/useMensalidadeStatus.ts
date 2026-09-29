import { useEffect, useState } from "react";
import { lerStatusCache, statusLeve, type MpStatusLeve } from "@/lib/mpClient";
import { estadoDaMensalidade, mensalidadePendente } from "@/financeiro/regras";
import { useResumoFinanceiro } from "@/financeiro/useResumoFinanceiro";

/** Atraso padrão antes de ir à rede: deixa o 1º render e o PowerSync respirarem. */
export const ATRASO_STATUS_MS = 2000;

/**
 * Status da mensalidade pra abertura do app (badge "!" no header, aviso de pendência e a trava do master).
 *
 * W6: a mensalidade do aluno mudou para o BANCO PRINCIPAL (financeiro_do_aluno(), guardado no aparelho por 10 min); o Banco
 * do Treino (`status-lite` do mp-payments, com cache de 6 h) só diz se o master bloqueou os alunos do professor
 * (`bloqueadoPeloMaster`, lido pela GateBloqueioMaster). Sem usuário, nada e nenhuma chamada.
 */
export function useMensalidadeStatus(userId: string | null | undefined, atrasoMs = ATRASO_STATUS_MS) {
  const [treino, setTreino] = useState<MpStatusLeve | null>(() => (userId ? lerStatusCache(userId) : null));
  const { resumo } = useResumoFinanceiro({ atrasoMs, ativo: !!userId });

  useEffect(() => {
    if (!userId) {
      setTreino(null);
      return;
    }
    const emCache = lerStatusCache(userId);
    if (emCache) {
      setTreino(emCache);
      return;
    }
    let cancelado = false;
    const t = setTimeout(() => {
      statusLeve(userId)
        .then((s) => { if (!cancelado) setTreino(s); })
        .catch(() => { /* sem rede/erro: não sinaliza nada */ });
    }, atrasoMs);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [userId, atrasoMs]);

  if (!userId) return { status: null, pendente: false };
  const m = (resumo ?? []).find((r) => Number(r.mensalidade_valor) > 0) ?? null;
  const e = estadoDaMensalidade(m ? { valor: m.mensalidade_valor, pausada: m.pausada, pago_ate: m.pago_ate, desde: m.desde, aguardando: m.aguardando } : null);
  if (!treino && !m) return { status: null, pendente: false };
  const status: MpStatusLeve = {
    mensalidade: m && !m.pausada ? e.valor : null,
    emDia: e.coberta || !mensalidadePendente(e),
    pagoAte: m?.pago_ate ?? null,
    mesRef: treino?.mesRef ?? "",
    mesLabel: treino?.mesLabel ?? "",
    ...(treino?.bloqueadoPeloMaster !== undefined ? { bloqueadoPeloMaster: Boolean(treino.bloqueadoPeloMaster) } : {}),
  };
  return { status, pendente: mensalidadePendente(e) };
}
