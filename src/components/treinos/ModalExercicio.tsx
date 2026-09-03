import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Exercicio {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  imagem_url?: string | null;
  subgrupo?: string | null;
  dica?: string | null;
}

interface Props {
  exercicio: Exercicio | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ModalExercicio = ({ exercicio, open, onOpenChange }: Props) => {
  const [imgErro, setImgErro] = useState(false);
  const [imgCarregada, setImgCarregada] = useState(false);
  const imagemUrl = exercicio?.imagem_url ?? null;

  // trocou o exercício → recomeça o estado da imagem (erro de um não esconde a do próximo)
  useEffect(() => {
    setImgErro(false);
    setImgCarregada(false);
  }, [imagemUrl]);

  if (!exercicio) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-muted-foreground/30 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground text-xl flex items-center gap-2">
            <span className="text-3xl">{exercicio.emoji}</span>
            {exercicio.nome}
          </DialogTitle>
        </DialogHeader>

        {imagemUrl && !imgErro && (
          // Área reservada (GIFs do catálogo são 600×400 = 3:2) → sem salto de layout
          // enquanto baixa; skeleton pulsando até a imagem chegar.
          <div
            className="relative w-full aspect-[3/2] max-h-72 overflow-hidden rounded-lg border border-muted-foreground/20 bg-card"
            data-testid="exercicio-imagem"
          >
            {!imgCarregada && <div className="absolute inset-0 animate-pulse bg-muted/60" aria-hidden="true" />}
            <img
              src={imagemUrl}
              alt={exercicio.nome}
              decoding="async"
              crossOrigin="anonymous"
              onLoad={() => setImgCarregada(true)}
              onError={() => setImgErro(true)}
              className={`h-full w-full object-contain transition-opacity duration-200 ${imgCarregada ? "opacity-100" : "opacity-0"}`}
            />
          </div>
        )}

        <div className="space-y-4 pt-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-heading mb-1">Grupo muscular</p>
            <p className="text-foreground font-body">{exercicio.grupo_muscular}</p>
          </div>

          {exercicio.subgrupo && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-heading mb-1">Subgrupo</p>
              <p className="text-foreground font-body">{exercicio.subgrupo}</p>
            </div>
          )}

          {exercicio.dica && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-heading mb-1">Dica</p>
              <p className="text-foreground font-body whitespace-pre-line">{exercicio.dica}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModalExercicio;
