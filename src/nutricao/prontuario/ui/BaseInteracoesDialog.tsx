// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/farmaco/BaseInteracoesDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, INPUT, SELECT } from "@/nutricao/editor/ui/estilos";
import BadgeGravidade from "@/nutricao/prontuario/ui/BadgeGravidade";
import InteracaoDialog from "@/nutricao/prontuario/ui/InteracaoDialog";
import { duplicarInteracao, excluirInteracao, type Interacao } from "@/nutricao/prontuario/lib/farmaco";
import { GRAVIDADES, filtrarBase, ordenarBase, origemDe, textoBaseInteracao, textoContagemBase, type FiltroOrigem } from "@/nutricao/prontuario/lib/farmacoUtil";

// 'Base de interações' — as do SISTEMA (só leitura; 'Duplicar' cria uma cópia sua já aberta pra editar) + as PRÓPRIAS (Editar /
// Excluir soft em AlertDialog). Busca sem acento em medicamento/sinônimos/nutriente/classe + filtros de gravidade e origem
// (todas / sistema / minhas). 'Nova interação' abre o InteracaoDialog por cima. Quem chama recarrega pelo `onMudou`.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  /** base viva (vem MEMOIZADA do pai) */
  base: Interacao[];
  onMudou: () => Promise<void> | void;
}

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const CHIP = "pq-chip pq-chip-g";

