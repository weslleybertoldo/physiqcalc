// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/dieta/PlanoDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import type { CalculoEnergetico } from "@/nutricao/editor/lib/calculosEnergeticos";
import { OBSERVACAO_MAX, TITULO_MAX, fmtKcal, formPlanoNovo, formPlanoParaRegistro, numero, planoParaForm, type FormPlano } from "@/nutricao/editor/lib/dietaUtil";
import { rotuloFormula } from "@/nutricao/editor/lib/energeticoUtil";
import { atualizarPlano, criarPlano, type Plano, type PlanoRow } from "@/nutricao/editor/lib/planos";

// Modal do plano alimentar ("nova prescrição alimentar" na referência): título (padrão "Plano alimentar dd/MM/yyyy"),
// meta calórica PRÉ-PREENCHIDA pelo VET do último cálculo energético (W7; a origem fica escrita na tela — sem cálculo
// o campo nasce vazio) e observações. Edição carrega o plano gravado. O plano novo nasce com as 6 refeições padrão.

const schema = z.object({
  titulo: z.string().refine((v) => v.trim().length >= 2, "Dê um título ao plano").refine((v) => v.trim().length <= TITULO_MAX, "Título muito longo"),
  kcal_alvo: z.string().refine((v) => {
    if (!v || !v.trim()) return true;
    const n = numero(v);
    return n !== null && n > 0 && n < 100000;
  }, "Meta em kcal/dia (ex.: 2000)"),
  observacao: z.string().max(OBSERVACAO_MAX, "Observação muito longa"),
});
type Valores = z.infer<typeof schema>;

// montado campo a campo: o tsconfig do repo não tem strictNullChecks e o zod infere tudo como opcional
const montarForm = (v: Partial<Valores>): FormPlano => ({ titulo: v.titulo ?? "", kcal_alvo: v.kcal_alvo ?? "", observacao: v.observacao ?? "" });

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  /** último cálculo energético do paciente (pré-preenche a meta com o VET) */
  ultimoCalculo: CalculoEnergetico | null;
  /** com plano = edição dos dados; sem = novo */
  plano?: PlanoRow | null;
  onCriado?: (p: Plano) => void;
  onEditado?: (p: PlanoRow) => void;
  /**
   * hml-17 (H-39): a leitura dos cálculos energéticos falhou (sem dado) — o texto da origem diz que não deu para ler o último
   * cálculo (com "Tentar de novo"), nunca "Sem cálculo energético registrado". A meta continua em branco, como sem cálculo.
   */
  calculoFalhou?: { aoTentar: () => void } | null;
}

export default function PlanoDialog({ open, onOpenChange, pacienteId, ultimoCalculo, plano, onCriado, onEditado, calculoFalhou = null }: Props) {
  const { user } = useAuth();
  const editando = !!plano;
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const vet = ultimoCalculo?.vet ?? null;
  const inicial = useMemo(() => formPlanoNovo(vet), [vet]);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: inicial,
  });

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    reset(plano ? planoParaForm(plano) : formPlanoNovo(vet));
  }, [open, plano, vet, reset]);

  const form = montarForm(watch());
  const kcal = numero(form.kcal_alvo);

  const onSubmit = async (v: Valores) => {
    setErroGeral(null);
    const reg = formPlanoParaRegistro(montarForm(v));
    try {
      if (plano) {
        const salvo = await atualizarPlano(plano.id, reg);
        onEditado?.(salvo);
        toast.success("Plano atualizado");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        const novo = await criarPlano(user.id, pacienteId, reg, ultimoCalculo?.id ?? null);
        onCriado?.(novo);
        toast.success("Plano criado com as refeições padrão");
      }
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar o plano";
      setErroGeral(msg);
      toast.error(msg);
    }
  };

  const falhouCalculo = !editando && !ultimoCalculo && !!calculoFalhou;
  const origem = editando ? "plano" : ultimoCalculo ? "vet" : falhouCalculo ? "erro" : "sem";
  const textoOrigem = editando
    ? "Dados gravados neste plano — altere o que precisar."
    : ultimoCalculo
      ? `Meta pré-preenchida pelo VET do cálculo energético de ${format(new Date(ultimoCalculo.data), "dd/MM/yyyy")} (${rotuloFormula(ultimoCalculo.formula)}: ${fmtKcal(ultimoCalculo.vet)} kcal) — altere se quiser.`
      : falhouCalculo
        ? "Não deu para ler o último cálculo energético — informe a meta calórica, deixe em branco ou tente de novo."
        : "Sem cálculo energético registrado — informe a meta calórica ou deixe em branco.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-lg" data-modal-plano={editando ? "editar" : "novo"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editando ? "Editar dados do plano" : "Nova prescrição alimentar"}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            Método <span className="text-texto">Alimentos</span>: refeições com alimentos e quantidades, kcal e macros calculados a partir da tabela nutricional.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Campo rotulo="Título" erro={errors.titulo?.message}>
            <input className={INPUT} maxLength={TITULO_MAX} placeholder="ex.: Plano alimentar 19/09/2026" {...register("titulo")} data-campo-titulo-plano />
          </Campo>
          <Campo rotulo="Meta calórica (kcal/dia)" erro={errors.kcal_alvo?.message} dica={kcal !== null && kcal > 0 ? `${fmtKcal(kcal)} kcal por dia` : "opcional"}>
            <input inputMode="numeric" placeholder="ex.: 2000" className={INPUT} {...register("kcal_alvo")} data-campo-kcal-alvo />
          </Campo>
          <p className={falhouCalculo ? "text-[11px] text-rosa-3 font-body" : "text-[11px] text-texto-3 font-body"} data-origem-alvo={origem}>
            {textoOrigem}
          </p>
          {falhouCalculo && calculoFalhou && (
            <button type="button" className={`${BTN_SEC} inline-flex items-center gap-1.5`} onClick={calculoFalhou.aoTentar} data-calculo-erro>
              <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Tentar de novo
            </button>
          )}
          <Campo rotulo="Observações" erro={errors.observacao?.message}>
            <textarea className={TEXTAREA} rows={3} maxLength={OBSERVACAO_MAX} placeholder="orientações gerais do plano (aparecem no PDF)" {...register("observacao")} data-campo-observacao-plano />
          </Campo>

          {erroGeral && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-plano>{erroGeral}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-plano>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-plano>
              {isSubmitting ? "Salvando..." : editando ? "Salvar" : "Criar plano"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
