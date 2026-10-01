import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChartLine, ChevronDown, CircleAlert, ClipboardCheck, ClipboardPlus, RefreshCw, Ruler } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { principal } from "@/integrations/principal/client";
import { contagemAvaliacoes } from "@/evolucao/formato";
import { avaliacoesDaTabela, hojeSP, kpisDaSerie, periodoInicial, serieVazia, temDados, ultimaAvaliacao, variacaoDaMetrica } from "@/evolucao/serie";
import type { Avaliacao, Periodo } from "@/evolucao/tipos";
import { CardsMetricas } from "@/evolucao/ui/CardsMetricas";
import { CartaoGrafico } from "@/evolucao/ui/CartaoGrafico";
import { SheetAvaliacoes } from "@/evolucao/ui/SheetAvaliacoes";
import { SheetComparar } from "@/evolucao/ui/SheetComparar";
import { SheetComposicao } from "@/evolucao/ui/SheetComposicao";
import AntropometriaDialog from "@/nutricao/avaliacao/AntropometriaDialog";
import { baixarPDFAntropometria } from "@/nutricao/avaliacao/antropometriaPdf";
import type { Antropometria } from "@/nutricao/editor/lib/antropometrias";
import { ehProtocolo, type Protocolo } from "@/nutricao/editor/lib/antropometriaUtil";
import { useTreinoDoAlunoPainel } from "@/treino/editor/useTreinoDoAlunoPainel";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Segmentado } from "@/ui/premium/Segmentado";
import { avisarAvaliacaoNova } from "../avaliacao/avaliacaoApi";
import { CartaoProxima } from "../avaliacao/CartaoProxima";
import { DialogAvaliacaoFisica } from "../avaliacao/DialogAvaliacaoFisica";
import { CartaoFotosPainel, SheetFotos } from "../avaliacao/Fotos";
import { HistoricoAvaliacoes } from "../avaliacao/Historico";
import { aberturaDoParametro, permissoesDaAvaliacao, podeRegistrar, type TipoRegistro } from "../avaliacao/regras";
import { useAvaliacaoDoAluno } from "../avaliacao/useAvaliacaoDoAluno";
import { mensagemErroPerfil } from "../dados/regras";

type PeriodoTela = Exclude<Periodo, "tudo">;
const PERIODOS: { valor: PeriodoTela; rotulo: string }[] = [
  { valor: "3m", rotulo: "3M" },
  { valor: "6m", rotulo: "6M" },
  { valor: "1a", rotulo: "1A" },
];

function EsqueletoAvaliacao() {
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-busy="true" aria-label="Carregando a avaliação" data-avaliacao-estado="carregando">
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Cartao className="h-[330px] p-4"><Esqueleto className="h-full w-full" /></Cartao>
        <Cartao className="h-[330px] p-4"><Esqueleto className="h-full w-full" /></Cartao>
      </div>
      <Cartao className="h-[180px] p-4"><Esqueleto className="h-full w-full" /></Cartao>
    </div>
  );
}

/**
 * Perfil do aluno › Avaliação (W17 — spec §11.3 W17 e 4.5; paridade C34–C36, C83, N-34, N-35, NF7; telas 7 e 4): o histórico
 * ÚNICO das avaliações físicas do personal (Banco do Treino) e das antropometrias da nutricionista (banco principal), com o autor,
 * os cards Peso · Gordura · Músculo e o gráfico do peso da tela 4 (o MESMO da aba Evolução do aluno — src/evolucao, W10: o que o
 * painel mostra = o que o aluno vê), "Nova avaliação" com o formulário do Calc (personal) ou do Nutri (nutricionista) conforme o
 * papel, excluir, as fotos dos 2 bancos (subir e comparar 2 datas) e a próxima avaliação. ?nova=1 (o botão do cabeçalho) e
 * ?nova=antropometria (o atalho do Fluxo de consulta, W14) abrem o formulário.
 */
