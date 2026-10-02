// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/documentos/ModelosDocumentoDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Eye, Pencil, PenLine, Plus, Star, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, Campo, INPUT } from "@/nutricao/editor/ui/estilos";
import { TEXTAREA_CONTEUDO } from "@/nutricao/editor/ui/ModelosDialog";
import { atualizarModeloDocumento, criarModeloDocumento, excluirModeloDocumento, type ModeloDocumento } from "@/nutricao/prontuario/lib/documentos";
import {
  TEXTO_DOCUMENTO_MAX, TIPOS_DOCUMENTO, TITULO_DOCUMENTO_MAX, aplicarTagsDocumento, dadosExemploDocumento, infoTipo, modelosDoTipo, normalizarConteudo, tagsDoTipo,
  validarModeloDocumento, type TipoDocumento,
} from "@/nutricao/prontuario/lib/documentosUtil";

// Modelos de documento (referência: atestados/receituários favoritos): abas por tipo (Atestados / Receituários / Declarações),
// lista com estrela, novo/editar (título + texto com botões que INSEREM as tags no cursor + prévia com dados de exemplo) e
// excluir (soft). O tipo do modelo novo é o da aba aberta. Quem chama recarrega pelo `onMudou`.
type Valores = { titulo: string; conteudo: string; favorito: boolean };

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const BTN_TAG = "inline-flex items-center border border-verde/40 text-verde-3 font-body text-[11px] px-2 py-0.5 hover:bg-[rgba(16,185,129,.08)] transition-colors";
const ABA = "inline-flex h-7 items-center rounded-[9px] border px-3 text-[11.5px] font-semibold transition-colors";
const ABA_ATIVA = `${ABA} border-verde text-verde-3 bg-[rgba(16,185,129,.1)]`;
const ABA_INATIVA = `${ABA} border-linha-2 text-texto-2 hover:text-texto hover:border-verde/50`;

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  modelos: ModeloDocumento[];
  nomeNutricionista: string | null;
  /** aba aberta ao entrar (padrão: atestado) */
  tipoInicial?: TipoDocumento;
  onMudou: () => Promise<void> | void;
}

const contarTags = (tipo: TipoDocumento, conteudo: string | null | undefined): number => tagsDoTipo(tipo).filter((t) => (conteudo ?? "").includes(t.tag)).length;
const textoTags = (n: number): string => (n === 0 ? "sem tags" : n === 1 ? "1 tag" : `${n} tags`);

