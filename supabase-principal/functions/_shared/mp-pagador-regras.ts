// Physiq mp-cartao (contrato §2.2) — o que o pedido de CARTÃO leva ao Mercado Pago para ajudar a aprovação ("Recommendations to improve
// payments approval", lida em 15/10/2026): o aparelho (o cabeçalho X-meli-session-id, com o id do security.js da tela de pagar), o pagador
// (o nome e o documento do TITULAR, do formulário do cartão), 1 item (additional_info.items) e o descritor da fatura (statement_descriptor).
// Puro — sem Deno, rede ou banco (o Vitest importa: src/financeiro/mpPagador.test.ts). O que é da pessoa (CPF/CNPJ, nome, o id do aparelho)
// só vai ao MP, na memória do pedido: nunca ao log, à resposta de erro ou ao banco. Inválido fica FORA (o MP recusaria o pedido inteiro) e
// nada daqui trava o pagamento: sem nada, o pedido é o de antes + o item + o descritor (o APK antigo).

import { codigosDoMp } from "./cobranca-regras.ts";

/** O nome que aparece na fatura do cartão (o MP aceita até 13 caracteres — "Configure invoice description"). Decisão 5: nos 2 MPs. */
export const DESCRITOR_FATURA = "PHYSIQ";

/** A categoria do item (decisão 4: o serviço do profissional). A doc pública do MP (lida em 15/10) não lista as categorias — só o exemplo
 *  "games" e "Categoria do item" —, então fica "services"; o aceite no sandbox (e2e/mpc/api.py --sandbox) confere que o MP guarda. */
export const CATEGORIA_DO_ITEM = "services";

/** O formato aceito do id do aparelho (o MP_DEVICE_SESSION_ID do security.js): só letras, dígitos e . _ : -, de 8 a 512 — sem quebra de
 *  linha nem espaço (ele vai num cabeçalho HTTP). Fora disso, o pedido segue SEM o cabeçalho (o token do SDK já leva o aparelho dele). */
export const DEVICE_RX = /^[A-Za-z0-9._:-]{8,512}$/;

/** O cabeçalho do aparelho na criação do pagamento (a doc: "Use the device ID"). */
export const CABECALHO_DEVICE = "X-meli-session-id";

const NOME_MAX = 60;
/** O nome do titular: letras (com acento), espaço, apóstrofo, hífen e ponto. Número, símbolo ou controle → o nome fica fora. */
const NOME_RX = /^[\p{L}\p{M}' ’.-]+$/u;
const TITULO_MAX = 120;

export interface IdentificacaoMp {
  type: "CPF" | "CNPJ";
  number: string;
}

/** O que vai no `payer` (junto do e-mail): só o que veio válido. */
export interface PagadorMp {
  first_name?: string;
  last_name?: string;
  identification?: IdentificacaoMp;
}

export interface ItemMp {
  id: string;
  title: string;
  category_id: string;
  quantity: 1;
  unit_price: number;
}

export interface InfoAdicionalMp {
  items: ItemMp[];
  payer?: { first_name: string; last_name?: string };
}

/** O id do aparelho que a tela mandou (`device_id`), se estiver no formato; senão null. */
export function deviceDoPedido(v: unknown): string | null {
  return typeof v === "string" && DEVICE_RX.test(v) ? v : null;
}

/** O cabeçalho do aparelho para o `init.headers` do mpFetch — SÓ esta chave (o init.headers vem por último no mpFetch: outra chave
 *  sobrescreveria o Authorization, o Content-Type ou a X-Idempotency-Key). Sem aparelho válido → {}. */
export function cabecalhosDoDevice(d: unknown): Record<string, string> {
  const ok = deviceDoPedido(d);
  return ok ? { [CABECALHO_DEVICE]: ok } : {};
}

/** Os 2 dígitos verificadores do CPF (11 dígitos iguais não vale) — o mesmo cálculo do validarCPF da tela (src/publico/cadastro/regras.ts). */
export function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Os 2 dígitos verificadores do CNPJ numérico (14 dígitos iguais não vale). O CNPJ alfanumérico (2026) fica fora: o documento é opcional. */
export function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

function nomeLimpo(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 300) return null;
  const nome = v.normalize("NFC").replace(/\s+/g, " ").trim();
  return nome && NOME_RX.test(nome) && /\p{L}/u.test(nome) ? nome : null;
}

