import { useMemo } from "react";
import { Link } from "react-router-dom";
import { num } from "@/evolucao/formato";
import { hojeSP, janelaDoGrafico, kpisDaSerie, ultimaAvaliacao } from "@/evolucao/serie";
import { GraficoLinha } from "@/evolucao/ui/GraficoLinha";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { chipDaUltima, pontosDoCard, textoDaProxima } from "../avaliacao/regras";
import { useAvaliacaoDoAluno } from "../avaliacao/useAvaliacaoDoAluno";

function Numero({ rotulo, valor, marca }: { rotulo: string; valor: string; marca: string }) {
  return (
    <div className="min-w-0" data-card-evolucao-numero={marca}>
      <div className="text-[12px] text-texto-2">{rotulo}</div>
      <b className="mt-0.5 block truncate text-[22px] font-bold tabular-nums tracking-[-0.03em] text-texto">{valor}</b>
    </div>
  );
}

/**
 * Card "Evolução" do Resumo do aluno (tela 7 — W17): o tipo e a data da última avaliação ("7 DOBRAS · 14/06"), o peso, o músculo
 * (massa muscular da balança ou massa magra), a próxima avaliação (NF7) e o gráfico do peso de 6 meses — os MESMOS números da aba
 * Avaliação e da Evolução do aluno (série única dos 2 bancos, W10). "Abrir" vai para a aba Avaliação.
 */
export default function CardEvolucao({ alunoId }: { alunoId: string }) {
  const ev = useAvaliacaoDoAluno(alunoId);
  const hoje = useMemo(() => hojeSP(), []);
  const serie = ev.serie;
  const d = useMemo(() => {
    if (!serie) return null;
    const [peso, , musculo] = kpisDaSerie(serie, "6m", hoje);
    const g = pontosDoCard(serie, hoje);
    return { peso, musculo, ultima: ultimaAvaliacao(serie), grafico: g };
  }, [serie, hoje]);
  const proxima = textoDaProxima(ev.dados?.treino?.proxima ?? null, hoje);
  const base = `/painel/alunos/${encodeURIComponent(alunoId)}`;
  if (ev.perfil && !ev.carregando && !serie && !ev.erro) return null;
  const chip = chipDaUltima(d?.ultima ?? null);
  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-evolucao={d?.ultima?.id ?? "vazio"}>
      <CabecalhoCartao
        titulo="Evolução"
        extra={chip ? <Chip tom="t" data-card-evolucao-ultima>{chip}</Chip> : undefined}
        acao={<Link to={`${base}/avaliacao`} className="text-[12.5px] font-semibold text-violeta-3" data-card-evolucao-abrir>Abrir</Link>}
      />
      {ev.carregando || (!serie && !ev.erro) ? (
        <Esqueleto className="h-[170px] w-full" />
      ) : ev.erro || !d ? (
        <p className="text-[12.5px] text-texto-3">Não deu para carregar agora.</p>
      ) : !d.ultima ? (
        <p className="text-[12.5px] leading-relaxed text-texto-3" data-card-evolucao-vazio>
          Nenhuma avaliação ainda. O personal registra a avaliação física e a nutricionista a antropometria, na aba Avaliação.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2" data-card-evolucao-numeros>
            <Numero rotulo="Peso" valor={d.peso.valor !== null ? `${num(d.peso.valor, 1)} kg` : "—"} marca="peso" />
            <Numero rotulo={d.musculo.titulo === "Músculo" ? "Músculo" : "M. magra"} valor={d.musculo.valor !== null ? `${num(d.musculo.valor, 1)} kg` : "—"} marca="musculo" />
            <Numero rotulo="Próxima" valor={proxima ? proxima.data : "—"} marca="proxima" />
          </div>
          {d.grafico.pontos.length >= 2 ? (
            <div className="mt-auto pt-3" data-card-evolucao-grafico={d.grafico.pontos.length}>
              <GraficoLinha pontos={d.grafico.pontos} janela={janelaDoGrafico(d.grafico.pontos, d.grafico.periodo, hoje)} altura={128} rotulo="Peso nos últimos meses" />
            </div>
          ) : (
            <p className="mt-auto pt-3 text-[12px] text-texto-3" data-card-evolucao-sem-grafico>Com mais uma pesagem, o gráfico do peso aparece aqui.</p>
          )}
        </>
      )}
    </Cartao>
  );
}
