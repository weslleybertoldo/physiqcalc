// Physiq W17 — regras PURAS do e-mail do "Salvar e enviar ao aluno" (tela 8). Sem Deno e sem rede: usadas pela função
// aluno-enviar e testadas no Vitest (src/painel/aluno/envio/enviarServidor.test.ts).
import { CAIXA_DE_TESTE_RESEND, destinoDoEmail, escaparHtml, siteDoConvite, type Schema } from "./convites-regras.ts";

export type ModuloEnvio = "treino" | "dieta";

/**
 * Para onde o e-mail vai de verdade. STAGING → SEMPRE a caixa de teste do Resend (nenhum e-mail do ambiente de teste chega a
 * uma pessoa real, mesmo que o cadastro tenha um endereço de verdade); produção → a regra dos convites (conta de teste dos
 * domínios physiq*.app → caixa de teste; endereço real → ele mesmo).
 */
export function destinoDoEnvio(schema: Schema, email: string): { para: string; teste: boolean } {
  if (schema === "staging") return { para: CAIXA_DE_TESTE_RESEND, teste: true };
  return destinoDoEmail(email);
}

/** Só os caminhos do app que o aviso usa (a tela de abertura, o Treino e a Dieta). */
export function caminhoDoEnvio(link: unknown): "/" | "/treino" | "/dieta" {
  return link === "/treino" || link === "/dieta" ? link : "/";
}

/** O link do botão do e-mail: o site do ambiente + a aba do que mudou. */
export function linkDoEnvio(schema: Schema, siteUrl: string | null | undefined, link: unknown): string {
  const caminho = caminhoDoEnvio(link);
  return `${siteDoConvite(schema, siteUrl)}${caminho === "/" ? "/" : caminho}`;
}

export function modulosDoEnvio(v: unknown): ModuloEnvio[] {
  const lista = Array.isArray(v) ? v : [];
  const out: ModuloEnvio[] = [];
  if (lista.includes("treino")) out.push("treino");
  if (lista.includes("dieta")) out.push("dieta");
  return out;
}

/** "seu treino", "seu plano alimentar", "seu treino e seu plano alimentar". */
export function oQueMudou(modulos: readonly ModuloEnvio[]): string {
  const t = modulos.includes("treino");
  const d = modulos.includes("dieta");
  if (t && d) return "seu treino e seu plano alimentar";
  return t ? "seu treino" : "seu plano alimentar";
}

export function primeiroNomeDe(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

export interface DadosEmailEnvio {
  /** o e-mail do cadastro do aluno */
  email: string;
  aluno: string;
  /** quem salvou (a nutri ou o personal) */
  quem: string;
  modulos: readonly ModuloEnvio[];
  link: string;
  /** e-mail de teste (staging ou conta de teste): o assunto diz para quem era */
  paraTeste?: string | null;
}

/** "Seu plano alimentar foi atualizado por Camila Rocha" (o texto curto do pedido). */
export function assuntoDoEnvio(d: DadosEmailEnvio): string {
  const quem = d.quem.trim() || "seu profissional";
  const t = d.modulos.includes("treino");
  const n = d.modulos.includes("dieta");
  const base = t && n
    ? `Seu treino e seu plano alimentar foram atualizados por ${quem}`
    : t ? `Seu treino foi atualizado por ${quem}` : `Seu plano alimentar foi atualizado por ${quem}`;
  return d.paraTeste ? `[teste → ${d.paraTeste}] ${base}` : base;
}

function rotuloDoBotao(modulos: readonly ModuloEnvio[]): string {
  const t = modulos.includes("treino");
  const n = modulos.includes("dieta");
  if (t && n) return "Abrir o Physiq";
  return t ? "Ver meu treino" : "Ver minha dieta";
}

/** E-mail (HTML simples, claro, sem imagem nem emoji — o mesmo jeito do convite). */
export function htmlDoEnvio(d: DadosEmailEnvio): string {
  const nome = escaparHtml(primeiroNomeDe(d.aluno));
  const quem = escaparHtml(d.quem.trim() || "Seu profissional");
  const oque = escaparHtml(oQueMudou(d.modulos));
  const link = escaparHtml(d.link);
  const botao = escaparHtml(rotuloDoBotao(d.modulos));
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.5">
  <h2 style="margin:0 0 12px;font-size:20px">${escaparHtml(assuntoDoEnvio({ ...d, paraTeste: null }))}</h2>
  <p>${nome ? `Olá, ${nome}! ` : ""}<b>${quem}</b> atualizou ${oque} no Physiq. Abra o app para ver o que mudou.</p>
  <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">${botao}</a></p>
  <p style="font-size:12px;color:#555">Ou copie o link: ${link}</p>
  <p style="font-size:12px;color:#555">Você recebeu este e-mail porque é aluno de ${quem} no Physiq.</p>
</div>`;
}

/** Texto puro (clientes de e-mail sem HTML). */
export function textoDoEnvio(d: DadosEmailEnvio): string {
  const nome = primeiroNomeDe(d.aluno);
  const quem = d.quem.trim() || "Seu profissional";
  return [
    `${nome ? `Olá, ${nome}! ` : ""}${quem} atualizou ${oQueMudou(d.modulos)} no Physiq. Abra o app para ver o que mudou: ${d.link}`,
    `Você recebeu este e-mail porque é aluno de ${quem} no Physiq.`,
  ].join("\n\n");
}

/** Freio por pessoa nesta instância da função (o banco já não repete o mesmo aviso em 10 min). */
export function criarFreio(max = 60, janelaMs = 60 * 60_000) {
  const janela = new Map<string, number[]>();
  return (chave: string, agora = Date.now()): boolean => {
    const lista = (janela.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    if (lista.length >= max) return false;
    lista.push(agora);
    janela.set(chave, lista);
    if (janela.size > 5000) janela.clear();
    return true;
  };
}

const STATUS: Record<string, number> = {
  sem_login: 401, sem_acesso: 403, aluno_inexistente: 404, sem_modulo: 400, muitos_envios: 429,
};

export function statusDoErroEnvio(erro: unknown): number {
  return STATUS[String(erro)] ?? 400;
}
