// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/exames/CatalogoExamesDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, Campo, INPUT } from "@/nutricao/editor/ui/estilos";
import { atualizarExameCatalogo, criarExameCatalogo, excluirExameCatalogo, type ExameCatalogo } from "@/nutricao/prontuario/lib/exames";
import {
  NOME_EXAME_MAX, REFERENCIA_TEXTO_MAX, UNIDADE_MAX, exameCatalogoParaForm, formExameVazio, formParaRegistroExameCatalogo, ordenarCatalogo, textoReferencia, validarExameCatalogo,
  type FormExameCatalogo,
} from "@/nutricao/prontuario/lib/examesUtil";

// Catálogo de exames da nutricionista (referência: pedido de exames com favoritos): lista com estrela, unidade e referência, novo/editar
// (nome, unidade, referência mínima/máxima numérica ou texto, favorito) e excluir (soft). Pedidos e resultados copiam o que precisam
// na hora — mudar o catálogo não mexe no histórico. Quem chama recarrega pelo `onMudou`.
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  catalogo: ExameCatalogo[];
  onMudou: () => Promise<void> | void;
}

// montado campo a campo (tsconfig sem strictNullChecks; o RHF pode devolver campos indefinidos)
const montarForm = (v: Partial<FormExameCatalogo>): FormExameCatalogo => ({
  nome: v.nome ?? "",
  unidade: v.unidade ?? "",
  refMin: v.refMin ?? "",
  refMax: v.refMax ?? "",
  referenciaTexto: v.referenciaTexto ?? "",
  favorito: !!v.favorito,
});