export default function ModelosDocumentoDialog({ open, onOpenChange, modelos, nomeNutricionista, tipoInicial, onMudou }: Props) {
  const { user } = useAuth();
  const [aba, setAba] = useState<TipoDocumento>(tipoInicial ?? "atestado");
  const [form, setForm] = useState<{ modelo: ModeloDocumento | null } | null>(null); // null = lista; {modelo:null} = novo
  const [previa, setPrevia] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ModeloDocumento | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [mudandoFav, setMudandoFav] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const ordenados = useMemo(() => modelosDoTipo(modelos, aba), [modelos, aba]);
  /** tipo do modelo em edição/criação (na criação = a aba aberta) */
  const tipoForm: TipoDocumento = (form?.modelo?.tipo as TipoDocumento | undefined) ?? aba;
  const tags = useMemo(() => tagsDoTipo(tipoForm), [tipoForm]);

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { isSubmitting } } = useForm<Valores>({
    defaultValues: { titulo: "", conteudo: "", favorito: false },
  });
  const conteudoAtual = watch("conteudo") ?? "";
  const tituloAtual = watch("titulo") ?? "";
  const exemplo = useMemo(() => dadosExemploDocumento(nomeNutricionista), [nomeNutricionista]);
  const { ref: refConteudo, ...regConteudo } = register("conteudo");

  useEffect(() => {
    if (erro && form && validarModeloDocumento(tipoForm, tituloAtual, conteudoAtual) === null) setErro(null); // o aviso some assim que ela resolve
  }, [erro, form, tipoForm, tituloAtual, conteudoAtual]);

  useEffect(() => {
    if (open) {
      setAba(tipoInicial ?? "atestado");
    } else {
      setForm(null);
      setPrevia(false);
      setErro(null);
    }
  }, [open, tipoInicial]);

  const abrirNovo = () => {
    reset({ titulo: "", conteudo: "", favorito: false });
    setErro(null);
    setPrevia(false);
    setForm({ modelo: null });
  };
  const abrirEdicao = (m: ModeloDocumento) => {
    reset({ titulo: m.titulo, conteudo: m.conteudo ?? "", favorito: m.favorito });
    setErro(null);
    setPrevia(false);
    setForm({ modelo: m });
  };

  /** Insere a tag onde está o cursor do textarea (ou no fim) e devolve o foco logo depois dela. */
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
    const msg = validarModeloDocumento(tipoForm, titulo, conteudo);
    if (msg) {
      setErro(msg);
      setPrevia(false);
      return;
    }
    setErro(null);
    try {
      if (form?.modelo) {
        await atualizarModeloDocumento(form.modelo.id, { titulo, conteudo, favorito: !!v.favorito });
        toast.success("Modelo atualizado");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        await criarModeloDocumento(user.id, { tipo: tipoForm, titulo, conteudo, favorito: !!v.favorito });
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

  const alternarFavorito = async (m: ModeloDocumento) => {
    setMudandoFav(m.id);
    try {
      await atualizarModeloDocumento(m.id, { favorito: !m.favorito });
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
      await excluirModeloDocumento(paraExcluir.id);
      toast.success("Modelo excluído");
      setParaExcluir(null);
      await onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o modelo");
    } finally {
      setExcluindo(false);
    }
  };

  const infoAba = infoTipo(aba);
  const infoForm = infoTipo(tipoForm);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-2xl max-h-[88vh] overflow-y-auto" data-modal-modelos-documento={form ? (form.modelo ? "editar" : "novo") : "lista"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto flex flex-wrap items-center gap-2">
            {form ? (form.modelo ? "Editar modelo" : "Novo modelo") : "Modelos de documento"}
            {form && (
              <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 border border-verde/50 text-verde-3" data-form-modelo-tipo={tipoForm}>
                {infoForm.rotulo}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="font-body text-xs">
            {form
              ? "Escreva o texto e clique nas tags pra inseri-las onde estiver o cursor — na emissão elas viram o nome, o CPF e a data do aluno."
              : "Os modelos são seus, separados por tipo: escolha um ao emitir o documento. A estrela marca os favoritos (aparecem primeiro). O documento já emitido não muda quando o modelo muda."}
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-modelo-documento>
            <Campo rotulo="Título">
              <input className={INPUT} maxLength={TITULO_DOCUMENTO_MAX} placeholder={`ex.: ${infoForm.rotulo} de consulta`} {...register("titulo")} data-campo-titulo-modelo-documento />
            </Campo>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-[11px] uppercase tracking-wider text-texto-2 font-body">Texto do {infoForm.rotulo.toLowerCase()}</label>
                <button type="button" className={BTN_MINI} onClick={() => setPrevia((p) => !p)} data-btn-preview-modelo-documento aria-pressed={previa}>
                  {previa ? <PenLine size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />} {previa ? "Escrever" : "Visualizar"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2" data-tags-modelo-documento>
                {tags.map((t) => (
                  <button key={t.tag} type="button" className={BTN_TAG} onClick={() => inserirTag(t.tag)} title={`${t.tag} → ex.: ${t.exemplo}`} data-btn-tag={t.tag}>
                    {t.rotulo}
                  </button>
                ))}
              </div>
              <textarea
                className={`${TEXTAREA_CONTEUDO}${previa ? " hidden" : ""}`}
                maxLength={TEXTO_DOCUMENTO_MAX}
                placeholder="ex.: Atesto, para os devidos fins, que *|NOME_PACIENTE|*…"
                {...regConteudo}
                ref={(el) => {
                  refConteudo(el);
                  areaRef.current = el;
                }}
                data-campo-conteudo-modelo-documento
              />
              {previa && (
                <div className="rounded-xl border border-linha-2 p-3 min-h-[240px] max-h-[50vh] overflow-y-auto text-sm font-body leading-relaxed whitespace-pre-wrap" data-preview-modelo-documento>
                  {aplicarTagsDocumento(conteudoAtual, exemplo) || <span className="text-texto-2">Sem texto ainda.</span>}
                </div>
              )}
              <p className="text-xs text-texto-2 font-body mt-1" data-tags-form={contarTags(tipoForm, conteudoAtual)}>
                {textoTags(contarTags(tipoForm, conteudoAtual))} no texto · a prévia usa dados de exemplo (Maria da Silva, CPF 123.456.789-09{tipoForm === "atestado" ? ", 2 dias, CID Z00.0" : ""})
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("favorito")} data-campo-favorito-modelo-documento /> Favorito
            </label>
            {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-modelo-documento>{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => { setForm(null); setErro(null); }} data-btn-cancelar-modelo-documento>Cancelar</button>
              <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-modelo-documento>{isSubmitting ? "Salvando..." : "Salvar modelo"}</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5" role="tablist" data-abas-tipo>
                {TIPOS_DOCUMENTO.map((t) => {
                  const n = modelos.filter((m) => m.tipo === t.tipo).length;
                  const ativa = t.tipo === aba;
                  return (
                    <button key={t.tipo} type="button" role="tab" aria-selected={ativa} className={ativa ? ABA_ATIVA : ABA_INATIVA} onClick={() => setAba(t.tipo)} data-aba-tipo={t.tipo} data-ativa={ativa ? "1" : "0"} data-aba-total={n}>
                      {t.plural} <span className="opacity-70">{n}</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" className={BTN_PRI} onClick={abrirNovo} data-btn-novo-modelo-documento><Plus size={12} aria-hidden="true" /> Novo modelo</button>
            </div>
            {ordenados.length === 0 && <p className="text-sm text-texto-2 font-body" data-modelos-documento-vazio>Nenhum modelo de {infoAba.rotulo.toLowerCase()} ainda.</p>}
            <ul className="divide-y divide-linha" data-lista-modelos-documento data-modelos-documento-total={ordenados.length} data-lista-tipo={aba}>
              {ordenados.map((m) => {
                const n = contarTags(aba, m.conteudo);
                return (
                  <li key={m.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2" data-modelo-documento={m.id} data-modelo-tipo={m.tipo} data-favorito={m.favorito ? "1" : "0"} data-tags={n}>
                    <div className="min-w-0 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void alternarFavorito(m)}
                        disabled={mudandoFav === m.id}
                        className="text-verde-3 disabled:opacity-40"
                        title={m.favorito ? "Tirar dos favoritos" : "Marcar como favorito"}
                        data-btn-favorito-documento
                      >
                        <Star size={16} className={m.favorito ? "fill-verde-3" : ""} aria-hidden="true" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body truncate" data-modelo-documento-titulo>{m.titulo}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body">{textoTags(n)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className={BTN_MINI} onClick={() => abrirEdicao(m)} data-btn-editar-modelo-documento><Pencil size={12} aria-hidden="true" /> Editar</button>
                      <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(m)} data-btn-excluir-modelo-documento><Trash2 size={12} aria-hidden="true" /> Excluir</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-modelos-documento>Fechar</button>
            </div>
          </div>
        )}

        <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
          <AlertDialogContent className="bg-tela border-linha-2">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este modelo?</AlertDialogTitle>
              <AlertDialogDescription className="font-body">
                {paraExcluir?.titulo}. Os documentos já emitidos com ele continuam iguais — só o modelo some da lista.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-modelo-documento>
                {excluindo ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
