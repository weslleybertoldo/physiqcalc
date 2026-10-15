import { MP_CSP_NONCE } from "./mpInit";

// mp-cartao (contrato §2.1, decisões 1–3 de 15/10/2026): o que a tela de pagar do ALUNO manda a mais ao Mercado Pago para ajudar a
// aprovação do cartão ("Recommendations to improve payments approval"):
// - o aparelho: o script de segurança do MP (security.js, view "checkout") expõe o id do aparelho em window.MP_DEVICE_SESSION_ID — a
//   função o repassa no cabeçalho X-meli-session-id. O SDK do Brick já manda o aparelho DELE dentro do token; o id do security.js é o que
//   a doc pede no cabeçalho. Carrega só na folha de pagar do aluno, ao abrir com cartão (decisão 2: o mínimo — o plano do painel não
//   carrega). O script recebe o nonce da CSP (MP_CSP_NONCE, desvio 20): ele repassa o currentScript.nonce ao widget inline que injeta.
// - o pagador: o nome do titular e o documento que a pessoa digitou no formulário do cartão (o Brick) — pagadorDoBrick.
// Nada daqui lança nem segura o pagamento: sem o id (bloqueado, lento, APK antigo), o pagamento vai como antes.

/** O script de segurança do Mercado Pago (o host está no script-src do vercel.json — a guarda scripts/ci/cabecalhos.test.mjs confere). */
export const MP_SECURITY_JS = "https://www.mercadopago.com/v2/security.js";
/** O mesmo formato que a função aceita (_shared/mp-pagador-regras.ts › DEVICE_RX): fora dele, o id não vai. */
export const DEVICE_RX = /^[A-Za-z0-9._:-]{8,512}$/;
/** Quanto o envio espera pelo id (o security.js o entrega ~3 s depois de carregar; o tempo de digitar o cartão cobre isso). */
export const ESPERA_DEVICE_MS = 2000;
const PASSO_MS = 200;
const NOME_MAX = 120;

type EstadoDoScript = "carregando" | "carregou" | "falhou";
const estadoDo = new WeakMap<HTMLScriptElement, EstadoDoScript>();

const scriptDaPagina = (): HTMLScriptElement | null =>
  typeof document === "undefined" ? null : document.querySelector<HTMLScriptElement>("script[data-mp-seguranca]");

/** Põe o security.js na página (1× por página: já posto, nada; sem `document`, nada). */
export function carregarSegurancaMp(): void {
  try {
    if (typeof document === "undefined" || scriptDaPagina()) return;
    const s = document.createElement("script");
    s.src = MP_SECURITY_JS;
    s.async = true;
    s.setAttribute("view", "checkout");
    s.setAttribute("data-mp-seguranca", "");
    // o atributo e a propriedade (o navegador esconde o atributo depois de inserir; o currentScript.nonce lê a propriedade)
    s.setAttribute("nonce", MP_CSP_NONCE);
    s.nonce = MP_CSP_NONCE;
    estadoDo.set(s, "carregando");
    s.addEventListener("load", () => estadoDo.set(s, "carregou"));
    s.addEventListener("error", () => estadoDo.set(s, "falhou"));
    document.head.appendChild(s);
  } catch {
    /* sem o script, o pagamento segue sem o id do aparelho */
  }
}

/** O valor de agora: string no formato → o id; vazio → null (ainda não veio); outra coisa → undefined (não serve). */
function lerDeviceAgora(): string | null | undefined {
  const v = typeof window === "undefined" ? undefined : (window as { MP_DEVICE_SESSION_ID?: unknown }).MP_DEVICE_SESSION_ID;
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "string" && DEVICE_RX.test(v) ? v : undefined;
}

/**
 * O id do aparelho do security.js para o pedido (`device_id`): pronto → na hora; ainda vazio com o script carregando (ou carregado, à espera
 * do id final) → tenta a cada 200 ms até `esperarMs`; fora do formato, sem o script na página ou o script falhou → undefined. Nunca lança.
 */
export async function deviceIdMp({ esperarMs = ESPERA_DEVICE_MS }: { esperarMs?: number } = {}): Promise<string | undefined> {
  try {
    const inicio = Date.now();
    for (;;) {
      const v = lerDeviceAgora();
      if (v !== null) return v;
      const s = scriptDaPagina();
      if (!s || estadoDo.get(s) === "falhou" || Date.now() - inicio >= esperarMs) return undefined;
      await new Promise((ok) => setTimeout(ok, PASSO_MS));
    }
  } catch {
    return undefined;
  }
}

/** O pagador que vai no pedido do cartão do aluno (a função confere de novo e tira o que não serve). */
export interface PagadorDoCartao {
  nome?: string;
  documento?: { tipo: "CPF" | "CNPJ"; numero: string };
}

/**
 * Do envio do Brick (`onSubmit(formData, additionalData)`): o nome do titular (`additionalData.cardholderName` — sem caractere de controle,
 * espaços colapsados, até 120) e o documento (`formData.payer.identification` — só os dígitos; CPF com 11, CNPJ com 14). O que faltar não
 * vai; sem nada → undefined (o corpo do pedido fica o de antes).
 */
export function pagadorDoBrick(form: unknown, extra: unknown): PagadorDoCartao | undefined {
  const bruto = (extra as { cardholderName?: unknown } | null | undefined)?.cardholderName;
  // eslint-disable-next-line no-control-regex -- tirar os caracteres de controle é o objetivo
  const nome = typeof bruto === "string" ? bruto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NOME_MAX).trim() : "";
  const id = (form as { payer?: { identification?: { type?: unknown; number?: unknown } | null } | null } | null | undefined)?.payer?.identification;
  const tipo = typeof id?.type === "string" ? id.type.trim().toUpperCase() : "";
  const numero = typeof id?.number === "string" || typeof id?.number === "number" ? String(id.number).replace(/\D/g, "") : "";
  const documento = (tipo === "CPF" && numero.length === 11) || (tipo === "CNPJ" && numero.length === 14)
    ? { tipo: tipo as "CPF" | "CNPJ", numero } : undefined;
  if (!nome && !documento) return undefined;
  return { ...(nome ? { nome } : {}), ...(documento ? { documento } : {}) };
}
