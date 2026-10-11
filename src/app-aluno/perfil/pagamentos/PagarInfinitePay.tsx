import { useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MensagemForm } from "@/entrada/pecas/Campo";
import { abrirPagina, reservarAba } from "@/financeiro/abrirPagamento";
import { abrirLinkDaInfinitePay, conferirInfinitePay, ErroFinanceiro, invalidarResumo } from "@/financeiro/api";
import { dataHoraBR, mensagemErroFinanceiro, reais, tituloDoPagar } from "@/financeiro/regras";
import type { CobrancaVista, MatriculaPagamentos } from "@/financeiro/tipos";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import type { AlvoPagamento } from "./PagarPixManual";

const INTERVALO_MS = 5000;
const CONFERIR_POR_MS = 10 * 60_000;
/** Para o aluno, a recusa da InfinitePay não é culpa dele (a InfiniteTag é do profissional). */
const FRASE_DO_ALUNO: Record<string, string> = {
  infinitepay_recusou: "Não deu para abrir o pagamento agora. Avise o seu profissional.",
  infinitepay_checkout_desligado: "Não deu para abrir o pagamento agora. Avise o seu profissional.",
  infinitepay_indisponivel: "Não deu para abrir o pagamento agora. Tente de novo em instantes.",
};
const AINDA_NAO = "Ainda não chegou a confirmação da InfinitePay. Se você já pagou, espere um pouco e confira de novo.";
const VENCEU = "Essa página de pagamento venceu. Toque em Pagar para abrir outra.";

/** A frase do que o aluno acabou de tocar na folha: DENTRO dela, acima dos botões — o toast (embaixo da tela) cobria o "Conferir
 *  pagamento" que ele mandava apertar (11/10). */
type Aviso = { tom: "erro" | "aviso"; texto: string };

/**
 * Pagar pela InfinitePay (W1 — desenho 10/10 §4.2 e §4.3): "Pagar com Pix ou cartão" pede o link à função (o MESMO enquanto a tentativa
 * vale, 72 h) e abre a página da InfinitePay por cima do app (APK: @capacitor/browser; site: a aba reservada no toque). O aluno paga lá
 * (Pix ou cartão em até 12×) e volta: a tela confere sozinha quando ele volta (o Browser fechou, o app voltou para a frente, a aba ficou
 * visível) e a cada 5 s com a folha aberta (até 10 min); "Conferir pagamento" confere na hora. Pago → "Pagamento confirmado!" e fecha. Sem
 * comprovante: a InfinitePay avisa o Physiq e o servidor confere com ela antes de dar baixa. Na versão da loja é igual (o serviço do
 * profissional — não libera recurso do app). Quem decide é o `paga` e o status da cobrança que a função devolve (nunca o `resultado`).
 * A frase do toque (ainda não chegou, a página venceu, não deu para abrir ou conferir) sai DENTRO da folha, acima dos botões
 * ([data-ip-aviso]) — o toast, embaixo da tela, cobria o "Conferir pagamento" (11/10). Só o "Pagamento confirmado!" é toast: a folha fecha.
 */
