import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/**
 * Entrega um arquivo de texto (o JSON do "Exportar meus dados"): no site, baixa (<a download>); no APK — onde o WebView não
 * tem gerenciador de download e o <a download> da engrenagem antiga não baixava nada — grava no cache privado do app (sem
 * permissão de armazenamento) e abre a folha de compartilhar do Android (Salvar no Drive, Arquivos, e-mail…), o mesmo
 * caminho dos PDFs (src/lib/salvarPdf.ts).
 */
export async function salvarArquivoTexto(nome: string, conteudo: string, tipo = "application/json"): Promise<"baixado" | "compartilhado"> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: nome, data: conteudo, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: nome, files: [uri] });
    return "compartilhado";
  }
  const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "baixado";
}
