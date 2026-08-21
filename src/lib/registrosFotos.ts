import { supabase, DB_SCHEMA } from "@/integrations/supabase/client";

// Bucket privado — staging tem espelho próprio (mesmo padrão do bucket de exercícios)
export const BUCKET_REGISTROS = DB_SCHEMA === "staging" ? "registros-staging" : "registros";

export const TIPOS_FOTO = [
  { key: "frente", label: "Frente" },
  { key: "costas", label: "Costas" },
  { key: "lateral_direita", label: "Lateral D" },
  { key: "lateral_esquerda", label: "Lateral E" },
] as const;

export type TipoFoto = (typeof TIPOS_FOTO)[number]["key"];

export interface RegistroFoto {
  id: string;
  user_id: string;
  mes_ref: string; // yyyy-mm-dd (sempre dia 1)
  tipo: TipoFoto;
  storage_path: string;
}

// "2026-08-01" → "2026-08" (valor do <input type="month">)
export const mesRefParaInput = (mesRef: string) => mesRef.slice(0, 7);
// "2026-08" → "2026-08-01"
export const inputParaMesRef = (input: string) => `${input}-01`;

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function formatarMesRef(mesRef: string) {
  const [ano, mes] = mesRef.split("-");
  return `${MESES[parseInt(mes, 10) - 1]} ${ano}`;
}

export async function carregarRegistros(userId: string): Promise<RegistroFoto[]> {
  const { data, error } = await supabase
    .from("physiq_registros_fotos")
    .select("id, user_id, mes_ref, tipo, storage_path")
    .eq("user_id", userId)
    .order("mes_ref", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RegistroFoto[];
}

export async function urlAssinada(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET_REGISTROS).createSignedUrl(path, 3600);
  if (error) {
    console.warn("[registros] Erro ao assinar URL:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

// Reduz a foto pra no máx 1600px (maior lado) em JPEG — Storage do free tier sob controle
export async function comprimirImagem(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality);
  });
}