export function PagarInfinitePay({ matricula, alvo, aoFechar, aoPago }: {
  matricula: MatriculaPagamentos;
  alvo: AlvoPagamento | null;
  aoFechar: () => void;
  aoPago: () => void;
}) {
  const [tentativa, setTentativa] = useState<CobrancaVista | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const avisou = useRef(false);
  const desde = useRef(Date.now());
  const valor = alvo?.tipo === "avulsa" ? Number(alvo.cobranca.valor) : Number(matricula.mensalidade?.valor ?? 0);

  useEffect(() => {
    avisou.current = false;
    desde.current = Date.now();
    setAviso(null);
    if (!alvo) {
      setTentativa(null);
      return;
    }
    // a tentativa viva que já existe (o aluno voltou depois): começa em "aguardando", com "Abrir a página de novo"
    setTentativa(matricula.cobrancas.find((c) => c.forma === "infinitepay" && c.status === "aguardando_confirmacao"
      && (alvo.tipo === "avulsa" ? c.id === alvo.cobranca.id : c.tipo === "mensalidade")) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o alvo muda
  }, [alvo]);

  const pago = () => {
    if (avisou.current) return;
    avisou.current = true;
    invalidarResumo();
    toast.success("Pagamento confirmado!");
    aoPago();
  };

  const pagar = async () => {
    const aba = reservarAba(); // no toque: o navegador não bloqueia
    setAbrindo(true);
    setAviso(null);
    try {
      const r = await abrirLinkDaInfinitePay(matricula.paciente_id, alvo?.tipo === "avulsa" ? alvo.cobranca.id : undefined);
      setTentativa(r.cobranca);
      desde.current = Date.now();
      if ((await abrirPagina(r.url, aba)) === "recusado") setAviso({ tom: "erro", texto: FRASE_DO_ALUNO.infinitepay_recusou });
    } catch (e) {
      aba?.fechar();
      const codigo = e instanceof ErroFinanceiro ? e.codigo : null;
      setAviso({ tom: "erro", texto: (codigo && FRASE_DO_ALUNO[codigo]) || mensagemErroFinanceiro(codigo, "Não deu para abrir o pagamento agora. Tente de novo.") });
    } finally {
      setAbrindo(false);
    }
  };

  const conferir = async (manual = false) => {
    if (!tentativa) return;
    if (manual) {
      setConferindo(true);
      setAviso(null);
    }
    try {
      const r = await conferirInfinitePay(tentativa.id);
      if (r.paga) return pago();
      if (r.cobranca.status !== "aguardando_confirmacao") {
        // MENOR 14 da revisão: a tentativa venceu (72 h) ou saiu — volta ao "Pagar" (abre outra página)
        setTentativa(null);
        if (manual) setAviso({ tom: "aviso", texto: VENCEU });
        return;
      }
      setTentativa((t) => (t ? { ...t, ...r.cobranca } : r.cobranca));
      if (manual) setAviso({ tom: "aviso", texto: AINDA_NAO });
    } catch {
      if (manual) setAviso({ tom: "erro", texto: "Não deu para conferir agora." });
    } finally {
      if (manual) setConferindo(false);
    }
  };

  // confere sozinho: a cada 5 s com a folha aberta e a página visível (até 10 min) e quando o aluno volta da InfinitePay
  useEffect(() => {
    if (!tentativa || tentativa.status !== "aguardando_confirmacao") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - desde.current < CONFERIR_POR_MS) void conferir(false);
    }, INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferir(false);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    const ouvintes: Array<Promise<{ remove: () => Promise<void> }>> = [];
    if (Capacitor.isNativePlatform()) {
      ouvintes.push(Browser.addListener("browserFinished", () => void conferir(false)));
      ouvintes.push(CapApp.addListener("appStateChange", ({ isActive }) => { if (isActive) void conferir(false); }));
    }
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      ouvintes.forEach((o) => void o.then((x) => x.remove()).catch(() => undefined));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a tentativa aberta (o id muda quando nasce outra)
  }, [tentativa?.id, tentativa?.status]);

  const titulo = alvo?.tipo === "avulsa" ? alvo.cobranca.descricao : tituloDoPagar(matricula.mensalidade);
  const linhaDoAviso = aviso && <MensagemForm tom={aviso.tom} data-ip-aviso>{aviso.texto}</MensagemForm>;
  return (
    <PainelDeslizante aberto={!!alvo} aoMudar={(a) => !a && aoFechar()} titulo={titulo} descricao={`${reais(valor)} · InfinitePay`} lado="baixo">
      <div className="flex flex-col gap-4" data-pagar-ip>
        {!tentativa ? (
          <>
            <p className="text-[13px] text-texto-2">
              Você paga na página da InfinitePay, com Pix ou cartão (em até 12×). Quando ela confirmar, o pagamento aparece aqui sozinho — não precisa mandar comprovante.
            </p>
            {linhaDoAviso}
            <Botao variante="w" icone={ExternalLink} className="w-full" disabled={abrindo} onClick={() => void pagar()} data-ip-pagar>
              {abrindo ? "Abrindo a página…" : `Pagar ${reais(valor)} com Pix ou cartão`}
            </Botao>
          </>
        ) : tentativa.status === "paga" ? (
          <p className="flex items-center gap-2 text-[14px] text-texto"><CheckCircle2 aria-hidden className="h-5 w-5 text-verde-2" /> Pagamento confirmado.</p>
        ) : (
          <div className="flex flex-col gap-3" data-ip-aguardando={tentativa.id}>
            <p className="flex items-center gap-2 text-[13.5px] text-texto" role="status">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin text-ambar-3" /> Aguardando a confirmação da InfinitePay…
            </p>
            <p className="text-[12.5px] text-texto-2">
              Terminou de pagar? Toque em "Conferir pagamento".{tentativa.ip_expira_em ? ` A página vale até ${dataHoraBR(tentativa.ip_expira_em)}.` : ""}
            </p>
            {linhaDoAviso}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Botao variante="w" icone={RefreshCw} disabled={conferindo} onClick={() => void conferir(true)} data-ip-conferir>
                {conferindo ? "Conferindo…" : "Conferir pagamento"}
              </Botao>
              <Botao variante="g" icone={ExternalLink} disabled={abrindo} onClick={() => void pagar()} data-ip-abrir-de-novo>Abrir a página de novo</Botao>
            </div>
          </div>
        )}
      </div>
    </PainelDeslizante>
  );
}
