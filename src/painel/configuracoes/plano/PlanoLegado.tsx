import { lazy } from "react";
import { ExternalLink, Salad, ShieldCheck } from "lucide-react";
import AdminLayout from "@/layouts/AdminLayout";
import { ASSINATURA_NUTRI, dataCurta, planoCartaoNutri, situacaoNutri, textoTravaNutri } from "@/nucleo/planoLegado";
import type { ContaSituacao, LegadoNutri } from "@/nucleo/situacao";
import { Carregavel } from "@/ui/casca/Carregavel";
import { TopoPagina } from "@/ui/casca/topo";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";

// a tela Planos do Calc de hoje (legado Calc até a W28 — P9)
const PlanosAntiga = lazy(() => import("@/pages/admin/PlanosPage"));

/** Conta 'legado_calc': a tela de hoje (Planos do Calc) dentro da casca, com as regras de hoje (tolerância de 7 dias). */
export function PlanoLegadoCalc() {
  return (
    <div data-plano-legado="calc">
      <AdminLayout>
        <Carregavel nome="Planos (antiga)">
          <PlanosAntiga />
        </Carregavel>
      </AdminLayout>
    </div>
  );
}

/**
 * Conta 'legado_nutri': o aviso com o link para a Assinatura do site do PhysiqNutri (até a W28 a nutri continua pagando lá,
 * com o preço e as regras de hoje — P9), e a situação da assinatura de hoje.
 */
export function PlanoLegadoNutri({ conta, legado }: { conta: ContaSituacao; legado: LegadoNutri | null }) {
  const e = situacaoNutri(legado);
  const cartao = planoCartaoNutri(legado);
  return (
    <div className="flex flex-col gap-4" data-plano-legado="nutri">
      <TopoPagina titulo="Plano" subtitulo={`${conta.nome} · assinatura do PhysiqNutri`} />
      <Cartao brilho className="p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tom="n" icone={Salad}>NUTRIÇÃO</Chip>
          <Chip tom={e.bloqueado ? "r" : e.situacao === "isento" ? "g" : "n"}>{e.bloqueado ? "PENDENTE" : e.situacao === "isento" ? "ISENTA" : "EM DIA"}</Chip>
        </div>
        <h2 className="mt-3 font-body text-[24px] font-bold normal-case tracking-[-0.035em] text-texto">{cartao.nome}</h2>
        <p className={`mt-1 text-[14px] ${e.bloqueado ? "text-rosa-3" : "text-texto-2"}`}>{e.bloqueado ? textoTravaNutri(e) : cartao.linha}</p>
      </Cartao>
      <Cartao className="p-5" data-aviso-assinatura-nutri>
        <CabecalhoCartao titulo="Onde pagar" />
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-texto-2">
          Sua conta veio do PhysiqNutri: o preço e as regras de hoje continuam valendo até você trocar de plano.
          Até a mudança completa do Physiq, a assinatura (cartão ou Pix) continua na página Assinatura do site do PhysiqNutri.
          {e.pagoAte ? ` Pago até ${dataCurta(e.pagoAte)}.` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={ASSINATURA_NUTRI} target="_blank" rel="noopener noreferrer" className="pq-botao pq-botao-w" data-link-assinatura-nutri>
            <ExternalLink aria-hidden /> Abrir a Assinatura no PhysiqNutri
          </a>
        </div>
      </Cartao>
    </div>
  );
}

/** Conta isenta sem cobrança (master; conta marcada pelo master — R18). */
export function PlanoIsento({ conta, master }: { conta: ContaSituacao; master: boolean }) {
  return (
    <div className="flex flex-col gap-4" data-plano-isento>
      <TopoPagina titulo="Plano" subtitulo={conta.nome} />
      <Cartao brilho className="flex items-start gap-4 p-5">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-verde-2">
          <ShieldCheck aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-semibold text-texto">{master ? "Conta master" : "Conta isenta"}</span>
            <Chip tom="g">SEM COBRANÇA</Chip>
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-texto-2">
            {conta.isenta_motivo ? `Motivo: ${conta.isenta_motivo}. ` : ""}Esta conta não paga plano.
          </p>
        </div>
      </Cartao>
    </div>
  );
}
