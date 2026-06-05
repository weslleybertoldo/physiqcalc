import { useState } from "react";
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

        {exercicio.imagem_url && !imgErro && (
          <img
            src={exercicio.imagem_url}
            alt={exercicio.nome}
            onError={() => setImgErro(true)}
            className="w-full rounded-lg border border-muted-foreground/20 object-contain max-h-72 bg-card"
          />
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
