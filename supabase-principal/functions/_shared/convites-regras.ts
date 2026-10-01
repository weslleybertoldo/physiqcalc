// Physiq W5 — regras PURAS do convite de membro da equipe (e-mail pelo Resend). Sem Deno e sem rede: usadas pela função
// convites e testadas no Vitest (src/painel/configuracoes/equipe/convitesServidor.test.ts).
// H3 (01/10): o e-mail no molde C (email-modelo.ts) — selo com as iniciais da conta, "Equipe · <conta> · como <papel>",
// linhas Convidado por/Seu papel/Entre com este e-mail/Como aceitar e o botão "Entrar e aceitar".
import { escaparHtml, iniciaisDe, montarEmail, textoDaReserva, type EmailModelo } from "./email-modelo.ts";

export { escaparHtml };

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

/** "Personal trainer" · "Nutricionista" · "Personal trainer e nutricionista" (a linha "Seu papel"). */
function papelComMaiuscula(papeis: readonly string[]): string {
  const r = rotuloDosPapeis(papeis);
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function origemDe(link: string): string {
  try {
    return new URL(link).origin;
  } catch {
    return "https://physiqcalc.com.br";
  }
}

/** O convite da equipe no molde C (o que o htmlDoConvite monta; separado para o teste olhar as peças). */
export function modeloDoConvite(d: DadosEmailConvite): EmailModelo {
  const quem = d.quem.trim() || "Um profissional";
  const conta = d.conta.trim() || "Physiq";
  const papeis = rotuloDosPapeis(d.papeis);
  const soNutri = d.papeis.includes("nutricionista") && !d.papeis.includes("personal");
  return {
    titulo: "Convite para a equipe no Physiq",
    preheader: `${quem} convidou você para a equipe ${conta} no Physiq, como ${papeis}.`,
    rotulo: "Convite de equipe",
    destaques: [{ visual: { tipo: "equipe", iniciais: iniciaisDe(conta) }, olho: "Equipe", titulo: conta, sub: `como ${papeis}` }],
    saudacao: ["Olá! ", { forte: quem }, " convidou você para a equipe ", { forte: conta }, " no Physiq, como ", { forte: papeis }, "."],
    linhas: [
      { iniciais: iniciaisDe(quem), rotulo: "Convidado por", valor: quem },
      { icone: soNutri ? "estetoscopio" : "halter", rotulo: "Seu papel", valor: papelComMaiuscula(d.papeis) },
      { icone: "email", rotulo: "Entre com este e-mail", valor: d.email, href: `mailto:${d.email}` },
      { icone: "escudo", rotulo: "Como aceitar", valor: "Pelo botão Entrar com Google", nota: "O convite é aceito sozinho na entrada." },
    ],
    primario: { texto: "Entrar e aceitar", href: d.link },
    reserva: { texto: textoDaReserva(1, "o Physiq"), href: d.link },
    rodape: "Se você não esperava este convite, ignore este e-mail.",
    site: origemDe(d.link),
  };
}

/** E-mail do convite no molde C (email-modelo.ts): tabelas + CSS inline, ícones em PNG, sem SVG nem JS. */
export function htmlDoConvite(d: DadosEmailConvite): string {
  return montarEmail(modeloDoConvite(d));
}

/** Texto puro (clientes de e-mail sem HTML). */
export function textoDoConvite(d: DadosEmailConvite): string {
  return [
    `${d.quem || "Um profissional"} convidou você para a equipe ${d.conta} no Physiq, como ${rotuloDosPapeis(d.papeis)}.`,
    `Para aceitar, entre no Physiq com este e-mail (${d.email}) pelo botão Entrar com Google: ${d.link}`,
    "Se você não esperava este convite, ignore este e-mail.",
  ].join("\n\n");
}
