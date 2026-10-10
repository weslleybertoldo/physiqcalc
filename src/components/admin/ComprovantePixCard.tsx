import { useState } from "react";
import { Check, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { acaoFinanceiro, ErroFinanceiro, invalidarResumo } from "@/financeiro/api";
import { dataBR, dataHoraBR, mensagemErroFinanceiro, nomeDoMes, reais } from "@/financeiro/regras";
import type { CobrancaVista } from "@/financeiro/tipos";
import { ComprovanteVisor } from "@/financeiro/ui/ComprovanteVisor";
import { CaixaMarcar, DialogoRecusar } from "@/financeiro/ui/Dialogos";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { useConfirmar } from "@/ui/premium/useConfirmar";

/**
 * Comprovante de Pix na chave da conta aguardando a confirmação do profissional (C98). W6: lê e grava a cobrança unificada do
 * banco principal (pagamentos-aluno — prof_confirmar / prof_recusar / prof_comprovante). Usado na aba Financeiro do aluno, na
 * página Financeiro antiga (fallback até a W19) e em Configurações › Recebimento.
 */
export interface PixPendente extends CobrancaVista {
  aluno?: { paciente_id: string; treino_user_id: string | null; nome: string | null; email: string | null } | null;
}

/** Selo "pago até / pendente desde" da lista de alunos (mesmo texto do painel antigo). */
export const BadgePagamento = ({ badge }: { badge: { s: string; ate: string | null } }) => (
  <Chip tom={badge.s === "pago" ? "n" : "r"} className="h-[22px] text-[10.5px]" data-badge-pagamento={badge.s}>
    {badge.s === "pago" ? `PAGO${badge.ate ? ` ATÉ ${dataBR(badge.ate)}` : ""}` : `PENDENTE${badge.ate ? ` DESDE ${dataBR(badge.ate)}` : ""}`}
  </Chip>
);

interface Props {
  item: PixPendente;
  /** Chamado depois de confirmar/recusar (ou quando o servidor diz que já foi tratado) — o pai recarrega. */
  onResolvido?: (acao: "confirmado" | "recusado" | "ja_tratado") => void;
}

const ComprovantePixCard = ({ item, onResolvido }: Props) => {
  const [busy, setBusy] = useState(false);
  const [vendo, setVendo] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const pedirConfirmacao = useConfirmar();
  const [lancar, setLancar] = useState(true);
  const titulo = item.aluno ? item.aluno.nome || item.aluno.email || "Aluno" : null;
  const referente = item.tipo === "mensalidade" ? `Mensalidade · ${nomeDoMes(item.mes_ref ?? item.vencimento, "0000")}` : item.descricao;

  const tratar = (e: unknown, padrao: string) => {
    const codigo = e instanceof ErroFinanceiro ? e.codigo : null;
    toast.error(mensagemErroFinanceiro(codigo, padrao));
    if (codigo === "nao_pendente") onResolvido?.("ja_tratado");
  };

  const confirmar = async () => {
    if (!(await pedirConfirmacao({ titulo: `Confirmar o recebimento de ${reais(item.valor)} (${referente})?`, rotuloConfirmar: "Confirmar recebimento" }))) return;
    setBusy(true);
    try {
      await acaoFinanceiro("prof_confirmar", { cobranca_id: item.id, lancar });
      invalidarResumo();
      toast.success("Pagamento confirmado — o aluno fica em dia.");
      onResolvido?.("confirmado");
    } catch (e) {
      tratar(e, "Erro ao confirmar o pagamento.");
    } finally {
      setBusy(false);
    }
  };

  const recusar = async (motivo: string) => {
    try {
      await acaoFinanceiro("prof_recusar", { cobranca_id: item.id, motivo });
      toast.success("Comprovante recusado. O aluno vê o motivo em Pagamentos.");
      onResolvido?.("recusado");
      return true;
    } catch (e) {
      tratar(e, "Erro ao recusar o comprovante.");
      return false;
    }
  };

  return (
    <Cartao className="flex flex-col gap-3 p-4" data-comprovante-pendente={item.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {titulo && <p className="truncate text-[14px] font-semibold text-texto">{titulo}</p>}
          <p className="line-clamp-2 text-[12.5px] text-texto-2">{referente}</p>
          <p className="text-[11.5px] text-texto-3">enviado em {dataHoraBR(item.enviado_em ?? item.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <b className="text-[17px] font-bold tabular-nums text-texto">{reais(item.valor)}</b>
          <Chip tom="c" className="h-[22px] text-[10.5px]">AGUARDANDO</Chip>
        </div>
      </div>
      <CaixaMarcar marcado={lancar} aoMudar={setLancar} marca="confirmar-lancar">Ao confirmar, lançar a entrada nos lançamentos do aluno</CaixaMarcar>
      <div className="flex flex-wrap gap-2">
        <Botao tamanho="sm" variante="g" icone={Eye} onClick={() => setVendo(true)} data-btn-ver-comprovante>Ver comprovante</Botao>
        <Botao tamanho="sm" variante="w" icone={Check} disabled={busy} onClick={() => void confirmar()} data-btn-confirmar-pix>Confirmar</Botao>
        <Botao tamanho="sm" variante="g" icone={X} disabled={busy} onClick={() => setRecusando(true)} data-btn-recusar-pix>Recusar</Botao>
      </div>
      <ComprovanteVisor cobrancaId={vendo ? item.id : null} quem="prof" aoFechar={() => setVendo(false)} />
      <DialogoRecusar cobranca={recusando ? item : null} aoFechar={() => setRecusando(false)} aoRecusar={recusar} />
    </Cartao>
  );
};

export default ComprovantePixCard;
