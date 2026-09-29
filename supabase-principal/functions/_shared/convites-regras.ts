// Physiq W5 — regras PURAS do convite de membro da equipe (e-mail pelo Resend). Sem Deno e sem rede: usadas pela função
// convites e testadas no Vitest (src/painel/configuracoes/equipe/convitesServidor.test.ts).

export type Papel = "dono" | "personal" | "nutricionista";
export type Schema = "public" | "staging";

/** Contas de TESTE (P26): os domínios physiqcalc.app/physiqnutri.app NÃO existem (NXDOMAIN) — e-mail para lá só voltaria. */
export function emailDeTesteDoPhysiq(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (e === "teste@teste.com") return true;
  return /^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app$/.test(e);
}

/** Caixa de teste do próprio Resend: recebe e confirma a entrega sem prejudicar a reputação do domínio que envia. */
export const CAIXA_DE_TESTE_RESEND = "delivered@resend.dev";

/**
 * Para onde o e-mail vai de verdade. Endereço real → ele mesmo. Conta de TESTE → a caixa de teste do Resend (o domínio de
 * teste não existe: mandar para ele viraria devolução — bounce — e sujaria o remetente dos convites de hoje).
 */
export function destinoDoEmail(email: string): { para: string; teste: boolean } {
  const e = email.trim().toLowerCase();
  return emailDeTesteDoPhysiq(e) ? { para: CAIXA_DE_TESTE_RESEND, teste: true } : { para: e, teste: false };
}

/** Endereço do site no link do e-mail: o do ambiente (o do APK e o do dev local não servem para quem recebe). */
export function siteDoConvite(schema: Schema, siteUrl?: string | null): string {
  if (schema === "staging") return "https://physiqcalc-staging.vercel.app";
  return (siteUrl || "https://physiqcalc.com.br").replace(/\/+$/, "");
}

/** O link do e-mail: a tela de entrada; ?convite=1 faz o app aceitar mesmo para quem já estava logado no aparelho. */
export function linkDoConvite(schema: Schema, siteUrl?: string | null): string {
  return `${siteDoConvite(schema, siteUrl)}/entrar?convite=1`;
}

/** "personal trainer", "nutricionista", "personal trainer e nutricionista". */
export function rotuloDosPapeis(papeis: readonly string[]): string {
  const nomes = [
    papeis.includes("personal") ? "personal trainer" : null,
    papeis.includes("nutricionista") ? "nutricionista" : null,
  ].filter((x): x is string => Boolean(x));
  return nomes.length ? nomes.join(" e ") : "profissional";
}

export function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export interface DadosEmailConvite {
  email: string;
  papeis: readonly string[];
  conta: string;
  quem: string;
  link: string;
  /** conta de teste: o assunto diz para quem era (o e-mail foi para a caixa de teste do Resend) */
  paraTeste?: string | null;
}

export function assuntoDoConvite(d: DadosEmailConvite): string {
  const base = `${d.quem || "Um profissional"} convidou você para a equipe ${d.conta} no Physiq`;
  return d.paraTeste ? `[teste → ${d.paraTeste}] ${base}` : base;
}

/** E-mail do convite (HTML simples, claro, sem imagem nem emoji — lê bem em qualquer cliente de e-mail). */
export function htmlDoConvite(d: DadosEmailConvite): string {
  const quem = escaparHtml(d.quem || "Um profissional");
  const conta = escaparHtml(d.conta);
  const papeis = escaparHtml(rotuloDosPapeis(d.papeis));
  const email = escaparHtml(d.email);
  const link = escaparHtml(d.link);
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.5">
  <h2 style="margin:0 0 12px;font-size:20px">Convite para a equipe no Physiq</h2>
  <p><b>${quem}</b> convidou você para a equipe <b>${conta}</b> no Physiq, como <b>${papeis}</b>.</p>
  <p>Para aceitar, entre no Physiq com este e-mail (<b>${email}</b>) — pelo botão <b>Entrar com Google</b>. O convite é aceito sozinho na entrada.</p>
  <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Entrar e aceitar</a></p>
  <p style="font-size:12px;color:#555">Ou copie o link: ${link}</p>
  <p style="font-size:12px;color:#555">Se você não esperava este convite, ignore este e-mail.</p>
</div>`;
}

/** Texto puro (clientes de e-mail sem HTML). */
export function textoDoConvite(d: DadosEmailConvite): string {
  return [
    `${d.quem || "Um profissional"} convidou você para a equipe ${d.conta} no Physiq, como ${rotuloDosPapeis(d.papeis)}.`,
    `Para aceitar, entre no Physiq com este e-mail (${d.email}) pelo botão Entrar com Google: ${d.link}`,
    "Se você não esperava este convite, ignore este e-mail.",
  ].join("\n\n");
}
