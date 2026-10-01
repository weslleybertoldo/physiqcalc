// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/metas/ModelosMetaDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import DiasSemanaToggle from "@/nutricao/editor/ui/DiasSemanaToggle";
import { atualizarModeloMeta, criarModeloMeta, excluirModeloMeta, type ModeloMeta } from "@/nutricao/editor/lib/metas";
import {
  DESCRICAO_META_MAX, TITULO_META_MAX, TODOS_OS_DIAS, normalizarDescricao, normalizarDias, normalizarTitulo, ordenarModelosMeta, textoDias,
  validarModeloMeta,
} from "@/nutricao/editor/lib/metasUtil";

// Modelos de meta (referência: metas favoritas): lista com estrela, novo/editar (título + descrição + dias da semana) e
// excluir (soft). Sem tags — a meta copia título/descrição/dias do modelo na hora de prescrever. Quem chama recarrega pelo `onMudou`.
type Valores = { titulo: string; descricao: string; dias: number[]; favorito: boolean };

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  modelos: ModeloMeta[];
  onMudou: () => Promise<void> | void;
}

export default function ModelosMetaDialog({ open, onOpenChange, modelos, onMudou }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<{ modelo: ModeloMeta | null } | null>(null); // null = lista; {modelo:null} = novo
  const [erro, setErro] = useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ModeloMeta | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [mudandoFav, setMudandoFav] = useState<string | null>(null);
  const ordenados = useMemo(() => ordenarModelosMeta(modelos), [modelos]);

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<Valores>({
    defaultValues: { titulo: "", descricao: "", dias: [...TODOS_OS_DIAS], favorito: false },
  });
  const tituloAtual = watch("titulo") ?? "";
  const descricaoAtual = watch("descricao") ?? "";
  const diasAtual = normalizarDias(watch("dias"));

  useEffect(() => {
    if (erro && form && validarModeloMeta(tituloAtual, descricaoAtual, diasAtual) === null) setErro(null); // o aviso some assim que ela resolve
  }, [erro, form, tituloAtual, descricaoAtual, diasAtual]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setErro(null);
    }
  }, [open]);

  const abrirNovo = () => {
    reset({ titulo: "", descricao: "", dias: [...TODOS_OS_DIAS], favorito: false });
    setErro(null);
    setForm({ modelo: null });
  };
  const abrirEdicao = (m: ModeloMeta) => {
    reset({ titulo: m.titulo, descricao: m.descricao ?? "", dias: normalizarDias(m.dias_semana), favorito: m.favorito });
    setErro(null);
    setForm({ modelo: m });
  };

  const onSubmit = async (v: Valores) => {
    const titulo = normalizarTitulo(v.titulo);
    const descricao = normalizarDescricao(v.descricao);
    const dias = normalizarDias(v.dias);
    const msg = validarModeloMeta(titulo, descricao, dias);
    if (msg) return setErro(msg);
    setErro(null);
    try {
      if (form?.modelo) {
        await atualizarModeloMeta(form.modelo.id, { titulo, descricao, dias_semana: dias, favorito: !!v.favorito });
        toast.success("Modelo atualizado");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        await criarModeloMeta(user.id, { titulo, descricao, dias_semana: dias, favorito: !!v.favorito });
        toast.success("Modelo criado");
      }
      await onMudou();
      setForm(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível salvar o modelo";
      setErro(m);
      toast.error(m);
    }
  };

  const alternarFavorito = async (m: ModeloMeta) => {
    setMudandoFav(m.id);
    try {
      await atualizarModeloMeta(m.id, { favorito: !m.favorito });
      await onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar o favorito");
    } finally {
      setMudandoFav(null);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirModeloMeta(paraExcluir.id);
      toast.success("Modelo excluído");
      setParaExcluir(null);
      await onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o modelo");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-xl max-h-[88vh] overflow-y-auto" data-modal-modelos-meta={form ? (form.modelo ? "editar" : "novo") : "lista"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{form ? (form.modelo ? "Editar modelo" : "Novo modelo de meta") : "Modelos de meta"}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {form
              ? "Título, como cumprir e os dias da semana em que a meta costuma valer. Ao prescrever, ela pode ajustar tudo."
              : "Os modelos são seus: escolha um ao prescrever a meta. A estrela marca os favoritos (aparecem primeiro). A meta já prescrita não muda quando o modelo muda."}
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-modelo-meta>
            <Campo rotulo="Meta">
              <input className={INPUT} maxLength={TITULO_META_MAX} placeholder="ex.: Caminhar 30 minutos" {...register("titulo")} data-campo-titulo-modelo-meta />
            </Campo>
            <Campo rotulo="Como cumprir (opcional)">
              <textarea className={TEXTAREA} maxLength={DESCRICAO_META_MAX} rows={3} placeholder="ex.: em ritmo confortável, de preferência ao ar livre" {...register("descricao")} data-campo-descricao-modelo-meta />
            </Campo>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1.5">Dias da semana</p>
              <DiasSemanaToggle dias={diasAtual} onChange={(dias) => setValue("dias", dias, { shouldDirty: true })} attrDia="data-modelo-dia-toggle" attrAtalho="data-modelo-atalho-dias" attrTexto="data-modelo-texto-dias" />
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("favorito")} data-campo-favorito-modelo-meta /> Favorito
            </label>
            {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-modelo-meta>{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => { setForm(null); setErro(null); }} data-btn-cancelar-modelo-meta>Cancelar</button>
              <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-modelo-meta>{isSubmitting ? "Salvando..." : "Salvar modelo"}</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-texto-2 font-body" data-modelos-meta-total={ordenados.length}>
                {ordenados.length === 0 ? "Nenhum modelo" : ordenados.length === 1 ? "1 modelo" : `${ordenados.length} modelos`}
              </p>
              <button type="button" className={BTN_PRI} onClick={abrirNovo} data-btn-novo-modelo-meta><Plus size={12} aria-hidden="true" /> Novo modelo</button>
            </div>
            {ordenados.length === 0 && <p className="text-sm text-texto-2 font-body" data-modelos-meta-vazio>Nenhum modelo de meta ainda.</p>}
            <ul className="divide-y divide-linha" data-lista-modelos-meta>
              {ordenados.map((m) => (
                <li key={m.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2" data-modelo-meta={m.id} data-favorito={m.favorito ? "1" : "0"}>
                  <div className="min-w-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void alternarFavorito(m)}
                      disabled={mudandoFav === m.id}
                      className="text-verde-3 disabled:opacity-40"
                      title={m.favorito ? "Tirar dos favoritos" : "Marcar como favorito"}
                      data-btn-favorito-meta
                    >
                      <Star size={16} className={m.favorito ? "fill-verde-3" : ""} aria-hidden="true" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm text-texto font-body truncate" data-modelo-meta-titulo>{m.titulo}</p>
                      <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body" data-modelo-meta-dias={normalizarDias(m.dias_semana).join(",")}>{textoDias(m.dias_semana)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className={BTN_MINI} onClick={() => abrirEdicao(m)} data-btn-editar-modelo-meta><Pencil size={12} aria-hidden="true" /> Editar</button>
                    <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(m)} data-btn-excluir-modelo-meta><Trash2 size={12} aria-hidden="true" /> Excluir</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-modelos-meta>Fechar</button>
            </div>
          </div>
        )}

        <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
          <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este modelo?</AlertDialogTitle>
              <AlertDialogDescription className="font-body text-texto-2">
                {paraExcluir?.titulo}. As metas já prescritas com ele continuam iguais — só o modelo some da lista.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-modelo-meta>
                {excluindo ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
