import { DB_SCHEMA } from "@/integrations/supabase/client";

// Bucket privado — staging tem espelho próprio (mesmo padrão do bucket de exercícios)
// hml-20a (H-42): sem a leitura direta que sobrava aqui (carregarRegistros, urlAssinada e o formatarMesRef — 0 uso desde a W28): as
// fotos mensais do próprio aluno são lidas e assinadas em src/evolucao/fontes.ts (o carregarTreino — no navegador, o desvio do gate J,
// docs/desvios.md) e as do painel, pela treino-leitura.
export const BUCKET_REGISTROS = DB_SCHEMA === "staging" ? "registros-staging" : "registros";

export const TIPOS_FOTO = [
  { key: "frente", label: "Frente" },
  { key: "costas", label: "Costas" },
  { key: "lateral_direita", label: "Lateral D" },
  { key: "lateral_esquerda", label: "Lateral E" },
] as const;

export type TipoFoto = (typeof TIPOS_FOTO)[number]["key"];

// "2026-08-01" → "2026-08" (valor do <input type="month">)
export const mesRefParaInput = (mesRef: string) => mesRef.slice(0, 7);
// "2026-08" → "2026-08-01"
export const inputParaMesRef = (input: string) => `${input}-01`;

// Decodifica a imagem; HEIC/HEIF (padrão do iPhone) o browser não abre nativo —
// converte via heic2any (lazy, só carrega o chunk quando precisa)
async function decodificarImagem(file: File): Promise<ImageBitmap> {
  const direto = await createImageBitmap(file).catch(() => null);
  if (direto) return direto;
  try {
    const { default: heic2any } = await import("heic2any");
    const jpeg = (await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 })) as Blob;
    const convertido = await createImageBitmap(jpeg).catch(() => null);
    if (convertido) return convertido;
  } catch (e) {
    console.warn("[registros] Conversão HEIC falhou:", e);
  }
  throw new Error("Formato de imagem não suportado. Envie JPEG ou PNG.");
}

// Reduz a foto pra no máx 1600px (maior lado) em JPEG — Storage do free tier sob controle.
// Nunca sobe o arquivo sem decodificar: bytes que o browser não abre viram imagem quebrada no app.
export async function comprimirImagem(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await decodificarImagem(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem neste dispositivo.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
  if (!blob) throw new Error("Não foi possível processar a imagem neste dispositivo.");
  return blob;
}