function identificacaoDe(v: unknown): IdentificacaoMp | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const { tipo, numero } = v as { tipo?: unknown; numero?: unknown };
  const t = typeof tipo === "string" ? tipo.trim().toUpperCase() : "";
  const n = typeof numero === "string" ? numero.trim() : "";
  if (t === "CPF" && cpfValido(n)) return { type: "CPF", number: n };
  if (t === "CNPJ" && cnpjValido(n)) return { type: "CNPJ", number: n };
  return null;
}

/**
 * O pagador que a tela mandou (`pagador: { nome?, documento?: { tipo: "CPF" | "CNPJ", numero } }` — o titular e o documento do Brick) →
 * `{ first_name?, last_name?, identification? }`: o nome dividido na 1ª palavra e no resto (1 palavra → só first_name), até 60 cada; o
 * documento só com dígitos e o dígito verificador certo. O que faltar ou vier fora do formato não vai (nunca lança).
 */
export function pagadorDoPedido(v: unknown): PagadorMp {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as { nome?: unknown; documento?: unknown };
  const saida: PagadorMp = {};
  const nome = nomeLimpo(o.nome);
  if (nome) {
    // as palavras sem letra (um "-" ou "." solto) ficam fora
    const [primeiro, ...resto] = nome.split(" ").filter((w) => /\p{L}/u.test(w));
    saida.first_name = primeiro.slice(0, NOME_MAX).trim();
    const sobrenome = resto.join(" ").slice(0, NOME_MAX).trim();
    if (sobrenome) saida.last_name = sobrenome;
  }
  const doc = identificacaoDe(o.documento);
  if (doc) saida.identification = doc;
  return saida;
}

/** O item do pagamento (additional_info.items[0]): o id (a avulsa, o plano do aluno ou a mensalidade), o título (a descrição da linha, até
 *  120), a categoria, 1 unidade e o valor do pagamento. */
export function itemDoPedido({ id, titulo, valor }: { id: string; titulo: string; valor: number }): ItemMp {
  const t = String(titulo ?? "").replace(/\s+/g, " ").trim().slice(0, TITULO_MAX).trim();
  return { id: String(id).slice(0, 64), title: t || "Physiq", category_id: CATEGORIA_DO_ITEM, quantity: 1, unit_price: Number(valor) };
}

/** O additional_info do pagamento: o item e, com o nome do titular, o payer dele (o exemplo da doc põe o nome no additional_info.payer). */
export function infoAdicionalDoPedido(item: ItemMp, pagador: PagadorMp): InfoAdicionalMp {
  if (!pagador.first_name) return { items: [item] };
  return { items: [item], payer: { first_name: pagador.first_name, ...(pagador.last_name ? { last_name: pagador.last_name } : {}) } };
}

/** O desfecho do aparelho para o campo `resultado` do log (nunca o id). */
export const resultadoDoDevice = (d: string | null): "com_device" | "sem_device" => (d ? "com_device" : "sem_device");

/** O texto do MP que volta na resposta de erro (`detalhe`, até 200): sequências de 5+ dígitos e endereços de e-mail viram "…" — o documento
 *  do titular, que agora vai no pedido, nunca volta por aqui. */
export function detalheSemDado(corpo: unknown): string {
  const msg = String((corpo as { message?: unknown } | null)?.message ?? "");
  return msg.replace(/[^\s@]+@[^\s@]+/g, "…").replace(/\d{5,}/g, "…").slice(0, 200);
}

/** O código da recusa para a resposta de erro (`status_detail` do cartao_recusado — a tela escolhe o texto, §7.7): o status_detail do MP ou o
 *  cc_rejected_… do texto (codigosDoMp), SÓ no formato de código ([a-z0-9_], até 64); senão null. */
export function codigoDaRecusa(corpo: unknown): string | null {
  const sd = codigosDoMp(corpo).mp_status_detail;
  return typeof sd === "string" && /^[a-z0-9_]{1,64}$/.test(sd) ? sd : null;
}
