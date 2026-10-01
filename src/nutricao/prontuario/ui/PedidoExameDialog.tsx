// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/exames/PedidoExameDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ClipboardList, Plus, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { atualizarPedido, criarPedido, type ExameCatalogo, type PedidoExame } from "@/nutricao/prontuario/lib/exames";
import {
  NOME_EXAME_MAX, OBSERVACAO_EXAME_MAX, acrescentarExame, alternarExame, formInicialPedido, formParaRegistroPedido, ordenarCatalogo, pedidoParaForm, temExame, textoContagemExames,
  tirarExame, validarPedido, type FormPedido,
} from "@/nutricao/prontuario/lib/examesUtil";

// Modal do pedido de exames do paciente. Data (hoje), exames do catálogo como chips liga/desliga (favoritos primeiro) + "Outro exame"
// (nome livre entra na lista), lista dos escolhidos com "tirar", contagem, observação. EDIÇÃO: os mesmos campos com o pedido
// carregado. O pedido guarda os NOMES (cópia do catálogo na hora) — mudar o catálogo depois não mexe nele.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  catalogo: ExameCatalogo[];
  /** pedido existente = modo edição */
  pedido?: PedidoExame | null;
  onSalvo: (p: PedidoExame, modo: "criado" | "editado") => void;
}

const CHIP = "pq-chip pq-chip-g";
const CHIP_OFF = `${CHIP} border-linha-2 text-texto-2 hover:text-texto hover:border-verde/50`;
const CHIP_ON = `${CHIP} border-verde bg-verde text-[#04150F]`;
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";

// montado campo a campo: o tsconfig do repo não tem strictNullChecks e o RHF pode devolver campos indefinidos
const montarForm = (v: Partial<FormPedido>): FormPedido => ({ data: v.data ?? "", exames: Array.isArray(v.exames) ? v.exames : [], observacao: v.observacao ?? "" });

export default function PedidoExameDialog({ open, onOpenChange, pacienteId, catalogo, pedido, onSalvo }: Props) {
  const { user } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [outro, setOutro] = useState("");
  const abriuRef = useRef(false);
  const edicao = !!pedido;
  const ordenados = useMemo(() => ordenarCatalogo(catalogo), [catalogo]);

  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<FormPedido>({ defaultValues: formInicialPedido() });
  const v = montarForm(watch());
  const examesChave = JSON.stringify(v.exames);

  // reinicia SÓ ao abrir (o catálogo pode mudar com o modal aberto sem apagar o que ela marcou)
  useEffect(() => {
    if (open && !abriuRef.current) {
      setErro(null);
      setOutro("");
      reset(pedido ? pedidoParaForm(pedido) : formInicialPedido());
    }
    abriuRef.current = open;
  }, [open, pedido, reset]);

  useEffect(() => {
    if (erro && validarPedido(v.data, v.exames, v.observacao) === null) setErro(null); // o aviso some assim que ela resolve
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erro, v.data, examesChave, v.observacao]);

  const alternar = (nome: string) => setValue("exames", alternarExame(v.exames, nome), { shouldDirty: true });
  const tirar = (nome: string) => setValue("exames", tirarExame(v.exames, nome), { shouldDirty: true });
  const adicionarOutro = () => {
    const nome = outro.trim();
    if (!nome) return;
    setValue("exames", acrescentarExame(v.exames, nome), { shouldDirty: true });
    setOutro("");
  };

  const onSubmit = async (valores: FormPedido) => {
    const f = montarForm(valores);
    const msg = validarPedido(f.data, f.exames, f.observacao);
    if (msg) return setErro(msg);
    setErro(null);
    const reg = formParaRegistroPedido(f);
    try {
      if (!user) throw new Error("Sessão expirada — entre de novo");
      if (pedido) {
        onSalvo(await atualizarPedido(pedido.id, reg), "editado");
        toast.success("Pedido atualizado");
      } else {
        onSalvo(await criarPedido(user.id, pacienteId, reg), "criado");
        toast.success(`Pedido com ${textoContagemExames(reg.exames.length)} registrado`);
      }
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível salvar o pedido";
      setErro(m);
      toast.error(m);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-2xl max-h-[92vh] overflow-y-auto" data-modal-pedido={edicao ? "editar" : "novo"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-verde-3" aria-hidden="true" /> {edicao ? "Editar pedido de exames" : "Novo pedido de exames"}
          </DialogTitle>
          <DialogDescription className="font-body text-xs">
            Marque os exames do seu catálogo (a estrela marca os favoritos) ou escreva outro. O pedido guarda os nomes na hora — mudar o catálogo depois não mexe nele.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-pedido>
          <Campo rotulo="Data do pedido *">
            <input type="date" className={INPUT} {...register("data")} data-campo-data-pedido />
          </Campo>

          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body">Exames do catálogo</p>
            {ordenados.length === 0 && <p className="text-xs text-texto-2 font-body" data-catalogo-vazio-pedido>Seu catálogo está vazio — escreva o exame abaixo.</p>}
            <div className="flex flex-wrap gap-1.5" data-chips-exames>
              {ordenados.map((c) => {
                const ligado = temExame(v.exames, c.nome);
                return (
                  <button type="button" key={c.id} className={ligado ? CHIP_ON : CHIP_OFF} aria-pressed={ligado} onClick={() => alternar(c.nome)} title={c.unidade ? `${c.nome} (${c.unidade})` : c.nome} data-exame-toggle={c.nome}>
                    {c.favorito ? "★ " : ""}{c.nome}
                  </button>
                );
              })}
            </div>
          </div>

          <Campo rotulo="Outro exame" dica="Escreva o nome e clique em adicionar (ou Enter)">
            <div className="flex items-end gap-2">
              <input
                className={INPUT}
                maxLength={NOME_EXAME_MAX}
                placeholder="ex.: Cortisol"
                value={outro}
                onChange={(e) => setOutro(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarOutro();
                  }
                }}
                data-campo-outro-exame
              />
              <button type="button" className={BTN_MINI} onClick={adicionarOutro} disabled={!outro.trim()} data-btn-adicionar-outro>
                <Plus size={12} aria-hidden="true" /> Adicionar
              </button>
            </div>
          </Campo>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body" data-contagem-escolhidos={v.exames.length}>
              Escolhidos: {textoContagemExames(v.exames.length)}
            </p>
            {v.exames.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" data-lista-escolhidos>
                {v.exames.map((nome) => (
                  <li key={nome} className="inline-flex items-center gap-1 border border-verde/40 bg-[rgba(16,185,129,.06)] text-texto font-body text-xs px-2 py-1" data-exame-escolhido={nome}>
                    {nome}
                    <button type="button" className="text-texto-2 hover:text-rosa-3" onClick={() => tirar(nome)} title={`Tirar ${nome}`} aria-label={`Tirar ${nome}`} data-btn-tirar-exame>
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Campo rotulo="Observações (opcional)">
            <textarea className={TEXTAREA} maxLength={OBSERVACAO_EXAME_MAX} rows={2} placeholder="ex.: jejum de 12 h; trazer o resultado na próxima consulta" {...register("observacao")} data-campo-observacao-pedido />
          </Campo>

          {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-pedido>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-pedido>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-pedido>
              <Save size={12} aria-hidden="true" /> {isSubmitting ? "Salvando..." : edicao ? "Salvar" : "Registrar pedido"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
