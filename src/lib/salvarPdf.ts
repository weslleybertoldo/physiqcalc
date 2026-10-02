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
  await compartilharBase64(filename, doc.output("datauristring").split(",")[1]);
}

/**
 * H4: o mesmo caminho para um arquivo já em base64 (ex.: o Excel do relatório do mês — XLSX.write com type "base64"). No site quem
 * baixa é o chamador (XLSX.writeFile); aqui é só o nativo.
 */
export async function compartilharBase64(filename: string, base64: string): Promise<void> {
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
