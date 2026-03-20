import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Exercicio {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
}

interface Props {
  exercicio: Exercicio | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ModalExercicio = ({ exercicio, open, onOpenChange }: Props) => {
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
        <div className="py-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-heading mb-1">Grupo muscular</p>
          <p className="text-foreground font-body">{exercicio.grupo_muscular}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModalExercicio;
