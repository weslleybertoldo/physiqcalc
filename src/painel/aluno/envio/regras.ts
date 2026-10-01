/**
 * "Salvar e enviar ao aluno" (tela 8) — W17, pedido dele 30/09/2026 ~22:45: "vamos integrar o botão do whatsapp e disparo
 * por email. Pelo whatsapp vai ter um botão com atalho que envia". Regras puras (testadas em regras.test.ts):
 *   · o texto do aviso que aparece para quem salvou (sino + e-mail);
 *   · o atalho do WhatsApp: abre o WhatsApp de quem salvou já na conversa com o aluno e com a mensagem pronta (ela só aperta
 *     enviar); sem telefone no cadastro, o botão fica desligado com o motivo.
 */
import { siteDoAmbiente } from "@/painel/configuracoes/equipe/regras";
import { primeiroNome, whatsappDoAluno } from "../dados/regras";

export type ModuloEnvio = "treino" | "dieta";

export type MotivoSemEmail = "sem_login" | "sem_email" | "repetido" | "falhou" | "sem_aviso";

export interface ResultadoEnvio {
  avisado: boolean;
  repetido: boolean;
  semLogin: boolean;
  /** null = o e-mail não foi tentado (a função do e-mail não respondeu: só o sino foi gravado) */
  email: { enviado: boolean; motivo: MotivoSemEmail | null; teste: boolean } | null;
}

export const SEM_TELEFONE = "Aluno sem telefone";

/** "seu treino", "seu plano alimentar", "seu treino e seu plano alimentar". */
export function oQueMudou(modulos: readonly ModuloEnvio[]): string {
  const t = modulos.includes("treino");
  const d = modulos.includes("dieta");
  if (t && d) return "seu treino e seu plano alimentar";
  return t ? "seu treino" : "seu plano alimentar";
}

/** A aba do app que mostra o que mudou (a mesma do aviso do sino). */
export function caminhoNoApp(modulos: readonly ModuloEnvio[]): "/" | "/treino" | "/dieta" {
  const t = modulos.includes("treino");
  const d = modulos.includes("dieta");
  if (t && d) return "/";
  return t ? "/treino" : "/dieta";
}

/** A mensagem pronta do WhatsApp (quem manda é a própria nutri ou o personal, do celular dela). */
export function mensagemWhatsApp(nomeAluno: string | null | undefined, modulos: readonly ModuloEnvio[], schema: string): string {
  const nome = primeiroNome(nomeAluno);
  const link = `${siteDoAmbiente(schema)}${caminhoNoApp(modulos)}`;
  return `${nome ? `Oi, ${nome}! ` : "Oi! "}Atualizei ${oQueMudou(modulos)} no Physiq. Abra o app para ver: ${link}`;
}

/** O atalho `https://wa.me/<DDI + número>?text=<mensagem>`; null sem telefone válido no cadastro. */
export function atalhoWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  const base = whatsappDoAluno(telefone);
  return base ? `${base}?text=${encodeURIComponent(texto)}` : null;
}

/** O que aparece para quem salvou: o sino (1ª frase) e o e-mail (2ª). `aviso` = o e-mail não saiu. */
export function textoDoResultado(r: ResultadoEnvio): { tipo: "sucesso" | "aviso"; texto: string } {
  if (r.semLogin) return { tipo: "sucesso", texto: "Salvo. O aluno ainda não tem acesso ao app: ele vê assim que entrar." };
  const e = r.email;
  const enviado = !!e?.enviado;
  const motivo = e && !e.enviado ? e.motivo : null;
  const naoSaiu = e === null || motivo === "falhou" || motivo === "sem_aviso";
  const caixa = enviado && e?.teste ? " (caixa de teste)" : "";
  if (r.avisado) {
    if (enviado) return { tipo: "sucesso", texto: `Salvo e enviado: o aluno vê no app, com o aviso no sino e por e-mail${caixa}.` };
    if (motivo === "sem_email") return { tipo: "sucesso", texto: "Salvo e enviado: o aluno vê no app, com o aviso no sino. Sem e-mail no cadastro, nada foi por e-mail." };
    if (motivo === "repetido") return { tipo: "sucesso", texto: "Salvo e enviado: o aluno vê no app, com o aviso no sino. O e-mail já saiu há menos de 10 minutos." };
    if (naoSaiu) return { tipo: "aviso", texto: "Salvo e enviado: o aluno vê no app, com o aviso no sino. O e-mail não saiu agora; tente de novo." };
    return { tipo: "sucesso", texto: "Salvo e enviado: o aluno vê no app, com o aviso no sino." };
  }
  // o aviso do sino já estava lá (menos de 10 minutos, não lido)
  if (enviado) return { tipo: "sucesso", texto: `Salvo. O aluno já tinha o aviso no app; o e-mail saiu agora${caixa}.` };
  if (motivo === "repetido") return { tipo: "sucesso", texto: "Salvo. O aluno já tinha o aviso no app e o e-mail (menos de 10 minutos)." };
  if (naoSaiu) return { tipo: "aviso", texto: "Salvo. O aluno já tinha o aviso no app; o e-mail não saiu agora." };
  return { tipo: "sucesso", texto: "Salvo. O aluno já tinha o aviso no app." };
}

/** A resposta da função aluno-enviar → ResultadoEnvio (o que não vier vira "não"). */
export function lerResultado(d: unknown): ResultadoEnvio {
  const r = (d ?? {}) as Record<string, unknown>;
  const e = (r.email ?? null) as Record<string, unknown> | null;
  const MOTIVOS: MotivoSemEmail[] = ["sem_login", "sem_email", "repetido", "falhou", "sem_aviso"];
  return {
    avisado: r.avisado === true,
    repetido: r.repetido === true,
    semLogin: r.sem_login === true,
    email: e
      ? {
          enviado: e.enviado === true,
          motivo: MOTIVOS.includes(e.motivo as MotivoSemEmail) ? (e.motivo as MotivoSemEmail) : e.enviado === true ? null : "falhou",
          teste: e.teste === true,
        }
      : null,
  };
}
