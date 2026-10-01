import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { INPUT } from "@/nutricao/editor/ui/estilos";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { salvarProximaAvaliacao } from "./avaliacaoApi";
import { mensagemDoErro } from "./mensagens";
import { textoDaProxima } from "./regras";

/**
 * Próxima avaliação (W17 — NF7, tela 7 "Próxima 22/07"): a data fica no perfil do Treino do aluno (physiq_profiles.
 * proxima_avaliacao, W2); quem muda o treino marca e tira; os outros veem. Aparece no card Evolução do Resumo.
 */
export function CartaoProxima({ proxima, hoje, podeMudar, treinoUserId, aoMudou }: {
  proxima: string | null;
  hoje: string;
  podeMudar: boolean;
  treinoUserId: string | null;
  aoMudou: () => void;
}) {
  const [valor, setValor] = useState(proxima ?? "");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setValor(proxima ?? ""), [proxima]);
  const t = textoDaProxima(proxima, hoje);

  const salvar = async (data: string | null) => {
    if (!treinoUserId) return;
    if (data && data < hoje) {
      toast.error("A próxima avaliação é uma data de hoje em diante.");
      return;
    }
    setSalvando(true);
    try {
      await salvarProximaAvaliacao(treinoUserId, data);
      toast.success(data ? "Próxima avaliação marcada." : "Data da próxima avaliação tirada.");
      aoMudou();
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Cartao className="flex flex-col px-[18px] py-4" data-avaliacao-proxima={proxima ?? ""}>
      <CabecalhoCartao titulo="Próxima avaliação" extra={t?.atrasada ? <Chip tom="a">ATRASADA</Chip> : undefined} />
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] border border-linha-2 bg-superficie-2 text-violeta-3">
          <CalendarClock aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <b className="block text-[20px] font-bold tabular-nums tracking-[-0.02em] text-texto" data-avaliacao-proxima-data>{t ? t.data : "Sem data"}</b>
          <span className={`text-[12.5px] ${t?.atrasada ? "text-ambar-3" : "text-texto-2"}`} data-avaliacao-proxima-detalhe>
            {t ? t.detalhe : podeMudar ? "Marque quando o aluno volta para reavaliar." : "O personal marca a data."}
          </span>
        </div>
      </div>
      {podeMudar && treinoUserId && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-avaliacao-proxima-editar>
          <input type="date" className={`${INPUT} h-9 max-w-[170px]`} value={valor} min={hoje} onChange={(e) => setValor(e.target.value)} data-avaliacao-proxima-input />
          <Botao variante="g" tamanho="sm" disabled={salvando || !valor || valor === (proxima ?? "")} onClick={() => void salvar(valor)} data-avaliacao-proxima-salvar>
            {salvando ? "Salvando…" : "Marcar"}
          </Botao>
          {proxima && (
            <button type="button" className="text-[12px] font-semibold text-texto-3 hover:text-texto-2" disabled={salvando} onClick={() => void salvar(null)} data-avaliacao-proxima-tirar>
              Tirar a data
            </button>
          )}
        </div>
      )}
    </Cartao>
  );
}
