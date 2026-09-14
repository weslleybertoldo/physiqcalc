import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  MP_VIRTUAL_ID, NENHUM_ATIVO, aplicarOtimista, comLinhaSalva, comMpVirtual, descricaoSwitch, detalheRecebimento, ordenarRecebimentos,
  tituloRecebimento, type Recebimento,
} from "@/lib/recebimentos";
import RecebimentoPixDialog from "@/components/admin/RecebimentoPixDialog";

interface Props { professorId: string; ehMaster: boolean }

const BTN_PRI = "inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50";
const BTN_SEC = "inline-flex items-center gap-1.5 border border-primary/40 text-primary font-heading text-[10px] uppercase tracking-wider px-2.5 py-1 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50";
const BTN_DANGER = "inline-flex items-center gap-1.5 border border-destructive/40 text-destructive font-heading text-[10px] uppercase tracking-wider px-2.5 py-1 hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- physiq_recebimentos e a RPC ficam fora dos tipos gerados
const db = supabase as any;
const tabela = () => db.from("physiq_recebimentos");

/**
 * Lista de recebimentos do professor (pedido 13/09/2026): "Integração com Mercado Pago" (só master) + chaves Pix criadas
 * pelo botão Adicionar; cada item tem o switch ligar/desligar e SÓ 1 fica ligado. A tela responde na hora (otimista) e
 * "ligar" é 1 chamada só (RPC physiq_recebimentos_ativar); o banco espelha o ativo em physiq_professores/physiq_integracoes
 * (trigger), então a tela Pagamentos do aluno não muda.
 */
export default function RecebimentosLista({ professorId, ehMaster }: Props) {
  const [rows, setRows] = useState<Recebimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [otimista, setOtimista] = useState<{ id: string; ativo: boolean } | null>(null);
  const [dialogo, setDialogo] = useState<{ aberto: boolean; item: Recebimento | null }>({ aberto: false, item: null });
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await tabela().select("*").eq("professor_id", professorId).order("criado_em");
    if (error) {
      console.error("[Recebimentos] carregar:", error);
      setErro("Erro ao carregar seus recebimentos.");
      setLoading(false);
      return;
    }
    setRows(ordenarRecebimentos((data || []) as Recebimento[]));
    setErro(null);
    setLoading(false);
  }, [professorId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const itens = useMemo(() => aplicarOtimista(comMpVirtual(rows, ehMaster, professorId), otimista), [rows, ehMaster, professorId, otimista]);
  const algumAtivo = itens.some((r) => r.ativo);

  const alternar = async (r: Recebimento, ligar: boolean) => {
    if (r.id === MP_VIRTUAL_ID && !ligar) return;
    const titulo = tituloRecebimento(r);
    setOtimista({ id: r.id, ativo: ligar }); // a tela troca na hora; se falhar, volta
    setBusyId(r.id);
    toast.success(`${titulo} ${ligar ? "ligado" : "desligado"}.`);
    try {
      if (ligar) {
        const { error } = await db.rpc("physiq_recebimentos_ativar", r.id === MP_VIRTUAL_ID ? { p_tipo: "mercadopago" } : { p_id: r.id });
        if (error) throw error;
      } else {
        const { error } = await tabela().update({ ativo: false }).eq("id", r.id);
        if (error) throw error;
      }
      await carregar(); // confirma com o banco (id real do Mercado Pago, ordem)
    } catch (e) {
      console.error("[Recebimentos] alternar:", e);
      toast.error(`Não foi possível ${ligar ? "ligar" : "desligar"} ${titulo} — desfeito.`);
    } finally {
      setOtimista(null);
      setBusyId(null);
    }
  };

  const excluir = async (r: Recebimento) => {
    const anterior = rows;
    setRows((prev) => prev.filter((x) => x.id !== r.id)); // some na hora; volta se falhar
    setConfirmarExcluir(null);
    setBusyId(r.id);
    const { error } = await tabela().delete().eq("id", r.id);
    setBusyId(null);
    if (error) {
      console.error("[Recebimentos] excluir:", error);
      setRows(anterior);
      toast.error("Não foi possível excluir o recebimento — desfeito.");
      return;
    }
    toast.success("Recebimento excluído.");
  };

  if (loading) return <p className="text-muted-foreground font-body text-sm" data-recebimentos-carregando>Carregando...</p>;

  return (
    <div className="space-y-4" data-recebimentos-lista>
      {erro && <p className="text-xs text-destructive font-body">{erro}</p>}
      {itens.length === 0 && (
        <p className="text-sm text-muted-foreground font-body" data-recebimentos-vazio>
          Nenhum recebimento cadastrado. Toque em Adicionar pra cadastrar sua chave Pix.
        </p>
      )}
      {itens.map((r) => (
        <div
          key={r.id}
          className="result-card p-4 border-muted-foreground/30 flex items-start justify-between gap-4"
          data-recebimento-item={r.tipo}
          data-recebimento-ativo={r.ativo || undefined}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground font-body flex items-center gap-2">
              {r.tipo === "mercadopago" ? <CreditCard size={14} className="text-primary shrink-0" /> : <QrCode size={14} className="text-primary shrink-0" />}
              <span className="truncate">{tituloRecebimento(r)}</span>
            </p>
            <p className="text-xs text-muted-foreground font-body mt-1 break-words">{detalheRecebimento(r)}</p>
            <p className={`text-xs font-body mt-1 ${r.ativo ? "text-primary" : "text-muted-foreground"}`} data-recebimento-estado>{descricaoSwitch(r)}</p>
            {r.tipo === "pix" && (
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => setDialogo({ aberto: true, item: r })} className={BTN_SEC} data-btn-editar-recebimento>
                  <Pencil size={11} />Editar
                </button>
                {confirmarExcluir === r.id ? (
                  <>
                    <button type="button" onClick={() => void excluir(r)} disabled={busyId === r.id} className={BTN_DANGER} data-btn-confirmar-excluir>
                      Confirmar exclusão
                    </button>
                    <button type="button" onClick={() => setConfirmarExcluir(null)} className={BTN_SEC}>Cancelar</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmarExcluir(r.id)} className={BTN_DANGER} data-btn-excluir-recebimento>
                    <Trash2 size={11} />Excluir
                  </button>
                )}
              </div>
            )}
          </div>
          <Switch
            checked={r.ativo}
            disabled={busyId !== null}
            onCheckedChange={(v) => void alternar(r, v)}
            aria-label={`${r.ativo ? "Desligar" : "Ligar"} ${tituloRecebimento(r)}`}
            data-recebimento-switch
          />
        </div>
      ))}
      {!algumAtivo && itens.length > 0 && (
        <p className="text-xs text-muted-foreground font-body" data-recebimentos-nenhum-ativo>{NENHUM_ATIVO}</p>
      )}
      <button type="button" onClick={() => setDialogo({ aberto: true, item: null })} className={BTN_PRI} data-btn-adicionar-recebimento>
        <Plus size={14} />Adicionar
      </button>
      <RecebimentoPixDialog
        aberto={dialogo.aberto}
        item={dialogo.item}
        professorId={professorId}
        ativarAoCriar={!algumAtivo}
        onFechar={() => setDialogo({ aberto: false, item: null })}
        onSalvo={(salva) => setRows((prev) => comLinhaSalva(prev, salva))}
      />
    </div>
  );
}
