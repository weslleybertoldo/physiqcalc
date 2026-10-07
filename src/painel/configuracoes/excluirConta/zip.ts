/**
 * W2 da loja — "Baixar prontuários" antes de excluir a conta (decisão do Weslley, 06/10/2026): 1 PDF por paciente, gerado no aparelho
 * pelo MESMO documento do "PDF do prontuário" da tela do aluno (src/nutricao/prontuario/lib/prontuarioPdf.ts, jsPDF) e juntado num
 * .zip (fflate — MIT, já vem com o jsPDF). Os dados vêm de w2l_prontuarios_para_baixar (a regra de visibilidade da aluno_anotacoes:
 * "Só nutricionistas" só para quem vê o clínico), inclusive das matrículas que já estão na lixeira.
 * Salvar: no site, baixa (<a download>); no APK — onde o WebView não baixa — grava no cache do app e abre a folha de compartilhar
 * (o caminho dos PDFs, src/lib/salvarPdf.ts).
 */
import { Capacitor } from "@capacitor/core";
import { compartilharBase64 } from "@/lib/salvarPdf";
import { principal } from "@/integrations/principal/client";
import { prontuariosParaBaixar, type Conferencia } from "./api";
import { lotesParaBaixar, nomeDoZip, nomeUnico, prontuariosDaConferencia } from "./regras";

const ROTULO_AUTOR: Record<string, string> = { dono: "dono", personal: "personal", nutricionista: "nutricionista", master: "master" };

export interface ZipPronto {
  nome: string;
  bytes: Uint8Array;
  pdfs: string[];
}

/** Gera o ZIP com 1 PDF por paciente com prontuário (aoProgresso(feitos, total) a cada PDF). */
export async function montarZipDeProntuarios(c: Conferencia, aoProgresso?: (feitos: number, total: number) => void, agora = new Date()): Promise<ZipPronto> {
  const [{ montarPDFProntuario }, { nomeArquivoPDFProntuario }, { zipSync }] = await Promise.all([
    import("@/nutricao/prontuario/lib/prontuarioPdf"),
    import("@/nutricao/editor/lib/prontuarioUtil"),
    import("fflate"),
  ]);
  const { data } = await principal.auth.getSession();
  const eu = data.session?.user?.id ?? null;
  const lista = prontuariosDaConferencia(c);
  const varias = new Set(lista.map((p) => p.conta_id ?? "")).size > 1;
  const nomeConta = new Map(c.contas.map((x) => [x.id ?? "", x.nome]));
  const arquivos: Record<string, Uint8Array> = {};
  const usados = new Set<string>();
  const pdfs: string[] = [];
  let feitos = 0;
  aoProgresso?.(0, lista.length);
  for (const lote of lotesParaBaixar(lista)) {
    const r = await prontuariosParaBaixar(lote.conta, lote.pacientes);
    for (const p of r.pacientes) {
      const doc = montarPDFProntuario({
        paciente: p.nome,
        nascimento: p.nascimento,
        nutricionista: r.emissor,
        rotuloProfissional: r.clinico ? "Nutricionista" : "Profissional",
        emitidoEm: agora,
        registros: p.registros.map((x) => ({
          data: x.data,
          texto: x.texto,
          created_at: x.created_at,
          autor: x.autor_id === eu ? null : `${x.autor_nome ?? "Profissional"} (${ROTULO_AUTOR[x.autor_papel] ?? "profissional"})`,
        })),
      });
      const pasta = varias ? `${(nomeConta.get(lote.conta ?? "") ?? "Pacientes sem conta").replace(/[\\/:*?"<>|]+/g, " ").trim()}/` : "";
      const nome = nomeUnico(`${pasta}${nomeArquivoPDFProntuario(p.nome, agora)}`, usados);
      arquivos[nome] = new Uint8Array(doc.output("arraybuffer"));
      pdfs.push(nome);
      feitos += 1;
      aoProgresso?.(feitos, lista.length);
    }
  }
  // os PDFs já vêm comprimidos pelo jsPDF: "store" (nível 0) deixa o ZIP rápido no celular
  const bytes = zipSync(arquivos, { level: 0 });
  const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  return { nome: nomeDoZip(dia), bytes, pdfs };
}

function paraBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Entrega o ZIP: baixa no site; no APK, compartilha (Salvar no Drive, Arquivos, e-mail…). */
export async function salvarZip(z: ZipPronto): Promise<"baixado" | "compartilhado"> {
  if (Capacitor.isNativePlatform()) {
    await compartilharBase64(z.nome, paraBase64(z.bytes));
    return "compartilhado";
  }
  const blob = new Blob([z.bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = z.nome;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "baixado";
}
