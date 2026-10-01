// Physiq W19 — "Cobranças do mês" (N-9 do Nutri: a rosca do mês por vencimento; + o "aguardando confirmação" do Pix do Calc), no visual
// da tela 7 (o anel da adesão): o anel mostra quanto do valor do mês já foi pago e a legenda as 4 situações com quantidade e valor.
import { Anel } from "@/ui/premium/Anel";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { fmtBRL } from "./financeiroUtil";
import { fracaoPaga, nomeDoMesLongo, type ChaveFatia, type FatiaCobranca } from "./resumo";

const COR: Record<ChaveFatia, string> = {
  pagas: "var(--p-verde-2)",
  aguardando: "var(--p-ciano)",
  abertas: "var(--p-ambar-2)",
  vencidas: "var(--p-rosa)",
};

export default function CobrancasDoMes({ fatias, hoje, aoVer }: { fatias: FatiaCobranca[]; hoje: string; aoVer: () => void }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const qtd = fatias.reduce((s, f) => s + f.qtd, 0);
  const pct = fracaoPaga(fatias);
  const mes = nomeDoMesLongo(hoje);
  return (
    <Cartao className="flex flex-col px-[22px] pb-4 pt-[18px]" data-cartao-cobrancas-mes data-cobrancas-mes-total={total.toFixed(2)}>
      <CabecalhoCartao
        titulo="Cobranças do mês"
        acao={<button type="button" onClick={aoVer} className="whitespace-nowrap text-[12.5px] font-semibold text-violeta-3" data-ver-mensalidades>Ver mensalidades</button>}
      />
      <div className="mt-1 flex items-center gap-4">
        <Anel pct={pct} tamanho={124} espessura={11} gradiente={["var(--p-verde)", "var(--p-lima)"]} rotulo={`${Math.round(pct * 100)}% pagas`}>
          <b className="text-[24px] font-bold tabular-nums tracking-[-0.03em] text-texto" data-cobrancas-mes-pct={Math.round(pct * 100)}>{Math.round(pct * 100)}%</b>
          <span className="text-[11px] text-texto-3">pagas</span>
        </Anel>
        <div className="min-w-0 flex-1 text-[12.5px] text-texto-2">
          <div className="text-[12.5px] text-texto-2">{qtd ? `${qtd} ${qtd === 1 ? "cobrança vence" : "cobranças vencem"} em ${mes}` : `Nada vence em ${mes}`}</div>
          <b className="mt-0.5 block text-[20px] font-bold tabular-nums tracking-[-0.02em] text-texto">{fmtBRL(total)}</b>
        </div>
      </div>
      <div className="mt-4 flex flex-col divide-y divide-linha-3" data-fatias>
        {fatias.map((f) => (
          <div key={f.chave} className="flex min-h-[42px] items-center gap-2.5 text-[13px]" data-fatia={f.chave} data-fatia-qtd={f.qtd} data-fatia-valor={f.valor.toFixed(2)}>
            <i aria-hidden className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: COR[f.chave], boxShadow: `0 0 8px ${COR[f.chave]}` }} />
            <span className="min-w-0 flex-1 truncate text-texto">{f.rotulo}</span>
            <span className="text-[12px] tabular-nums text-texto-3">{f.qtd}</span>
            <b className="w-[92px] text-right font-semibold tabular-nums text-texto">{fmtBRL(f.valor)}</b>
          </div>
        ))}
      </div>
    </Cartao>
  );
}
