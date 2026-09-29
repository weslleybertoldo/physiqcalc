/** Frase do erro do Auth para a pessoa (sem detalhe técnico — a do Nutri, W52). */
export function textoErroEntrar(erro: { status?: number; code?: string; message?: string } | null | undefined): string {
  if (!erro) return "";
  if (erro.status === 429) return "Muitas tentativas no servidor. Aguarde alguns minutos.";
  const m = (erro.message ?? "").toLowerCase();
  if (erro.code === "user_banned" || m.includes("banned")) return "Este acesso está desativado. Fale com o seu profissional.";
  if (erro.code === "email_not_confirmed" || m.includes("not confirmed")) return "Confirme o seu e-mail antes de entrar.";
  if (erro.code === "invalid_credentials" || m.includes("invalid login") || erro.status === 400) return "E-mail ou senha incorretos.";
  return "Não foi possível entrar. Tente de novo.";
}
