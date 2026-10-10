import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, CreditCard, FlaskConical, Loader2, QrCode, RefreshCw, Repeat, TimerOff } from "lucide-react";
import { toast } from "sonner";
import { acaoFinanceiro, ErroFinanceiro, invalidarResumo } from "@/financeiro/api";
import { dataHoraBR, mensagemErroFinanceiro, reais } from "@/financeiro/regras";
import type { CobrancaVista, MatriculaPagamentos } from "@/financeiro/tipos";
import { CartaoPagamento, type DadosCartao } from "@/painel/configuracoes/plano/CartaoPagamento";
import { useSessao } from "@/nucleo/sessao";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import type { AlvoPagamento } from "./PagarPixManual";

const INTERVALO_MS = 5000;

/**
 * Pagar pelo Mercado Pago (as contas liberadas pelo master — C99): Pix do MP (QR e copia e cola de 72 h; a tela confere a cada
 * 5 s e no "Já paguei"), cartão à vista (Brick — o número do cartão nunca passa pelo nosso servidor) e, na mensalidade, a
 * cobrança automática mensal no cartão. No staging, "Simular aprovação" (o Pix do sandbox não se paga).
 */
export function PagarMercadoPago({
  matricula,
  alvo,
  simulacao,
  aoFechar,
  aoPago,
}: {
  matricula: MatriculaPagamentos;
  alvo: AlvoPagamento | null;
  simulacao: boolean;
  aoFechar: () => void;
  aoPago: () => void;
}) {
  const { usuario } = useSessao();
  const [pix, setPix] = useState<CobrancaVista | null>(null);
  const [gerando, setGerando] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [cartao, setCartao] = useState<"avista" | "assinar" | null>(null);
  const avisou = useRef(false);
  const valor = alvo?.tipo === "avulsa" ? Number(alvo.cobranca.valor) : Number(matricula.mensalidade?.valor ?? 0);
  const corpoAlvo = { paciente_id: matricula.paciente_id, ...(alvo?.tipo === "avulsa" ? { cobranca_id: alvo.cobranca.id } : {}) };
  const vencido = !!pix?.pix_expira_em && new Date(pix.pix_expira_em).getTime() < Date.now();

  useEffect(() => {
    if (!alvo) {
      setPix(null);
      avisou.current = false;
    }
  }, [alvo]);

  const pago = (msg = "Pagamento confirmado!") => {
    if (avisou.current) return;
    avisou.current = true;
    invalidarResumo();
    toast.success(msg);
    aoPago();
  };

  const gerarPix = async () => {
    setGerando(true);
    try {
      const r = await acaoFinanceiro<{ cobranca: CobrancaVista; aprovada?: boolean }>("aluno_mp_pix", corpoAlvo);
      if (r.aprovada || r.cobranca.status === "paga") return pago();
      setPix(r.cobranca);
    } catch (e) {
      toast.error(mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null, "Não deu para gerar o Pix agora."));
    } finally {
      setGerando(false);
    }
  };

  const conferir = async (manual = false) => {
    if (!pix) return;
    if (manual) setConferindo(true);
    try {
      const r = await acaoFinanceiro<{ cobranca: CobrancaVista }>("aluno_mp_conferir", { cobranca_id: pix.id });
      if (r.cobranca.status === "paga") pago();
      else {
        setPix((p) => (p ? { ...p, ...r.cobranca, pix_qr: r.cobranca.pix_qr ?? p.pix_qr, pix_copia_cola: r.cobranca.pix_copia_cola ?? p.pix_copia_cola } : r.cobranca));
        if (manual) toast.info("Ainda aguardando a confirmação do Mercado Pago.");
      }
    } catch {
      if (manual) toast.error("Não deu para conferir agora.");
    } finally {
      if (manual) setConferindo(false);
    }
  };

  useEffect(() => {
    if (!pix || pix.status !== "aguardando_confirmacao" || vencido) return;
    const t = setInterval(() => void conferir(false), INTERVALO_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- confere o Pix aberto (o id muda quando gera outro)
  }, [pix?.id, pix?.status, vencido]);

  const simular = async () => {
    if (!pix) return;
    try {
      await acaoFinanceiro("simular_aprovacao", { cobranca_id: pix.id });
      pago("Aprovação simulada (ambiente de teste).");
    } catch {
      toast.error("Não deu para simular agora.");
    }
  };

  const pagarCartao = async (d: DadosCartao) => {
    try {
      if (cartao === "assinar") {
        const r = await acaoFinanceiro<{ primeira_cobranca: string | null; sandbox: boolean; init_point: string | null }>("aluno_mp_assinar", {
          paciente_id: matricula.paciente_id, card_token: d.token,
        });
        setCartao(null);
        invalidarResumo();
        if (r.sandbox && r.init_point) toast.info("Ambiente de teste: a cobrança automática ficou pendente no checkout do Mercado Pago.");
        else toast.success(r.primeira_cobranca ? `Cobrança automática ligada. A 1ª será em ${new Date(r.primeira_cobranca).toLocaleDateString("pt-BR")}.` : "Cobrança automática ligada.");
        aoPago();
        return;
      }
      const r = await acaoFinanceiro<{ status: string }>("aluno_mp_cartao", { ...corpoAlvo, card_token: d.token, payment_method_id: d.payment_method_id, issuer_id: d.issuer_id });
      setCartao(null);
      if (r.status === "paga") pago("Pagamento aprovado!");
      else if (r.status === "cancelada" || r.status === "aberta") toast.error("Pagamento recusado pelo cartão.");
      else {
        toast.info("Pagamento em processamento — a situação atualiza em instantes.");
        aoPago();
      }
    } catch (e) {
      toast.error(mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null, "Erro no pagamento. Confira os dados do cartão."));
      throw e;
    }
  };

  const titulo = alvo?.tipo === "avulsa" ? alvo.cobranca.descricao : "Pagar a mensalidade";
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(pix?.pix_copia_cola ?? "");
      toast.success("Código Pix copiado.");
    } catch {
      toast.error("Não deu para copiar. Selecione o código e copie.");
    }
  };

  return (
    <>
      <PainelDeslizante aberto={!!alvo && !cartao} aoMudar={(a) => !a && aoFechar()} titulo={titulo} descricao={`${reais(valor)} · Mercado Pago`} lado="baixo">
        <div className="flex flex-col gap-4" data-pagar-mp>
          {!pix ? (
            <div className="grid grid-cols-1 gap-2">
              <Botao variante="w" icone={QrCode} className="w-full" disabled={gerando} onClick={() => void gerarPix()} data-mp-gerar-pix>
                {gerando ? "Gerando o Pix…" : `Pagar ${reais(valor)} com Pix`}
              </Botao>
              <Botao variante="g" icone={CreditCard} className="w-full" onClick={() => setCartao("avista")} data-mp-cartao>Pagar com cartão</Botao>
              {alvo?.tipo === "mensalidade" && !matricula.assinatura?.status?.match(/authorized/) && (
                <Botao variante="g" icone={Repeat} className="w-full" onClick={() => setCartao("assinar")} data-mp-assinar>Cobrança automática todo mês</Botao>
              )}
            </div>
          ) : vencido ? (
            <div className="flex flex-col items-start gap-3" data-mp-pix-vencido>
              <p className="flex items-center gap-2 text-[13.5px] text-texto-2"><TimerOff aria-hidden className="h-4 w-4" /> Código Pix vencido. Gere outro para pagar.</p>
              <Botao variante="w" icone={QrCode} onClick={() => { setPix(null); void gerarPix(); }}>Gerar outro Pix</Botao>
            </div>
          ) : pix.status === "paga" ? (
            <p className="flex items-center gap-2 text-[14px] text-texto"><CheckCircle2 aria-hidden className="h-5 w-5 text-verde-2" /> Pagamento confirmado.</p>
          ) : (
            <div className="flex flex-col gap-3" data-mp-pix-aberto={pix.id}>
              <div className="mx-auto flex h-[190px] w-[190px] items-center justify-center overflow-hidden rounded-[18px] border border-linha bg-white p-2.5">
                {pix.pix_qr ? <img src={`data:image/png;base64,${pix.pix_qr}`} alt="QR Code do Pix" className="h-full w-full object-contain" data-mp-pix-qr /> : <QrCode aria-hidden className="h-14 w-14 text-zinc-400" />}
              </div>
              <p className="text-center text-[12px] text-texto-2">Vale até {dataHoraBR(pix.pix_expira_em)}.</p>
              <div className="flex items-stretch gap-2">
                <input readOnly value={pix.pix_copia_cola ?? ""} aria-label="Pix copia e cola" data-mp-pix-copia-cola
                  className="h-11 min-w-0 flex-1 truncate rounded-[12px] border border-linha-2 bg-superficie px-3 font-mono text-[12px] text-texto-2" />
                <Botao variante="g" icone={Copy} onClick={() => void copiar()}>Copiar</Botao>
              </div>
              <p className="flex items-center gap-2 text-[12.5px] text-texto-2" role="status"><Loader2 aria-hidden className="h-4 w-4 animate-spin text-ambar-3" /> Aguardando confirmação do Mercado Pago…</p>
              <div className="flex flex-wrap gap-2">
                <Botao variante="w" icone={RefreshCw} disabled={conferindo} onClick={() => void conferir(true)} data-mp-ja-paguei>{conferindo ? "Conferindo…" : "Já paguei"}</Botao>
                {simulacao && <Botao variante="g" icone={FlaskConical} onClick={() => void simular()} data-mp-simular>Simular aprovação (teste)</Botao>}
              </div>
            </div>
          )}
        </div>
      </PainelDeslizante>
      <CartaoPagamento
        aberto={!!cartao}
        aoMudar={(a) => !a && setCartao(null)}
        modo={cartao === "assinar" ? "assinar" : "avista"}
        valor={valor}
        email={usuario?.email ?? ""}
        descricao={cartao === "assinar" ? "Todo mês no mesmo dia, até você cancelar." : "Pagamento único no cartão."}
        aoEnviar={pagarCartao}
      />
    </>
  );
}
