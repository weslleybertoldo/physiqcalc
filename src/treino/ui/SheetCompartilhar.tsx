import { useEffect, useRef, useState } from "react";
import { Camera, Download, Image as ImageIcon, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { baixarImagem, compartilharImagem } from "@/lib/compartilharImagem";
import { gerarImagemTreino } from "@/lib/gerarImagemTreino";
import type { TreinoResumo } from "@/lib/treinoResumo";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";

/**
 * Imagem do treino para compartilhar ou salvar na galeria (C77/C21): "Só dados" ou "Com foto" (uma foto do aparelho de
 * fundo). No APK, "Salvar na galeria" grava de verdade na galeria (GalleryImage); no site, baixa o arquivo.
 */
export function SheetCompartilhar({ resumo, aoFechar }: { resumo: TreinoResumo | null; aoFechar: () => void }) {
  const [modo, setModo] = useState<"dados" | "foto">("dados");
  const [foto, setFoto] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [acao, setAcao] = useState<"compartilhar" | "salvar" | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!resumo) {
      setModo("dados");
      setFoto(null);
      setPrevia(null);
      return;
    }
    let vivo = true;
    setGerando(true);
    gerarImagemTreino(resumo, { fotoDataUrl: modo === "foto" ? foto : null })
      .then((url) => vivo && setPrevia(url))
      .catch(() => vivo && toast.error("Não deu para montar a imagem."))
      .finally(() => vivo && setGerando(false));
    return () => {
      vivo = false;
    };
  }, [resumo, modo, foto]);

  const nomeArquivo = resumo ? `treino-${resumo.nome_treino.replace(/\s+/g, "-").toLowerCase()}-${resumo.iniciado_em.slice(0, 10)}.png` : "treino.png";

  const escolherFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      setFoto(leitor.result as string);
      setModo("foto");
    };
    leitor.readAsDataURL(f);
  };

  const compartilhar = async () => {
    if (!previa) return;
    setAcao("compartilhar");
    try {
      await compartilharImagem(previa, nomeArquivo);
    } catch {
      toast.error("Não deu para compartilhar.");
    }
    setAcao(null);
  };

  const salvar = async () => {
    if (!previa) return;
    setAcao("salvar");
    try {
      await baixarImagem(previa, nomeArquivo);
      toast.success("Imagem salva.");
    } catch {
      toast.error("Não deu para salvar a imagem.");
    }
    setAcao(null);
  };

  return (
    <PainelDeslizante aberto={!!resumo} aoMudar={(v) => !v && aoFechar()} titulo="Compartilhar treino" descricao={resumo?.nome_treino}
      rodape={
        <div className="grid grid-cols-2 gap-2">
          <Botao variante="w" icone={acao === "compartilhar" ? Loader2 : Share2} disabled={!previa || gerando || acao !== null} onClick={() => void compartilhar()} data-compartilhar-enviar>
            Compartilhar
          </Botao>
          <Botao variante="g" icone={acao === "salvar" ? Loader2 : Download} disabled={!previa || gerando || acao !== null} onClick={() => void salvar()} data-compartilhar-salvar>
            Salvar na galeria
          </Botao>
        </div>
      }>
      <div className="flex flex-col gap-3 pt-1" data-sheet-compartilhar>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo da imagem">
          <button type="button" role="radio" aria-checked={modo === "dados"} onClick={() => setModo("dados")} data-compartilhar-modo="dados"
            className={cn("flex h-11 items-center justify-center gap-2 rounded-2xl border text-[13px] font-semibold", modo === "dados" ? "border-violeta/55 bg-violeta/10 text-violeta-3" : "border-linha bg-superficie text-texto-2")}>
            <ImageIcon aria-hidden className="h-4 w-4" /> Só dados
          </button>
          <button type="button" role="radio" aria-checked={modo === "foto"} onClick={() => (foto ? setModo("foto") : arquivoRef.current?.click())} data-compartilhar-modo="foto"
            className={cn("flex h-11 items-center justify-center gap-2 rounded-2xl border text-[13px] font-semibold", modo === "foto" ? "border-violeta/55 bg-violeta/10 text-violeta-3" : "border-linha bg-superficie text-texto-2")}>
            <Camera aria-hidden className="h-4 w-4" /> Com foto
          </button>
        </div>
        <input ref={arquivoRef} type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
        {modo === "foto" && (
          <button type="button" onClick={() => arquivoRef.current?.click()} className="self-center text-[12.5px] font-semibold text-violeta-3">
            {foto ? "Trocar a foto de fundo" : "Escolher a foto de fundo"}
          </button>
        )}
        <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-2xl border border-linha bg-superficie" data-compartilhar-previa={previa ? "1" : "0"}>
          {gerando ? <Loader2 aria-label="Montando a imagem" className="h-7 w-7 animate-spin text-texto-3" /> : previa ? <img src={previa} alt="Prévia do treino" className="h-auto w-full" /> : <span className="text-[12px] text-texto-3">Sem prévia</span>}
        </div>
      </div>
    </PainelDeslizante>
  );
}
