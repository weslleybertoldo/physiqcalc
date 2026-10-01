// Physiq W17 — porta do PhysiqNutri (main ca9f66f, src/components/evolucao/FotoDialog.tsx) para o banco principal (Perfil do aluno ›
// Avaliação › Fotos): os imports e as classes do visual premium mudaram; os campos e a validação são os do site antigo.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, TEXTAREA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { formatarTamanho } from "@/nutricao/editor/lib/anexosUtil";
import { atualizarFoto, enviarFoto, type FotoEvolucao } from "./evolucao";
import {
  ACCEPT_FOTO, FOTO_TAMANHO_MAX_ROTULO, OBSERVACAO_FOTO_MAX, POSICOES, formDaFoto, formInicialFoto, hojeISO, validarFoto, validarImagem, type FormFoto, type Posicao,
} from "@/nutricao/editor/lib/evolucaoUtil";

const BTN_POSICAO = "h-9 rounded-xl border px-2 font-body text-[12.5px] font-semibold transition-colors";
const BTN_POSICAO_ON = "border-verde-3 bg-[rgba(16,185,129,.12)] text-verde-3";
const BTN_POSICAO_OFF = "border-linha-2 text-texto-2 hover:text-texto";

// Modal "Nova foto" / "Editar foto": imagem com prévia (só no novo — a imagem não troca; pra trocar, exclui e envia outra), posição
// em 4 botões, data (padrão hoje, nunca futura) e observação. Um slot vazio da grade abre o modal já com posição + data preenchidas.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  pacienteId: string;
  /** foto existente → modo editar */
  foto: FotoEvolucao | null;
  /** slot vazio da grade → posição e data sugeridas (modo novo); objeto MEMOIZADO pelo pai */
  inicial: { posicao?: Posicao; data?: string } | null;
  onSalva: (f: FotoEvolucao) => void;
}

export default function FotoDialog({ open, onOpenChange, nutricionistaId, pacienteId, foto, inicial, onSalva }: Props) {
  const editar = !!foto;
  const hoje = hojeISO();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [form, setForm] = useState<FormFoto>(() => formInicialFoto(hoje));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setArquivo(null);
    setForm(foto ? formDaFoto(foto) : formInicialFoto(hojeISO(), inicial?.posicao, inicial?.data));
  }, [open, foto, inicial]);

  // prévia por object URL, revogada quando o arquivo muda ou o modal fecha (o arquivo volta a null)
  useEffect(() => {
    if (!arquivo) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!f) return;
    const problema = validarImagem(f);
    if (problema) {
      setArquivo(null);
      setErro(problema);
      return;
    }
    setErro(null);
    setArquivo(f);
  };

  const campo = <K extends keyof FormFoto>(k: K, v: FormFoto[K]) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarFoto(form, hojeISO());
    if (problema) {
      setErro(problema);
      return;
    }
    if (!foto && !arquivo) {
      setErro("Escolha a imagem");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const salva = foto ? await atualizarFoto(foto.id, form) : await enviarFoto(nutricionistaId, pacienteId, arquivo as File, form);
      onSalva(salva);
      toast.success(foto ? "Foto atualizada" : "Foto enviada");
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a foto");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-lg max-h-[92vh] overflow-y-auto" data-modal-foto={editar ? "editar" : "novo"} data-enviando={enviando ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editar ? "Editar foto" : "Nova foto de evolução"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            {editar ? "Posição, data e observação. A imagem não muda — pra trocar, exclua e envie outra." : `JPG, PNG ou WebP até ${FOTO_TAMANHO_MAX_ROTULO}. Escolha a posição e o dia em que a foto foi tirada.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4" noValidate data-form-foto>
          {!editar && (
            <div className="space-y-1.5">
              <input ref={inputRef} type="file" accept={ACCEPT_FOTO} className="hidden" onChange={escolher} data-input-foto />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed p-3 transition-colors ${previa ? "border-verde-3/60" : "border-linha-2 hover:border-verde-3/60"}`}
                disabled={enviando}
                data-btn-escolher-foto
              >
                {previa ? (
                  <img src={previa} alt="Prévia da foto" className="max-h-64 w-auto object-contain" data-previa-foto />
                ) : (
                  <>
                    <ImagePlus className="h-6 w-6 text-texto-3" aria-hidden="true" />
                    <span className="font-body text-[13.5px] text-texto">Escolher imagem</span>
                    <span className="font-body text-[12px] text-texto-3">ou tire a foto agora pelo celular</span>
                  </>
                )}
              </button>
              {arquivo && (
                <p className="break-all font-body text-[12px] text-texto-3" data-arquivo-info>
                  {arquivo.name} · {formatarTamanho(arquivo.size)} ·{" "}
                  <button type="button" className="text-verde-3 underline underline-offset-2 hover:opacity-80" onClick={() => inputRef.current?.click()} data-btn-trocar-foto>
                    trocar
                  </button>
                </p>
              )}
            </div>
          )}

          <Campo rotulo="Posição">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="group" aria-label="Posição da foto">
              {POSICOES.map((p) => (
                <button
                  key={p.valor}
                  type="button"
                  aria-pressed={form.posicao === p.valor}
                  onClick={() => campo("posicao", p.valor)}
                  className={`${BTN_POSICAO} ${form.posicao === p.valor ? BTN_POSICAO_ON : BTN_POSICAO_OFF}`}
                  data-campo-posicao={p.valor}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
          </Campo>

          <Campo rotulo="Data da foto" dica="Padrão hoje · não pode ser futura">
            <input type="date" className={INPUT} value={form.data} max={hoje} onChange={(e) => campo("data", e.target.value)} data-campo-data-foto />
          </Campo>

          <Campo rotulo="Observação" dica={`${form.observacao.length}/${OBSERVACAO_FOTO_MAX} · opcional`}>
            <textarea
              className={TEXTAREA}
              value={form.observacao}
              maxLength={OBSERVACAO_FOTO_MAX}
              onChange={(e) => campo("observacao", e.target.value)}
              placeholder="Ex.: início do acompanhamento"
              data-campo-observacao-foto
            />
          </Campo>

          {erro && <p role="alert" className="font-body text-[12.5px] text-rosa-3" data-erro-foto>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} disabled={enviando} data-btn-cancelar-foto>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={enviando || (!editar && !arquivo)} data-btn-salvar-foto>
              {enviando ? "Enviando..." : editar ? "Salvar" : "Enviar foto"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
