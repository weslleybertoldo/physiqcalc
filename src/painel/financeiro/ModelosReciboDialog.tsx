// Physiq W19 — Modelos de recibo ★ (N-62): porta do PhysiqNutri (main ca9f66f, src/components/recibos/ModelosReciboDialog.tsx) no visual
// premium — lista com a estrela (favoritos primeiro), novo/editar (título + texto com botões que INSEREM as tags no cursor + prévia com
// dados de exemplo) e excluir (soft). Os modelos são de cada profissional (P23). Quem chama recarrega pelo `onMudou`.
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Eye, Pencil, PenLine, Plus, Star, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { normalizarConteudo } from "@/nutricao/editor/lib/orientacoesUtil";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { CONTEUDO_MODELO_MAX, TAGS, TITULO_MODELO_MAX, aplicarTags, ordenarModelosRecibo, validarModelo } from "@/financeiro/recibos";
import { BTN_MINI, BTN_MINI_PERIGO } from "./Categorias";
import { atualizarModeloRecibo, criarModeloRecibo, excluirModeloRecibo, type ModeloRecibo } from "./dados";
import { contarTags, dadosExemplo, textoTags } from "./recibosUtil";

type Valores = { titulo: string; conteudo: string; favorito: boolean };

const BTN_TAG = "inline-flex h-7 items-center rounded-[9px] border border-violeta/35 bg-[rgba(139,92,246,.1)] px-2.5 font-body text-[11.5px] font-semibold text-violeta-3 transition-colors hover:bg-[rgba(139,92,246,.18)]";
const TEXTAREA_CONTEUDO =
  "min-h-[240px] w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 py-2.5 font-body text-[13.5px] leading-relaxed text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-verde-3";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  uid: string;
  contaId: string | null;
  modelos: ModeloRecibo[];
  nomeProfissional: string | null;
  onMudou: () => Promise<void> | void;
}

