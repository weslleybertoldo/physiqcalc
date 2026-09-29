import { useEffect, useState } from "react";
import { CheckCircle2, Download, FileJson } from "lucide-react";
import { toast } from "sonner";
import { hojeSP } from "@/financeiro/regras";
import { MensagemForm } from "@/entrada/pecas/Campo";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { exportarMeusDados, mensagemErroConta } from "./api";
import { salvarArquivoTexto } from "./salvarArquivo";

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Perfil › Exportar meus dados (falha F4 — C88, R11; LGPD): um arquivo JSON com os dados da pessoa nos 2 bancos do Physiq.
 * No site baixa; no APK abre a folha de compartilhar do Android (salvar no Drive, em Arquivos, mandar por e-mail…).
 */
export function SheetExportar({ aberto, aoMudar }: { aberto: boolean; aoMudar: (v: boolean) => void }) {
  const [estado, setEstado] = useState<"pronto" | "gerando" | "feito">("pronto");
  const [erro, setErro] = useState("");
  const [arquivo, setArquivo] = useState<{ nome: string; tamanho: number } | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setEstado("pronto");
    setErro("");
    setArquivo(null);
  }, [aberto]);

  const baixar = async () => {
    setErro("");
    setEstado("gerando");
    try {
      const a = await exportarMeusDados(hojeSP());
      const como = await salvarArquivoTexto(a.nome, a.texto);
      setArquivo({ nome: a.nome, tamanho: a.tamanho });
      setEstado("feito");
      toast.success(como === "baixado" ? "Arquivo baixado." : "Arquivo pronto: escolha onde salvar.");
    } catch (e) {
      setEstado("pronto");
      setErro(mensagemErroConta(e));
    }
  };

  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Exportar meus dados">
      <div className="flex flex-col gap-4 pt-1" data-sheet-exportar data-estado-exportar={estado}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-violeta-3">
            <FileJson aria-hidden className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <p className="text-[13px] leading-relaxed text-texto-2">
            Um arquivo (JSON) com os seus dados no Physiq: login e cadastro, matrícula, treinos, séries e cargas, avaliações, dieta,
            agenda, pagamentos e recibos. As fotos vão só como referência (data e tipo), não a imagem.
          </p>
        </div>
        {estado === "feito" && arquivo && (
          <MensagemForm tom="ok" data-exportar-ok>
            <CheckCircle2 aria-hidden className="mr-1.5 inline h-4 w-4 align-[-3px]" />
            {arquivo.nome} · {tamanhoLegivel(arquivo.tamanho)}
          </MensagemForm>
        )}
        {erro && <MensagemForm data-exportar-erro>{erro}</MensagemForm>}
        <Botao variante="w" icone={Download} onClick={() => void baixar()} disabled={estado === "gerando"} data-exportar-baixar>
          {estado === "gerando" ? "Juntando os seus dados…" : estado === "feito" ? "Baixar de novo" : "Baixar meus dados"}
        </Botao>
      </div>
    </PainelDeslizante>
  );
}
