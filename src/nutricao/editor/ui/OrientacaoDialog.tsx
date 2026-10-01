// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/orientacoes/OrientacaoDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Eye, FileText, PenLine, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT } from "@/nutricao/editor/ui/estilos";
import Blocos from "@/nutricao/editor/ui/Blocos";
import { DICA_MARKDOWN, TEXTAREA_CONTEUDO } from "@/nutricao/editor/ui/ModelosDialog";
import { atualizarOrientacao, criarOrientacao, salvarComoModelo, type ModeloOrientacao, type Orientacao } from "@/nutricao/editor/lib/orientacoes";
import {
  CONTEUDO_MAX, TITULO_MAX, ehVazio, formParaRegistro, ordenarModelos, registroParaForm, textoTopicos, tituloPadrao, topicosDoTexto,
  type FormOrientacao,
} from "@/nutricao/editor/lib/orientacoesUtil";

// Modal da orientação. Nova: passo 1 escolhe o modelo (favoritos primeiro) ou "em branco"; passo 2 é o formulário
// (título + conteúdo em markdown simples com abas Escrever/Visualizar + "salvar também como modelo"). Edição vai
// direto pro formulário com o texto gravado na própria orientação (cópia — o modelo pode ter mudado depois).
const schema = z.object({
  titulo: z.string().trim().min(1, "Dê um título").max(TITULO_MAX, "Título muito longo"),
  conteudo: z.string().max(CONTEUDO_MAX, "Texto muito longo"),
  salvarComoModelo: z.boolean(),
});
type Valores = z.infer<typeof schema>;

const ABA = "inline-flex items-center gap-1 border border-linha-2 text-texto-2 font-semibold text-[10px] uppercase tracking-wider px-2.5 py-1 hover:text-texto transition-colors";
const ABA_ATIVA = "inline-flex items-center gap-1 border border-verde bg-[rgba(16,185,129,.1)] text-verde-3 font-semibold text-[10px] uppercase tracking-wider px-2.5 py-1";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  modelos: ModeloOrientacao[];
  /** com orientação = edição; sem = nova */
  orientacao?: Orientacao | null;
  onSalvo: (o: Orientacao, modo: "criada" | "editada") => void;
  /** chamado quando "salvar também como modelo" criou um modelo */
  onModeloCriado?: () => Promise<void> | void;
}

