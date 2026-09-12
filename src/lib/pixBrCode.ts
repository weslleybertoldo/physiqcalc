// Pix "copia e cola" ESTÁTICO (BR Code / EMV® QRCPS-MPM do Banco Central), gerado no cliente.
// Usado na aba Pagamentos do aluno quando o professor cobra por Pix manual: o QR aponta pra
// chave DELE, com o valor da mensalidade; o aluno paga no banco e anexa o comprovante.
// Referência: Manual de Padrões para Iniciação do Pix (BCB), anexo I — payload estático.

export type PixTipoChave = "cpf" | "cnpj" | "telefone" | "email" | "aleatoria";

/** Campo TLV do EMV: id (2 dígitos) + tamanho (2 dígitos) + valor. */
export function tlv(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, sem reflexão, xorout 0) → 4 hex maiúsculos. */
export function crc16(payload: string): string {
  const bytes = new TextEncoder().encode(payload);
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// NFD separa a letra do acento; \p{M} apaga as marcas combinantes (acentos, cedilha, til)
const semAcento = (s: string) => (s || "").normalize("NFD").replace(/\p{M}+/gu, "");

/** Sem acento, só [A-Za-z0-9 ], maiúsculo, espaços colapsados, no máximo `max` caracteres. */
export function normalizarTexto(s: string, max: number): string {
  const limpo = semAcento(s).replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  return limpo.slice(0, max).trim();
}

/** Aceita variações do tipo gravado no cadastro do professor ("aleatória", "e-mail", "celular"...). */
export function tipoChaveNormalizado(tipo?: string | null): PixTipoChave | null {
  if (!tipo) return null;
  const t = semAcento(tipo).toLowerCase().trim();
  if (t === "cpf") return "cpf";
  if (t === "cnpj") return "cnpj";
  if (["telefone", "celular", "fone", "phone", "tel"].includes(t)) return "telefone";
  if (["email", "e-mail", "mail"].includes(t)) return "email";
  if (["aleatoria", "aleatorio", "evp", "random", "chave aleatoria"].includes(t)) return "aleatoria";
  return null;
}

export function rotuloTipoChave(tipo?: string | null): string {
  switch (tipoChaveNormalizado(tipo)) {
    case "cpf": return "CPF";
    case "cnpj": return "CNPJ";
    case "telefone": return "Telefone";
    case "email": return "E-mail";
    case "aleatoria": return "Chave aleatória";
    default: return "Chave Pix";
  }
}

// sem o tipo informado: deduz pela forma da chave (11 dígitos "secos" = CPF; celular sem +55 é ambíguo)
function inferirTipo(chave: string): PixTipoChave {
  const c = chave.trim();
  if (c.includes("@")) return "email";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return "aleatoria";
  if (c.startsWith("+") || c.includes("(")) return "telefone";
  const digitos = c.replace(/\D/g, "");
  if (digitos.length === 14) return "cnpj";
  if (digitos.length === 11) return "cpf";
  if (digitos.length === 10 || digitos.length === 12 || digitos.length === 13) return "telefone";
  return "aleatoria";
}

/** CPF/CNPJ só dígitos · telefone "+55DDDNÚMERO" · e-mail minúsculo · aleatória como está. */
export function normalizarChavePix(chave: string, tipo?: string | null): string {
  const bruta = (chave || "").trim();
  if (!bruta) return "";
  const t = tipoChaveNormalizado(tipo) ?? inferirTipo(bruta);
  if (t === "cpf" || t === "cnpj") return bruta.replace(/\D/g, "");
  if (t === "telefone") {
    let d = bruta.replace(/\D/g, "");
    if (d.startsWith("55") && d.length >= 12) d = d.slice(2); // já veio com o código do país
    return `+55${d}`;
  }
  if (t === "email") return bruta.toLowerCase();
  return bruta;
}

export interface PixBrCodeParams {
  chave: string;
  /** favorecido (campo 59) — até 25 caracteres sem acento */
  nome: string;
  /** campo 60 — até 15 caracteres sem acento */
  cidade?: string;
  /** valor fixo (campo 54); omitido ou <= 0 = o pagador digita */
  valor?: number | string | null;
  /** identificador da transação (campo 62/05); "***" = sem identificador */
  txid?: string;
  /** cpf | cnpj | telefone | email | aleatoria — se omitido, inferido pela chave */
  tipo?: string | null;
}

/** Payload completo do Pix estático (com CRC), pronto pro "copia e cola" e pro QR. */
export function pixBrCode({ chave, nome, cidade = "MACEIO", valor, txid = "***", tipo }: PixBrCodeParams): string {
  const chaveOk = normalizarChavePix(chave, tipo);
  if (!chaveOk) throw new Error("chave_pix_vazia");
  const nomeOk = normalizarTexto(nome, 25) || "PROFESSOR";
  const cidadeOk = normalizarTexto(cidade, 15) || "MACEIO";
  const txidOk = (txid === "***" ? "***" : (txid || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25)) || "***";
  const n = valor === null || valor === undefined || valor === "" ? NaN : Number(valor);
  const temValor = Number.isFinite(n) && n > 0;

  const semCrc =
    tlv("00", "01") +
    tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", chaveOk)) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (temValor ? tlv("54", n.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", nomeOk) +
    tlv("60", cidadeOk) +
    tlv("62", tlv("05", txidOk)) +
    "6304";
  return semCrc + crc16(semCrc);
}
