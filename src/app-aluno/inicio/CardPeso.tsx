import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Scale, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { num, variacaoAbs } from "@/evolucao/formato";
import { hojeSP, kpisDaSerie, periodoInicial, variacaoDaMetrica } from "@/evolucao/serie";
import { SetaVariacao } from "@/evolucao/ui/CardsMetricas";
import { COR_DO_TOM } from "@/evolucao/ui/tons";
import { useEvolucaoDoAluno } from "@/evolucao/useEvolucaoDoAluno";
import { useTreinoDaPagina } from "@/ui/casca/treinoDaPagina";
import { Area } from "@/ui/premium/Area";
import { Esqueleto } from "@/ui/premium/Estados";
import { textoDoPeriodo } from "./pecas/regras";
import { useOQueOAlunoTem } from "./pecas/dados";

const CLASSE = "pq-cartao flex w-full min-h-[84px] items-center gap-3 px-3.5 py-3 text-left transition-colors hover:border-linha-2";

/**
 * Início › "Seu peso" (W12 — tela 1): o último peso, a variação no período e o gráfico — o MESMO card "Peso" da aba Evolução
 * no período em que ela abre (6M; 1A quando o 6M tem menos de 2 pesagens), com a série única dos 2 bancos (`src/evolucao/*`,
 * W10: as avaliações do personal e as antropometrias da nutricionista, somadas). Sem internet mostra o que já foi aberto (o
 * cache da Evolução). Tocar abre a Evolução. O aluno do app (sem profissional) não tem avaliação: o card não aparece.
 */
export default function CardPeso() {
  const tem = useOQueOAlunoTem();
  const treino = useTreinoDaPagina();
  if (tem.semProfissional) return null;
  // quem tem Treino: a série só é montada depois da sessão do Banco do Treino (a troca de token), como na aba Evolução (que a trava
  // da sessão segura) — senão o card mostraria por uns segundos só as avaliações da nutricionista e depois mudaria de número
  if (tem.treino && treino.tipo === "carregando") return <EsqueletoPeso />;
  return <Peso />;
}

function EsqueletoPeso() {
  return (
    <div className={CLASSE} data-card-peso="carregando" role="status" aria-busy="true" aria-label="Carregando o seu peso">
      <div className="flex flex-1 flex-col gap-2">
        <Esqueleto className="h-3 w-1/4" />
        <Esqueleto className="h-5 w-2/5" />
        <Esqueleto className="h-3 w-1/2" />
      </div>
      <Esqueleto className="h-[60px] w-[150px] flex-none" />
    </div>
  );
}

function Peso() {
  const navigate = useNavigate();
  const ev = useEvolucaoDoAluno();
  const hoje = useMemo(() => hojeSP(), []);
  const abrir = () => navigate("/evolucao");

  const dados = useMemo(() => {
    if (!ev.serie) return null;
    const periodo = periodoInicial(ev.serie, hoje);
    const kpi = kpisDaSerie(ev.serie, periodo, hoje)[0];
    const pontos = variacaoDaMetrica(ev.serie.avaliacoes, "peso", periodo, hoje).pontos;
    return { periodo, kpi, pontos };
  }, [ev.serie, hoje]);

  if (ev.fase === "carregando") return <EsqueletoPeso />;

  if (ev.fase === "sem-conexao" || ev.fase === "erro" || !dados) {
    const semRede = ev.fase === "sem-conexao";
    return (
      <div className={CLASSE} data-card-peso={semRede ? "sem-internet" : "erro"}>
        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full border border-linha bg-superficie">
          {semRede ? <WifiOff aria-hidden className="h-[18px] w-[18px] text-ambar-3" strokeWidth={1.75} /> : <Scale aria-hidden className="h-[18px] w-[18px] text-texto-3" strokeWidth={1.75} />}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] font-semibold text-texto">Seu peso</b>
          <span className="mt-0.5 block text-[12px] text-texto-2">{semRede ? "Sem conexão · aparece quando a internet voltar." : "Não deu para carregar agora."}</span>
        </span>
        {!semRede && (
          <button type="button" onClick={ev.recarregar} className="flex flex-none items-center gap-1 text-[12px] font-semibold text-violeta-3" data-card-peso-tentar>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Tentar
          </button>
        )}
      </div>
    );
  }

  const { kpi, pontos, periodo } = dados;
  if (kpi.valor === null) {
    return (
      <button type="button" onClick={abrir} className={CLASSE} data-card-peso="vazio">
        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full border border-linha bg-superficie text-texto-3">
          <Scale aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] font-semibold text-texto">Seu peso</b>
          <span className="mt-0.5 block text-[12px] text-texto-2">Aparece depois da sua primeira avaliação.</span>
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={abrir} className={CLASSE} data-card-peso="dados" data-peso-valor={kpi.valor} data-peso-variacao={kpi.variacao ?? ""} data-peso-periodo={periodo}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[12px] text-texto-2">
          Seu peso
          {ev.deCache && <WifiOff aria-label="Sem conexão · o que foi aberto por último" className="h-3 w-3 text-ambar-3" strokeWidth={1.75} data-card-peso-cache />}
        </span>
        <b className="mt-0.5 block text-[21px] font-bold tracking-[-0.02em] text-texto tabular-nums">
          {num(kpi.valor, kpi.casas)} {kpi.unidade}
        </b>
        <span className={cn("mt-0.5 flex items-center gap-[5px] text-[12px] font-semibold tabular-nums", kpi.variacao === null ? "text-texto-3" : COR_DO_TOM[kpi.tom])} data-peso-linha>
          {kpi.variacao === null ? (
            <span className="font-medium">sem variação {textoDoPeriodo(periodo)}</span>
          ) : (
            <>
              <SetaVariacao delta={kpi.variacao} className="h-3.5 w-3.5" />
              {variacaoAbs(kpi.variacao, kpi.casas)} {kpi.unidadeVariacao} {textoDoPeriodo(periodo)}
            </>
          )}
        </span>
      </span>
      {pontos.length >= 2 && (
        <span className="flex-none" data-peso-grafico={pontos.length}>
          <Area valores={pontos.map((p) => p.valor)} largura={150} altura={60} cor="var(--p-violeta-2)" pontoFinal rotulo={`Peso ${textoDoPeriodo(periodo)}`} />
        </span>
      )}
    </button>
  );
}
