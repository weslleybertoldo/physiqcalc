import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, FlaskConical, Loader2, QrCode, RefreshCw, TimerOff } from "lucide-react";
import { toast } from "sonner";
import { dataBR, reais } from "@/nucleo/cobranca/regras";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { acaoCobranca, ErroCobranca, type FaturaConta } from "./api";

const INTERVALO_MS = 5000;

function horaBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
function diaBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dataBR(d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
}

/**
 * Pix aberto (spec 6.2 e 9): QR e copia-e-cola do Mercado Pago, válido por 72 h; a tela confere o pagamento a cada 5 s e no
 * "Já paguei" ("Aguardando confirmação do Mercado Pago"); vencido → "Código Pix vencido. Gerar outro". No staging, "Simular
 * aprovação" (o Pix do sandbox não se paga — como o plano-simular-aprovacao do Calc).
 */
export function PixAberto({
  fatura,
  simulacao,
  aoAprovar,
  aoGerarOutro,
}: {
  fatura: FaturaConta;
  simulacao: boolean;
  aoAprovar: () => void;
  aoGerarOutro: () => void;
}) {
  const [atual, setAtual] = useState(fatura);
  const [conferindo, setConferindo] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const avisou = useRef(false);
  const vencido = atual.status === "expired" || (!!atual.pix_expira_em && new Date(atual.pix_expira_em).getTime() < Date.now());

  useEffect(() => setAtual(fatura), [fatura]);

  const conferir = async (manual = false) => {
    if (manual) setConferindo(true);
    try {
      const r = await acaoCobranca<{ fatura: FaturaConta }>("pix_status", { conta_id: atual.conta_id, fatura_id: atual.id });
      if (r.fatura) setAtual(r.fatura);
      if (r.fatura?.status === "approved" && !avisou.current) {
        avisou.current = true;
        toast.success("Pagamento confirmado! Seu plano foi renovado.");
        aoAprovar();
      } else if (manual) {
        toast.info("Ainda aguardando a confirmação do Mercado Pago.");
      }
    } catch (e) {
      if (manual) toast.error(e instanceof ErroCobranca && e.codigo === "sem_internet" ? "Sem internet." : "Não deu para conferir agora.");
    } finally {
      if (manual) setConferindo(false);
    }
  };

  useEffect(() => {
    if (atual.status !== "pending" && atual.status !== "in_process") return;
    if (vencido) return;
    const t = setInterval(() => void conferir(false), INTERVALO_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- confere a fatura aberta (o id muda quando gera outra)
  }, [atual.id, atual.status, vencido]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(atual.pix_copia_cola ?? "");
      toast.success("Código Pix copiado.");
    } catch {
      toast.error("Não deu para copiar. Selecione o código e copie.");
    }
  };

  const simular = async () => {
    setSimulando(true);
    try {
      await acaoCobranca("simular_aprovacao", { conta_id: atual.conta_id, fatura_id: atual.id });
      avisou.current = true;
      toast.success("Aprovação simulada (ambiente de teste).");
      aoAprovar();
    } catch {
      toast.error("Não deu para simular agora.");
    } finally {
      setSimulando(false);
    }
  };

  if (atual.status === "approved") {
    return (
      <Cartao brilho className="flex items-center gap-3 p-5" data-pix-aprovado>
        <CheckCircle2 aria-hidden className="h-6 w-6 flex-none text-verde-2" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-texto">Pagamento confirmado</div>
          <div className="text-[13px] text-texto-2">Pix de {reais(atual.valor)} aprovado{atual.cobre_ate ? ` · plano ativo até ${dataBR(atual.cobre_ate)}` : ""}.</div>
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao brilho className="p-5" data-pix-aberto={atual.id}>
      <CabecalhoCartao
        titulo="Pagar com Pix"
        extra={vencido ? <Chip tom="g">VENCIDO</Chip> : <Chip tom="a">AGUARDANDO</Chip>}
        acao={<span className="text-[13px] font-semibold tabular-nums text-texto">{reais(atual.valor)}</span>}
      />
      {vencido ? (
        <div className="flex flex-col items-start gap-3" data-pix-vencido>
          <p className="flex items-center gap-2 text-[13.5px] text-texto-2">
            <TimerOff aria-hidden className="h-4 w-4 text-texto-3" /> Código Pix vencido. Gere outro para pagar.
          </p>
          <Botao variante="w" icone={QrCode} onClick={aoGerarOutro}>Gerar outro Pix</Botao>
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex h-[176px] w-[176px] flex-none items-center justify-center overflow-hidden rounded-[18px] border border-linha bg-white p-2.5">
            {atual.pix_qr ? (
              <img src={`data:image/png;base64,${atual.pix_qr}`} alt="QR Code do Pix" className="h-full w-full object-contain" data-pix-qr />
            ) : (
              <QrCode aria-hidden className="h-16 w-16 text-zinc-400" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="text-[12.5px] text-texto-2">
              Abra o app do seu banco, escolha Pix e leia o QR ou cole o código. Vale até {diaBR(atual.pix_expira_em)} às {horaBR(atual.pix_expira_em)}.
            </div>
            <div className="flex items-stretch gap-2">
              <input readOnly value={atual.pix_copia_cola ?? ""} aria-label="Pix copia e cola" data-pix-copia-cola
                className="h-11 min-w-0 flex-1 truncate rounded-[12px] border border-linha-2 bg-superficie px-3 font-mono text-[12px] text-texto-2" />
              <Botao variante="g" icone={Copy} onClick={() => void copiar()} data-pix-copiar>Copiar</Botao>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-texto-2" role="status" data-pix-aguardando>
              <Loader2 aria-hidden className="h-4 w-4 animate-spin text-ambar-3" /> Aguardando confirmação do Mercado Pago…
            </div>
            <div className="flex flex-wrap gap-2">
              <Botao variante="w" icone={RefreshCw} onClick={() => void conferir(true)} disabled={conferindo} data-pix-ja-paguei>
                {conferindo ? "Conferindo…" : "Já paguei"}
              </Botao>
              {simulacao && (
                <Botao variante="g" icone={FlaskConical} onClick={() => void simular()} disabled={simulando} data-simular-aprovacao>
                  {simulando ? "Simulando…" : "Simular aprovação (teste)"}
                </Botao>
              )}
            </div>
          </div>
        </div>
      )}
    </Cartao>
  );
}
