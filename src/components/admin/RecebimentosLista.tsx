import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { principal } from "@/integrations/principal/client";
import { formatarChavePix, rotuloPixTipo } from "@/lib/pixChave";
import { Botao } from "@/ui/premium/Botao";
import { Esqueleto } from "@/ui/premium/Estados";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import RecebimentoPixDialog, { COLUNAS_CHAVE, type ChaveRecebimento } from "@/components/admin/RecebimentoPixDialog";

interface Props {
  contaId: string;
  membroId: string | null;
  podeEditar: boolean;
}

export const NENHUMA_ATIVA = "Nenhuma chave ligada — o aluno não vê chave nem consegue anexar comprovante (útil se você cobra por fora).";

/**
 * Chaves Pix da conta (C51 — pedido 13/09/2026): cada uma com o switch ligar/desligar e SÓ 1 ligada por conta; é a ligada que o
 * aluno vê em Perfil › Pagamentos. W6: mora no banco principal (recebimento_chaves; o dono e o membro dono da chave editam).
 */
export default function RecebimentosLista({ contaId, membroId, podeEditar }: Props) {
  const [chaves, setChaves] = useState<ChaveRecebimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const confirmar = useConfirmar();
  const [dialogo, setDialogo] = useState<{ aberto: boolean; item: ChaveRecebimento | null }>({ aberto: false, item: null });

  const carregar = useCallback(async () => {
    const { data, error } = await principal.from("recebimento_chaves").select(COLUNAS_CHAVE).eq("conta_id", contaId).order("criado_em");
    if (error) {
      console.error("[Recebimento] chaves:", error);
      setErro("Não deu para carregar as chaves.");
    } else {
      setChaves((data ?? []) as unknown as ChaveRecebimento[]);
      setErro(null);
    }
    setCarregando(false);
  }, [contaId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const algumaAtiva = chaves.some((c) => c.ativa);

  const alternar = async (c: ChaveRecebimento, ligar: boolean) => {
    setOcupado(c.id);
    try {
      if (ligar) {
        // só 1 ligada por conta (índice único): desliga as outras antes
        const { error: e1 } = await principal.from("recebimento_chaves").update({ ativa: false }).eq("conta_id", contaId).eq("ativa", true).neq("id", c.id);
        if (e1) throw e1;
      }
      const { error } = await principal.from("recebimento_chaves").update({ ativa: ligar }).eq("id", c.id);
      if (error) throw error;
      toast.success(`Chave ${ligar ? "ligada" : "desligada"}.`);
    } catch (e) {
      console.error("[Recebimento] alternar:", e);
      toast.error("Não deu para mudar a chave agora.");
    } finally {
      setOcupado(null);
      await carregar();
    }
  };

  const excluir = async (c: ChaveRecebimento) => {
    if (!(await confirmar({ titulo: `Excluir a chave ${formatarChavePix(c.tipo, c.chave)}?`, rotuloConfirmar: "Excluir", perigo: true }))) return;
    setOcupado(c.id);
    const { error } = await principal.from("recebimento_chaves").delete().eq("id", c.id);
    setOcupado(null);
    if (error) {
      toast.error("Não deu para excluir a chave.");
      return;
    }
    toast.success("Chave excluída.");
    await carregar();
  };

  if (carregando) return <Esqueleto className="h-[92px] w-full rounded-2xl" />;

  return (
    <div className="flex flex-col gap-2.5" data-recebimentos-lista>
      {erro && <p className="text-[13px] text-rosa-3">{erro}</p>}
      {chaves.length === 0 && <p className="text-[13px] text-texto-2" data-recebimentos-vazio>Nenhuma chave cadastrada. Adicione a sua chave Pix para os alunos pagarem pelo app.</p>}
      {chaves.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-recebimento-item={c.tipo} data-recebimento-ativo={c.ativa || undefined}>
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] border border-linha bg-superficie text-verde-3"><QrCode aria-hidden className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-texto">Pix · {rotuloPixTipo(c.tipo)}</span>
            <span className="block truncate text-[12px] text-texto-2">{[formatarChavePix(c.tipo, c.chave), c.favorecido, c.banco].filter(Boolean).join(" · ")}</span>
            <span className={`block text-[11.5px] ${c.ativa ? "text-verde-3" : "text-texto-3"}`} data-recebimento-estado>{c.ativa ? "Ligada: é a que o aluno vê." : "Desligada: não aparece pro aluno."}</span>
          </span>
          {podeEditar && (
            <>
              <button type="button" aria-label="Editar a chave" className="text-texto-3 hover:text-texto" onClick={() => setDialogo({ aberto: true, item: c })} data-btn-editar-recebimento><Pencil aria-hidden className="h-4 w-4" /></button>
              <button type="button" aria-label="Excluir a chave" className="text-texto-3 hover:text-rosa-3" disabled={ocupado !== null} onClick={() => void excluir(c)} data-btn-excluir-recebimento><Trash2 aria-hidden className="h-4 w-4" /></button>
              <Switch checked={c.ativa} disabled={ocupado !== null} onCheckedChange={(v) => void alternar(c, v)} aria-label={`${c.ativa ? "Desligar" : "Ligar"} a chave`} data-recebimento-switch />
            </>
          )}
        </div>
      ))}
      {!algumaAtiva && chaves.length > 0 && <p className="text-[12px] text-texto-3" data-recebimentos-nenhum-ativo>{NENHUMA_ATIVA}</p>}
      {podeEditar && (
        <Botao icone={Plus} className="self-start" onClick={() => setDialogo({ aberto: true, item: null })} data-btn-adicionar-recebimento>Adicionar chave Pix</Botao>
      )}
      <RecebimentoPixDialog aberto={dialogo.aberto} item={dialogo.item} contaId={contaId} membroId={membroId} ativarAoCriar={!algumaAtiva}
        onFechar={() => setDialogo({ aberto: false, item: null })} onSalvo={() => void carregar()} />
    </div>
  );
}
