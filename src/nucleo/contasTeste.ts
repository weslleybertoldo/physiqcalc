/**
 * Contas de teste (P26): o staging só aceita estas — o Auth dos 2 bancos é compartilhado com a produção. A mesma regra da
 * trocar-token (Treino), do pos-login/vincular-aluno (principal) e da {schema}.email_de_teste do banco: SÓ
 * *teste*@physiqcalc.com.br — a parte antes do @ contém "teste" e o domínio é exatamente physiqcalc.com.br, que é do dono.
 * 31/10/2026 (achado médio da 2ª revisão de segurança do restaurar-login): saíram o teste@teste.com (domínio de outra pessoa)
 * e os domínios physiqcalc.app / physiqnutri.app (não registrados: quem registrasse um deles entraria nas contas pelo
 * "esqueci a senha").
 */
export function emailDeTeste(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  return /^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiqcalc\.com\.br$/.test(e);
}