export default function OrientacaoDialog({ open, onOpenChange, pacienteId, modelos, orientacao, onSalvo, onModeloCriado }: Props) {
  const { user } = useAuth();
  const editando = !!orientacao;
  const [escolha, setEscolha] = useState<{ modelo: ModeloOrientacao | null } | null>(null);
  const [aba, setAba] = useState<"escrever" | "visualizar">("escrever");
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const ordenados = useMemo(() => ordenarModelos(modelos), [modelos]);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { titulo: "", conteudo: "", salvarComoModelo: false },
  });
  const conteudoAtual = watch("conteudo") ?? "";
  const topicos = topicosDoTexto(conteudoAtual);

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    setAba("escrever");
    if (orientacao) {
      const f = registroParaForm(orientacao);
      setEscolha({ modelo: null });
      reset({ titulo: f.titulo, conteudo: f.conteudo, salvarComoModelo: false });
    } else {
      setEscolha(null);
      reset({ titulo: "", conteudo: "", salvarComoModelo: false });
    }
  }, [open, orientacao, reset]);

  const escolher = (m: ModeloOrientacao | null) => {
    setErroGeral(null);
    setAba("escrever");
    setEscolha({ modelo: m });
    reset({ titulo: tituloPadrao(), conteudo: m?.conteudo ?? "", salvarComoModelo: false });
  };

  const onSubmit = async (v: Valores) => {
    if (!escolha) return;
    // montado campo a campo: o tsconfig do repo não tem strictNullChecks e o zod infere tudo como opcional
    const f: FormOrientacao = { titulo: v.titulo ?? "", conteudo: v.conteudo ?? "", salvarComoModelo: !!v.salvarComoModelo };
    const reg = formParaRegistro(f);
    if (ehVazio(reg.conteudo)) {
      setErroGeral("Escreva o conteúdo da orientação");
      setAba("escrever");
      return;
    }
    setErroGeral(null);
    try {
      if (!user) throw new Error("Sessão expirada — entre de novo");
      if (orientacao) {
        onSalvo(await atualizarOrientacao(orientacao.id, reg), "editada");
        toast.success("Orientação atualizada");
      } else {
        onSalvo(await criarOrientacao(user.id, pacienteId, escolha.modelo?.id ?? null, reg), "criada");
        toast.success("Orientação salva");
      }
      if (f.salvarComoModelo) {
        try {
          await salvarComoModelo(user.id, reg);
          await onModeloCriado?.();
          toast.success("Modelo salvo");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "A orientação foi salva, mas o modelo não");
        }
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a orientação");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-2xl max-h-[88vh] overflow-y-auto" data-modal-orientacao={editando ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">
            {editando ? "Editar orientação" : escolha ? "Nova orientação" : "Nova orientação — escolha o modelo"}
          </DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {escolha ? DICA_MARKDOWN : "Os favoritos aparecem primeiro. Crie e edite modelos pelo botão \"Modelos\" da seção."}
          </DialogDescription>
        </DialogHeader>

        {!escolha ? (
          <div className="space-y-2" data-passo="modelo">
            {ordenados.map((m) => {
              const n = topicosDoTexto(m.conteudo);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => escolher(m)}
                  className="w-full text-left border border-linha-2 px-3 py-2 hover:border-verde/50 transition-colors"
                  data-escolher-modelo={m.id}
                >
                  <span className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider text-texto">
                    {m.favorito && <Star size={12} className="text-verde-3 fill-verde-3 shrink-0" />}
                    <span className="truncate">{m.titulo}</span>
                  </span>
                  <span className="block text-[11px] text-texto-2 font-body">{textoTopicos(n)}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => escolher(null)}
              className="w-full text-left border border-dashed border-linha-2 px-3 py-2 hover:border-verde/50 transition-colors"
              data-escolher-modelo="branco"
            >
              <span className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider text-texto"><FileText size={12} className="shrink-0" /> Em branco</span>
              <span className="block text-[11px] text-texto-2 font-body">Escreva a orientação do zero</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-passo="formulario">
            <Campo rotulo="Título" erro={errors.titulo?.message}>
              <input className={INPUT} maxLength={TITULO_MAX} {...register("titulo")} data-campo-titulo-orientacao />
            </Campo>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-[11px] uppercase tracking-wider text-texto-2 font-body">Conteúdo</label>
                <div className="flex items-center gap-1" role="tablist" data-abas-conteudo={aba}>
                  <button type="button" role="tab" aria-selected={aba === "escrever"} onClick={() => setAba("escrever")} className={aba === "escrever" ? ABA_ATIVA : ABA} data-btn-aba-escrever>
                    <PenLine size={12} /> Escrever
                  </button>
                  <button type="button" role="tab" aria-selected={aba === "visualizar"} onClick={() => setAba("visualizar")} className={aba === "visualizar" ? ABA_ATIVA : ABA} data-btn-aba-visualizar>
                    <Eye size={12} /> Visualizar
                  </button>
                </div>
              </div>
              <textarea className={`${TEXTAREA_CONTEUDO}${aba === "visualizar" ? " hidden" : ""}`} maxLength={CONTEUDO_MAX} {...register("conteudo")} data-campo-conteudo-orientacao />
              {aba === "visualizar" && (
                <div className="border border-linha-2 p-3 min-h-[240px] max-h-[50vh] overflow-y-auto" data-preview-orientacao>
                  <Blocos conteudo={conteudoAtual} compacto />
                </div>
              )}
              <p className="text-xs text-texto-2 font-body mt-1" data-topicos-form={topicos}>{textoTopicos(topicos)}</p>
              {errors.conteudo?.message && <p className="text-xs text-rosa-3 font-body mt-1" role="alert">{errors.conteudo.message}</p>}
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" {...register("salvarComoModelo")} data-campo-salvar-modelo /> Salvar também como modelo
            </label>

            {erroGeral && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-orientacao>{erroGeral}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div>
                {!editando && (
                  <button type="button" className={BTN_SEC} onClick={() => setEscolha(null)} data-btn-trocar-modelo><ArrowLeft size={12} /> Trocar modelo</button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-orientacao>Cancelar</button>
                <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-orientacao>{isSubmitting ? "Salvando..." : "Salvar"}</button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
