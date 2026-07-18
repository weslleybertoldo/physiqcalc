import { useState, useEffect, useRef } from "react";
import { X, Image as ImageIcon, Camera, Share2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TreinoResumo } from "@/lib/treinoResumo";
import { gerarImagemTreino } from "@/lib/gerarImagemTreino";
import { compartilharImagem, baixarImagem } from "@/lib/compartilharImagem";

interface Props {
  resumo: TreinoResumo;
  onClose: () => void;
}

type Modo = "template" | "foto";

const CompartilharTreinoModal = ({ resumo, onClose }: Props) => {
  const [modo, setModo] = useState<Modo>("template");
  const [fotoDataUrl, setFotoDataUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [acao, setAcao] = useState<"share" | "download" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filename = `treino-${resumo.nome_treino.replace(/\s+/g, "-").toLowerCase()}-${resumo.iniciado_em.slice(0, 10)}.png`;

  // Regenera o preview quando muda o modo ou a foto
  useEffect(() => {
    let cancelado = false;
    setGerando(true);
    gerarImagemTreino(resumo, { fotoDataUrl: modo === "foto" ? fotoDataUrl : null })
      .then((url) => { if (!cancelado) setPreview(url); })
      .catch(() => { if (!cancelado) toast.error("Erro ao gerar imagem."); })
      .finally(() => { if (!cancelado) setGerando(false); });
    return () => { cancelado = true; };
  }, [resumo, modo, fotoDataUrl]);

  const onEscolherFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setFotoDataUrl(reader.result as string); setModo("foto"); };
    reader.readAsDataURL(file);
  };

  const handleShare = async () => {
    if (!preview) return;
    setAcao("share");
    try { await compartilharImagem(preview, filename); }
    catch { toast.error("Não foi possível compartilhar."); }
    setAcao(null);
  };

  const handleDownload = async () => {
    if (!preview) return;
    setAcao("download");
    try { await baixarImagem(preview, filename); toast.success("Imagem salva."); }
    catch { toast.error("Não foi possível baixar."); }
    setAcao(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-background border-t sm:border border-muted-foreground/30 w-full sm:max-w-md sm:rounded-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-muted-foreground/20 sticky top-0 bg-background">
          <h3 className="font-heading text-base text-foreground uppercase tracking-wider">Compartilhar treino</h3>
          <button type="button" onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Seletor de modo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModo("template")}
              className={`flex items-center justify-center gap-2 py-3 text-xs font-heading uppercase tracking-wider border transition-colors ${
                modo === "template" ? "border-primary text-primary bg-primary/10" : "border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              <ImageIcon size={14} /> Só dados
            </button>
            <button
              type="button"
              onClick={() => (fotoDataUrl ? setModo("foto") : fileRef.current?.click())}
              className={`flex items-center justify-center gap-2 py-3 text-xs font-heading uppercase tracking-wider border transition-colors ${
                modo === "foto" ? "border-primary text-primary bg-primary/10" : "border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              <Camera size={14} /> Com foto
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onEscolherFoto} />
          {modo === "foto" && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full text-xs text-primary font-heading uppercase tracking-wider py-1"
            >
              {fotoDataUrl ? "Trocar foto de fundo" : "Escolher foto de fundo"}
            </button>
          )}

          {/* Preview */}
          <div className="rounded border border-muted-foreground/20 bg-secondary/20 min-h-[240px] flex items-center justify-center overflow-hidden">
            {gerando ? (
              <Loader2 className="animate-spin text-muted-foreground" size={28} />
            ) : preview ? (
              <img src={preview} alt="Prévia do treino" className="w-full h-auto" />
            ) : (
              <p className="text-muted-foreground text-xs font-body">Sem prévia</p>
            )}
          </div>

          {/* Ações */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!preview || gerando || acao !== null}
              onClick={handleShare}
              className="flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider disabled:opacity-40 transition-colors hover:bg-primary/90"
            >
              {acao === "share" ? <Loader2 className="animate-spin" size={16} /> : <Share2 size={16} />} Compartilhar
            </button>
            <button
              type="button"
              disabled={!preview || gerando || acao !== null}
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 py-3 border border-primary/50 text-primary font-heading text-sm uppercase tracking-wider disabled:opacity-40 transition-colors hover:bg-primary/10"
            >
              {acao === "download" ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} Baixar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompartilharTreinoModal;