export default function Avaliacao({ alunoId }: { alunoId: string }) {
  const celular = useIsMobile();
  const [params, setParams] = useSearchParams();
  const ev = useAvaliacaoDoAluno(alunoId);
  const treinoEst = useTreinoDoAlunoPainel(alunoId);
  const p = ev.perfil;
  const serie = ev.serie;
  const hoje = useMemo(() => hojeSP(), []);
  const [escolhido, setEscolhido] = useState<PeriodoTela | null>(null);
  const [abrir, setAbrir] = useState<TipoRegistro | null>(null);
  const [editarAntropo, setEditarAntropo] = useState<Antropometria | null>(null);
  const [folha, setFolha] = useState<"tabela" | "comparar" | "fotos" | null>(null);
  const [ver, setVer] = useState<Avaliacao | null>(null);

  const podeMudarTreino = treinoEst.tipo === "ok" && !treinoEst.somenteLeitura;
  const perm = useMemo(() => (p ? permissoesDaAvaliacao(p, podeMudarTreino) : { fisica: false, antropometria: false }), [p, podeMudarTreino]);
  const treinoUserId = treinoEst.tipo === "ok" ? treinoEst.treinoUserId : ev.dados?.treino?.treinoUserId || null;
  const periodo: PeriodoTela = escolhido ?? (serie ? periodoInicial(serie, hoje) : "6m");

  // ?nova= abre o formulário do papel (depois que o estado do Treino chegou) e sai da URL
  const nova = params.get("nova");
  const treinoDefinido = treinoEst.tipo !== "carregando";
  useEffect(() => {
    if (!nova || !p || !treinoDefinido) return;
    const a = aberturaDoParametro(nova, perm);
    if (a === "fisica" || a === "antropometria") setAbrir(a);
    if (a === null) toast.message("Quem registra avaliação é o personal (física) ou a nutricionista (antropometria) do aluno.");
    const prox = new URLSearchParams(params);
    prox.delete("nova");
    setParams(prox, { replace: true });
    if (a === "escolher") window.setTimeout(() => document.querySelector<HTMLButtonElement>("[data-avaliacao-nova]")?.click(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o parâmetro chega e as permissões estão prontas
  }, [nova, !!p, treinoDefinido, perm.fisica, perm.antropometria]);

  const dados = useMemo(() => {
    if (!serie) return null;
    const avsPeriodo = avaliacoesDaTabela(serie, periodo, hoje, "periodo");
    return {
      vazia: serieVazia(serie),
      kpis: kpisDaSerie(serie, periodo, hoje),
      pesos: variacaoDaMetrica(serie.avaliacoes, "peso", periodo, hoje).pontos,
      nPeriodo: avsPeriodo.length,
      nTotal: serie.avaliacoes.length,
      temAvaliacoes: serie.avaliacoes.some(temDados),
      ultima: ultimaAvaliacao(serie),
    };
  }, [serie, periodo, hoje]);

  const brutaDe = (av: Avaliacao) => ev.dados?.principal?.antropometrias.find((a) => a.id === av.idOriginal) ?? null;
  const protocoloPadrao: Protocolo = useMemo(() => {
    const lista = ev.dados?.principal?.antropometrias ?? [];
    const ult = lista[lista.length - 1];
    return ult && ehProtocolo(ult.protocolo) ? ult.protocolo : "nenhum";
  }, [ev.dados]);

  // a antropometria nova nasce com o sexo, a idade, o peso e a altura que o aluno já tem (o cadastro do Nutri, senão o perfil do Treino)
  const padroesAntropo = useMemo(() => {
    const perfilTreino = (ev.dados?.treino?.parte.perfil ?? null) as Record<string, unknown> | null;
    const ultima = serie ? ultimaAvaliacao(serie) : null;
    const sexoT = perfilTreino?.sexo === "female" ? "feminino" : perfilTreino?.sexo === "male" ? "masculino" : null;
    const idadeT = typeof perfilTreino?.idade === "number" ? perfilTreino.idade : Number(perfilTreino?.idade) || null;
    return {
      sexo: (sexoT ?? (ultima?.sexo === "F" ? "feminino" : ultima?.sexo === "M" ? "masculino" : null)) as "masculino" | "feminino" | null,
      idade: idadeT ?? ultima?.idade ?? null,
      peso: ultima?.peso ?? null,
      altura: ultima?.altura ?? null,
    };
  }, [ev.dados, serie]);

  const pdf = (av: Avaliacao) => {
    const a = brutaDe(av);
    if (!a || !p) return;
    try {
      const nome = baixarPDFAntropometria({
        paciente: p.nome,
        nutricionista: a.autor_nome ?? null,
        data: new Date(`${a.data}T12:00:00`),
        peso: a.peso === null ? null : Number(a.peso),
        altura: a.altura === null ? null : Number(a.altura),
        sexo: a.sexo,
        idade: a.idade,
        protocolo: a.protocolo ?? "nenhum",
        circunferencias: a.circunferencias,
        dobras: a.dobras,
        resultados: a.resultados,
        observacao: a.observacao ?? null,
      });
      toast.success(`PDF gerado: ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  const editar = async (av: Avaliacao) => {
    const { data, error } = await principal.from("antropometrias").select("*").eq("id", av.idOriginal).maybeSingle();
    if (error || !data) {
      toast.error("Não deu para abrir esta antropometria agora.");
      return;
    }
    setEditarAntropo(data as Antropometria);
    setAbrir("antropometria");
  };

  const aoSalvar = async (aviso: boolean) => {
    if (aviso) await avisarAvaliacaoNova(alunoId);
    await ev.recarregar();
  };

  if (ev.carregando || (!!p && treinoEst.tipo === "carregando" && !ev.dados)) return <EsqueletoAvaliacao />;
  if (!p) {
    return <EstadoErro titulo="Não deu para abrir este aluno" texto={mensagemErroPerfil(ev.erro instanceof Error ? ev.erro.message : "")} />;
  }
  if (ev.erro || !serie || !dados) {
    return <EstadoErro titulo="Não deu para carregar a avaliação" aoTentar={() => void ev.recarregar()} />;
  }

  const falhou = ev.dados?.falhas;
  const algumaFalha = !!(falhou?.treino || falhou?.principal);
  const botaoNova = podeRegistrar(perm) ? (
    perm.fisica && perm.antropometria ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Botao variante="w" icone={ClipboardPlus} data-avaliacao-nova="escolher">
            Nova avaliação <ChevronDown aria-hidden className="h-4 w-4" />
          </Botao>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-linha-2 bg-tela font-body text-texto" data-avaliacao-nova-menu>
          <DropdownMenuItem onSelect={() => setAbrir("fisica")} className="cursor-pointer" data-avaliacao-nova-fisica>
            <ClipboardCheck size={14} className="mr-2" /> Avaliação física (treino)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAbrir("antropometria")} className="cursor-pointer" data-avaliacao-nova-antropometria>
            <Ruler size={14} className="mr-2" /> Antropometria (nutrição)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <Botao variante="w" icone={ClipboardPlus} onClick={() => setAbrir(perm.fisica ? "fisica" : "antropometria")} data-avaliacao-nova={perm.fisica ? "fisica" : "antropometria"}>
        {celular ? "Nova" : perm.fisica ? "Nova avaliação física" : "Nova antropometria"}
      </Botao>
    )
  ) : null;

  return (
    <div className="flex flex-col gap-3.5" data-aba-avaliacao={dados.vazia ? "vazia" : "dados"} data-avaliacao-total={dados.nTotal} data-avaliacao-treino={treinoEst.tipo}
      data-avaliacao-permissoes={`${perm.fisica ? "fisica" : ""}${perm.fisica && perm.antropometria ? "," : ""}${perm.antropometria ? "antropometria" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Avaliação</h2>
          <p className="text-[12.5px] text-texto-2" data-avaliacao-resumo>
            {dados.nTotal > 0 ? `${contagemAvaliacoes(dados.nTotal)} · do personal e da nutricionista, na mesma linha do tempo` : "As avaliações do personal e da nutricionista aparecem aqui juntas."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!dados.vazia && <Segmentado<PeriodoTela> opcoes={PERIODOS} valor={periodo} aoMudar={setEscolhido} rotulo="Período" />}
          {botaoNova}
        </div>
      </div>

      {algumaFalha && (
        <div className="flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5" style={{ borderColor: "var(--p-chip-a-borda)", background: "var(--p-chip-a-fundo)" }} data-avaliacao-aviso>
          <CircleAlert aria-hidden className="h-4 w-4 flex-none text-ambar-3" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 text-[12.5px] text-texto">
            {falhou?.treino && falhou?.principal ? "Parte das avaliações não carregou agora." : falhou?.treino ? "As avaliações do treino (personal) não carregaram agora." : "As antropometrias da nutricionista não carregaram agora."}
          </span>
          <button type="button" onClick={() => void ev.recarregar()} className="flex flex-none items-center gap-1 text-[12px] font-semibold text-ambar-3" data-avaliacao-tentar>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Tentar
          </button>
        </div>
      )}

      {dados.vazia ? (
        <EstadoVazio
          icone={ChartLine}
          titulo="Nenhuma avaliação ainda"
          texto={podeRegistrar(perm)
            ? "Registre a primeira: o peso, a gordura, as medidas e as fotos aparecem aqui e na Evolução do app do aluno."
            : "Quando o personal ou a nutricionista registrar a primeira avaliação, ela aparece aqui e na Evolução do app do aluno."}
          acao={botaoNova ?? undefined}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3.5">
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
          </div>
          <div className="flex min-w-0 flex-col gap-3.5">
            {ev.dados?.treino && (
              <CartaoProxima proxima={ev.dados.treino.proxima} hoje={hoje} podeMudar={perm.fisica} treinoUserId={treinoUserId} aoMudou={() => void ev.recarregar()} />
            )}
            <CartaoFotosPainel sessoes={serie.sessoes} total={serie.fotos.length} perm={perm} aoComparar={() => setFolha("comparar")} aoGerenciar={() => setFolha("fotos")} />
          </div>
        </div>
      )}

      {!dados.vazia && (
        <HistoricoAvaliacoes
          avaliacoes={serie.avaliacoes}
          perm={perm}
          nomeAluno={p.nome}
          linhasTreino={(ev.dados?.treino?.parte.avaliacoes ?? []) as Record<string, unknown>[]}
          treinoUserId={perm.fisica ? treinoUserId : null}
          aoVer={(av) => setVer(av)}
          aoPdf={pdf}
          aoEditar={perm.antropometria ? (av) => void editar(av) : undefined}
          aoExcluiu={() => void ev.recarregar()}
        />
      )}
      {dados.vazia && serie.fotos.length === 0 && podeRegistrar(perm) && (
        <CartaoFotosPainel sessoes={[]} total={0} perm={perm} aoComparar={() => {}} aoGerenciar={() => setFolha("fotos")} />
      )}

      <SheetAvaliacoes aberto={folha === "tabela"} aoMudar={(v) => setFolha(v ? "tabela" : null)} serie={serie} hoje={hoje} periodo={periodo}
        aoVer={(av) => setVer(av)} lado={celular ? "baixo" : "direita"} />
      <SheetComparar aberto={folha === "comparar"} aoMudar={(v) => setFolha(v ? "comparar" : null)} sessoes={serie.sessoes} lado={celular ? "baixo" : "direita"} />
      <SheetComposicao av={ver} aoFechar={() => setVer(null)} lado={celular ? "baixo" : "direita"} />
      <SheetFotos aberto={folha === "fotos"} aoMudar={(v) => setFolha(v ? "fotos" : null)} sessoes={serie.sessoes} perm={perm}
        treinoUserId={perm.fisica ? treinoUserId : null} pacienteId={p.paciente_id} aoMudou={() => void ev.recarregar()} />

      {perm.fisica && treinoUserId && (
        <DialogAvaliacaoFisica
          aberto={abrir === "fisica"}
          aoMudar={(v) => setAbrir(v ? "fisica" : null)}
          alunoId={alunoId}
          treinoUserId={treinoUserId}
          perfil={ev.dados?.treino?.parte.perfil ?? null}
          avaliacoes={serie.avaliacoes}
          aoSalvar={() => void ev.recarregar()}
        />
      )}
      {perm.antropometria && (
        <AntropometriaDialog
          open={abrir === "antropometria"}
          onOpenChange={(v) => {
            setAbrir(v ? "antropometria" : null);
            if (!v) setEditarAntropo(null);
          }}
          paciente={{ id: p.paciente_id, genero: p.genero, nascimento: p.nascimento }}
          protocoloPadrao={protocoloPadrao}
          sexoPadrao={padroesAntropo.sexo}
          idadePadrao={padroesAntropo.idade}
          pesoPadrao={padroesAntropo.peso}
          alturaPadrao={padroesAntropo.altura}
          antropometria={editarAntropo}
          onSalvo={(_a, modo) => void aoSalvar(modo === "criada")}
        />
      )}
    </div>
  );
}
