// Physiq H5 (N-34) — "Baixar" da foto de progresso no painel (o Nutri tinha, VisualizarFotoDialog). A foto é de bucket privado (URL
// assinada): no site, o próprio Storage manda baixar (parâmetro `download` da URL assinada — sem passar a imagem pelo JavaScript);
// no APK, onde o WebView não baixa por <a download>, a imagem é gravada no cache do app e abre a folha de compartilhar do Android (o
// mesmo caminho dos PDFs, src/lib/salvarPdf.ts).
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { ROTULO_POSICAO } from "@/evolucao/formato";
import { criarFetchResiliente } from "@/integrations/repeticao";
import type { Foto } from "@/evolucao/tipos";

const dataBR = (d: string): string => d.split("-").reverse().join("/");

/** "Frente · 19/09/2026" — nas fotos mensais do personal, o mês ("Frente · 09/2026"). */
export function textoDaFoto(f: Pick<Foto, "posicao" | "data" | "mensal">): string {
  return `${ROTULO_POSICAO[f.posicao]} · ${f.mensal ? dataBR(f.data.slice(0, 7)) : dataBR(f.data)}`;
}

const semAcento = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const slug = (s: string): string => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A extensão do arquivo pelo caminho no Storage (".../frente.png" → "png"); sem extensão conhecida, "jpg". */
export function extensaoDoCaminho(caminho: string | null | undefined): string {
  const m = /\.([a-z0-9]{3,4})$/i.exec(String(caminho ?? "").split("?")[0]);
  const ext = m ? m[1].toLowerCase() : "";
  return ["jpg", "jpeg", "png", "webp", "heic"].includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
}

/** "maria-silva-frente-2026-09-19.jpg" (o nome do Nutri). */
export function nomeArquivoFoto(aluno: string, posicao: string, data: string, caminho?: string | null): string {
  const base = slug(aluno) || "aluno";
  return `${base}-${slug(posicao) || "foto"}-${data}.${extensaoDoCaminho(caminho)}`;
}

/** A URL assinada do Storage com o pedido de download (o Storage responde com Content-Disposition: attachment). */
export function urlDeDownload(url: string, nome: string): string {
  const u = new URL(url);
  u.searchParams.set("download", nome);
  return u.toString();
}

function base64DoBlob(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("Não foi possível ler a foto"));
    r.readAsDataURL(b);
  });
}

const FOTO_NAO_ABRIU = "A foto não abriu. Feche e abra de novo.";
/** hml-14 (H-32, D5): a foto do APK baixa em até 30 s, contando o arquivo inteiro (o relógio vale até ler o corpo); 1 vez só. */
export const TEMPO_FOTO_MS = 30_000;
const buscarFoto = criarFetchResiliente(0, TEMPO_FOTO_MS, undefined, { ateOCorpo: true });

/** Baixa (site) ou compartilha (APK) a foto. */
export async function baixarFoto(url: string, nome: string): Promise<"baixado" | "compartilhado"> {
  if (Capacitor.isNativePlatform()) {
    let foto: Blob;
    try {
      const r = await buscarFoto(url);
      if (!r.ok) throw new Error(FOTO_NAO_ABRIU);
      foto = await r.blob();
    } catch {
      // sem internet ou passou dos 30 s: a frase de quando a foto não abre (nada novo na tela)
      throw new Error(FOTO_NAO_ABRIU);
    }
    const { uri } = await Filesystem.writeFile({ path: nome, data: await base64DoBlob(foto), directory: Directory.Cache });
    await Share.share({ title: nome, files: [uri] });
    return "compartilhado";
  }
  const a = document.createElement("a");
  a.href = urlDeDownload(url, nome);
  a.download = nome;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "baixado";
}
