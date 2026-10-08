// Physiq W17 — regras PURAS do e-mail do "Salvar e enviar ao aluno" (tela 8). Sem Deno e sem rede: usadas pela função
// aluno-enviar e testadas no Vitest (src/painel/aluno/envio/enviarServidor.test.ts).
// H3 (01/10): o e-mail no molde C (email-modelo.ts) — destaque com os ícones do que mudou (halter = treino, salada = dieta),
// linhas Treino/Plano alimentar/Por e os botões "Abrir o Physiq" + "Ver meu treino"/"Ver minha dieta" (um módulo só: 1 ícone,
// 1 linha e só o botão dele).
import { CAIXA_DE_TESTE_RESEND, destinoDoEmail, siteDoConvite, type Schema } from "./convites-regras.ts";
import { iniciaisDe, montarEmail, textoDaReserva, type BotaoEmail, type EmailModelo, type IconeEmail, type LinhaEmail } from "./email-modelo.ts";

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

/** A configuração do e-mail das funções (os segredos, como chegam do Deno.env; ausente = ""). */
export interface ConfigEmail {
  resendApiKey: string;
  resendFrom: string;
  siteUrl: string;
}

/**
 * hml-10 (D3, H-25) — o que falta para o e-mail sair, SEM reserva com valor de produção (antes o remetente e o endereço do site
 * caíam num valor fixo): a chave e o remetente do Resend sempre; o SITE_URL só na produção (o staging usa o endereço dele —
 * siteDoConvite). Vazio = pode mandar. Quem chama (convites, alunos, agenda-avisar, aluno-enviar) trata a falta como o
 * "sem_resend" de sempre — o e-mail não sai e a reserva no banco, quando há, é desfeita — e avisa pelo log.erro.
 */
export function faltaNoEmail(schema: Schema, config: ConfigEmail): string[] {
  const falta: string[] = [];
  if (!config.resendApiKey) falta.push("RESEND_API_KEY");
  if (!config.resendFrom) falta.push("RESEND_FROM");
  if (schema !== "staging" && !config.siteUrl) falta.push("SITE_URL");
  return falta;
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

function origemDe(link: string): string {
  try {
    return new URL(link).origin;
  } catch {
    return "https://physiqcalc.com.br";
  }
}

/** O e-mail do plano atualizado no molde C (o que o htmlDoEnvio monta; separado para o teste olhar as peças). */
export function modeloDoEnvio(d: DadosEmailEnvio): EmailModelo {
  const nome = primeiroNomeDe(d.aluno);
  const quem = d.quem.trim() || "Seu profissional";
  const t = d.modulos.includes("treino");
  const n = d.modulos.includes("dieta");
  const ambos = t && n;
  const site = origemDe(d.link);
  const icones: IconeEmail[] = [];
  if (t) icones.push("halterGrande");
  if (n || !t) icones.push("saladaVerdeGrande");
  const linhas: LinhaEmail[] = [];
  if (t) linhas.push({ icone: "halter", rotulo: "Treino", valor: "Atualizado · aba Treino do app" });
  if (n || !t) linhas.push({ icone: "saladaVerde", rotulo: "Plano alimentar", valor: "Atualizado · aba Dieta do app" });
  linhas.push({ iniciais: iniciaisDe(quem), rotulo: "Por", valor: quem });
  const primario: BotaoEmail = { texto: rotuloDoBotao(d.modulos), href: d.link };
  const secundarios: BotaoEmail[] = ambos
    ? [{ texto: "Ver meu treino", href: `${site}/treino` }, { texto: "Ver minha dieta", href: `${site}/dieta` }]
    : [];
  const oque = oQueMudou(d.modulos);
  return {
    titulo: "Plano atualizado",
    preheader: `${quem} atualizou ${oque} no Physiq. Abra o app para ver o que mudou.`,
    rotulo: "Plano atualizado",
    destaques: [{
      visual: { tipo: "icones", icones },
      olho: "O que mudou",
      titulo: ambos ? "Treino e dieta" : t ? "Treino" : "Plano alimentar",
      sub: `${ambos ? "atualizados" : "atualizado"} por ${quem}`,
    }],
    saudacao: [nome ? `Olá, ${nome}! ` : "Olá! ", { forte: quem }, ` atualizou ${oque} no Physiq. Abra o app para ver o que mudou.`],
    linhas,
    primario,
    secundarios,
    reserva: { texto: textoDaReserva(1 + secundarios.length, "o app"), href: d.link },
    rodape: `Você recebeu este e-mail porque é aluno de ${quem} no Physiq.`,
    site,
  };
}

/** E-mail no molde C (email-modelo.ts): tabelas + CSS inline, ícones em PNG, sem SVG nem JS. */
export function htmlDoEnvio(d: DadosEmailEnvio): string {
  return montarEmail(modeloDoEnvio(d));
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
