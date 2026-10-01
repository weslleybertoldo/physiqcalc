// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/anamnese/AnamneseDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ListChecks, ArrowLeft, FileText, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { chaveDia, dataValida, formatarHora, horaValida } from "@/nutricao/editor/lib/agendaUtil";
import { atualizarAnamnese, criarAnamnese, type Anamnese, type ModeloAnamnese } from "@/nutricao/prontuario/lib/anamneses";
import {
  RESPOSTA_MAX, TEXTO_LIVRE_MAX, TITULO_MAX, ehModeloDoSistema, ehVazia, formParaRegistro, lerPerguntas, ordenarModelos, registroParaForm, tituloPadrao, type RegistroAnamnese,
  type FormAnamnese,
} from "@/nutricao/prontuario/lib/anamneseUtil";

// Modal da anamnese. Nova: passo 1 escolhe o modelo (favoritos primeiro) ou "em branco"; passo 2 é o formulário
// (título, data/hora, uma resposta por pergunta e o texto livre). Edição vai direto pro formulário com as perguntas
// gravadas na própria anamnese (cópia — o modelo pode ter mudado depois).
const schema = z.object({
  titulo: z.string().trim().min(1, "Dê um título").max(TITULO_MAX, "Título muito longo"),
  data: z.string().refine(dataValida, "Data inválida"),
  hora: z.string().refine(horaValida, "Hora inválida"),
  respostas: z.array(z.string().max(RESPOSTA_MAX, "Resposta muito longa")),
  textoLivre: z.string().max(TEXTO_LIVRE_MAX, "Texto muito longo"),
});
type Valores = z.infer<typeof schema>;

const agoraForm = () => ({ data: chaveDia(new Date()), hora: formatarHora(new Date()) });

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  modelos: ModeloAnamnese[];
  /** com anamnese = edição; sem = nova */
  anamnese?: Anamnese | null;
  onSalvo: (a: Anamnese, modo: "criada" | "editada") => void;
}

