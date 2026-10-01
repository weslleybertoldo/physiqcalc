// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/manipulados/FormulaDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Beaker, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import AtivosEditor from "@/nutricao/editor/ui/AtivosEditor";
import { atualizarFormula, criarFormula, salvarComoModelo, type Formula, type ModeloFormula } from "@/nutricao/editor/lib/manipulados";
import {
  OBSERVACAO_FORMULA_MAX, POSOLOGIA_MAX, QUANTIDADE_MAX, TITULO_FORMULA_MAX, ativoVazio, formInicialFormula, formParaRegistroFormula, formulaParaForm, modeloInicial,
  ordenarModelosFormula, validarFormula, type FormFormula,
} from "@/nutricao/editor/lib/manipuladosUtil";

// Modal da fórmula manipulada do paciente. NOVA: modelo (favoritos primeiro, opção "Em branco" — escolher preenche título, ativos,
// posologia, quantidade e observação), título, ativos em linhas dinâmicas (editor compartilhado), posologia, quantidade, observação
// e "salvar também como modelo" (padrão W10/W16). EDIÇÃO: os mesmos campos, sem modelo (a fórmula guarda a própria cópia —
// mudar o modelo depois não mexe nela) e sem "salvar como modelo". A data da prescrição não muda na edição (duplicar cria outra com hoje).
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  modelos: ModeloFormula[];
  /** fórmula existente = modo edição */
  formula?: Formula | null;
  onSalvo: (f: Formula, modo: "criada" | "editada") => void;
  /** chamado quando "salvar também como modelo" criou um modelo */
  onModeloCriado?: () => Promise<void> | void;
}

// montado campo a campo: o tsconfig do repo não tem strictNullChecks e o RHF pode devolver campos indefinidos
const montarForm = (v: Partial<FormFormula>): FormFormula => ({
  modeloId: v.modeloId ?? "",
  titulo: v.titulo ?? "",
  ativos: Array.isArray(v.ativos) && v.ativos.length ? v.ativos : [ativoVazio()],
  posologia: v.posologia ?? "",
  quantidade: v.quantidade ?? "",
  observacao: v.observacao ?? "",
  salvarComoModelo: !!v.salvarComoModelo,
});