export default function ModelosReciboDialog({ open, onOpenChange, uid, contaId, modelos, nomeProfissional, onMudou }: Props) {
  const [form, setForm] = useState<{ modelo: ModeloRecibo | null } | null>(null); // null = lista; {modelo:null} = novo
  const [previa, setPrevia] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ModeloRecibo | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [mudandoFav, setMudandoFav] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const ordenados = useMemo(() => ordenarModelosRecibo(modelos), [modelos]);

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { isSubmitting } } = useForm<Valores>({
    defaultValues: { titulo: "", conteudo: "", favorito: false },
  });
  const conteudoAtual = watch("conteudo") ?? "";
  const tituloAtual = watch("titulo") ?? "";
  const exemplo = useMemo(() => dadosExemplo(nomeProfissional), [nomeProfissional]);
  const { ref: refConteudo, ...regConteudo } = register("conteudo");

  useEffect(() => {
    if (erro && form && validarModelo(tituloAtual, normalizarConteudo(conteudoAtual)) === null) setErro(null);
  }, [erro, form, tituloAtual, conteudoAtual]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setPrevia(false);
      setErro(null);
    }
  }, [open]);

  const abrirNovo = () => {
    reset({ titulo: "", conteudo: "", favorito: false });
    setErro(null);
    setPrevia(false);
    setForm({ modelo: null });
  };
  const abrirEdicao = (m: ModeloRecibo) => {
    reset({ titulo: m.titulo, conteudo: m.conteudo ?? "", favorito: m.favorito });
    setErro(null);
    setPrevia(false);
    setForm({ modelo: m });
  };

  /** Insere a tag onde está o cursor do texto (ou no fim) e devolve o foco logo depois dela. */
  const inserirTag = (tag: string) => {
    const el = areaRef.current;
    const atual = getValues("conteudo") ?? "";
    const ini = el?.selectionStart ?? atual.length;
    const fim = el?.selectionEnd ?? atual.length;
    setValue("conteudo", atual.slice(0, ini) + tag + atual.slice(fim), { shouldDirty: true });
    setPrevia(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = ini + tag.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onSubmit = async (v: Valores) => {
    const titulo = (v.titulo ?? "").trim();
    const conteudo = normalizarConteudo(v.conteudo ?? "");
    const msg = validarModelo(titulo, conteudo);
    if (msg) {
      setErro(msg);
      setPrevia(false);
      return;
    }
    setErro(null);
    try {
      if (form?.modelo) {
        await atualizarModeloRecibo(form.modelo.id, { titulo, conteudo, favorito: !!v.favorito });
        toast.success("Modelo atualizado");
      } else {
        if (!uid) throw new Error("Sessão expirada — entre de novo");
        await criarModeloRecibo(uid, contaId, { titulo, conteudo, favorito: !!v.favorito });
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

  const alternarFavorito = async (m: ModeloRecibo) => {
    setMudandoFav(m.id);
    try {
      await atualizarModeloRecibo(m.id, { favorito: !m.favorito });
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
      await excluirModeloRecibo(paraExcluir.id);
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
      <DialogContent className={cn(JANELA, "max-h-[88vh] overflow-y-auto sm:max-w-2xl")} data-modal-modelos-recibo={form ? (form.modelo ? "editar" : "novo") : "lista"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{form ? (form.modelo ? "Editar modelo de recibo" : "Novo modelo de recibo") : "Modelos de recibo"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            {form
              ? "Escreva o texto do recibo e clique nas tags para inseri-las onde estiver o cursor — na emissão elas viram o nome, o CPF, o valor, a data e o número."
              : "Os modelos são seus: escolha um ao emitir o recibo. A estrela marca os favoritos (aparecem primeiro). O recibo já emitido não muda quando o modelo muda."}
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-modelo-recibo>
            <Campo rotulo="Título">
              <input className={INPUT} maxLength={TITULO_MODELO_MAX} placeholder="ex.: Recibo de consulta" {...register("titulo")} data-campo-titulo-modelo-recibo />
            </Campo>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="font-body text-[12px] font-semibold text-texto-2">Texto do recibo</label>
                <button type="button" className={BTN_MINI} onClick={() => setPrevia((p) => !p)} data-btn-preview-modelo-recibo aria-pressed={previa}>
                  {previa ? <PenLine size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />} {previa ? "Escrever" : "Visualizar"}
                </button>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5" data-tags-recibo>
                {TAGS.map((t) => (
                  <button key={t.tag} type="button" className={BTN_TAG} onClick={() => inserirTag(t.tag)} title={`${t.tag} → ex.: ${t.exemplo}`} data-btn-tag={t.tag}>
                    {t.rotulo}
                  </button>
                ))}
              </div>
              <textarea
                className={`${TEXTAREA_CONTEUDO}${previa ? " hidden" : ""}`}
                maxLength={CONTEUDO_MODELO_MAX}
                placeholder="ex.: Recebi de *|NOME_PACIENTE|* a quantia de *|VALOR_CONSULTA|*…"
                {...regConteudo}
                ref={(el) => {
                  refConteudo(el);
                  areaRef.current = el;
                }}
                data-campo-conteudo-modelo-recibo
              />
              {previa && (
                <div className="max-h-[50vh] min-h-[240px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-linha-2 bg-[rgba(255,255,255,.03)] p-3.5 font-body text-[13px] leading-relaxed text-texto" data-preview-modelo-recibo>
                  {aplicarTags(conteudoAtual, exemplo) || <span className="text-texto-3">Sem texto ainda.</span>}
                </div>
              )}
              <p className="mt-1.5 font-body text-[11.5px] text-texto-3" data-tags-form={contarTags(conteudoAtual)}>
                {textoTags(contarTags(conteudoAtual))} no texto · a prévia usa dados de exemplo (Maria da Silva, R$ 180,00, nº 0001)
              </p>
            </div>
            <label className="inline-flex items-center gap-2 font-body text-[12.5px] text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("favorito")} data-campo-favorito-modelo-recibo /> Favorito (abre primeiro)
            </label>
            {erro && <p role="alert" className="font-body text-[12px] text-rosa-3" data-erro-modelo-recibo>{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => { setForm(null); setErro(null); }} data-btn-cancelar-modelo-recibo>Cancelar</button>
              <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-modelo-recibo>{isSubmitting ? "Salvando..." : "Salvar modelo"}</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button type="button" className={BTN_PRI} onClick={abrirNovo} data-btn-novo-modelo-recibo><Plus size={13} aria-hidden="true" /> Novo modelo</button>
            </div>
            {ordenados.length === 0 && <p className="font-body text-[13px] text-texto-3" data-modelos-recibo-vazio>Nenhum modelo ainda.</p>}
            <ul className="divide-y divide-linha-3" data-lista-modelos-recibo data-modelos-recibo-total={ordenados.length}>
              {ordenados.map((m) => {
                const n = contarTags(m.conteudo);
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5" data-modelo-recibo={m.id} data-favorito={m.favorito ? "1" : "0"} data-tags={n}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button type="button" onClick={() => void alternarFavorito(m)} disabled={mudandoFav === m.id}
                        className="text-ambar-3 disabled:opacity-40" title={m.favorito ? "Tirar dos favoritos" : "Marcar como favorito"} data-btn-favorito-recibo>
                        <Star size={17} className={m.favorito ? "fill-ambar-3" : ""} aria-hidden="true" />
                      </button>
                      <div className="min-w-0">
                        <p className="truncate font-body text-[13.5px] font-semibold text-texto" data-modelo-recibo-titulo>{m.titulo}</p>
                        <p className="font-body text-[11.5px] text-texto-3">{textoTags(n)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className={BTN_MINI} onClick={() => abrirEdicao(m)} data-btn-editar-modelo-recibo><Pencil size={12} aria-hidden="true" /> Editar</button>
                      <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(m)} data-btn-excluir-modelo-recibo><Trash2 size={12} aria-hidden="true" /> Excluir</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-modelos-recibo>Fechar</button>
            </div>
          </div>
        )}

        <AlertDialog open={!!paraExcluir} onOpenChange={(a) => { if (!a) setParaExcluir(null); }}>
          <AlertDialogContent className={JANELA}>
            <AlertDialogHeader>
              <AlertDialogTitle className={TITULO_JANELA}>Excluir este modelo?</AlertDialogTitle>
              <AlertDialogDescription className={DESCRICAO_JANELA}>
                {paraExcluir?.titulo}. Os recibos já emitidos com ele continuam iguais — só o modelo some da lista.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-modelo-recibo>
                {excluindo ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
