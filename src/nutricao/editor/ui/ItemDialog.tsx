// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/dieta/ItemDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import BuscaAlimento, { BadgeFonte } from "@/nutricao/editor/ui/BuscaAlimento";
import type { Alimento } from "@/nutricao/editor/lib/alimentos";
import { fmtQtd, resumoMacros, rotuloMedida } from "@/nutricao/editor/lib/alimentosUtil";
import { OBSERVACAO_ITEM_MAX, formItemNovo, formItemParaRegistro, itemParaForm, previaItem, temMedidas, type AlimentoDoItem, type FormItem } from "@/nutricao/editor/lib/dietaUtil";
import { atualizarItem, criarItem, type Item } from "@/nutricao/editor/lib/planos";

// Modal do item da refeição: escolher o alimento (busca na TACO + próprios) e a quantidade em GRAMAS ou por MEDIDA
// CASEIRA × quantidade (só quando o alimento tem medidas cadastradas), com kcal/macros da linha ao vivo e observação
// ("sem sal", "cozido no vapor"). Edição mantém o alimento e troca só a quantidade/observação.

const schema = z.object({
  modo: z.enum(["gramas", "medida"]),
  quantidade_g: z.string(),
  medida_caseira_id: z.string(),
  quantidade_medida: z.string(),
  observacao: z.string().max(OBSERVACAO_ITEM_MAX, "Observação muito longa"),
});
type Valores = z.infer<typeof schema>;
const montarForm = (v: Partial<Valores>): FormItem => ({
  modo: v.modo === "medida" ? "medida" : "gramas",
  quantidade_g: v.quantidade_g ?? "",
  medida_caseira_id: v.medida_caseira_id ?? "",
  quantidade_medida: v.quantidade_medida ?? "",
  observacao: v.observacao ?? "",
});

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  refeicao: { id: string; nome: string } | null;
  /** com item = edição (quantidade/observação); sem = novo */
  item?: Item | null;
  /** posição do item novo (fim da refeição) */
  ordem: number;
  /** Physiq W16: o alimento já escolhido na busca da refeição (tela 8) — o modal abre direto na quantidade */
  alimentoInicial?: Alimento | null;
  onSalvo: (refeicaoId: string, item: Item, modo: "criado" | "editado") => void;
}

function Previa({ rotulo, valor, marca, bruto }: { rotulo: string; valor: string; marca: string; bruto: number | null }) {
  return (
    <div {...{ [`data-previa-${marca}`]: bruto ?? "" }}>
      <p className="text-[10px] uppercase tracking-wider text-texto-2 font-body">{rotulo}</p>
      <p className="text-lg font-semibold text-texto leading-tight">{valor}</p>
    </div>
  );
}

