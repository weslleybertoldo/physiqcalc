// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/manipulados/ModelosFormulaDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
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
import AtivosEditor from "@/nutricao/editor/ui/AtivosEditor";
import { atualizarModeloFormula, criarModeloFormula, excluirModeloFormula, type ModeloFormula } from "@/nutricao/editor/lib/manipulados";
import {
  OBSERVACAO_FORMULA_MAX, POSOLOGIA_MAX, QUANTIDADE_MAX, TITULO_FORMULA_MAX, ativoVazio, contarAtivos, lerAtivos, normalizarAtivos, normalizarQuantidade, normalizarTexto,
  normalizarTitulo, ordenarModelosFormula, textoAtivos, validarModeloFormula, type Ativo,
} from "@/nutricao/editor/lib/manipuladosUtil";

// Modelos de fórmula manipulada (referência: manipulados favoritos): lista com estrela e o resumo dos ativos, novo/editar (título +
// ativos no editor compartilhado + posologia + quantidade + observação + favorito) e excluir (soft). A fórmula copia tudo do modelo
// na hora de prescrever. Quem chama recarrega pelo `onMudou`.
type Valores = { titulo: string; ativos: Ativo[]; posologia: string; quantidade: string; observacao: string; favorito: boolean };

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const VAZIO: Valores = { titulo: "", ativos: [ativoVazio()], posologia: "", quantidade: "", observacao: "", favorito: false };

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  modelos: ModeloFormula[];
  onMudou: () => Promise<void> | void;
}

