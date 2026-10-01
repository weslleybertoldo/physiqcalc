// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/dieta/RefeicaoDialog.tsx) + os dias da semana (NF3).
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, TEXTAREA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import DiasSemanaToggle from "@/nutricao/editor/ui/DiasSemanaToggle";
import { NOME_REFEICAO_MAX, OBSERVACAO_ITEM_MAX, formRefeicaoNova, formRefeicaoParaRegistro, horarioValido, refeicaoParaForm, type FormRefeicao } from "@/nutricao/editor/lib/dietaUtil";
import { atualizarRefeicao, criarRefeicao, type Refeicao, type RefeicaoRow } from "@/nutricao/editor/lib/planos";
import { normalizarDias } from "@/nutricao/editor/lib/semanaPlano";
import { TODOS_OS_DIAS } from "@/nutricao/app/metasUtil";

// Modal da refeição: nome (Café da manhã, Pré-treino…), horário opcional, os dias da semana em que ela vale (NF3 — todos os
// dias é o padrão, como sempre foi) e observação (aparece no PDF abaixo dos alimentos). Edição carrega a refeição gravada.

const schema = z.object({
  nome: z.string().refine((v) => v.trim().length >= 2, "Dê um nome à refeição").refine((v) => v.trim().length <= NOME_REFEICAO_MAX, "Nome muito longo"),
  horario: z.string().refine((v) => horarioValido(v.trim()), "Horário inválido"),
  observacao: z.string().max(OBSERVACAO_ITEM_MAX, "Observação muito longa"),
});
type Valores = z.infer<typeof schema>;
const montarForm = (v: Partial<Valores>, dias: number[]): FormRefeicao => ({ nome: v.nome ?? "", horario: v.horario ?? "", observacao: v.observacao ?? "", dias });

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  planoId: string;
  /** com refeição = edição; sem = nova */
  refeicao?: RefeicaoRow | null;
  /** posição da refeição nova (fim da lista) */
  ordem: number;
  /** dias da refeição nova (vazio = todos os dias) */
  diasNovos?: number[];
  onSalvo: (r: Refeicao | RefeicaoRow, modo: "criada" | "editada") => void;
}

const paraTela = (dias: unknown): number[] => {
  const d = normalizarDias(dias);
  return d.length ? d : [...TODOS_OS_DIAS];
};

export default function RefeicaoDialog({ open, onOpenChange, planoId, refeicao, ordem, diasNovos, onSalvo }: Props) {
  const editando = !!refeicao;
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [dias, setDias] = useState<number[]>([...TODOS_OS_DIAS]);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: formRefeicaoNova(),
  });

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    const f = refeicao ? refeicaoParaForm(refeicao) : formRefeicaoNova();
    reset({ nome: f.nome, horario: f.horario, observacao: f.observacao });
    setDias(paraTela(refeicao ? refeicao.dias_semana : diasNovos));
  }, [open, refeicao, diasNovos, reset]);

  const onSubmit = async (v: Valores) => {
    setErroGeral(null);
    if (!dias.length) {
      setErroGeral("Marque pelo menos um dia da semana");
      return;
    }
    const reg = formRefeicaoParaRegistro(montarForm(v, dias));
    try {
      if (refeicao) {
        onSalvo(await atualizarRefeicao(refeicao.id, reg), "editada");
        toast.success("Refeição atualizada");
      } else {
        onSalvo(await criarRefeicao(planoId, reg, ordem), "criada");
        toast.success("Refeição adicionada");
      }
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar a refeição";
      setErroGeral(msg);
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${JANELA} sm:max-w-md`} data-modal-refeicao={editando ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editando ? "Editar refeição" : "Nova refeição"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>O horário é só uma orientação pro aluno; a observação aparece no PDF abaixo dos alimentos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <Campo rotulo="Nome" erro={errors.nome?.message}>
              <input className={INPUT} maxLength={NOME_REFEICAO_MAX} placeholder="ex.: Pré-treino" {...register("nome")} data-campo-nome-refeicao />
            </Campo>
            <Campo rotulo="Horário" erro={errors.horario?.message}>
              <input type="time" className={INPUT} {...register("horario")} data-campo-horario-refeicao />
            </Campo>
          </div>
          <div>
            <p className="mb-1.5 font-body text-[12px] font-semibold text-texto-2">Dias da semana</p>
            <DiasSemanaToggle dias={dias} onChange={setDias} attrDia="data-dia-refeicao" attrAtalho="data-atalho-dias-refeicao" attrTexto="data-texto-dias-refeicao" />
            <p className="mt-1.5 font-body text-[11.5px] text-texto-3">O app do aluno mostra a refeição só nos dias marcados.</p>
          </div>
          <Campo rotulo="Observação" erro={errors.observacao?.message}>
            <textarea className={TEXTAREA} rows={2} maxLength={OBSERVACAO_ITEM_MAX} placeholder="ex.: beber 300 ml de água antes" {...register("observacao")} data-campo-observacao-refeicao />
          </Campo>
          {erroGeral && <p role="alert" className="font-body text-xs text-rosa-3" data-erro-refeicao>{erroGeral}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-refeicao>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-refeicao>{isSubmitting ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
