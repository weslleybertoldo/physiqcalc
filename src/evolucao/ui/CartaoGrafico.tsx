import { Cartao } from "@/ui/premium/Cartao";
import { dataCurta, num } from "../formato";
import { infoMetrica, janelaDoGrafico, rotuloDoPeriodo, type Metrica, type PontoSerie } from "../serie";
import type { Periodo } from "../tipos";
import { GraficoLinha } from "./GraficoLinha";

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
            <GraficoLinha pontos={pontos} janela={janelaDoGrafico(pontos, periodo, hoje)} rotulo={`${info.rotulo} ${rotuloDoPeriodo(periodo)}`} />
          </div>
        </>
      ) : (
        <p className="mt-3 pb-1.5 text-[12.5px] leading-relaxed text-texto-2" data-grafico-sem-pontos>
          {pontos.length === 1 ? "Com mais uma avaliação no período, o gráfico da evolução aparece aqui." : textoSemPontos}
        </p>
      )}
    </Cartao>
  );
}
