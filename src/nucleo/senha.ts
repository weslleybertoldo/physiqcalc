/**
 * Senha da própria pessoa (W8b). Quando o profissional (ou o master) cria/redefine a senha do aluno, ela nasce PROVISÓRIA
 * (marca `senha_provisoria` no app_metadata, gravada pelas RPCs paciente_criar_acesso / paciente_redefinir_senha). No 1º login
 * com ela o app mostra "crie a sua senha" (src/ui/avisos/AvisoSenhaProvisoria.tsx) — é uma OPÇÃO: "Agora não" deixa para
 * depois e a tela volta no próximo login, até a pessoa gravar a senha dela. Trocar a senha em Perfil › Conta (W7) ou em
 * Configurações › Perfil também tira a marca (todos gravam por `salvarMinhaSenha`).
 */
import type { Session, User } from "@supabase/supabase-js";
import { principal } from "@/integrations/principal/client";

/** Payload do JWT (sem conferir assinatura: é só para a tela decidir o que mostrar; quem confere é o servidor). */
export function claimsDoToken(token: string | null | undefined): Record<string, unknown> | null {
  const partes = (token ?? "").split(".");
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const txt = decodeURIComponent(
      Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)))
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const obj = JSON.parse(txt);
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Esta sessão nasceu de um login com senha (claim amr "password")? Google (oauth) não pede a troca. */
export function entrouComSenha(sessao: Pick<Session, "access_token"> | null | undefined): boolean {
  const amr = claimsDoToken(sessao?.access_token)?.amr;
  return Array.isArray(amr) && amr.some((m) => (m as { method?: string })?.method === "password");
}

/** Id da sessão (claim session_id): cada login novo tem outro — o "Agora não" vale só para a sessão em que foi tocado. */
export function idDaSessao(sessao: Pick<Session, "access_token"> | null | undefined): string {
  const id = claimsDoToken(sessao?.access_token)?.session_id;
  return typeof id === "string" ? id : "";
}

export function temSenhaProvisoria(usuario: Pick<User, "app_metadata"> | null | undefined): boolean {
  return (usuario?.app_metadata as Record<string, unknown> | undefined)?.senha_provisoria === true;
}

const CHAVE_DEPOIS = "physiq_senha_provisoria_depois:";

export function adiadaNestaSessao(uid: string, sessionId: string): boolean {
  if (!uid || !sessionId) return false;
  try {
    return localStorage.getItem(CHAVE_DEPOIS + uid) === sessionId;
  } catch {
    return false;
  }
}

export function adiarNestaSessao(uid: string, sessionId: string): void {
  try {
    if (uid && sessionId) localStorage.setItem(CHAVE_DEPOIS + uid, sessionId);
  } catch {
    /* sem armazenamento: some só até recarregar */
  }
}

/** A tela "crie a sua senha" aparece? Senha provisória + entrou com ela (senha) + não tocou "Agora não" NESTA sessão. */
export function precisaCriarSenha(p: { usuario: Pick<User, "id" | "app_metadata"> | null; sessao: Pick<Session, "access_token"> | null }): boolean {
  if (!p.usuario || !p.sessao || !temSenhaProvisoria(p.usuario) || !entrouComSenha(p.sessao)) return false;
  return !adiadaNestaSessao(p.usuario.id, idDaSessao(p.sessao));
}

/** Frase do erro ao gravar a senha. */
export function textoErroSenha(mensagem: string): string {
  if (/same|different|igual/i.test(mensagem)) return "A nova senha precisa ser diferente da atual.";
  if (/weak|fraca|short|curta/i.test(mensagem)) return "Essa senha é fraca. Use pelo menos 8 caracteres, com letras e números.";
  return "Não foi possível salvar a senha agora. Tente de novo.";
}

/**
 * Grava a senha da pessoa logada (principal.auth.updateUser) e tira a marca de provisória (minha_senha_definida + sessão nova,
 * para o app_metadata do aparelho já vir sem a marca). A falha em tirar a marca não desfaz a senha: a tela volta no próximo
 * login e a pessoa grava de novo.
 */
export async function salvarMinhaSenha(senha: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { error } = await principal.auth.updateUser({ password: senha });
  if (error) return { ok: false, erro: textoErroSenha(String(error.message ?? "")) };
  try {
    await principal.rpc("minha_senha_definida" as never);
    await principal.auth.refreshSession();
  } catch {
    /* a senha já está gravada; a marca sai na próxima */
  }
  return { ok: true };
}