export default function ItemDialog({ open, onOpenChange, refeicao, item, ordem, alimentoInicial, onSalvo }: Props) {
  const editando = !!item;
  const [alimento, setAlimento] = useState<AlimentoDoItem | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: formItemNovo(null),
  });

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    if (item) {
      setAlimento(item.alimento);
      reset(itemParaForm(item));
    } else if (alimentoInicial) {
      setAlimento(alimentoInicial);
      reset(formItemNovo(alimentoInicial));
    } else {
      setAlimento(null);
      reset(formItemNovo(null));
    }
  }, [open, item, alimentoInicial, reset]);

  const escolher = (a: Alimento) => {
    setAlimento(a);
    const f = formItemNovo(a);
    reset({ ...f, observacao: montarForm(watch()).observacao });
    setErroGeral(null);
  };
  const trocarAlimento = () => {
    setAlimento(null);
    reset(formItemNovo(null));
  };

  const form = montarForm(watch());
  const previa = previaItem(form, alimento);
  const medidas = alimento?.medidas_caseiras ?? [];
  const podeMedida = temMedidas(alimento);

  const onSubmit = async (v: Valores) => {
    if (!refeicao) return;
    if (!alimento) {
      setErroGeral("Escolha um alimento na busca");
      return;
    }
    const f = montarForm(v);
    const reg = formItemParaRegistro(f, alimento);
    if (!reg) {
      setErroGeral(f.modo === "medida" ? "Escolha a medida caseira e uma quantidade maior que zero" : "Informe a quantidade em gramas (maior que zero)");
      return;
    }
    setErroGeral(null);
    try {
      if (item) {
        onSalvo(refeicao.id, await atualizarItem(item.id, reg, item.alimento), "editado");
        toast.success("Alimento atualizado");
      } else {
        onSalvo(refeicao.id, await criarItem(refeicao.id, alimento.id, reg, ordem), "criado");
        toast.success(`${alimento.nome} adicionado em ${refeicao.nome}`);
      }
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar o alimento";
      setErroGeral(msg);
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-modal-item={editando ? "editar" : "novo"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editando ? "Editar alimento" : `Adicionar alimento${refeicao ? ` — ${refeicao.nome}` : ""}`}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            Quantidade em gramas ou por medida caseira (quando o alimento tem medidas cadastradas). As kcal e os macros da linha aparecem enquanto você digita.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {!alimento ? (
            <BuscaAlimento onEscolher={escolher} />
          ) : (
            <div className="border border-linha-2 p-3 flex flex-wrap items-start justify-between gap-2" data-alimento-escolhido={alimento.id}>
              <div className="min-w-0">
                <p className="text-sm text-texto font-body flex flex-wrap items-center gap-2">
                  <span data-alimento-escolhido-nome>{alimento.nome}</span>
                  <BadgeFonte fonte={alimento.fonte} />
                </p>
                <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body">{resumoMacros(alimento)} / 100 g</p>
              </div>
              {!editando && (
                <button type="button" className={BTN_SEC} onClick={trocarAlimento} data-btn-trocar-alimento>Trocar alimento</button>
              )}
            </div>
          )}

          {alimento && (
            <>
              <fieldset className="space-y-2" data-campo-modo={form.modo}>
                <legend className="text-[11px] uppercase tracking-wider text-texto-2 font-body">Como informar a quantidade</legend>
                <div className="flex flex-wrap gap-4 text-sm font-body">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" value="gramas" {...register("modo")} data-modo-gramas /> Em gramas
                  </label>
                  <label className={`inline-flex items-center gap-2 ${podeMedida ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`} title={podeMedida ? undefined : "Este alimento não tem medidas caseiras cadastradas"}>
                    <input type="radio" value="medida" disabled={!podeMedida} {...register("modo")} data-modo-medida /> Por medida caseira
                  </label>
                </div>
              </fieldset>

              {form.modo === "gramas" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Campo rotulo="Quantidade (g)">
                    <input inputMode="decimal" placeholder="ex.: 100" className={INPUT} {...register("quantidade_g")} data-campo-quantidade-g />
                  </Campo>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3 items-end">
                  <Campo rotulo="Medida caseira">
                    <select className={SELECT} {...register("medida_caseira_id")} data-campo-medida>
                      {medidas.map((m) => (
                        <option key={m.id} value={m.id}>{rotuloMedida(m)}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo rotulo="Quantidade">
                    <input inputMode="decimal" placeholder="ex.: 2" className={INPUT} {...register("quantidade_medida")} data-campo-quantidade-medida />
                  </Campo>
                  <div className="text-sm font-body text-texto-2 pb-2">
                    <span className="text-[10px] text-texto-3 font-body block">= gramas</span>
                    <span data-previa-gramas-medida={previa.gramas ?? ""}>{previa.gramas === null ? "—" : `${fmtQtd(previa.gramas)} g`}</span>
                  </div>
                </div>
              )}

              <div className="border border-linha-2 p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center" data-previa-item data-previa-gramas={previa.gramas ?? ""}>
                <Previa rotulo="Gramas" valor={previa.gramas === null ? "—" : fmtQtd(previa.gramas)} marca="g" bruto={previa.gramas} />
                <Previa rotulo="kcal" valor={fmtQtd(previa.macros.energia_kcal)} marca="kcal" bruto={previa.macros.energia_kcal} />
                <Previa rotulo="Proteína (g)" valor={fmtQtd(previa.macros.proteina_g)} marca="p" bruto={previa.macros.proteina_g} />
                <Previa rotulo="Carboidrato (g)" valor={fmtQtd(previa.macros.carboidrato_g)} marca="c" bruto={previa.macros.carboidrato_g} />
                <Previa rotulo="Lipídios (g)" valor={fmtQtd(previa.macros.lipidio_g)} marca="l" bruto={previa.macros.lipidio_g} />
              </div>

              <Campo rotulo="Observação" erro={errors.observacao?.message}>
                <textarea className={TEXTAREA} rows={2} maxLength={OBSERVACAO_ITEM_MAX} placeholder="ex.: sem sal · cozido no vapor" {...register("observacao")} data-campo-observacao-item />
              </Campo>
            </>
          )}

          {erroGeral && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-item>{erroGeral}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-item>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting || !alimento} onClick={() => setValue("modo", podeMedida ? form.modo : "gramas")} data-btn-salvar-item>
              {isSubmitting ? "Salvando..." : editando ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
