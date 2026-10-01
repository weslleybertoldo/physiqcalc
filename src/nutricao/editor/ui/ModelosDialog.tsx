// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/orientacoes/ModelosDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, Pencil, PenLine, Plus, Star, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, Campo, INPUT } from "@/nutricao/editor/ui/estilos";
import Blocos from "@/nutricao/editor/ui/Blocos";
import { atualizarModelo, criarModelo, excluirModelo, type ModeloOrientacao } from "@/nutricao/editor/lib/orientacoes";
import { CONTEUDO_MAX, TITULO_MAX, ehVazio, normalizarConteudo, ordenarModelos, textoTopicos, topicosDoTexto } from "@/nutricao/editor/lib/orientacoesUtil";

// Modelos de orientação (referência: "modelos favoritos"): lista com estrela, novo/editar (título + conteúdo em
// markdown simples com prévia) e excluir (soft). Quem chama recarrega a lista pelo `onMudou`.
const schema = z.object({
  titulo: z.string().trim().min(1, "Dê um título ao modelo").max(TITULO_MAX, "Título muito longo"),
  conteudo: z.string().max(CONTEUDO_MAX, "Texto muito longo").refine((v) => !ehVazio(v), "Escreva o conteúdo do modelo"),
  favorito: z.boolean(),
});
type Valores = z.infer<typeof schema>;

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
export const TEXTAREA_CONTEUDO = "w-full bg-transparent border border-linha-2 text-texto font-body text-sm leading-relaxed p-2 outline-none focus:border-verde-3 min-h-[240px]";
export const DICA_MARKDOWN = "Use \"## Subtítulo\" para separar os tópicos, \"- \" para listas e **negrito** para destacar. Linha em branco separa os blocos.";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  modelos: ModeloOrientacao[];
  onMudou: () => Promise<void> | void;
}

export default function ModelosDialog({ open, onOpenChange, modelos, onMudou }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<{ modelo: ModeloOrientacao | null } | null>(null); // null = lista; {modelo:null} = novo
  const [previa, setPrevia] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<ModeloOrientacao | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [mudandoFav, setMudandoFav] = useState<string | null>(null);
  const ordenados = useMemo(() => ordenarModelos(modelos), [modelos]);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { titulo: "", conteudo: "", favorito: false },
  });
  const conteudoAtual = watch("conteudo") ?? "";
  const topicos = topicosDoTexto(conteudoAtual);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setPrevia(false);
    }
  }, [open]);

  const abrirNovo = () => {
    reset({ titulo: "", conteudo: "", favorito: false });
    setPrevia(false);
    setForm({ modelo: null });
  };
  const abrirEdicao = (m: ModeloOrientacao) => {
    reset({ titulo: m.titulo, conteudo: m.conteudo ?? "", favorito: m.favorito });
    setPrevia(false);
    setForm({ modelo: m });
  };

  const onSubmit = async (v: Valores) => {
    const dados = { titulo: v.titulo ?? "", conteudo: normalizarConteudo(v.conteudo ?? ""), favorito: !!v.favorito };
    try {
      if (form?.modelo) {
        await atualizarModelo(form.modelo.id, dados);
        toast.success("Modelo atualizado");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        await criarModelo(user.id, dados);
        toast.success("Modelo criado");
      }
      await onMudou();
      setForm(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o modelo");
    }
  };

  const alternarFavorito = async (m: ModeloOrientacao) => {
    setMudandoFav(m.id);
    try {
      await atualizarModelo(m.id, { favorito: !m.favorito });
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
      await excluirModelo(paraExcluir.id);
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
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-2xl max-h-[88vh] overflow-y-auto" data-modal-modelos={form ? (form.modelo ? "editar" : "novo") : "lista"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{form ? (form.modelo ? "Editar modelo" : "Novo modelo") : "Modelos de orientação"}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {form ? DICA_MARKDOWN : "Os modelos são seus: escolha um ao escrever a orientação. A estrela marca os favoritos."}
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-modelo>
            <Campo rotulo="Título" erro={errors.titulo?.message}>
              <input className={INPUT} maxLength={TITULO_MAX} {...register("titulo")} data-campo-titulo-modelo />
            </Campo>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-[11px] uppercase tracking-wider text-texto-2 font-body">Conteúdo</label>
                <button type="button" className={BTN_MINI} onClick={() => setPrevia((p) => !p)} data-btn-preview-modelo aria-pressed={previa}>
                  {previa ? <PenLine size={12} /> : <Eye size={12} />} {previa ? "Escrever" : "Visualizar"}
                </button>
              </div>
              <textarea className={`${TEXTAREA_CONTEUDO}${previa ? " hidden" : ""}`} maxLength={CONTEUDO_MAX} {...register("conteudo")} data-campo-conteudo-modelo />
              {previa && (
                <div className="border border-linha-2 p-3 min-h-[240px] max-h-[50vh] overflow-y-auto" data-preview-modelo>
                  <Blocos conteudo={conteudoAtual} compacto />
                </div>
              )}
              <p className="text-xs text-texto-2 font-body mt-1" data-topicos-form={topicos}>{textoTopicos(topicos)}</p>
              {errors.conteudo?.message && <p className="text-xs text-rosa-3 font-body mt-1" role="alert">{errors.conteudo.message}</p>}
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("favorito")} data-campo-favorito-modelo /> Favorito
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => setForm(null)} data-btn-cancelar-modelo>Cancelar</button>
              <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-modelo>{isSubmitting ? "Salvando..." : "Salvar modelo"}</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button type="button" className={BTN_PRI} onClick={abrirNovo} data-btn-novo-modelo><Plus size={12} /> Novo modelo</button>
            </div>
            {ordenados.length === 0 && <p className="text-sm text-texto-2 font-body" data-modelos-vazio>Nenhum modelo ainda.</p>}
            <ul className="divide-y divide-linha" data-lista-modelos>
              {ordenados.map((m) => {
                const n = topicosDoTexto(m.conteudo);
                return (
                  <li key={m.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2" data-modelo={m.id} data-favorito={m.favorito ? "1" : "0"} data-topicos={n}>
                    <div className="min-w-0 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void alternarFavorito(m)}
                        disabled={mudandoFav === m.id}
                        className="text-verde-3 disabled:opacity-40"
                        title={m.favorito ? "Tirar dos favoritos" : "Marcar como favorito"}
                        data-btn-favorito
                      >
                        <Star size={16} className={m.favorito ? "fill-verde-3" : ""} />
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body truncate" data-modelo-titulo>{m.titulo}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body">{textoTopicos(n)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className={BTN_MINI} onClick={() => abrirEdicao(m)} data-btn-editar-modelo><Pencil size={12} /> Editar</button>
                      <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(m)} data-btn-excluir-modelo><Trash2 size={12} /> Excluir</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
          <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este modelo?</AlertDialogTitle>
              <AlertDialogDescription className="font-body text-texto-2">
                {paraExcluir?.titulo}. As orientações já entregues com ele continuam iguais — só o modelo some da lista.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-modelo>
                {excluindo ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
