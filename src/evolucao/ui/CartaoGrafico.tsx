import { Cartao } from "@/ui/premium/Cartao";
import { dataCurta, num } from "../formato";
import { infoMetrica, janelaDoGrafico, rotuloDoPeriodo, type Metrica, type PontoSerie } from "../serie";
import type { Periodo } from "../tipos";
import { GraficoLinha } from "./GraficoLinha";

/** A legenda das 2 linhas: a métrica principal (linha cheia) e a 2ª (tracejada), com o de → para de cada uma no período. */
function LegendaDuasLinhas({ pontos, metrica, segunda }: { pontos: PontoSerie[]; metrica: Metrica; segunda: { pontos: PontoSerie[]; metrica: Metrica; cor: string } }) {
  const a = infoMetrica(metrica);
  const b = infoMetrica(segunda.metrica);
  const deAte = (ps: PontoSerie[], casas: number, un: string) =>
    ps.length >= 2 ? `${num(ps[0].valor, casas)} → ${num(ps[ps.length - 1].valor, casas)} ${un}` : ps.length === 1 ? `${num(ps[0].valor, casas)} ${un}` : "sem dados no período";
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-texto-2" data-grafico-legenda>
      <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-[3px] w-4 rounded-full" style={{ background: "var(--p-violeta-2)" }} />{a.rotulo} · {deAte(pontos, a.casas, a.unidade)}</span>
      <span className="inline-flex items-center gap-1.5" data-grafico-legenda-segunda={segunda.pontos.length}>
        <i aria-hidden className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: segunda.cor }} />{b.rotulo} · {deAte(segunda.pontos, b.casas, b.unidade)}
      </span>
    </div>
  );
}

/**
 * Card do gráfico da tela 4 (borda de luz): "Peso nos últimos 6 meses", "De 90,3 kg pra 84,2 kg", o chip "N avaliações"
 * (abre a tabela) e o balão com o ponto atual. Com menos de 2 valores no período, o card explica em vez do gráfico.
 */
export function CartaoGrafico({
  pontos,
  metrica = "peso",
  periodo,
  hoje,
  contagem,
  aoAbrirTabela,
  textoSemPontos = "As avaliações do período aparecem aqui.",
  segunda,
}: {
  pontos: PontoSerie[];
  metrica?: Metrica;
  periodo: Periodo;
  hoje: string;
  /** avaliações no período (o chip); null esconde o chip */
  contagem: { texto: string; n: number } | null;
  aoAbrirTabela?: () => void;
  /** texto quando o período não tem nenhum valor (ex.: "Escolha 1A para ver as anteriores.") */
  textoSemPontos?: string;
  /**
   * H5 (painel › Avaliação, achado 9 do FIM-1b): a 2ª métrica no mesmo gráfico (o % de gordura, como no Nutri), com a legenda
   * embaixo. O app (tela 4) não passa: o gráfico dele fica igual.
   */
  segunda?: { pontos: PontoSerie[]; metrica: Metrica; cor: string };
}) {
  const info = infoMetrica(metrica);
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  const titulo =
    pontos.length >= 2
      ? `De ${num(primeiro.valor, info.casas)} ${info.unidade} pra ${num(ultimo.valor, info.casas)} ${info.unidade}`
      : pontos.length === 1
        ? `${num(ultimo.valor, info.casas)} ${info.unidade} em ${dataCurta(ultimo.data)}`
        : "Nenhuma avaliação no período";
  return (
    <Cartao brilho className="relative px-3.5 pb-2.5 pt-3.5" data-grafico-evolucao={metrica} data-grafico-periodo={periodo}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-texto-2">
            {info.rotulo} {rotuloDoPeriodo(periodo)}
          </div>
          <div className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-texto" data-grafico-titulo>
            {titulo}
          </div>
        </div>
        {contagem && (
          <button type="button" onClick={aoAbrirTabela} className="pq-chip pq-chip-g flex-none" data-evolucao-contagem={contagem.n}>
            {contagem.texto}
          </button>
        )}
      </div>
      {pontos.length >= 2 ? (
        <>
          <div
            className="pointer-events-none absolute right-3.5 top-[58px] rounded-[10px] px-[9px] py-1.5 text-[11.5px] font-bold tabular-nums"
            style={{ background: "var(--p-botao-w-fundo)", color: "var(--p-botao-w-texto)", boxShadow: "0 8px 20px -6px rgba(255,255,255,.4)" }}
            data-grafico-balao
          >
            {num(ultimo.valor, info.casas)} {info.unidade}
            <span className="block text-[10px] font-medium opacity-70">{dataCurta(ultimo.data)}</span>
          </div>
          <div className="mt-3.5">
            <GraficoLinha pontos={pontos} janela={janelaDoGrafico(pontos, periodo, hoje)} rotulo={`${info.rotulo} ${rotuloDoPeriodo(periodo)}`}
              linha2={segunda && segunda.pontos.length >= 2 ? { pontos: segunda.pontos, cor: segunda.cor } : undefined} />
          </div>
          {segunda && <LegendaDuasLinhas pontos={pontos} metrica={metrica} segunda={segunda} />}
        </>
      ) : (
        <p className="mt-3 pb-1.5 text-[12.5px] leading-relaxed text-texto-2" data-grafico-sem-pontos>
          {pontos.length === 1 ? "Com mais uma avaliação no período, o gráfico da evolução aparece aqui." : textoSemPontos}
        </p>
      )}
    </Cartao>
  );
}
