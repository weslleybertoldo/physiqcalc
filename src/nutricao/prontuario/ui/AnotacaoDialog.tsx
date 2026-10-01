// Physiq W18 — "Nova anotação" / "Editar anotação" do prontuário (N-43, P4). Vem do modal "novo registro" do Prontuário do site
// antigo do Nutri (src/components/prontuario/RegistroDialog.tsx, main ca9f66f): data e hora começam em "agora", o texto é markdown
// simples com Escrever/Visualizar e não pode ficar vazio. Novo: a VISIBILIDADE — "Só nutricionistas" (padrão de quem é nutri) ou
// "Equipe" (o personal só escreve esta); o papel com que a anotação é assinada sai das regras de src/nutricao/prontuario/lib/acesso.ts.
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, Lock, PenLine, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { dataValida, horaValida } from "@/nutricao/editor/lib/agendaUtil";
import { TEXTO_MAX, formVazio, registroParaForm, textoVazio } from "@/nutricao/editor/lib/prontuarioUtil";
import Blocos from "@/nutricao/editor/ui/Blocos";
import { DICA_MARKDOWN } from "@/nutricao/editor/ui/ModelosDialog";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { ROTULO_VISIBILIDADE, ajudaVisibilidade, type PapelAutor, type Visibilidade } from "@/nutricao/prontuario/lib/acesso";
import { atualizarAnotacao, criarAnotacao, type Anotacao, type FormAnotacao } from "@/nutricao/prontuario/lib/anotacoes";
import { useAuth } from "./contexto";

const schema = z.object({
  data: z.string().refine(dataValida, "Data inválida"),
  hora: z.string().refine(horaValida, "Hora inválida"),
  texto: z.string().max(TEXTO_MAX, "Texto muito longo"),
});
type Valores = z.infer<typeof schema>;

const TEXTAREA =
  "min-h-[220px] w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 py-2.5 font-body text-[13.5px] leading-relaxed text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-verde-3";
const ABA = "inline-flex h-7 items-center gap-1 rounded-[9px] border px-2.5 text-[11.5px] font-semibold transition-colors";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  /** com anotação = edição; sem = nova */
  anotacao?: Anotacao | null;
  /** as visibilidades que a pessoa pode dar (a 1ª é o padrão) */
  visibilidades: Visibilidade[];
  /** o papel com que a anotação é assinada, pela visibilidade escolhida */
  papel: (v: Visibilidade) => PapelAutor;
  onSalvo: () => void;
}

