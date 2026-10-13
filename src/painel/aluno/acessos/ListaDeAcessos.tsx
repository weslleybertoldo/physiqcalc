import { Eye, RefreshCw, WifiOff } from "lucide-react";
import { mensagemErroAcessos } from "@/acessos/api";
import type { ChaveDeAcesso, NivelDasSeries } from "@/acessos/tipos";
import { existe } from "@/rotas/registro";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { useOnline } from "@/ui/premium/useOnline";
import { LinhaDeAcesso } from "./LinhaDeAcesso";
import {
  TEXTOS, avisoDaLinha, confirmacaoDoBloqueio, dicaDaLinha, estadoDasSeries, linhasVisiveis, nivelDaLinha, pedeConfirmacao, resumoDosAcessos,
  textoDaMudanca, type ChaveDaLinha,
} from "./regras";
import { useAcessosDoAluno, useMudarAcesso, useMudarSeries, useSeriesDoAluno } from "./useAcessos";

/**
 * As linhas da aba Acessos (W-A P4 — spec §4.1, §4.7): "o que o aluno pode no app", uma linha por parte, salvas na hora pela função acessos
 * (as 4 do principal) e pela treino-acessos (as séries, no Banco do Treino — carregam à parte, com o esqueleto e o erro delas, sem segurar as
 * outras). "App: Bloqueado" pede a confirmação do app; sem internet, os níveis ficam desligados com o aviso; quem só vê (pode_mudar = false)
 * vê tudo desligado. No rodapé, o resumo ("App liberado · séries: pode mexer · dieta: só ver · rotinas sempre").
 */
export function ListaDeAcessos({ alunoId, nome }: { alunoId: string; nome: string | null }) {
  const q = useAcessosDoAluno(alunoId);
  const d = q.data;
  const comTreino = !!d && d.modulos.includes("treino");
  const s = useSeriesDoAluno(alunoId, comTreino);
  const mudar = useMudarAcesso(alunoId);
  const mudarSeries = useMudarSeries(alunoId);
  const confirmar = useConfirmar();
  const online = useOnline();
  const comCardRotinas = existe("resumoAluno", "CardRotinas");

  if (q.isLoading) {
    return (
      <Cartao className="flex flex-col gap-3 px-[18px] py-4" data-aba-acessos="carregando" aria-busy="true">
        <Esqueleto className="h-5 w-1/3" />
        {[0, 1, 2, 3, 4, 5].map((i) => <Esqueleto key={i} className="h-[58px] w-full" />)}
      </Cartao>
    );
  }
  if (q.isError || !d) {
    const codigo = (q.error as { codigo?: string } | null)?.codigo ?? null;
    return (
      <EstadoErro
        titulo="Não deu para abrir os acessos"
        texto={mensagemErroAcessos(codigo)}
        aoTentar={codigo === "sem_acesso" || codigo === "aluno_inexistente" ? undefined : () => void q.refetch()}
      />
    );
  }

  const series = estadoDasSeries(comTreino, s, (c) => mensagemErroAcessos(c));
  const ocupado = mudar.isPending || mudarSeries.isPending;
  const travado = !d.pode_mudar || !online || ocupado;

  const escolher = async (chave: ChaveDaLinha, valor: string) => {
    if (chave === "rotinas") return;
    if (pedeConfirmacao(chave, valor)) {
      const c = confirmacaoDoBloqueio(nome);
      if (!(await confirmar({ titulo: c.titulo, descricao: c.descricao, rotuloConfirmar: "Bloquear", perigo: true }))) return;
    }
    if (chave === "treino_series") mudarSeries.mutate(valor as NivelDasSeries);
    else mudar.mutate({ chave: chave as ChaveDeAcesso, valor });
  };

  return (
    <Cartao className="flex min-w-0 flex-col px-[18px] py-4" data-aba-acessos="pronto" data-acessos-pode-mudar={d.pode_mudar ? "1" : "0"}>
      <CabecalhoCartao titulo="Acessos no app" />
      {!d.pode_mudar && (
        <p className="mb-1 flex items-start gap-2 text-[12px] leading-relaxed text-texto-2" data-acessos-so-leitura>
          <Eye aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-violeta-3" /> {TEXTOS.soLeitura}
        </p>
      )}
      {!online && (
        <p className="mb-1 flex items-start gap-2 text-[12px] leading-relaxed text-ambar-3" data-acessos-sem-internet>
          <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" /> {TEXTOS.semInternet}
        </p>
      )}
      <ul className="flex flex-col" data-acessos-lista>
        {linhasVisiveis(d).map((l) => {
          const ehSeries = l.chave === "treino_series";
          const semDieta = l.chave === "dieta" && !d.tem_nutricionista;
          const seriesSemNiveis = ehSeries && (series.tipo === "antes_do_acesso" || series.tipo === "outra_conta" || series.tipo === "erro");
          return (
            <LinhaDeAcesso
              key={l.chave}
              def={l}
              dica={dicaDaLinha(l, comCardRotinas)}
              valor={nivelDaLinha(l.chave, d.linhas, series)}
              desligado={travado || (l.chave === "acesso_app" && !d.tem_login) || (ehSeries && series.tipo === "pronto" && !series.podeMudar)}
              aviso={seriesSemNiveis ? null : avisoDaLinha(l.chave, d, series)}
              mudanca={l.chave === "rotinas" ? null : textoDaMudanca(d.mudancas[l.chave])}
              aoEscolher={(v) => void escolher(l.chave, v)}
              carregando={ehSeries && series.tipo === "carregando"}
              semNiveis={semDieta ? TEXTOS.semDieta : seriesSemNiveis ? avisoDaLinha(l.chave, d, series) : null}
              fixo={l.chave === "rotinas"}
              estado={ehSeries ? series.tipo : "pronto"}
              acao={
                ehSeries && series.tipo === "erro" ? (
                  <button type="button" onClick={() => void s.refetch()} className="flex items-center gap-1.5 text-[12px] font-semibold text-violeta-3"
                    data-acessos-series-tentar>
                    <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Tentar de novo
                  </button>
                ) : null
              }
            />
          );
        })}
      </ul>
      <p className="mt-2 border-t border-linha pt-2.5 text-[12.5px] font-medium text-texto-2" aria-live="polite" data-acessos-resumo>
        {resumoDosAcessos(d, series)}
      </p>
    </Cartao>
  );
}