export default function AnamneseDialog({ open, onOpenChange, pacienteId, modelos, anamnese, onSalvo }: Props) {
  const { user } = useAuth();
  const editando = !!anamnese;
  const [escolha, setEscolha] = useState<{ modelo: ModeloAnamnese | null; perguntas: string[] } | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const ordenados = useMemo(() => ordenarModelos(modelos), [modelos]);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { titulo: "", ...agoraForm(), respostas: [], textoLivre: "" },
  });

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    if (anamnese) {
      // o tipo gerado diz Json; a leitura (lerConteudo) já tolera o formato antigo
      const f = registroParaForm(anamnese as unknown as RegistroAnamnese);
      setEscolha({ modelo: null, perguntas: f.perguntas });
      reset({ titulo: f.titulo, data: f.data, hora: f.hora, respostas: f.respostas, textoLivre: f.textoLivre });
    } else {
      setEscolha(null);
      reset({ titulo: "", ...agoraForm(), respostas: [], textoLivre: "" });
    }
  }, [open, anamnese, reset]);

  const escolher = (m: ModeloAnamnese | null) => {
    const perguntas = m ? lerPerguntas(m.perguntas) : [];
    setErroGeral(null);
    setEscolha({ modelo: m, perguntas });
    reset({ titulo: tituloPadrao(m?.titulo ?? null), ...agoraForm(), respostas: perguntas.map(() => ""), textoLivre: "" });
  };

  const onSubmit = async (v: Valores) => {
    if (!escolha) return;
    // montado campo a campo: o tsconfig do repo não tem strictNullChecks e o zod infere tudo como opcional
    const f: FormAnamnese = {
      titulo: v.titulo ?? "",
      data: v.data ?? "",
      hora: v.hora ?? "",
      perguntas: escolha.perguntas,
      respostas: (v.respostas ?? []).map((r) => r ?? ""),
      textoLivre: v.textoLivre ?? "",
    };
    const reg = formParaRegistro(f);
    if (ehVazia(reg.conteudo, reg.texto_livre)) {
      setErroGeral("Preencha pelo menos uma resposta ou o texto livre");
      return;
    }
    setErroGeral(null);
    try {
      if (anamnese) {
        onSalvo(await atualizarAnamnese(anamnese.id, reg), "editada");
        toast.success("Anamnese atualizada");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        onSalvo(await criarAnamnese(user.id, pacienteId, escolha.modelo?.id ?? null, reg), "criada");
        toast.success("Anamnese salva");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a anamnese");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-2xl max-h-[88vh] overflow-y-auto" data-modal-anamnese={editando ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">
            {editando ? "Editar anamnese" : escolha ? "Nova anamnese" : "Nova anamnese — escolha o modelo"}
          </DialogTitle>
          <DialogDescription className="font-body text-xs">
            {escolha ? "Responda o que fizer sentido; o resto pode ficar em branco." : "Os favoritos aparecem primeiro. Crie e edite modelos pelo botão \"Modelos\" da seção."}
          </DialogDescription>
        </DialogHeader>

        {!escolha ? (
          <div className="space-y-2" data-passo="modelo">
            {ordenados.map((m) => {
              const n = lerPerguntas(m.perguntas).length;
              const sistema = ehModeloDoSistema(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => escolher(m)}
                  className="w-full text-left border border-linha-2 px-3 py-2 hover:border-verde/50 transition-colors"
                  data-escolher-modelo={m.id}
                  data-modelo-origem={sistema ? "sistema" : "proprio"}
                >
                  <span className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider text-texto">
                    {sistema ? <ListChecks size={12} className="text-texto-2 shrink-0" aria-hidden="true" /> : m.favorito && <Star size={12} className="text-verde-3 fill-verde-3 shrink-0" />}
                    <span className="truncate">{m.titulo}</span>
                  </span>
                  <span className="block text-[11px] text-texto-2 font-body">{sistema ? "Do sistema · " : ""}{n} pergunta{n === 1 ? "" : "s"}</span>
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
              <span className="block text-[11px] text-texto-2 font-body">Só texto livre, sem perguntas</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-passo="formulario">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
              <Campo rotulo="Título" erro={errors.titulo?.message}>
                <input className={INPUT} maxLength={TITULO_MAX} {...register("titulo")} data-campo-titulo-anamnese />
              </Campo>
              <Campo rotulo="Data" erro={errors.data?.message}>
                <input type="date" className={INPUT} {...register("data")} data-campo-data-anamnese />
              </Campo>
              <Campo rotulo="Hora" erro={errors.hora?.message}>
                <input type="time" className={INPUT} {...register("hora")} data-campo-hora-anamnese />
              </Campo>
            </div>

            {escolha.perguntas.length > 0 && (
              <ol className="space-y-3" data-perguntas={escolha.perguntas.length}>
                {escolha.perguntas.map((p, i) => (
                  <li key={`${i}-${p}`}>
                    <label className="block text-xs text-texto font-body mb-1">
                      <span className="text-texto-2">{i + 1}.</span> {p}
                    </label>
                    <textarea className={TEXTAREA} rows={2} maxLength={RESPOSTA_MAX} {...register(`respostas.${i}` as const)} data-resposta={i} />
                    {errors.respostas?.[i]?.message && <p className="text-xs text-rosa-3 font-body mt-1" role="alert">{errors.respostas[i]?.message}</p>}
                  </li>
                ))}
              </ol>
            )}

            <Campo rotulo={escolha.perguntas.length ? "Texto livre / observações" : "Texto livre"} erro={errors.textoLivre?.message}>
              <textarea className={TEXTAREA} rows={escolha.perguntas.length ? 3 : 8} maxLength={TEXTO_LIVRE_MAX} {...register("textoLivre")} data-campo-texto-livre />
            </Campo>

            {erroGeral && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-anamnese>{erroGeral}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div>
                {!editando && (
                  <button type="button" className={BTN_SEC} onClick={() => setEscolha(null)} data-btn-trocar-modelo><ArrowLeft size={12} /> Trocar modelo</button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-anamnese>Cancelar</button>
                <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-anamnese>{isSubmitting ? "Salvando..." : "Salvar"}</button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
