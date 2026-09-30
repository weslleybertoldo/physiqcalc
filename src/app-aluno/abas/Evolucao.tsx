import { useMemo, useState } from "react";
import { ChartLine, CircleAlert, RefreshCw, WifiOff } from "lucide-react";
import { useSessao } from "@/nucleo/sessao";
import { matriculaDoApp } from "@/nucleo/situacao";
import { CLASSE_PAGINA_APP, TituloApp } from "@/app-aluno/perfil/pecas/TopoItem";
import { contagemAvaliacoes } from "@/evolucao/formato";
import { avaliacoesDaTabela, hojeSP, kpisDaSerie, periodoInicial, serieVazia, temDados, ultimaAvaliacao, variacaoDaMetrica } from "@/evolucao/serie";
import type { Avaliacao, Periodo } from "@/evolucao/tipos";
import { CardsMetricas } from "@/evolucao/ui/CardsMetricas";
import { CartaoFotos } from "@/evolucao/ui/CartaoFotos";
import { CartaoGrafico } from "@/evolucao/ui/CartaoGrafico";
import { CartaoUltimaAvaliacao } from "@/evolucao/ui/CartaoUltimaAvaliacao";
import { SheetAvaliacoes } from "@/evolucao/ui/SheetAvaliacoes";
import { SheetComparar } from "@/evolucao/ui/SheetComparar";
import { SheetComposicao } from "@/evolucao/ui/SheetComposicao";
import { useEvolucaoDoAluno, type EstadoEvolucao } from "@/evolucao/useEvolucaoDoAluno";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Esqueleto, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { Segmentado } from "@/ui/premium/Segmentado";

type PeriodoTela = Exclude<Periodo, "tudo">;
const PERIODOS: { valor: PeriodoTela; rotulo: string }[] = [
  { valor: "3m", rotulo: "3M" },
  { valor: "6m", rotulo: "6M" },
  { valor: "1a", rotulo: "1A" },
];

function EsqueletoEvolucao() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando a sua evolução" data-estado="carregando" className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-[9px]">
        {[0, 1, 2].map((i) => (
          <Cartao key={i} className="flex h-[98px] flex-col gap-3 px-3 py-[11px]">
            <Esqueleto className="h-3 w-3/5" />
            <Esqueleto className="mt-auto h-5 w-4/5" />
          </Cartao>
        ))}
      </div>
      <Cartao className="p-3.5">
        <Esqueleto className="h-3 w-2/5" />
        <Esqueleto className="mt-2 h-4 w-3/5" />
        <Esqueleto className="mt-4 h-[140px] w-full" />
      </Cartao>
      <Cartao className="flex items-center gap-3 p-3.5">
        <Esqueleto className="h-11 w-11 flex-none rounded-[14px]" />
        <div className="flex flex-1 flex-col gap-2">
          <Esqueleto className="h-3.5 w-2/5" />
          <Esqueleto className="h-3 w-3/5" />
        </div>
      </Cartao>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

/** Faixa do topo quando a tela está com o que já tinha sido aberto ou uma das partes não carregou. */
function AvisoParcial({ ev, temNutricao }: { ev: EstadoEvolucao; temNutricao: boolean }) {
  const semRede = ev.falhas.treino === "sem-conexao" || ev.falhas.principal === "sem-conexao";
  const erroTreino = ev.falhas.treino === "erro";
  const erroPrincipal = ev.falhas.principal === "erro" && temNutricao;
  if (!semRede && !erroTreino && !erroPrincipal) return null;
  const quando = ev.salvoEm ? new Date(ev.salvoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  const texto = semRede
    ? ev.deCache
      ? `Sem conexão · mostrando o que foi aberto${quando ? ` em ${quando.replace(",", " às")}` : ""}.`
      : "Sem conexão · as avaliações aparecem quando a internet voltar."
    : erroTreino && erroPrincipal
      ? "Não deu para carregar as avaliações agora."
      : erroTreino
        ? "Não deu para carregar as avaliações do seu personal."
        : "Não deu para carregar as avaliações da sua nutricionista.";
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5" style={{ borderColor: "var(--p-chip-a-borda)", background: "var(--p-chip-a-fundo)" }} data-evolucao-aviso={semRede ? "sem-conexao" : "erro"}>
      {semRede ? <WifiOff aria-hidden className="h-4 w-4 flex-none text-ambar-3" strokeWidth={1.75} /> : <CircleAlert aria-hidden className="h-4 w-4 flex-none text-ambar-3" strokeWidth={1.75} />}
      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-texto">{texto}</span>
      {!semRede && (
        <button type="button" onClick={ev.recarregar} className="flex flex-none items-center gap-1 text-[12px] font-semibold text-ambar-3" data-evolucao-tentar>
          <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Tentar
        </button>
      )}
    </div>
  );
}

/**
 * Aba Evolução do app do aluno (W10 — spec 4.3, tela 4; paridade C14, C24–C26, N-34, N-35): filtro 3M · 6M · 1A; cards Peso,
 * Gordura e Músculo com a variação do período; gráfico do peso com o ponto atual; "N avaliações" (a tabela com as variações);
 * a última avaliação com "Ver" (a composição completa, como a tela antiga); fotos de progresso com cadeado e o Comparar.
 * A série soma as avaliações e fotos dos 2 bancos (Calc e Nutri), em ordem de data e com o autor — nada é copiado de um
 * banco para o outro. Sem internet mostra o que já foi aberto. Entra na barra de abas pelo registro no lugar do UserDashboard.
 */