export default function AnotacaoDialog({ open, onOpenChange, pacienteId, anotacao, visibilidades, papel, onSalvo }: Props) {
  const { user } = useAuth();
  const editando = !!anotacao;
  const [aba, setAba] = useState<"escrever" | "visualizar">("escrever");
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [visibilidade, setVisibilidade] = useState<Visibilidade>(visibilidades[0] ?? "equipe");

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: formVazio(),
  });
  const textoAtual = watch("texto") ?? "";

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    setAba("escrever");
    reset(anotacao ? registroParaForm(anotacao) : formVazio());
    const inicial = anotacao?.visibilidade ?? visibilidades[0] ?? "equipe";
    setVisibilidade(visibilidades.includes(inicial) ? inicial : visibilidades[0] ?? "equipe");
  }, [open, anotacao, reset, visibilidades]);

  useEffect(() => {
    if (erroGeral && !textoVazio(textoAtual)) setErroGeral(null);
  }, [textoAtual, erroGeral]);

  const onSubmit = async (v: Valores) => {
    const f: FormAnotacao = { data: v.data ?? "", hora: v.hora ?? "", texto: v.texto ?? "", visibilidade };
    if (textoVazio(f.texto)) {
      setErroGeral("Escreva o texto da anotação");
      setAba("escrever");
      return;
    }
    setErroGeral(null);
    try {
      if (anotacao) {
        await atualizarAnotacao(anotacao.id, papel(visibilidade), f);
        toast.success("Anotação atualizada");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        await criarAnotacao(user.id, pacienteId, papel(visibilidade), f);
        toast.success("Anotação salva no prontuário");
      }
      onSalvo();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a anotação");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "max-h-[88vh] overflow-y-auto sm:max-w-2xl")} data-modal-anotacao={editando ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editando ? "Editar anotação" : "Nova anotação"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>Data, hora e o texto da anotação. {DICA_MARKDOWN}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-anotacao>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data" erro={errors.data?.message}>
              <input type="date" className={INPUT} {...register("data")} data-campo-data-anotacao />
            </Campo>
            <Campo rotulo="Hora" erro={errors.hora?.message}>
              <input type="time" className={INPUT} {...register("hora")} data-campo-hora-anotacao />
            </Campo>
          </div>

          <div data-campo-visibilidade={visibilidade}>
            <p className="mb-1.5 font-body text-[12px] font-semibold text-texto-2">Quem lê</p>
            {visibilidades.length > 1 ? (
              <div role="radiogroup" aria-label="Quem lê" className="inline-flex rounded-xl border border-linha bg-superficie p-[3px]">
                {visibilidades.map((v) => {
                  const ativo = v === visibilidade;
                  const Icone = v === "equipe" ? Users : Lock;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => setVisibilidade(v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                        ativo ? "text-[var(--p-botao-w-texto)]" : "text-texto-2 hover:text-texto",
                      )}
                      style={ativo ? { background: "var(--p-botao-w-fundo)" } : undefined}
                      data-opcao-visibilidade={v}
                    >
                      <Icone aria-hidden className="h-3.5 w-3.5" /> {ROTULO_VISIBILIDADE[v]}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-linha bg-superficie px-3 py-1.5 text-[12.5px] font-semibold text-texto" data-visibilidade-fixa>
                <Users aria-hidden className="h-3.5 w-3.5 text-violeta-3" /> {ROTULO_VISIBILIDADE[visibilidade]}
              </span>
            )}
            <p className="mt-1.5 font-body text-[11.5px] text-texto-3" data-ajuda-visibilidade>{ajudaVisibilidade(visibilidade)}</p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="font-body text-[12px] font-semibold text-texto-2">Texto</label>
              <div className="flex items-center gap-1" role="tablist" data-abas-texto={aba}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={aba === "escrever"}
                  onClick={() => setAba("escrever")}
                  className={cn(ABA, aba === "escrever" ? "border-verde/40 bg-[rgba(16,185,129,.1)] text-verde-3" : "border-linha-2 bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto")}
                  data-btn-aba-escrever
                >
                  <PenLine size={12} /> Escrever
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={aba === "visualizar"}
                  onClick={() => setAba("visualizar")}
                  className={cn(ABA, aba === "visualizar" ? "border-verde/40 bg-[rgba(16,185,129,.1)] text-verde-3" : "border-linha-2 bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto")}
                  data-btn-aba-visualizar
                >
                  <Eye size={12} /> Visualizar
                </button>
              </div>
            </div>
            <textarea className={cn(TEXTAREA, aba === "visualizar" && "hidden")} maxLength={TEXTO_MAX} placeholder="O que aconteceu, o que mudou, o que combinar…" {...register("texto")} data-campo-texto-anotacao />
            {aba === "visualizar" && (
              <div className="max-h-[50vh] min-h-[220px] overflow-y-auto rounded-xl border border-linha-2 p-3" data-preview-anotacao>
                <Blocos conteudo={textoAtual} compacto />
              </div>
            )}
            {errors.texto?.message && <p className="mt-1 font-body text-xs text-rosa-3" role="alert">{errors.texto.message}</p>}
          </div>

          {erroGeral && <p role="alert" className="font-body text-xs text-rosa-3" data-erro-anotacao>{erroGeral}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-anotacao>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-anotacao>
              {isSubmitting ? "Salvando..." : editando ? "Salvar" : "Registrar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
