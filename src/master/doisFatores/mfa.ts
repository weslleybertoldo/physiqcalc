/**
 * hml-22 (H-22) — as chamadas do 2FA do master ao Auth do banco principal (o TOTP do supabase-js). É LOGIN (a exceção do jeito 2: o
 * login e a sessão ficam no navegador — src/integrations/semBancoNoNavegador.test.ts, lista LOGIN). Só o site: as telas que usam
 * (TelaCodigo e CartaoDoisFatores) saem do build do app (src/rotas/Rotas.tsx e o registro do master).
 *
 * Nada aqui decide quem é master: quem decide é o servidor (o banco e as funções conferem o fator e o aal do token).
 */
import { principal } from "@/integrations/principal/client";
import { erroDoCodigo, fatoresVerificados, qrComoImagem, type ErroCodigo, type FatorDaSessao } from "@/nucleo/doisFatoresRegras";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: ErroCodigo };

/** O erro de um Resultado que não deu certo (o projeto compila sem strictNullChecks: o `!r.ok` não estreita o tipo sozinho). */
export function erroDe<T>(r: Resultado<T>): ErroCodigo | null {
  return r.ok ? null : (r as Extract<Resultado<T>, { ok: false }>).erro;
}

/** O cadastro em andamento: o id do fator (ainda não verificado), o QR (SVG em data: — o supabase-js já monta) e o código em texto. */
export interface Cadastro {
  id: string;
  qr: string;
  segredo: string;
}

const falha = <T>(erro: unknown): Resultado<T> => ({ ok: false, erro: erroDoCodigo(erro) });

/** Os fatores da conta, frescos do Auth (o listFactors relê o usuário): os verificados e quantos estão pela metade. */
export async function fatores(): Promise<Resultado<{ verificados: FatorDaSessao[]; pelaMetade: number }>> {
  try {
    const { data, error } = await principal.auth.mfa.listFactors();
    if (error || !data) return falha(error);
    const todos = (data.all ?? []) as unknown[];
    const verificados = fatoresVerificados(todos);
    return { ok: true, valor: { verificados, pelaMetade: todos.length - verificados.length } };
  } catch (e) {
    return falha(e);
  }
}

/**
 * "Ativar": tira os cadastros pela metade que sobraram (o Auth deixa tirar fator NÃO verificado com a senha só — aal1) e começa um
 * novo TOTP ("Physiq" no app autenticador; o nome do fator, "Celular", é único por conta). O segredo volta só para a tela.
 */
export async function comecarCadastro(): Promise<Resultado<Cadastro>> {
  try {
    const { data: lista, error: erroLista } = await principal.auth.mfa.listFactors();
    if (erroLista || !lista) return falha(erroLista);
    for (const f of (lista.all ?? []) as Array<{ id?: string; status?: string }>) {
      if (f?.id && f.status !== "verified") {
        const { error } = await principal.auth.mfa.unenroll({ factorId: f.id });
        if (error) return falha(error);
      }
    }
    const { data, error } = await principal.auth.mfa.enroll({ factorType: "totp", issuer: "Physiq", friendlyName: "Celular" });
    if (error || !data || data.type !== "totp") return falha(error);
    return { ok: true, valor: { id: data.id, qr: qrComoImagem(data.totp.qr_code), segredo: data.totp.secret } };
  } catch (e) {
    return falha(e);
  }
}

/**
 * Confere os 6 números (desafio + verificação). Certo → o supabase-js grava a sessão nova (aal2) e avisa MFA_CHALLENGE_VERIFIED (a
 * sessão do app troca sozinha e refaz a troca do Treino). Na 1ª verificação (o cadastro), o Auth encerra as outras sessões aal1.
 */
export async function confirmar(factorId: string, codigo: string): Promise<Resultado<true>> {
  try {
    const { error } = await principal.auth.mfa.challengeAndVerify({ factorId, code: codigo });
    if (error) return falha(error);
    return { ok: true, valor: true };
  } catch (e) {
    return falha(e);
  }
}

/**
 * Relê a sessão do Auth (a renovação traz o usuário com os fatores de agora) — quando o que a sessão guardou ficou velho: uma
 * função respondeu precisa_2fa (fator novo) ou o fator sumiu (o suporte apagou). Falhou (sessão revogada) → o supabase-js sai.
 */
export async function relerUsuario(): Promise<void> {
  try {
    await principal.auth.refreshSession();
  } catch {
    /* sem rede: fica a sessão de agora */
  }
}
