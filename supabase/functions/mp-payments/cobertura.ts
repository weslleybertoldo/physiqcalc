// Cobertura sequencial de mensalidades (modelo validado com o Weslley 15/07/2026):
// - Sem assinatura: cada pagamento aprovado cobre 1 mês a partir de max(data do pagamento,
//   fim da cobertura anterior). Atraso move o vencimento (venceu 15, pagou 20 → passa a vencer 20);
//   pagamento adiantado preserva o dia (soma a partir do fim da cobertura vigente).
// - Com assinatura ativa (anchorDay = dia da próxima cobrança no MP): o ciclo pertence à
//   assinatura — pagamento avulso no meio do ciclo (ex. reposição de mês reembolsado) cobre
//   só até a PRÓXIMA cobrança da assinatura; o vencimento da assinatura não muda.
// - Reembolso: o pagamento sai do cálculo (status deixa de ser "approved") → cobertura recua
//   e o status fica pendente até novo pagamento.

// soma 1 mês com clamp de dia (31/01 → 28/02, não 03/03)
export function addMonthClamp(d: Date): Date {
  const r = new Date(d);
  const dia = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + 1);
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(dia, ultimo));
  return r;
}

// próxima data (estritamente depois de base) cujo dia do mês é `dia` (clamp em mês curto)
export function nextAnchorAfter(base: Date, dia: number): Date {
  const c = new Date(base);
  const ultimoDoMes = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  c.setUTCDate(Math.min(dia, ultimoDoMes(c)));
  if (c <= base) {
    c.setUTCDate(1);
    c.setUTCMonth(c.getUTCMonth() + 1);
    c.setUTCDate(Math.min(dia, ultimoDoMes(c)));
  }
  return c;
}

// fim da cobertura dado o histórico de pagamentos aprovados (null = nunca pagou / tudo reembolsado)
export function calcCobertura(datasPagamentos: Date[], anchorDay: number | null): Date | null {
  const datas = [...datasPagamentos].sort((a, b) => a.getTime() - b.getTime());
  let cobertura: Date | null = null;
  for (const d of datas) {
    const base = cobertura && cobertura > d ? cobertura : d;
    let fim = addMonthClamp(base);
    if (anchorDay !== null) {
      const ancora = nextAnchorAfter(base, anchorDay);
      if (ancora < fim) fim = ancora;
    }
    cobertura = fim;
  }
  return cobertura;
}