export default function FormulaDialog({ open, onOpenChange, pacienteId, modelos, formula, onSalvo, onModeloCriado }: Props) {
  const { user } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const abriuRef = useRef(false);
  const edicao = !!formula;
  const ordenados = useMemo(() => ordenarModelosFormula(modelos), [modelos]);

  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<FormFormula>({ defaultValues: formInicialFormula(null) });
  const v = montarForm(watch());
  const ativosChave = JSON.stringify(v.ativos);

  // reinicia SÓ ao abrir (a lista de modelos pode mudar com o modal aberto sem apagar o que ela digitou)
  useEffect(() => {
    if (open && !abriuRef.current) {
      setErro(null);
      if (formula) reset(formulaParaForm(formula));
      else reset(formInicialFormula(modeloInicial(ordenados)));
    }
    abriuRef.current = open;
  }, [open, formula, ordenados, reset]);

  useEffect(() => {
    if (erro && validarFormula(v.titulo, v.ativos, v.posologia, v.quantidade, v.observacao) === null) setErro(null); // o aviso some assim que ela resolve
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erro, v.titulo, ativosChave, v.posologia, v.quantidade, v.observacao]);

  /** Escolher um modelo preenche tudo; "Em branco" limpa (1 linha de ativo vazia). */
  const aplicarModelo = (id: string) => {
    const m = ordenados.find((x) => x.id === id) ?? null;
    const f = formInicialFormula(m);
    setValue("modeloId", id);
    setValue("titulo", f.titulo, { shouldDirty: true });
    setValue("ativos", f.ativos, { shouldDirty: true });
    setValue("posologia", f.posologia, { shouldDirty: true });
    setValue("quantidade", f.quantidade, { shouldDirty: true });
    setValue("observacao", f.observacao, { shouldDirty: true });
  };
  const modeloReg = register("modeloId");

  const onSubmit = async (valores: FormFormula) => {
    const f = montarForm(valores);
    const msg = validarFormula(f.titulo, f.ativos, f.posologia, f.quantidade, f.observacao);
    if (msg) return setErro(msg);
    setErro(null);
    const reg = formParaRegistroFormula(f);
    try {
      if (!user) throw new Error("Sessão expirada — entre de novo");
      if (formula) {
        onSalvo(await atualizarFormula(formula.id, reg), "editada");
        toast.success("Fórmula atualizada");
      } else {
        onSalvo(await criarFormula(user.id, pacienteId, reg), "criada");
        toast.success(`Fórmula "${reg.titulo}" prescrita`);
        if (f.salvarComoModelo) {
          try {
            await salvarComoModelo(user.id, reg);
            await onModeloCriado?.();
            toast.success("Modelo salvo");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "A fórmula foi salva, mas o modelo não");
          }
        }
      }
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível salvar a fórmula";
      setErro(m);
      toast.error(m);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-2xl max-h-[92vh] overflow-y-auto" data-modal-formula={edicao ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto flex items-center gap-2">
            <Beaker className="h-4 w-4 text-verde-3" aria-hidden="true" /> {edicao ? "Editar fórmula" : "Nova fórmula"}
          </DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {edicao
              ? "Ajuste o título, os ativos, a posologia, a quantidade e as observações. A data da prescrição não muda — pra prescrever de novo com a data de hoje, use \"Duplicar\"."
              : "Comece por um modelo (ou em branco), informe os ativos com dose e unidade, a posologia e a quantidade. A fórmula guarda a própria cópia — mudar o modelo depois não mexe nela."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-formula>
          {!edicao && (
            <Campo rotulo="Modelo">
              <select
                className={SELECT}
                {...modeloReg}
                onChange={(e) => {
                  void modeloReg.onChange(e);
                  aplicarModelo(e.target.value);
                }}
                data-campo-modelo-formula
              >
                <option value="">Em branco</option>
                {ordenados.map((m) => (
                  <option key={m.id} value={m.id}>{m.favorito ? "★ " : ""}{m.titulo}</option>
                ))}
              </select>
            </Campo>
          )}

          <Campo rotulo="Título da fórmula *">
            <input className={INPUT} maxLength={TITULO_FORMULA_MAX} placeholder="ex.: Magnésio + vitamina B6" {...register("titulo")} data-campo-titulo-formula />
          </Campo>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1.5">Ativos *</p>
            <AtivosEditor
              ativos={v.ativos}
              onChange={(ativos) => setValue("ativos", ativos, { shouldDirty: true })}
              attrLinha="data-linha-ativo"
              attrNome="data-campo-ativo-nome"
              attrDose="data-campo-ativo-dose"
              attrUnidade="data-campo-ativo-unidade"
              attrRemover="data-btn-remover-ativo"
              attrAdicionar="data-btn-adicionar-ativo"
            />
          </div>

          <Campo rotulo="Posologia">
            <textarea className={TEXTAREA} maxLength={POSOLOGIA_MAX} rows={3} placeholder="ex.: Tomar 1 cápsula à noite" {...register("posologia")} data-campo-posologia />
          </Campo>

          <Campo rotulo="Quantidade">
            <input className={INPUT} maxLength={QUANTIDADE_MAX} placeholder="ex.: 30 cápsulas" {...register("quantidade")} data-campo-quantidade />
          </Campo>

          <Campo rotulo="Observações (opcional)">
            <textarea className={TEXTAREA} maxLength={OBSERVACAO_FORMULA_MAX} rows={2} placeholder="ex.: sem lactose, cápsula vegetal" {...register("observacao")} data-campo-observacao-formula />
          </Campo>

          {!edicao && (
            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("salvarComoModelo")} data-campo-salvar-modelo-formula /> Salvar também como modelo
            </label>
          )}

          {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-formula>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-formula>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-formula>
              <Save size={12} aria-hidden="true" /> {isSubmitting ? "Salvando..." : edicao ? "Salvar" : "Prescrever fórmula"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
