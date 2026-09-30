import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Cartao } from "@/ui/premium/Cartao";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { Tabela, TabelaCabeca, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/ui/premium/Tabela";
import { autorCurto, contagemAvaliacoes, dataTabela, num, variacaoComSinal } from "../formato";
import {
  infoMetrica,
  janelaDoGrafico,
  linhasDaTabela,
  metricaDoMusculo,
  metricasComDados,
  noPeriodo,
  pontosDe,
  resumoDoPeriodo,
  tipoCurto,
  type Metrica,
} from "../serie";
import type { Avaliacao, Periodo, Serie } from "../tipos";
import { SetaVariacao } from "./CardsMetricas";
import { COR_DO_TOM } from "./tons";
import { GraficoLinha } from "./GraficoLinha";

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "3m", rotulo: "3M" },
  { valor: "6m", rotulo: "6M" },
  { valor: "1a", rotulo: "1A" },
  { valor: "tudo", rotulo: "Tudo" },
];

/**
 * "N avaliações" (tela 4 → C25): a tabela com as variações (cada avaliação, a mais recente primeiro, com o que mudou desde a
 * anterior), o gráfico de qualquer métrica (a "Gráficos de evolução" da tela antiga) e o resumo do período (a 1ª e a última).
 * Toque numa linha abre a composição daquela avaliação.
 */