export default function BaseInteracoesDialog({ open, onOpenChange, nutricionistaId, base, onMudou }: Props) {
  const [busca, setBusca] = useState("");
  const [gravidade, setGravidade] = useState("");
  const [origem, setOrigem] = useState<FiltroOrigem>("todas");
  const [interacaoDialog, setInteracaoDialog] = useState<{ aberto: boolean; interacao: Interacao | null }>({ aberto: false, interacao: null });
  const [paraExcluir, setParaExcluir] = useState<Interacao | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusca("");
      setGravidade("");
      setOrigem("todas");
      setParaExcluir(null);
    }
  }, [open]);

  const lista = useMemo(() => filtrarBase(ordenarBase(base), busca, gravidade, origem), [base, busca, gravidade, origem]);
  const proprias = useMemo(() => base.filter((i) => !!i.nutricionista_id).length, [base]);

  const duplicar = async (i: Interacao) => {
    setOcupado(i.id);
    try {
      const copia = await duplicarInteracao(nutricionistaId, i);
      toast.success("Interação duplicada", { description: "A cópia é sua — ajuste o que quiser." });
      await onMudou();
      setInteracaoDialog({ aberto: true, interacao: copia });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível duplicar a interação");
    } finally {
      setOcupado(null);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    setOcupado(paraExcluir.id);
    try {
      await excluirInteracao(paraExcluir.id);
      toast.success("Interação excluída");
      setParaExcluir(null);
      await onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a interação");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-tela border-linha-2 sm:max-w-3xl max-h-[88vh] overflow-y-auto"
        data-modal-base
        data-base-total={base.length}
        data-base-proprias={proprias}
        data-base-filtradas={lista.length}
      >
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Base de interações</DialogTitle>
          <DialogDescription className="font-body text-xs">
            As do sistema valem pra todo mundo e não mudam (duplique pra ter a sua versão). As suas valem pra todos os seus pacientes. O cruzamento usa o nome genérico e os sinônimos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input className={INPUT} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por medicamento, marca, nutriente ou classe" data-campo-busca-base />
            <select className={`${SELECT} sm:max-w-[10rem]`} value={gravidade} onChange={(e) => setGravidade(e.target.value)} aria-label="Gravidade" data-campo-filtro-gravidade>
              <option value="">Toda gravidade</option>
              {GRAVIDADES.map((g) => (
                <option key={g.valor} value={g.valor}>{g.rotulo}</option>
              ))}
            </select>
            <select className={`${SELECT} sm:max-w-[9rem]`} value={origem} onChange={(e) => setOrigem(e.target.value as FiltroOrigem)} aria-label="Origem" data-campo-filtro-origem>
              <option value="todas">Todas</option>
              <option value="sistema">Do sistema</option>
              <option value="propria">Minhas</option>
            </select>
            <button type="button" className={`${BTN_PRI} shrink-0`} onClick={() => setInteracaoDialog({ aberto: true, interacao: null })} data-btn-nova-interacao>
              <Plus size={12} aria-hidden="true" /> Nova interação
            </button>
          </div>
          <p className="text-[11px] text-texto-2 font-body" data-base-contagem-texto>
            {textoContagemBase(base.length)} · {proprias} {proprias === 1 ? "minha" : "minhas"}{busca || gravidade || origem !== "todas" ? ` · ${lista.length} no filtro` : ""}
          </p>
          {lista.length === 0 ? (
            <p className="text-sm text-texto-2 font-body" data-base-vazia>
              {origem === "propria" && !busca && !gravidade ? "Você ainda não tem interações próprias — duplique uma do sistema ou crie a primeira." : "Nenhuma interação com esse filtro."}
            </p>
          ) : (
            <ul className="divide-y divide-linha" data-lista-base>
              {lista.map((i) => {
                const propria = origemDe(i) === "propria";
                return (
                  <li key={i.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2" data-interacao-base={i.id} data-origem={propria ? "propria" : "sistema"} data-gravidade={i.gravidade}>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm text-texto font-body flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold" data-base-texto>{textoBaseInteracao(i)}</span>
                        <BadgeGravidade gravidade={i.gravidade} />
                        <span className={`${CHIP} ${propria ? "border-verde/40 text-verde-3" : "border-linha-2 text-texto-2"}`} data-base-origem-chip>{propria ? "minha" : "sistema"}</span>
                        {i.classe && <span className={`${CHIP} border-linha-2 text-texto-2`}>{i.classe}</span>}
                      </p>
                      <p className="text-xs text-texto-2 font-body" data-base-efeito>{i.efeito}</p>
                      <p className="text-xs text-texto font-body" data-base-conduta>{i.conduta}</p>
                      {i.fonte && <p className="text-[11px] text-texto-3 font-body italic" data-base-fonte>Fonte: {i.fonte}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {propria ? (
                        <>
                          <button type="button" className={BTN_MINI} onClick={() => setInteracaoDialog({ aberto: true, interacao: i })} disabled={ocupado === i.id} data-btn-editar-interacao>
                            <Pencil size={12} aria-hidden="true" /> Editar
                          </button>
                          <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(i)} disabled={ocupado === i.id} data-btn-excluir-interacao>
                            <Trash2 size={12} aria-hidden="true" /> Excluir
                          </button>
                        </>
                      ) : (
                        <button type="button" className={BTN_MINI} onClick={() => void duplicar(i)} disabled={ocupado === i.id} data-btn-duplicar-interacao>
                          <Copy size={12} aria-hidden="true" /> {ocupado === i.id ? "Duplicando..." : "Duplicar"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-base>Fechar</button>
          </div>
        </div>

        <InteracaoDialog
          open={interacaoDialog.aberto}
          onOpenChange={(aberto) => setInteracaoDialog((m) => ({ ...m, aberto }))}
          nutricionistaId={nutricionistaId}
          interacao={interacaoDialog.interacao}
          onSalvo={() => void onMudou()}
        />

        <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
          <AlertDialogContent className="bg-tela border-linha-2">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta interação?</AlertDialogTitle>
              <AlertDialogDescription className="font-body">
                <span className="text-texto">{paraExcluir ? textoBaseInteracao(paraExcluir) : ""}</span> sai da sua base e vai pra lixeira. As análises já feitas mantêm a cópia.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={!!ocupado} data-btn-confirmar-excluir-interacao>
                {ocupado ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
