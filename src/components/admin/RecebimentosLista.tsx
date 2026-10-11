import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ErroFinanceiro, excluirChavePix, ligarChavePix } from "@/financeiro/api";
import { mensagemDoRecebimento } from "@/financeiro/regras";
import type { ChaveRecebimento } from "@/financeiro/tipos";
import { formatarChavePix, rotuloPixTipo } from "@/lib/pixChave";
import { Botao } from "@/ui/premium/Botao";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import RecebimentoPixDialog from "@/components/admin/RecebimentoPixDialog";

interface Props {
  contaId: string;
  chaves: ChaveRecebimento[];
  podeEditar: boolean;
  /** a tela relê o prof_recebimento (W1: a lista não lê mais o banco) */
  aoMudar: () => void;
}

export const NENHUMA_ATIVA = "Nenhuma chave ligada — o aluno não vê chave nem consegue anexar comprovante (útil se você cobra por fora).";

/**
 * Chaves Pix da conta (C51 — pedido 13/09/2026): cada uma com o switch ligar/desligar e SÓ 1 ligada por conta; é a ligada que o
 * aluno vê em Perfil › Pagamentos. W6: mora no banco principal (recebimento_chaves; o dono e o membro dono da chave editam).
 * W1 (jeito 2): as gravações vão pela pagamentos-aluno (prof_chave_salvar/ligar/excluir), como a pessoa; quem lê é a tela
 * (prof_recebimento), que recebe o aoMudar para reler.
 */
export default function RecebimentosLista({ contaId, chaves, podeEditar, aoMudar }: Props) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const confirmar = useConfirmar();
  const [dialogo, setDialogo] = useState<{ aberto: boolean; item: ChaveRecebimento | null }>({ aberto: false, item: null });

  const algumaAtiva = chaves.some((c) => c.ativa);

  const alternar = async (c: ChaveRecebimento, ligar: boolean) => {
    setOcupado(c.id);
    try {
      // só 1 ligada por conta: o servidor desliga as outras numa transação
      await ligarChavePix(contaId, c.id, ligar);
      toast.success(`Chave ${ligar ? "ligada" : "desligada"}.`);
    } catch (e) {
      toast.error(mensagemDoRecebimento(e instanceof ErroFinanceiro ? e.codigo : null, "Não deu para mudar a chave agora."));
    } finally {
      setOcupado(null);
      aoMudar();
    }
  };

  const excluir = async (c: ChaveRecebimento) => {
    if (!(await confirmar({ titulo: `Excluir a chave ${formatarChavePix(c.tipo, c.chave)}?`, rotuloConfirmar: "Excluir", perigo: true }))) return;
    setOcupado(c.id);
    try {
      await excluirChavePix(contaId, c.id);
      toast.success("Chave excluída.");
    } catch (e) {
      toast.error(mensagemDoRecebimento(e instanceof ErroFinanceiro ? e.codigo : null, "Não deu para excluir a chave agora."));
    } finally {
      setOcupado(null);
      aoMudar();
    }
  };

  return (
    <div className="flex flex-col gap-2.5" data-recebimentos-lista>
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
      <RecebimentoPixDialog aberto={dialogo.aberto} item={dialogo.item} contaId={contaId}
        onFechar={() => setDialogo({ aberto: false, item: null })} onSalvo={aoMudar} />
    </div>
  );
}
