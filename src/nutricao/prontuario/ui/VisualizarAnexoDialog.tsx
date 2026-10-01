// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/anexos/VisualizarAnexoDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import { urlAssinada, type Anexo } from "@/nutricao/prontuario/lib/anexos";
import { ehImagem, formatarDataHoraAnexo, formatarTamanho, rotuloTipo, tipoPorMime } from "@/nutricao/editor/lib/anexosUtil";

// Modal "Ver": imagem no <img> e PDF no <iframe>, os dois por URL assinada de curta duração (gerada ao abrir).
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  anexo: Anexo | null;
  onBaixar: (a: Anexo) => void;
}

export default function VisualizarAnexoDialog({ open, onOpenChange, anexo, onBaixar }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    setUrl(null);
    setErro(null);
    setCarregou(false);
    if (!open || !anexo) return;
    let ativo = true;
    urlAssinada(anexo, 120, false)
      .then((u) => {
        if (ativo) setUrl(u);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível abrir o arquivo");
      });
    return () => {
      ativo = false;
    };
  }, [open, anexo]);

  const imagem = anexo ? ehImagem(anexo.mime) : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-tela border-linha-2 sm:max-w-4xl max-h-[92vh] overflow-y-auto"
        data-modal-visualizar-anexo={anexo ? tipoPorMime(anexo.mime) : ""}
        data-carregou={carregou ? "1" : "0"}
      >
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto break-all">{anexo?.nome ?? ""}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {anexo ? `${rotuloTipo(anexo.mime)} · ${formatarTamanho(anexo.tamanho)} · ${formatarDataHoraAnexo(anexo.created_at)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {erro && <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-visualizar-anexo>{erro}</p>}
        {!erro && !url && <p className="text-sm text-texto-2 font-body" data-abrindo-anexo>Abrindo...</p>}
        {url && imagem && (
          <img
            src={url}
            alt={anexo?.nome ?? ""}
            className="max-h-[70vh] w-auto mx-auto object-contain bg-black/20"
            onLoad={() => setCarregou(true)}
            onError={() => setErro("A imagem não carregou")}
            data-img-anexo
          />
        )}
        {url && !imagem && (
          <iframe src={url} title={anexo?.nome ?? "arquivo"} className="w-full h-[70vh] bg-white" onLoad={() => setCarregou(true)} data-iframe-anexo />
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-visualizar>Fechar</button>
          {anexo && (
            <button type="button" className={BTN_PRI} onClick={() => onBaixar(anexo)} data-btn-baixar-visualizar>
              <Download size={12} aria-hidden="true" /> Baixar
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
