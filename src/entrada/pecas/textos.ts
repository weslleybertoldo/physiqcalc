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

/**
 * W8b — frase da resposta da função entrar-senha (o limite de tentativas no servidor). O tempo que falta do bloqueio é mostrado
 * à parte pela tela (contador); aqui ficam as outras.
 */
export function textoErroServidor(code: string | undefined): string {
  switch (code) {
    case "senha_errada":
      return "E-mail ou senha incorretos.";
    case "bloqueado_de_vez":
      return TEXTO_BLOQUEADA_DE_VEZ;
    case "bloqueado":
    case "muitas_tentativas_rede":
      return "Muitas tentativas. Aguarde um pouco para tentar de novo.";
    case "em_andamento":
      return "Aguarde: a tentativa anterior ainda está sendo conferida.";
    case "captcha_invalido":
      return "Não conseguimos confirmar que é você. Tente de novo.";
    case "acesso_desativado":
      return "Este acesso está desativado. Fale com o seu profissional.";
    case "email_nao_confirmado":
      return "Confirme o seu e-mail antes de entrar.";
    case "conta_real_no_staging":
      return "Ambiente de teste — só contas de teste entram.";
    case "limite_servidor":
      return "Muitas tentativas no servidor. Aguarde alguns minutos.";
    case "dados_invalidos":
      return "Confira o e-mail e a senha.";
    case "rede":
      return "Não foi possível entrar. Confira a internet e tente de novo.";
    default:
      return "Não foi possível entrar agora. Tente de novo em instantes.";
  }
}

/** A frase do bloqueio de vez (regra dele, W8b). */
export const TEXTO_BLOQUEADA_DE_VEZ = "Conta bloqueada por tentativas. Peça uma senha nova ao seu profissional ou entre com o Google.";