export default function Evolucao() {
  const { situacao } = useSessao();
  const ev = useEvolucaoDoAluno();
  const hoje = useMemo(() => hojeSP(), []);
  const [escolhido, setEscolhido] = useState<PeriodoTela | null>(null);
  const [folha, setFolha] = useState<"tabela" | "comparar" | null>(null);
  const [ver, setVer] = useState<Avaliacao | null>(null);
  const serie = ev.serie;
  const periodo: PeriodoTela = escolhido ?? (serie ? periodoInicial(serie, hoje) : "6m");
  const semProfissional = !!matriculaDoApp(situacao);
  const temNutricao = (situacao?.modulos_aluno ?? []).includes("nutricao");

  const dados = useMemo(() => {
    if (!serie) return null;
    // o N do botão = as linhas que a tabela abre (a mesma função); o gráfico = a mesma conta dos cards
    const avsPeriodo = avaliacoesDaTabela(serie, periodo, hoje, "periodo");
    const pesos = variacaoDaMetrica(serie.avaliacoes, "peso", periodo, hoje).pontos;
    const comDados = serie.avaliacoes.filter(temDados);
    return {
      vazia: serieVazia(serie),
      kpis: kpisDaSerie(serie, periodo, hoje),
      pesos,
      nPeriodo: avsPeriodo.length,
      nTotal: serie.avaliacoes.length,
      temAvaliacoes: comDados.length > 0,
      ultima: ultimaAvaliacao(serie),
    };
  }, [serie, periodo, hoje]);

  const mostrarFiltro = ev.fase === "pronto" && !!dados && !dados.vazia && (dados.temAvaliacoes || !!serie?.composicaoAtual);

  return (
    <div className={CLASSE_PAGINA_APP} data-aba-evolucao={ev.fase === "pronto" ? (dados?.vazia ? "vazia" : "dados") : ev.fase}>
      <div className="mt-1 flex items-center justify-between gap-3">
        <TituloApp>Evolução</TituloApp>
        {mostrarFiltro && <Segmentado<PeriodoTela> opcoes={PERIODOS} valor={periodo} aoMudar={setEscolhido} rotulo="Período" className="flex-none" />}
      </div>

      {ev.fase === "pronto" && <AvisoParcial ev={ev} temNutricao={temNutricao} />}

      {ev.fase === "carregando" && <EsqueletoEvolucao />}

      {ev.fase === "sem-conexao" && (
        <div data-evolucao-sem-conexao>
          <EstadoSemInternet titulo="Sem conexão" texto="A sua evolução aparece aqui quando a internet voltar. Depois de aberta uma vez, ela fica guardada no aparelho." />
        </div>
      )}

      {ev.fase === "erro" && (
        <div data-evolucao-erro>
          <EstadoErro titulo="Não deu para carregar a sua evolução" aoTentar={ev.recarregar} />
        </div>
      )}

      {ev.fase === "pronto" && serie && dados && dados.vazia && (
        <div data-evolucao-vazia>
          <EstadoVazio
            icone={ChartLine}
            titulo="Sua evolução aparece aqui"
            texto={
              semProfissional
                ? "As avaliações físicas e as fotos de progresso são feitas pelo seu profissional. Quando você tiver um, é só colocar o código dele no Perfil."
                : "Quando o seu profissional registrar a primeira avaliação, você vê aqui o peso, a gordura, o músculo e as fotos de progresso."
            }
            acao={
              dados.nTotal > 0 ? (
                <Botao variante="g" tamanho="sm" onClick={() => setFolha("tabela")} data-evolucao-ver-registros>
                  Ver {contagemAvaliacoes(dados.nTotal)} sem medidas
                </Botao>
              ) : undefined
            }
          />
        </div>
      )}

      {ev.fase === "pronto" && serie && dados && !dados.vazia && (
        <div className="flex flex-col gap-3" data-evolucao-conteudo>
          {(dados.temAvaliacoes || serie.composicaoAtual) && <CardsMetricas kpis={dados.kpis} />}
          {dados.temAvaliacoes && (
            <CartaoGrafico
              pontos={dados.pesos}
              periodo={periodo}
              hoje={hoje}
              contagem={dados.nPeriodo > 0 ? { texto: contagemAvaliacoes(dados.nPeriodo), n: dados.nPeriodo } : { texto: `${dados.nTotal} no total`, n: 0 }}
              aoAbrirTabela={() => setFolha("tabela")}
              textoSemPontos={periodo === "1a" ? "Nenhuma pesagem no último ano. Toque em “no total” para ver as anteriores." : "Nenhuma pesagem neste período. Escolha 1A para ver as anteriores."}
            />
          )}
          {dados.ultima && <CartaoUltimaAvaliacao av={dados.ultima} aoVer={() => setVer(dados.ultima)} />}
          <CartaoFotos sessao={serie.sessoes[0] ?? null} total={serie.fotos.length} aoComparar={() => setFolha("comparar")} />
        </div>
      )}

      {serie && (
        <>
          <SheetAvaliacoes
            aberto={folha === "tabela"}
            aoMudar={(v) => setFolha(v ? "tabela" : null)}
            serie={serie}
            hoje={hoje}
            periodo={periodo}
            aoVer={(av) => setVer(av)}
          />
          <SheetComparar aberto={folha === "comparar"} aoMudar={(v) => setFolha(v ? "comparar" : null)} sessoes={serie.sessoes} />
          <SheetComposicao av={ver} aoFechar={() => setVer(null)} />
        </>
      )}
    </div>
  );
}
