// Imagem do exercício "local-primeiro": os GIFs do catálogo viram WebP e vêm DENTRO do app
// (`public/exercicios/<uuid>-<v>.webp` → APK = arquivo local, web = Vercel com cache imutável).
// O manifest (gerado por `scripts/exercicios_pack.py`) diz qual versão `v` de cada exercício
// está embutida; se a URL do banco tem outra versão (exercício novo ou GIF trocado depois
// do build), cai na URL da rede como antes.
import manifestJson from "./exerciciosManifest.json";

export interface EntradaManifest {
  /** valor do `?v=` da imagem_url na hora do build */
  v: string;
  bytes: number;
}

export const manifestExercicios = manifestJson as Record<string, EntradaManifest>;

const RE_STORAGE = /\/storage\/v1\/object\/public\/exercicios(?:-staging)?\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:gif|webp)(?:\?v=([^&#]+))?/i;

/** Caminho local do arquivo embutido, ou null se não estiver embutido nessa versão. */
export function imagemLocal(url: string | null | undefined, manifest: Record<string, EntradaManifest> = manifestExercicios): string | null {
  if (!url) return null;
  const m = RE_STORAGE.exec(url);
  if (!m) return null;
  const [, uuid, v] = m;
  const entrada = manifest[uuid.toLowerCase()];
  if (!entrada || !v || entrada.v !== v) return null;
  return `/exercicios/${uuid.toLowerCase()}-${entrada.v}.webp`;
}

/** URL a usar no <img>: local quando embutida na mesma versão; senão a URL original. */
export function resolverImagem(url: string | null | undefined, manifest: Record<string, EntradaManifest> = manifestExercicios): string | null {
  if (!url) return null;
  return imagemLocal(url, manifest) ?? url;
}
