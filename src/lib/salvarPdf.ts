import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { jsPDF } from "jspdf";

// No WebView do APK o doc.save() do jsPDF não baixa nada. Nativo: grava no cache
// privado (sem permissão de storage) e abre a share sheet do sistema.
export async function salvarPdf(doc: jsPDF, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    doc.save(filename);
    return;
  }
  const base64 = doc.output("datauristring").split(",")[1];
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({
    title: filename,
    files: [uri],
  });
}