export function SheetAvaliacoes({
  aberto,
  aoMudar,
  serie,
  hoje,
  periodoInicial,
  aoVer,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  serie: Serie;
  hoje: string;
  periodoInicial: Periodo;
  aoVer: (av: Avaliacao) => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);
  const [metrica, setMetrica] = useState<Metrica>("peso");
  useEffect(() => {
    if (aberto) setPeriodo(periodoInicial);
  }, [aberto, periodoInicial]);

  const avs = useMemo(() => noPeriodo(serie.avaliacoes, periodo, hoje), [serie.avaliacoes, periodo, hoje]);
  const metricas = useMemo(() => metricasComDados(avs), [avs]);
  const atual = metricas.includes(metrica) ? metrica : metricas[0] ?? "peso";
  const pontos = useMemo(() => pontosDe(avs, atual), [avs, atual]);
  const colunas = useMemo<Metrica[]>(() => ["peso", "gordura", metricaDoMusculo(serie)], [serie]);
  const linhas = useMemo(() => linhasDaTabela(avs, colunas, serie.objetivo), [avs, colunas, serie.objetivo]);
  const resumo = useMemo(() => resumoDoPeriodo(avs, serie.objetivo), [avs, serie.objetivo]);
  const info = infoMetrica(atual);

  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={aoMudar}
      titulo={contagemAvaliacoes(avs.length)}
      descricao="Cada avaliação com a variação desde a anterior. Toque numa linha para ver a composição."
      className="max-h-[92vh]"
    >
      <div className="flex flex-col gap-3.5 pb-2" data-sheet-avaliacoes={periodo}>
        <Segmentado<Periodo> opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} className="self-start" />

        {metricas.length > 0 && (
          <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-0.5" data-metricas-grafico>
            {metricas.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetrica(m)}
                aria-pressed={m === atual}
                data-metrica={m}
                className={cn("pq-chip flex-none", m === atual ? "pq-chip-t" : "pq-chip-g")}
              >
                {infoMetrica(m).curto}
              </button>
            ))}
          </div>
        )}

        {metricas.length > 0 && (
          <Cartao className="px-3.5 pb-2.5 pt-3" data-grafico-metrica={atual}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium text-texto-2">{info.rotulo}</span>
              {pontos.length > 0 && (
                <b className="text-[13px] font-semibold tabular-nums text-texto">
                  {num(pontos[pontos.length - 1].valor, info.casas)} {info.unidade}
                </b>
              )}
            </div>
            {pontos.length >= 2 ? (
              <div className="mt-2">
                <GraficoLinha pontos={pontos} janela={janelaDoGrafico(pontos, periodo, hoje)} altura={120} rotulo={`${info.rotulo} no período`} />
              </div>
            ) : (
              <p className="mt-2 pb-1 text-[12.5px] text-texto-2">Com 2 avaliações com {info.rotulo.toLowerCase()} no período, o gráfico aparece aqui.</p>
            )}
          </Cartao>
        )}

        {linhas.length === 0 ? (
          <p className="text-[13px] text-texto-2" data-tabela-vazia>
            Nenhuma avaliação neste período.
          </p>
        ) : (
          <Tabela data-tabela-avaliacoes>
            <TabelaCabeca>
              <tr>
                <TabelaTitulo className="pl-0">Data</TabelaTitulo>
                {colunas.map((c) => (
                  <TabelaTitulo key={c} className="text-right">
                    {infoMetrica(c).curto}
                  </TabelaTitulo>
                ))}
              </tr>
            </TabelaCabeca>
            <TabelaCorpo>
              {linhas.map(({ av, celulas }) => (
                <TabelaLinha key={av.id} className="cursor-pointer" onClick={() => aoVer(av)} data-linha-avaliacao={av.id} data-linha-origem={av.origem}>
                  <TabelaCelula className="pl-0">
                    <div className="flex items-center gap-1.5">
                      <i aria-hidden className={cn("h-1.5 w-1.5 flex-none rounded-full", av.origem === "principal" ? "bg-verde-2" : "bg-violeta-2")} />
                      <b className="text-[13px] font-semibold text-texto">{dataTabela(av.data)}</b>
                    </div>
                    <div className="mt-0.5 truncate pl-3 text-[11px] text-texto-3" data-linha-autor>
                      {tipoCurto(av)} · {autorCurto(av.autor)}
                    </div>
                  </TabelaCelula>
                  {colunas.map((c) => {
                    const cel = celulas[c];
                    const i = infoMetrica(c);
                    return (
                      <TabelaCelula key={c} className="text-right" data-celula={c}>
                        <b className="text-[13px] font-semibold text-texto">{num(cel?.valor ?? null, i.casas)}</b>
                        {cel?.delta !== null && cel?.delta !== undefined && (
                          <div className={cn("mt-0.5 flex items-center justify-end gap-0.5 text-[10.5px] font-semibold", COR_DO_TOM[cel.tom])}>
                            <SetaVariacao delta={cel.delta} className="h-3 w-3" />
                            {variacaoComSinal(cel.delta, i.casas)}
                          </div>
                        )}
                      </TabelaCelula>
                    );
                  })}
                </TabelaLinha>
              ))}
            </TabelaCorpo>
          </Tabela>
        )}

        {resumo.length > 0 && avs.length >= 2 && (
          <section data-resumo-periodo>
            <h3 className="pq-eyebrow mb-2">Resumo do período</h3>
            <div className="flex flex-col divide-y divide-linha-3 rounded-2xl border border-linha bg-superficie-3 px-3.5">
              {resumo.map((r) => (
                <div key={r.metrica} className="flex items-center gap-2 py-2.5 text-[12.5px]" data-resumo={r.metrica}>
                  <span className="min-w-0 flex-1 truncate text-texto-2">{r.rotulo}</span>
                  <span className="tabular-nums text-texto-2">{num(r.primeira, r.casas)}</span>
                  <span aria-hidden className="text-texto-4">→</span>
                  <b className="w-[52px] text-right font-semibold tabular-nums text-texto">{num(r.ultima, r.casas)}</b>
                  <span className={cn("flex w-[62px] items-center justify-end gap-0.5 font-semibold tabular-nums", COR_DO_TOM[r.tom])}>
                    {r.delta === null ? "—" : (
                      <>
                        <SetaVariacao delta={r.delta} className="h-3 w-3" />
                        {variacaoComSinal(r.delta, r.casas)}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PainelDeslizante>
  );
}
