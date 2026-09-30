// Physiq W13 — regras PURAS da função alunos (banco principal): ações aceitas, status HTTP de cada erro do banco e o e-mail do
// convite de aluno (Resend). Sem Deno e sem rede: usadas pela função e testadas no Vitest (src/painel/alunos/alunosServidor.test.ts).
import { escaparHtml, siteDoConvite, type Schema } from "./convites-regras.ts";

/** Ações do painel (com o login do profissional). As leituras (lista, convites, pendentes) são RPC direto da tela. */
export const ACOES_APP = [
  "criar", "convidar", "cancelar_convite", "reenviar_convite", "bloquear", "desbloquear", "desativar", "reativar", "remover",
  "atribuir", "aprovar", "recusar",
] as const;
export type AcaoApp = (typeof ACOES_APP)[number];

/** Ações públicas (a página /c/:codigo, sem login). */
export const ACOES_PUBLICAS = ["cadastro_info", "cadastro_enviar"] as const;
export type AcaoPublica = (typeof ACOES_PUBLICAS)[number];

/** Repasse do APK antigo (professor-convites do Treino, modo servidor). */
export const ACOES_REPASSE = ["convidar", "convites", "cancelar", "reenviar"] as const;
export type AcaoRepasse = (typeof ACOES_REPASSE)[number];

export function acaoApp(v: unknown): AcaoApp | null {
  return typeof v === "string" && (ACOES_APP as readonly string[]).includes(v) ? (v as AcaoApp) : null;
}
export function acaoPublica(v: unknown): AcaoPublica | null {
  return typeof v === "string" && (ACOES_PUBLICAS as readonly string[]).includes(v) ? (v as AcaoPublica) : null;
}
export function acaoRepasse(v: unknown): AcaoRepasse | null {
  return typeof v === "string" && (ACOES_REPASSE as readonly string[]).includes(v) ? (v as AcaoRepasse) : null;
}

/** Status HTTP de cada erro que o banco devolve (o corpo leva { ok: false, erro, ... } para a tela escrever a mensagem). */
export const STATUS_DO_ERRO: Record<string, number> = {
  sem_login: 401,
  sem_acesso: 403, so_dono: 403, conta_real_no_staging: 403,
  conta_inexistente: 404, aluno_inexistente: 404, convite_inexistente: 404, cadastro_nao_encontrado: 404, link_nao_encontrado: 404,
  nao_professor: 404,
  limite_plano: 409, outro_profissional: 409, ja_e_aluno: 409, ja_cadastrado: 409, conta_travada: 409, conta_excluida: 409,
  convite_nao_pendente: 409, cadastro_repetido: 409, profissional_inativo: 409,
  muitos_convites: 429, muitos_cadastros: 429, muitas_acoes: 429,
  captcha_invalido: 400,
};

export function statusDoErro(erro: unknown): number {
  return STATUS_DO_ERRO[String(erro ?? "")] ?? 400;
}

/** Link do e-mail do convite de aluno: a tela de entrada do ambiente; ?convite=1 faz o app aceitar mesmo já logado no aparelho. */
export function linkConviteAluno(schema: Schema, siteUrl?: string | null): string {
  return `${siteDoConvite(schema, siteUrl)}/entrar?convite=1`;
}

/** "o seu treino", "a sua alimentação", "o seu treino e a sua alimentação". */
export function rotuloDosModulos(modulos: readonly string[]): string {
  const t = modulos.includes("treino");
  const n = modulos.includes("nutricao");
  if (t && n) return "o seu treino e a sua alimentação";
  if (n) return "a sua alimentação";
  return "o seu treino";
}

export interface DadosEmailAluno {
  email: string;
  modulos: readonly string[];
  conta: string;
  quem: string;
  responsavel?: string | null;
  link: string;
  /** conta de teste: o assunto diz para quem era (o e-mail foi para a caixa de teste do Resend) */
  paraTeste?: string | null;
}

export function assuntoConviteAluno(d: DadosEmailAluno): string {
  const base = `${d.quem || "Seu profissional"} convidou você para o Physiq`;
  return d.paraTeste ? `[teste → ${d.paraTeste}] ${base}` : base;
}

/** E-mail do convite de aluno (HTML simples, sem imagem nem emoji — o mesmo padrão do convite de equipe da W5). */
export function htmlConviteAluno(d: DadosEmailAluno): string {
  const quem = escaparHtml(d.quem || "Seu profissional");
  const conta = escaparHtml(d.conta);
  const oque = escaparHtml(rotuloDosModulos(d.modulos));
  const email = escaparHtml(d.email);
  const link = escaparHtml(d.link);
  const resp = d.responsavel && d.responsavel !== d.quem ? `<p>Quem vai acompanhar você: <b>${escaparHtml(d.responsavel)}</b>.</p>` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.5">
  <h2 style="margin:0 0 12px;font-size:20px">Convite para o Physiq</h2>
  <p><b>${quem}</b> (${conta}) convidou você para acompanhar ${oque} pelo Physiq.</p>
  ${resp}
  <p>Para aceitar, entre no Physiq com este e-mail (<b>${email}</b>) — pelo botão <b>Entrar com Google</b>. O convite é aceito sozinho na entrada.</p>
  <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Entrar e aceitar</a></p>
  <p style="font-size:12px;color:#555">Ou copie o link: ${link}</p>
  <p style="font-size:12px;color:#555">Se você não esperava este convite, ignore este e-mail.</p>
</div>`;
}

export function textoConviteAluno(d: DadosEmailAluno): string {
  return [
    `${d.quem || "Seu profissional"} (${d.conta}) convidou você para acompanhar ${rotuloDosModulos(d.modulos)} pelo Physiq.`,
    `Para aceitar, entre no Physiq com este e-mail (${d.email}) pelo botão Entrar com Google: ${d.link}`,
    "Se você não esperava este convite, ignore este e-mail.",
  ].join("\n\n");
}

/**
 * Resposta que o APK antigo (≤ 3.15, ConviteAlunoDialog → professor-convites) entende, a partir da resposta do banco principal.
 * Convite por e-mail: nunca "vinculado na hora" (o aceite é no 1º login com aquele e-mail, C7); erros no vocabulário de hoje.
 */
export function erroParaApkAntigo(erro: unknown): string {
  switch (String(erro ?? "")) {
    case "email_invalido": return "email_invalido";
    case "limite_plano": return "limite_plano";
    case "outro_profissional": return "aluno_de_outro_professor";
    case "conta_travada": return "plano_vencido";
    case "nao_professor": return "nao_professor";
    case "muitos_convites": return "rate_limited";
    case "convite_inexistente":
    case "convite_nao_pendente": return "not_found";
    default: return String(erro ?? "internal");
  }
}

/** Situação do convite no vocabulário do APK antigo (pendente | aceito | revogado). */
export function statusParaApkAntigo(status: unknown): "pendente" | "aceito" | "revogado" {
  return status === "aceito" ? "aceito" : status === "pendente" ? "pendente" : "revogado";
}
