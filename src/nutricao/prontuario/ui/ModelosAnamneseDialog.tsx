// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/anamnese/ModelosDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Copy, ListChecks, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { atualizarModelo, criarModelo, duplicarModelo, excluirModelo, type ModeloAnamnese } from "@/nutricao/prontuario/lib/anamneses";
import { TITULO_MAX, ehModeloDoSistema, lerPerguntas, ordenarModelos, perguntasDoTexto, textoDasPerguntas } from "@/nutricao/prontuario/lib/anamneseUtil";

// Modelos de anamnese (referência: "modelos favoritos"): lista com estrela, novo/editar (título + perguntas, uma por
// linha) e excluir (soft). W40: o modelo DO SISTEMA (nutricionista_id NULL) aparece pra todas, só leitura — ícone em vez
// de estrela, sem Editar/Excluir, com "Duplicar" (cópia própria editável). Quem chama recarrega a lista pelo `onMudou`.
const schema = z.object({
  titulo: z.string().trim().min(1, "Dê um título ao modelo").max(TITULO_MAX, "Título muito longo"),
  perguntas: z.string().refine((v) => perguntasDoTexto(v).length >= 1, "Escreva pelo menos uma pergunta (uma por linha)"),
  favorito: z.boolean(),
});
type Valores = z.infer<typeof schema>;

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  modelos: ModeloAnamnese[];
  onMudou: () => Promise<void> | void;
}

export default function ModelosDialog({ open, onOpenChange, modelos, onMudou }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<{ modelo: ModeloAnamnese | null } | null>(null); // null = lista; {modelo:null} = novo
  const [paraExcluir, setParaExcluir] = useState<ModeloAnamnese | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [mudandoFav, setMudandoFav] = useState<string | null>(null);
  const [duplicando, setDuplicando] = useState<string | null>(null);
  const ordenados = useMemo(() => ordenarModelos(modelos), [modelos]);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { titulo: "", perguntas: "", favorito: false },
  });

  useEffect(() => {
    if (!open) setForm(null);
  }, [open]);

  const abrirNovo = () => {
    reset({ titulo: "", perguntas: "", favorito: false });
    setForm({ modelo: null });
  };
  const abrirEdicao = (m: ModeloAnamnese) => {
    reset({ titulo: m.titulo, perguntas: textoDasPerguntas(lerPerguntas(m.perguntas)), favorito: m.favorito });
    setForm({ modelo: m });
  };

  const onSubmit = async (v: Valores) => {
    const dados = { titulo: v.titulo ?? "", perguntas: perguntasDoTexto(v.perguntas ?? ""), favorito: !!v.favorito };
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

  const alternarFavorito = async (m: ModeloAnamnese) => {
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

  const duplicar = async (m: ModeloAnamnese) => {
    if (!user) {
      toast.error("Sessão expirada — entre de novo");
      return;
    }
    setDuplicando(m.id);
    try {
      const copia = await duplicarModelo(user.id, m);
      toast.success(`Cópia criada: ${copia.titulo}`);
      await onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível duplicar o modelo");
    } finally {
      setDuplicando(null);
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
      <DialogContent className="bg-tela border-linha-2 sm:max-w-xl max-h-[88vh] overflow-y-auto" data-modal-modelos={form ? (form.modelo ? "editar" : "novo") : "lista"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{form ? (form.modelo ? "Editar modelo" : "Novo modelo") : "Modelos de anamnese"}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {form ? "Uma pergunta por linha. Os favoritos aparecem primeiro ao criar uma anamnese." : "O do sistema vale pra todas e não muda — duplique pra ter a sua versão editável. Os seus aceitam estrela (aparecem primeiro), edição e exclusão."}
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-modelo>
            <Campo rotulo="Título" erro={errors.titulo?.message}>
              <input className={INPUT} maxLength={TITULO_MAX} {...register("titulo")} data-campo-titulo-modelo />
            </Campo>
            <Campo rotulo="Perguntas" erro={errors.perguntas?.message} dica="Uma pergunta por linha, na ordem em que devem aparecer.">
              <textarea className={TEXTAREA} rows={10} {...register("perguntas")} data-campo-perguntas-modelo />
            </Campo>
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
                const n = lerPerguntas(m.perguntas).length;
                const sistema = ehModeloDoSistema(m);
                return (
                  <li
                    key={m.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                    data-modelo={m.id}
                    data-favorito={m.favorito && !sistema ? "1" : "0"}
                    data-perguntas={n}
                    data-modelo-origem={sistema ? "sistema" : "proprio"}
                    data-modelo-codigo={m.codigo ?? undefined}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      {sistema ? (
                        <ListChecks size={16} className="text-texto-3 shrink-0" aria-hidden="true" />
                      ) : (
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
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body truncate" data-modelo-titulo>{m.titulo}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body">
                          {sistema ? "Do sistema" : "Meu modelo"} · {n} pergunta{n === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className={BTN_MINI} onClick={() => void duplicar(m)} disabled={duplicando === m.id} data-btn-duplicar-modelo>
                        <Copy size={12} /> {duplicando === m.id ? "Duplicando..." : "Duplicar"}
                      </button>
                      {!sistema && <button type="button" className={BTN_MINI} onClick={() => abrirEdicao(m)} data-btn-editar-modelo><Pencil size={12} /> Editar</button>}
                      {!sistema && <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(m)} data-btn-excluir-modelo><Trash2 size={12} /> Excluir</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
          <AlertDialogContent className="bg-tela border-linha-2">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este modelo?</AlertDialogTitle>
              <AlertDialogDescription className="font-body">
                {paraExcluir?.titulo}. As anamneses já feitas com ele continuam iguais — só o modelo some da lista.
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