export default function CatalogoExamesDialog({ open, onOpenChange, catalogo, onMudou }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<{ item: ExameCatalogo | null } | null>(null); // null = lista; {item:null} = novo
  const [erro, setErro] = useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ExameCatalogo | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [mudandoFav, setMudandoFav] = useState<string | null>(null);
  const ordenados = useMemo(() => ordenarCatalogo(catalogo), [catalogo]);

  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm<FormExameCatalogo>({ defaultValues: formExameVazio() });
  const v = montarForm(watch());

  useEffect(() => {
    if (erro && form && validarExameCatalogo(v.nome, v.unidade, v.refMin, v.refMax, v.referenciaTexto) === null) setErro(null); // o aviso some assim que ela resolve
  }, [erro, form, v.nome, v.unidade, v.refMin, v.refMax, v.referenciaTexto]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setErro(null);
    }
  }, [open]);

  const abrirNovo = () => {
    reset(formExameVazio());
    setErro(null);
    setForm({ item: null });
  };
  const abrirEdicao = (e: ExameCatalogo) => {
    reset(exameCatalogoParaForm(e));
    setErro(null);
    setForm({ item: e });
  };

  const onSubmit = async (valores: FormExameCatalogo) => {
    const f = montarForm(valores);
    const msg = validarExameCatalogo(f.nome, f.unidade, f.refMin, f.refMax, f.referenciaTexto);
    if (msg) return setErro(msg);
    setErro(null);
    const reg = formParaRegistroExameCatalogo(f);
    try {
      if (form?.item) {
        await atualizarExameCatalogo(form.item.id, reg);
        toast.success("Exame atualizado");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        await criarExameCatalogo(user.id, reg);
        toast.success("Exame adicionado ao catálogo");
      }
      await onMudou();
      setForm(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível salvar o exame";
      setErro(m);
      toast.error(m);
    }
  };

  const alternarFavorito = async (e: ExameCatalogo) => {
    setMudandoFav(e.id);
    try {
      await atualizarExameCatalogo(e.id, { favorito: !e.favorito });
      await onMudou();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o favorito");
    } finally {
      setMudandoFav(null);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirExameCatalogo(paraExcluir.id);
      toast.success("Exame excluído do catálogo");
      setParaExcluir(null);
      await onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o exame");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-2xl max-h-[88vh] overflow-y-auto" data-modal-catalogo-exames={form ? (form.item ? "editar" : "novo") : "lista"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{form ? (form.item ? "Editar exame" : "Novo exame no catálogo") : "Catálogo de exames"}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {form
              ? "Nome, unidade e referência: faixa numérica (mínimo e/ou máximo) ou um texto (ex.: negativo). Ao lançar um resultado, a referência é copiada e a situação sai sozinha."
              : "O catálogo é seu: os exames aparecem no pedido e no lançamento de resultados. A estrela marca os favoritos (aparecem primeiro). Pedidos e resultados já feitos não mudam quando o catálogo muda."}
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-exame-catalogo>
            <Campo rotulo="Nome do exame *">
              <input className={INPUT} maxLength={NOME_EXAME_MAX} placeholder="ex.: Zinco sérico" {...register("nome")} data-campo-nome-exame />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo rotulo="Unidade">
                <input className={INPUT} maxLength={UNIDADE_MAX} placeholder="ex.: mg/dL" {...register("unidade")} data-campo-unidade-exame />
              </Campo>
              <Campo rotulo="Referência mínima">
                <input className={INPUT} inputMode="decimal" placeholder="ex.: 70" {...register("refMin")} data-campo-ref-min />
              </Campo>
              <Campo rotulo="Referência máxima">
                <input className={INPUT} inputMode="decimal" placeholder="ex.: 99" {...register("refMax")} data-campo-ref-max />
              </Campo>
            </div>
            <Campo rotulo="Referência em texto (quando não é numérica)" dica="ex.: negativo, não reagente — usada só se mínimo e máximo ficarem vazios">
              <input className={INPUT} maxLength={REFERENCIA_TEXTO_MAX} placeholder="ex.: negativo" {...register("referenciaTexto")} data-campo-ref-texto />
            </Campo>
            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("favorito")} data-campo-favorito-exame /> Favorito
            </label>
            {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-exame>{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => { setForm(null); setErro(null); }} data-btn-cancelar-exame>Cancelar</button>
              <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-exame>{isSubmitting ? "Salvando..." : "Salvar exame"}</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-texto-2 font-body" data-catalogo-total={ordenados.length}>
                {ordenados.length === 0 ? "Nenhum exame" : ordenados.length === 1 ? "1 exame" : `${ordenados.length} exames`}
              </p>
              <button type="button" className={BTN_PRI} onClick={abrirNovo} data-btn-novo-exame-catalogo><Plus size={12} aria-hidden="true" /> Novo exame</button>
            </div>
            {ordenados.length === 0 && <p className="text-sm text-texto-2 font-body" data-catalogo-vazio>Nenhum exame no catálogo ainda.</p>}
            <ul className="divide-y divide-linha" data-lista-catalogo-exames>
              {ordenados.map((e) => (
                <li key={e.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2" data-exame-catalogo={e.id} data-favorito={e.favorito ? "1" : "0"} data-exame-catalogo-nome={e.nome}>
                  <div className="min-w-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void alternarFavorito(e)}
                      disabled={mudandoFav === e.id}
                      className="text-verde-3 disabled:opacity-40"
                      title={e.favorito ? "Tirar dos favoritos" : "Marcar como favorito"}
                      data-btn-favorito-exame-catalogo
                    >
                      <Star size={16} className={e.favorito ? "fill-verde-3" : ""} aria-hidden="true" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm text-texto font-body truncate" data-exame-catalogo-titulo>{e.nome}</p>
                      <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body truncate">
                        <span className="normal-case" data-exame-catalogo-unidade>{e.unidade || "sem unidade"}</span> · ref. <span className="normal-case" data-exame-catalogo-ref>{textoReferencia(e.ref_min, e.ref_max, e.referencia_texto)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className={BTN_MINI} onClick={() => abrirEdicao(e)} data-btn-editar-exame-catalogo><Pencil size={12} aria-hidden="true" /> Editar</button>
                    <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(e)} data-btn-excluir-exame-catalogo><Trash2 size={12} aria-hidden="true" /> Excluir</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-catalogo>Fechar</button>
            </div>
          </div>
        )}

        <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
          <AlertDialogContent className="bg-tela border-linha-2">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este exame do catálogo?</AlertDialogTitle>
              <AlertDialogDescription className="font-body">
                {paraExcluir?.nome}. Os pedidos e resultados já registrados continuam iguais — só o exame some do catálogo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-exame>
                {excluindo ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
