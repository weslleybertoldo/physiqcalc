/**
 * Contas de teste (P26): o staging só aceita estas — o Auth dos 2 bancos é compartilhado com a produção. A mesma regra da
 * trocar-token (Treino) e do pos-login/vincular-aluno (principal): teste@teste.com e *teste*@physiqcalc.app /
 * *teste*@physiqnutri.app.
 */
export function emailDeTeste(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (e === "teste@teste.com") return true;
  return /^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app$/.test(e);
}
