// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/metas/MetaDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Save, Target } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import DiasSemanaToggle from "@/nutricao/editor/ui/DiasSemanaToggle";
import { atualizarMeta, criarMeta, salvarComoModelo, type Meta, type ModeloMeta } from "@/nutricao/editor/lib/metas";
import {
  DESCRICAO_META_MAX, TITULO_META_MAX, formInicialMeta, formParaRegistroMeta, metaParaForm, modeloInicial, ordenarModelosMeta, validarMeta, type FormMeta,
} from "@/nutricao/editor/lib/metasUtil";

// Modal da meta do paciente (referência: "nova meta" com os dias da semana Seg–Dom). NOVA: modelo (favoritos primeiro, opção
// "Em branco" — escolher um modelo preenche título, descrição e dias), título, descrição ("como"), 7 botões dos dias +
// atalhos, "salvar também como modelo" (padrão W10). EDIÇÃO: título, descrição, dias e "ativa" (pausar/retomar também dá
// pela lista). A meta guarda a própria cópia — mudar o modelo depois não mexe nela.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  modelos: ModeloMeta[];
  /** meta existente = modo edição */
  meta?: Meta | null;
  onSalvo: (m: Meta, modo: "criada" | "editada") => void;
  /** chamado quando "salvar também como modelo" criou um modelo */
  onModeloCriado?: () => Promise<void> | void;
}

// montado campo a campo: o tsconfig do repo não tem strictNullChecks e o RHF pode devolver campos indefinidos
const montarForm = (v: Partial<FormMeta>): FormMeta => ({
  modeloId: v.modeloId ?? "",
  titulo: v.titulo ?? "",
  descricao: v.descricao ?? "",
  dias: Array.isArray(v.dias) ? v.dias : [],
  ativa: v.ativa ?? true,
  salvarComoModelo: !!v.salvarComoModelo,
});

export default function MetaDialog({ open, onOpenChange, pacienteId, modelos, meta, onSalvo, onModeloCriado }: Props) {
  const { user } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const abriuRef = useRef(false);
  const edicao = !!meta;
  const ordenados = useMemo(() => ordenarModelosMeta(modelos), [modelos]);

  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<FormMeta>({ defaultValues: formInicialMeta(null) });
  const v = montarForm(watch());

  // reinicia SÓ ao abrir (a lista de modelos pode mudar com o modal aberto sem apagar o que ela digitou)
  useEffect(() => {
    if (open && !abriuRef.current) {
      setErro(null);
      if (meta) reset(metaParaForm(meta));
      else reset(formInicialMeta(modeloInicial(ordenados)));
    }
    abriuRef.current = open;
  }, [open, meta, ordenados, reset]);

  useEffect(() => {
    if (erro && validarMeta(v.titulo, v.descricao, v.dias) === null) setErro(null); // o aviso some assim que ela resolve
  }, [erro, v.titulo, v.descricao, v.dias]);

  /** Escolher um modelo preenche título/descrição/dias; "Em branco" limpa (todos os dias). */
  const aplicarModelo = (id: string) => {
    const m = ordenados.find((x) => x.id === id) ?? null;
    const f = formInicialMeta(m);
    setValue("modeloId", id);
    setValue("titulo", f.titulo, { shouldDirty: true });
    setValue("descricao", f.descricao, { shouldDirty: true });
    setValue("dias", f.dias, { shouldDirty: true });
  };
  const modeloReg = register("modeloId");

  const onSubmit = async (valores: FormMeta) => {
    const f = montarForm(valores);
    const msg = validarMeta(f.titulo, f.descricao, f.dias);
    if (msg) return setErro(msg);
    setErro(null);
    const reg = formParaRegistroMeta(f);
    try {
      if (!user) throw new Error("Sessão expirada — entre de novo");
      if (meta) {
        onSalvo(await atualizarMeta(meta.id, reg), "editada");
        toast.success("Meta atualizada");
      } else {
        onSalvo(await criarMeta(user.id, pacienteId, reg), "criada");
        toast.success(`Meta "${reg.titulo}" prescrita`);
        if (f.salvarComoModelo) {
          try {
            await salvarComoModelo(user.id, reg);
            await onModeloCriado?.();
            toast.success("Modelo salvo");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "A meta foi salva, mas o modelo não");
          }
        }
      }
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível salvar a meta";
      setErro(m);
      toast.error(m);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-xl max-h-[92vh] overflow-y-auto" data-modal-meta={edicao ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto flex items-center gap-2">
            <Target className="h-4 w-4 text-verde-3" aria-hidden="true" /> {edicao ? "Editar meta" : "Nova meta"}
          </DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {edicao
              ? "Ajuste o título, como cumprir e os dias da semana. Desmarque \"ativa\" pra pausar a meta sem excluir."
              : "Comece por um modelo (ou em branco), diga como cumprir e marque os dias da semana em que a meta vale. A meta guarda a própria cópia — mudar o modelo depois não mexe nela."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-meta>
          {!edicao && (
            <Campo rotulo="Modelo">
              <select
                className={SELECT}
                {...modeloReg}
                onChange={(e) => {
                  void modeloReg.onChange(e);
                  aplicarModelo(e.target.value);
                }}
                data-campo-modelo-meta
              >
                <option value="">Em branco</option>
                {ordenados.map((m) => (
                  <option key={m.id} value={m.id}>{m.favorito ? "★ " : ""}{m.titulo}</option>
                ))}
              </select>
            </Campo>
          )}

          <Campo rotulo="Meta *">
            <input className={INPUT} maxLength={TITULO_META_MAX} placeholder="ex.: Beber 2 litros de água" {...register("titulo")} data-campo-titulo-meta />
          </Campo>

          <Campo rotulo="Como cumprir (opcional)">
            <textarea className={TEXTAREA} maxLength={DESCRICAO_META_MAX} rows={3} placeholder="ex.: um copo grande ao acordar e uma garrafa de 500 ml nos intervalos" {...register("descricao")} data-campo-descricao-meta />
          </Campo>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1.5">Dias da semana *</p>
            <DiasSemanaToggle dias={v.dias} onChange={(dias) => setValue("dias", dias, { shouldDirty: true })} attrDia="data-dia-toggle" attrAtalho="data-atalho-dias" attrTexto="data-texto-dias" />
          </div>

          {edicao && (
            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("ativa")} data-campo-ativa-meta /> Meta ativa (desmarque pra pausar)
            </label>
          )}
          {!edicao && (
            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("salvarComoModelo")} data-campo-salvar-modelo-meta /> Salvar também como modelo
            </label>
          )}

          {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-meta>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-meta>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-meta>
              <Save size={12} aria-hidden="true" /> {isSubmitting ? "Salvando..." : edicao ? "Salvar" : "Prescrever meta"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
