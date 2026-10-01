// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/consultas/ConsultaDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { dataValida, horaValida } from "@/nutricao/editor/lib/agendaUtil";
import { atualizarConsulta, registrarConsulta, type Consulta } from "@/nutricao/prontuario/lib/consultas";
import { OBSERVACAO_MAX, formVazio, registroParaForm, type FormConsulta } from "@/nutricao/prontuario/lib/consultasUtil";

// Modal "registrar consulta" / "editar consulta" (referência: novo registro de consulta = data + observação).
// Data e hora começam em "agora"; a observação é livre.
const schema = z.object({
  data: z.string().refine(dataValida, "Data inválida"),
  hora: z.string().refine(horaValida, "Hora inválida"),
  observacao: z.string().max(OBSERVACAO_MAX, `Observação muito longa (máx. ${OBSERVACAO_MAX} caracteres)`),
});
type Valores = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  /** com consulta = edição; sem = novo registro */
  consulta?: Consulta | null;
  onSalvo: (c: Consulta, modo: "criada" | "editada") => void;
}

export default function ConsultaDialog({ open, onOpenChange, pacienteId, consulta, onSalvo }: Props) {
  const { user } = useAuth();
  const editando = !!consulta;

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: formVazio(),
  });

  useEffect(() => {
    if (open) reset(consulta ? registroParaForm(consulta) : formVazio());
  }, [open, consulta, reset]);

  const onSubmit = async (valores: Valores) => {
    // montado campo a campo: o tsconfig do repo não tem strictNullChecks e o zod infere tudo como opcional
    const f: FormConsulta = { data: valores.data ?? "", hora: valores.hora ?? "", observacao: valores.observacao ?? "" };
    try {
      if (consulta) {
        onSalvo(await atualizarConsulta(consulta.id, f), "editada");
        toast.success("Consulta atualizada");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        onSalvo(await registrarConsulta(user.id, pacienteId, f), "criada");
        toast.success("Consulta registrada");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a consulta");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-md" data-modal-consulta={editando ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editando ? "Editar consulta" : "Registrar consulta"}</DialogTitle>
          <DialogDescription className="font-body text-xs">Data e hora do atendimento e, se quiser, uma observação sobre a consulta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data" erro={errors.data?.message}>
              <input type="date" className={INPUT} {...register("data")} data-campo-data-consulta />
            </Campo>
            <Campo rotulo="Hora" erro={errors.hora?.message}>
              <input type="time" className={INPUT} {...register("hora")} data-campo-hora-consulta />
            </Campo>
          </div>
          <Campo rotulo="Observação" erro={errors.observacao?.message} dica="Como foi a consulta, combinados e próximos passos.">
            <textarea className={TEXTAREA} rows={5} maxLength={OBSERVACAO_MAX} {...register("observacao")} data-campo-observacao-consulta />
          </Campo>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-consulta>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-consulta>
              {isSubmitting ? "Salvando..." : editando ? "Salvar" : "Registrar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