export default function ModelosFormulaDialog({ open, onOpenChange, modelos, onMudou }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<{ modelo: ModeloFormula | null } | null>(null); // null = lista; {modelo:null} = novo
  const [erro, setErro] = useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ModeloFormula | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [mudandoFav, setMudandoFav] = useState<string | null>(null);
  const ordenados = useMemo(() => ordenarModelosFormula(modelos), [modelos]);

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<Valores>({ defaultValues: { ...VAZIO, ativos: [ativoVazio()] } });
  const tituloAtual = watch("titulo") ?? "";
  const ativosBrutos = watch("ativos");
  const ativosAtual = useMemo(() => (Array.isArray(ativosBrutos) && ativosBrutos.length ? ativosBrutos : [ativoVazio()]), [ativosBrutos]);
  const posologiaAtual = watch("posologia") ?? "";
  const quantidadeAtual = watch("quantidade") ?? "";
  const observacaoAtual = watch("observacao") ?? "";

  useEffect(() => {
    if (erro && form && validarModeloFormula(tituloAtual, ativosAtual, posologiaAtual, quantidadeAtual, observacaoAtual) === null) setErro(null); // o aviso some assim que ela resolve
  }, [erro, form, tituloAtual, ativosAtual, posologiaAtual, quantidadeAtual, observacaoAtual]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setErro(null);
    }
  }, [open]);

  const abrirNovo = () => {
    reset({ ...VAZIO, ativos: [ativoVazio()] });
    setErro(null);
    setForm({ modelo: null });
  };
  const abrirEdicao = (m: ModeloFormula) => {
    const ativos = lerAtivos(m.ativos);
    reset({ titulo: m.titulo, ativos: ativos.length ? ativos : [ativoVazio()], posologia: m.posologia ?? "", quantidade: m.quantidade ?? "", observacao: m.observacao ?? "", favorito: m.favorito });
    setErro(null);
    setForm({ modelo: m });
  };

  const onSubmit = async (v: Valores) => {
    const titulo = normalizarTitulo(v.titulo);
    const ativos = normalizarAtivos(v.ativos);
    const posologia = normalizarTexto(v.posologia).slice(0, POSOLOGIA_MAX);
    const quantidade = normalizarQuantidade(v.quantidade);
    const observacao = normalizarTexto(v.observacao).slice(0, OBSERVACAO_FORMULA_MAX);
    const msg = validarModeloFormula(titulo, ativos, posologia, quantidade, observacao);
    if (msg) return setErro(msg);
    setErro(null);
    try {
      if (form?.modelo) {
        await atualizarModeloFormula(form.modelo.id, { titulo, ativos, posologia, quantidade, observacao, favorito: !!v.favorito });
        toast.success("Modelo atualizado");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        await criarModeloFormula(user.id, { titulo, ativos, posologia, quantidade, observacao, favorito: !!v.favorito });
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

  const alternarFavorito = async (m: ModeloFormula) => {
    setMudandoFav(m.id);
    try {
      await atualizarModeloFormula(m.id, { favorito: !m.favorito });
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
      await excluirModeloFormula(paraExcluir.id);
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
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-2xl max-h-[88vh] overflow-y-auto" data-modal-modelos-formula={form ? (form.modelo ? "editar" : "novo") : "lista"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{form ? (form.modelo ? "Editar modelo" : "Novo modelo de fórmula") : "Modelos de fórmula"}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {form
              ? "Título, ativos com dose e unidade, posologia, quantidade e observações. Ao prescrever, ela pode ajustar tudo."
              : "Os modelos são seus: escolha um ao prescrever a fórmula. A estrela marca os favoritos (aparecem primeiro). A fórmula já prescrita não muda quando o modelo muda."}
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-modelo-formula>
            <Campo rotulo="Título">
              <input className={INPUT} maxLength={TITULO_FORMULA_MAX} placeholder="ex.: Vitamina D3 2000 UI" {...register("titulo")} data-campo-titulo-modelo-formula />
            </Campo>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1.5">Ativos</p>
              <AtivosEditor
                ativos={ativosAtual}
                onChange={(ativos) => setValue("ativos", ativos, { shouldDirty: true })}
                attrLinha="data-modelo-linha-ativo"
                attrNome="data-modelo-campo-ativo-nome"
                attrDose="data-modelo-campo-ativo-dose"
                attrUnidade="data-modelo-campo-ativo-unidade"
                attrRemover="data-modelo-btn-remover-ativo"
                attrAdicionar="data-modelo-btn-adicionar-ativo"
              />
            </div>
            <Campo rotulo="Posologia">
              <textarea className={TEXTAREA} maxLength={POSOLOGIA_MAX} rows={2} placeholder="ex.: Tomar 1 cápsula ao dia" {...register("posologia")} data-campo-posologia-modelo-formula />
            </Campo>
            <Campo rotulo="Quantidade">
              <input className={INPUT} maxLength={QUANTIDADE_MAX} placeholder="ex.: 60 cápsulas" {...register("quantidade")} data-campo-quantidade-modelo-formula />
            </Campo>
            <Campo rotulo="Observações (opcional)">
              <textarea className={TEXTAREA} maxLength={OBSERVACAO_FORMULA_MAX} rows={2} {...register("observacao")} data-campo-observacao-modelo-formula />
            </Campo>
            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("favorito")} data-campo-favorito-modelo-formula /> Favorito
            </label>
            {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-modelo-formula>{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => { setForm(null); setErro(null); }} data-btn-cancelar-modelo-formula>Cancelar</button>
              <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-modelo-formula>{isSubmitting ? "Salvando..." : "Salvar modelo"}</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-texto-2 font-body" data-modelos-formula-total={ordenados.length}>
                {ordenados.length === 0 ? "Nenhum modelo" : ordenados.length === 1 ? "1 modelo" : `${ordenados.length} modelos`}
              </p>
              <button type="button" className={BTN_PRI} onClick={abrirNovo} data-btn-novo-modelo-formula><Plus size={12} aria-hidden="true" /> Novo modelo</button>
            </div>
            {ordenados.length === 0 && <p className="text-sm text-texto-2 font-body" data-modelos-formula-vazio>Nenhum modelo de fórmula ainda.</p>}
            <ul className="divide-y divide-linha" data-lista-modelos-formula>
              {ordenados.map((m) => (
                <li key={m.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2" data-modelo-formula={m.id} data-favorito={m.favorito ? "1" : "0"}>
                  <div className="min-w-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void alternarFavorito(m)}
                      disabled={mudandoFav === m.id}
                      className="text-verde-3 disabled:opacity-40"
                      title={m.favorito ? "Tirar dos favoritos" : "Marcar como favorito"}
                      data-btn-favorito-formula
                    >
                      <Star size={16} className={m.favorito ? "fill-verde-3" : ""} aria-hidden="true" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm text-texto font-body truncate" data-modelo-formula-titulo>{m.titulo}</p>
                      <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body truncate" data-modelo-formula-ativos={contarAtivos(m.ativos)}>
                        {textoAtivos(m.ativos) || "Sem ativos"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className={BTN_MINI} onClick={() => abrirEdicao(m)} data-btn-editar-modelo-formula><Pencil size={12} aria-hidden="true" /> Editar</button>
                    <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(m)} data-btn-excluir-modelo-formula><Trash2 size={12} aria-hidden="true" /> Excluir</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-modelos-formula>Fechar</button>
            </div>
          </div>
        )}

        <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
          <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este modelo?</AlertDialogTitle>
              <AlertDialogDescription className="font-body text-texto-2">
                {paraExcluir?.titulo}. As fórmulas já prescritas com ele continuam iguais — só o modelo some da lista.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-modelo-formula>
                {excluindo ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
