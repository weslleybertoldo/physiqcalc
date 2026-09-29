// Physiq W6 — Pix "copia e cola" estático na chave ativa da conta (o BR Code do Calc — src/lib/pixBrCode.ts) e o QR dele.
import { toDataURL } from "qrcode";
import { pixBrCode } from "@/lib/pixBrCode";
import type { ChavePix } from "./tipos";

/** Payload do Pix com o valor (ou null se a chave não é válida para o BR Code). */
export function payloadPix(chave: ChavePix | null | undefined, valor: number, nomePadrao: string): string | null {
  if (!chave?.chave) return null;
  try {
    return pixBrCode({ chave: chave.chave, tipo: chave.tipo, nome: chave.favorecido || nomePadrao || "PHYSIQ", valor });
  } catch {
    return null;
  }
}

export async function qrDoPix(payload: string): Promise<string | null> {
  try {
    return await toDataURL(payload, { margin: 1, width: 360 });
  } catch {
    return null;
  }
}
