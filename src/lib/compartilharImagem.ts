import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

interface GalleryImagePlugin {
  saveImage(options: { base64: string; filename: string }): Promise<{ uri: string }>;
}
const GalleryImage = registerPlugin<GalleryImagePlugin>("GalleryImage");

function dataUrlParaBase64(dataUrl: string): string {
  return dataUrl.split(",")[1] ?? "";
}

/** Compartilha a imagem (data URL PNG). Nativo: grava no cache e abre a share
 *  sheet; web: usa navigator.share com File se disponível, senão baixa. */
export async function compartilharImagem(dataUrl: string, filename: string, titulo = "Treino concluído"): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: dataUrlParaBase64(dataUrl),
      directory: Directory.Cache,
    });
    await Share.share({ title: titulo, files: [uri] });
    return;
  }
  // Web: tenta Web Share API com arquivo, senão baixa
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: "image/png" });
    const navShare = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (navShare.share && navShare.canShare?.({ files: [file] })) {
      await navShare.share({ files: [file], title: titulo });
      return;
    }
  } catch {
    /* cai no download */
  }
  baixarImagem(dataUrl, filename);
}

/** Baixa a imagem (data URL PNG). Nativo (Android): salva DE FATO na galeria via
 *  plugin MediaStore. Se o plugin falhar (ex. sem permissão no Android 9-), cai
 *  no fallback de gravar em Documents + share sheet. Web: <a download>. */
export async function baixarImagem(dataUrl: string, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await GalleryImage.saveImage({ base64: dataUrlParaBase64(dataUrl), filename });
      return;
    } catch {
      // fallback: sem galeria disponível → grava e abre a share sheet
      const { uri } = await Filesystem.writeFile({
        path: filename,
        data: dataUrlParaBase64(dataUrl),
        directory: Directory.Documents,
      });
      await Share.share({ title: filename, files: [uri] });
      return;
    }
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
