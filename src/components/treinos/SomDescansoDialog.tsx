import { useEffect, useState } from "react";
import { Check, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SOM_OPCOES, VIBRACAO_FIM_DESCANSO, deveVibrar, gravarSomDescanso, lerSomDescanso, nomeDoSom, temSom, tocarSom,
  type SomDescanso,
} from "@/lib/somDescanso";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Popup Configurações › Som — o aluno escolhe o que toca quando o tempo de descanso acaba.
 * A escolha fica no aparelho (localStorage); "Ouvir" toca uma prévia na hora.
 */
const SomDescansoDialog = ({ open, onOpenChange }: Props) => {
  const [escolhido, setEscolhido] = useState<SomDescanso>(() => lerSomDescanso());

  // Reabriu o popup → relê (outra tela pode ter mudado)
  useEffect(() => {
    if (open) setEscolhido(lerSomDescanso());
  }, [open]);

  const escolher = (som: SomDescanso) => {
    setEscolhido(som);
    gravarSomDescanso(som);
    toast.success(`Som do descanso: ${nomeDoSom(som)}`);
  };

  const ouvir = async (som: SomDescanso) => {
    try {
      if (deveVibrar(som) && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(VIBRACAO_FIM_DESCANSO);
      }
      if (!temSom(som)) return;
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      tocarSom(ctx, som);
    } catch {
      // sem áudio disponível neste aparelho/navegador
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-muted-foreground/30 max-w-sm" data-som-dialog>
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground flex items-center gap-2">
            <Volume2 size={16} /> Som do descanso
          </DialogTitle>
          <DialogDescription className="font-body text-xs text-muted-foreground">
            Toca quando o tempo de descanso acaba. Vale neste aparelho.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2" data-som-lista>
          {SOM_OPCOES.map((op) => {
            const ativo = op.valor === escolhido;
            return (
              <li key={op.valor} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => escolher(op.valor)}
                  aria-pressed={ativo}
                  data-som-opcao={op.valor}
                  className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                    ativo ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/60"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      ativo ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"
                    }`}
                    aria-hidden="true"
                  >
                    {ativo && <Check size={12} />}
                  </span>
                  <span>
                    <span className="block font-heading text-xs uppercase tracking-wider text-foreground">{op.nome}</span>
                    <span className="block font-body text-[11px] text-muted-foreground">{op.descricao}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void ouvir(op.valor)}
                  data-som-ouvir={op.valor}
                  title={`Ouvir ${op.nome}`}
                  className="shrink-0 flex items-center gap-1 px-3 py-2 text-[11px] font-heading uppercase tracking-wider text-muted-foreground hover:text-primary border border-border rounded-lg transition-colors"
                >
                  <Volume2 size={12} /> Ouvir
                </button>
              </li>
            );
          })}
        </ul>

        <p className="font-body text-[10px] text-muted-foreground/70">
          No app Android com a tela fechada, o aviso do fim do descanso usa o som padrão do sistema.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default SomDescansoDialog;
