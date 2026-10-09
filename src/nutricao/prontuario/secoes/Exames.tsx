// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Exames.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ClipboardList, FileDown, FlaskConical, PenLine, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, SELECT } from "@/nutricao/editor/ui/estilos";
import CatalogoExamesDialog from "@/nutricao/prontuario/ui/CatalogoExamesDialog";
import PedidoExameDialog from "@/nutricao/prontuario/ui/PedidoExameDialog";
import ResultadosDialog from "@/nutricao/prontuario/ui/ResultadosDialog";
import SituacaoBadge from "@/nutricao/prontuario/ui/SituacaoBadge";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import type { DadosProfissionais } from "@/nutricao/prontuario/lib/documentosUtil";
import {
  dadosProfissionais, excluirPedido, excluirResultado, garantirCatalogoExames, nomeDaNutricionista, paginaDeExames, paginaPedidosDoPaciente, type PedidoExame,
  type ResultadoExame,
} from "@/nutricao/prontuario/lib/exames";
import { baixarPDFPedido } from "@/nutricao/prontuario/lib/examesPdf";
import {
  agruparResultadosPorData, formatarDataExame, lerExames, situacaoDoResultado, textoContagemPedidos, textoContagemResultados, textoReferencia, textoResumoData,
  textoValor,
} from "@/nutricao/prontuario/lib/examesUtil";
import { usePaciente } from "@/nutricao/prontuario/ui/contexto";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";
import { Paginacao } from "@/ui/premium/Paginacao";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const TH = "text-left font-semibold text-[10px] uppercase tracking-wider text-texto-2 px-2 py-1.5";
const TD = "px-2 py-1.5 text-sm font-body align-middle";

type Alvo = { tipo: "pedido"; item: PedidoExame } | { tipo: "resultado"; item: ResultadoExame };

// Seção "Exames laboratoriais" do paciente (referência: pedido de exames + resultados). BLOCO 1 — pedidos: "Novo pedido" (chips do
// catálogo + outro exame), lista "dd/MM/yyyy · N exames" com Ver (lista dos exames + observação), PDF do pedido, Editar e Excluir
// (soft). BLOCO 2 — resultados: "Lançar resultados" em LOTE, "Catálogo" (★), filtro por exame (evolução de 1 exame em todas as
// datas), tabela agrupada por data com Exame · Valor · Unidade · Referência · Situação (fora da referência DESTACADO), Editar e
// Excluir (soft) por linha. Pedido e resultado guardam a própria cópia do catálogo.
export default function Exames() {
  const { paciente: p, recarregar } = usePaciente();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const [nomeNutri, setNomeNutri] = useState<string | null>(null);
  const [profissional, setProfissional] = useState<DadosProfissionais | null>(null);

  useEffect(() => {
    if (!user) return;
    void nomeDaNutricionista(user.id).then(setNomeNutri);
    void dadosProfissionais(user.id).then(setProfissional);
  }, [user]);

  const chavePedidos = useMemo(() => ["pedidos-exame", p.id], [p.id]);
  const chaveResultados = useMemo(() => ["resultados-exame", p.id], [p.id]);
  const [filtro, setFiltro] = useState("");
  // hml-14d (B21 · D32): as 2 listas em páginas do banco, com a página no endereço — os pedidos em páginas de 20 (?pagina_pedidos=) e
  // os resultados em páginas de 20 DATAS, cada uma com o dia inteiro (?pagina_exames=; o "Ver evolução de" volta à 1)
  const [totalPedidosLido, setTotalPedidosLido] = useState<number | null>(null);
  const [totalDatasLido, setTotalDatasLido] = useState<number | null>(null);
  const { pagina: paginaPedidos, irPara: irParaPedidos } = usePaginaNaUrl({ chave: "pagina_pedidos", total: totalPedidosLido });
  const { pagina: paginaExames, irPara: irParaExames } = usePaginaNaUrl({ chave: "pagina_exames", filtro, total: totalDatasLido });
  const pedidosQ = useQuery({ queryKey: [...chavePedidos, paginaPedidos], queryFn: () => paginaPedidosDoPaciente(p.id, paginaPedidos), placeholderData: keepPreviousData });
  const resultadosQ = useQuery({
    queryKey: [...chaveResultados, filtro, paginaExames], queryFn: () => paginaDeExames(p.id, filtro, paginaExames), placeholderData: keepPreviousData,
  });
  const catalogoQ = useQuery({ queryKey: ["exames-catalogo", uid], queryFn: () => garantirCatalogoExames(uid!), enabled: !!uid });
  const totalPedidosDaResposta = pedidosQ.data && !pedidosQ.isPlaceholderData ? pedidosQ.data.total : null;
  const totalDatasDaResposta = resultadosQ.data && !resultadosQ.isPlaceholderData ? resultadosQ.data.totalDatas : null;
  useEffect(() => {
    if (totalPedidosDaResposta !== null) setTotalPedidosLido(totalPedidosDaResposta);
  }, [totalPedidosDaResposta]);
  useEffect(() => {
    if (totalDatasDaResposta !== null) setTotalDatasLido(totalDatasDaResposta);
  }, [totalDatasDaResposta]);

  const pedidos = useMemo(() => pedidosQ.data?.itens ?? [], [pedidosQ.data]);
  const totalPedidos = pedidosQ.data?.total ?? 0;
  const paginaResultados = resultadosQ.data;
  const totalResultados = paginaResultados?.totalResultados ?? 0;
  const catalogo = useMemo(() => catalogoQ.data ?? [], [catalogoQ.data]);

  const carregando = !uid || pedidosQ.isPending || resultadosQ.isPending || catalogoQ.isPending;
  const atualizando = carregando || pedidosQ.isFetching || resultadosQ.isFetching || catalogoQ.isFetching;
  const erro = pedidosQ.error ?? resultadosQ.error ?? catalogoQ.error;

  const [modalPedido, setModalPedido] = useState<{ aberto: boolean; pedido: PedidoExame | null }>({ aberto: false, pedido: null });
  const [modalResultados, setModalResultados] = useState<{ aberto: boolean; resultado: ResultadoExame | null }>({ aberto: false, resultado: null });
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<Alvo | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(0); // gravações assíncronas fora dos modais — o E2E espera voltar a 0

  // os nomes do filtro, os números do topo e as datas da página vêm do banco (exames_do_aluno); o agrupamento e a ordem dentro do dia
  // seguem o examesUtil
  const nomesFiltro = useMemo(() => paginaResultados?.exames ?? [], [paginaResultados]);
  const grupos = useMemo(() => agruparResultadosPorData((paginaResultados?.datas ?? []).flatMap((d) => d.resultados)), [paginaResultados]);
  const foraDaReferencia = paginaResultados?.foraReferencia ?? 0;

  useEffect(() => {
    // o exame filtrado sumiu (excluído/editado) — conferido na resposta nova, não na de antes que segura a tela
    if (filtro && paginaResultados && !resultadosQ.isPlaceholderData && !nomesFiltro.some((n) => n === filtro)) setFiltro("");
  }, [filtro, nomesFiltro, paginaResultados, resultadosQ.isPlaceholderData]);

  // hml-14d: gravou → a página relê do banco (a lista em páginas não é mais montada aqui)
  const onPedidoSalvo = (_ped: PedidoExame) => {
    void qc.invalidateQueries({ queryKey: chavePedidos });
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const onResultadosSalvos = (_novos: ResultadoExame[]) => {
    void qc.invalidateQueries({ queryKey: chaveResultados });
    void recarregar();
  };
  const onResultadoEditado = (_r: ResultadoExame) => {
    void qc.invalidateQueries({ queryKey: chaveResultados });
    void recarregar();
  };
  const catalogoMudou = async () => {
    await qc.invalidateQueries({ queryKey: ["exames-catalogo"] });
  };

  const pdfPedido = (ped: PedidoExame) => {
    try {
      const nome = baixarPDFPedido({ paciente: p.nome, pedido: ped, nutricionista: nomeNutri, profissional, emitidoEm: new Date() });
      toast.success(`PDF gerado: ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setExcluindo(true);
    setSalvando((n) => n + 1);
    try {
      if (alvo.tipo === "pedido") {
        await excluirPedido(alvo.item.id);
        void qc.invalidateQueries({ queryKey: chavePedidos });
        toast.success(`Pedido de ${formatarDataExame(alvo.item.data)} excluído`);
      } else {
        await excluirResultado(alvo.item.id);
        void qc.invalidateQueries({ queryKey: chaveResultados });
        toast.success(`Resultado de ${alvo.item.exame} excluído`);
      }
      setParaExcluir(null);
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir");
    } finally {
      setExcluindo(false);
      setSalvando((n) => n - 1);
    }
  };

  const alternarDetalhe = (id: string) => setAbertos((a) => ({ ...a, [id]: !a[id] }));
  const linhaFora = (s: string): string => (s === "acima" ? "bg-[rgba(244,63,94,.05)]" : s === "abaixo" ? "bg-orange-500/5" : "");

  return (
    <div className="space-y-4" data-secao-exames data-atualizando={atualizando ? "1" : "0"} data-salvando-exame={salvando}>
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-exames>
          Não foi possível carregar os exames: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      {/* ---- BLOCO 1: pedidos ---- */}
      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="pedidos">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Pedidos de exames</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem-pedidos={totalPedidos}>
              {carregando ? "Carregando..." : textoContagemPedidos(totalPedidos)}
            </p>
          </div>
          <button type="button" onClick={() => setModalPedido({ aberto: true, pedido: null })} className={BTN_PRI} disabled={carregando} data-btn-novo-pedido>
            <Plus size={12} aria-hidden="true" /> Novo pedido
          </button>
        </header>

        {!carregando && !erro && totalPedidos === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-pedidos-vazio>
            <ClipboardList className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhum pedido de exames</p>
            <p className="text-xs text-texto-2 font-body">Peça exames marcando os do seu catálogo (ou escrevendo outros) e imprima o pedido em PDF pro laboratório.</p>
          </div>
        )}

        {pedidos.length > 0 && (
          <ul className="divide-y divide-linha border-t border-linha" data-lista-pedidos data-lista="pedidos-exame">
            {pedidos.map((ped) => {
              const exames = lerExames(ped.exames);
              const aberto = !!abertos[ped.id];
              return (
                <li key={ped.id} className="py-3 space-y-2" data-pedido={ped.id} data-pedido-data={ped.data} data-pedido-exames={exames.length} data-item>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <ClipboardList className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body" data-pedido-resumo>{textoResumoData(ped.data, exames.length)}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body truncate" data-pedido-previa>{exames.slice(0, 4).join(" · ")}{exames.length > 4 ? " · …" : ""}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => alternarDetalhe(ped.id)} className={BTN_MINI} aria-expanded={aberto} data-leitura data-btn-ver-pedido>
                        {aberto ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />} {aberto ? "Fechar" : "Ver"}
                      </button>
                      <button type="button" onClick={() => pdfPedido(ped)} className={BTN_MINI} data-leitura data-btn-pdf-pedido>
                        <FileDown size={12} aria-hidden="true" /> PDF
                      </button>
                      <button type="button" onClick={() => setModalPedido({ aberto: true, pedido: ped })} className={BTN_MINI} data-btn-editar-pedido>
                        <PenLine size={12} aria-hidden="true" /> Editar
                      </button>
                      <button type="button" onClick={() => setParaExcluir({ tipo: "pedido", item: ped })} className={BTN_MINI_PERIGO} data-btn-excluir-pedido>
                        <Trash2 size={12} aria-hidden="true" /> Excluir
                      </button>
                    </div>
                  </div>
                  {aberto && (
                    <div className="ml-6 border-l-2 border-verde/30 pl-3 space-y-1.5 text-xs font-body" data-pedido-detalhe>
                      <ol className="list-decimal pl-4 space-y-0.5" data-pedido-lista-exames>
                        {exames.map((nome, i) => (
                          <li key={i} className="text-texto" data-exame-pedido={i}>{nome}</li>
                        ))}
                      </ol>
                      {(ped.observacao ?? "").trim() && (
                        <p className="text-texto-2 whitespace-pre-wrap" data-pedido-observacao><span className="uppercase tracking-wider text-[10px]">Observações:</span> {ped.observacao}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Paginacao nome="pedidos-exame" pagina={paginaPedidos} total={totalPedidos} aoMudar={irParaPedidos} carregando={pedidosQ.isFetching} />
      </section>

      {/* ---- BLOCO 2: resultados ---- */}
      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="resultados">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Resultados</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem-resultados={totalResultados} data-fora-referencia={foraDaReferencia}>
              {carregando ? "Carregando..." : textoContagemResultados(totalResultados)}
              {!carregando && foraDaReferencia > 0 && <span className="text-rosa-3"> · {foraDaReferencia} fora da referência</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCatalogoAberto(true)} className={BTN_SEC} disabled={carregando} data-btn-catalogo-exames>
              <Star className="h-3.5 w-3.5" aria-hidden="true" /> Catálogo
            </button>
            <button type="button" onClick={() => setModalResultados({ aberto: true, resultado: null })} className={BTN_PRI} disabled={carregando} data-btn-lancar-resultados>
              <Plus size={12} aria-hidden="true" /> Lançar resultados
            </button>
          </div>
        </header>

        {totalResultados > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-texto-2 font-body" htmlFor="filtro-exame">Ver evolução de</label>
            <select id="filtro-exame" className={`${SELECT} sm:max-w-xs`} value={filtro} onChange={(e) => setFiltro(e.target.value)} data-filtro-exame>
              <option value="">Todos os exames</option>
              {nomesFiltro.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}

        {!carregando && !erro && totalResultados === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-resultados-vazio>
            <FlaskConical className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhum resultado lançado</p>
            <p className="text-xs text-texto-2 font-body">Lance os resultados dos exames em lote: a referência do catálogo é copiada e o que está fora dela fica destacado.</p>
          </div>
        )}

        {grupos.length > 0 && (
          <div className="space-y-3" data-lista="exames">
            {grupos.map((g) => (
              <div key={g.data} className="space-y-1" data-grupo-data={g.data} data-grupo-total={g.itens.length} data-item>
                <h3 className="font-semibold text-[11px] uppercase tracking-wider text-texto pt-1 font-body" data-grupo-titulo>{textoResumoData(g.data, g.itens.length)}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-t border-linha">
                    <thead>
                      <tr className="border-b border-linha">
                        <th className={TH}>Exame</th>
                        <th className={`${TH} text-right`}>Valor</th>
                        <th className={TH}>Unidade</th>
                        <th className={TH}>Referência</th>
                        <th className={TH}>Situação</th>
                        <th className={TH}><span className="sr-only">Ações</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-linha">
                      {g.itens.map((r) => {
                        const s = situacaoDoResultado(r);
                        const fora = s === "acima" || s === "abaixo";
                        return (
                          <tr
                            key={r.id}
                            className={linhaFora(s)}
                            data-resultado={r.id}
                            data-resultado-exame={r.exame}
                            data-resultado-valor={textoValor(r.valor, r.valor_texto)}
                            data-resultado-unidade={r.unidade ?? ""}
                            data-resultado-ref={textoReferencia(r.ref_min, r.ref_max, r.referencia_texto)}
                            data-situacao={s}
                          >
                            <td className={`${TD} text-texto`}>
                              {r.exame}
                              {(r.observacao ?? "").trim() && <p className="text-[11px] text-texto-2 whitespace-pre-wrap" data-resultado-observacao>{r.observacao}</p>}
                            </td>
                            <td className={`${TD} text-right tabular-nums ${fora ? "font-semibold text-texto" : "text-texto"}`}>{textoValor(r.valor, r.valor_texto)}</td>
                            <td className={`${TD} text-texto-2`}>{r.unidade || "—"}</td>
                            <td className={`${TD} text-texto-2`}>{textoReferencia(r.ref_min, r.ref_max, r.referencia_texto)}</td>
                            <td className={TD}><SituacaoBadge situacao={s} curto /></td>
                            <td className={`${TD} text-right`}>
                              <div className="inline-flex items-center gap-1.5">
                                <button type="button" onClick={() => setModalResultados({ aberto: true, resultado: r })} className={BTN_MINI} data-btn-editar-resultado>
                                  <PenLine size={12} aria-hidden="true" /> Editar
                                </button>
                                <button type="button" onClick={() => setParaExcluir({ tipo: "resultado", item: r })} className={BTN_MINI_PERIGO} data-btn-excluir-resultado>
                                  <Trash2 size={12} aria-hidden="true" /> Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
        <Paginacao nome="exames" pagina={paginaExames} total={paginaResultados?.totalDatas ?? 0} aoMudar={irParaExames} carregando={resultadosQ.isFetching} />
      </section>

      <PedidoExameDialog
        open={modalPedido.aberto}
        onOpenChange={(aberto) => setModalPedido((m) => ({ ...m, aberto }))}
        pacienteId={p.id}
        catalogo={catalogo}
        pedido={modalPedido.pedido}
        onSalvo={onPedidoSalvo}
      />
      <ResultadosDialog
        open={modalResultados.aberto}
        onOpenChange={(aberto) => setModalResultados((m) => ({ ...m, aberto }))}
        pacienteId={p.id}
        catalogo={catalogo}
        resultado={modalResultados.resultado}
        onSalvos={onResultadosSalvos}
        onEditado={onResultadoEditado}
      />
      <CatalogoExamesDialog open={catalogoAberto} onOpenChange={setCatalogoAberto} catalogo={catalogo} onMudou={catalogoMudou} />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{paraExcluir?.tipo === "pedido" ? "Excluir este pedido?" : "Excluir este resultado?"}</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {paraExcluir?.tipo === "pedido" && <>O pedido de <span className="text-texto">{formatarDataExame(paraExcluir.item.data)}</span> vai pra lixeira. Os resultados não mudam.</>}
              {paraExcluir?.tipo === "resultado" && <><span className="text-texto">{paraExcluir.item.exame}</span> de {formatarDataExame(paraExcluir.item.data)} vai pra lixeira. Os outros resultados não mudam.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={BTN_PERIGO}
              onClick={(e) => { e.preventDefault(); void excluir(); }}
              disabled={excluindo}
              {...(paraExcluir?.tipo === "resultado" ? { "data-btn-confirmar-excluir-resultado": "" } : { "data-btn-confirmar-excluir-pedido": "" })}
            >
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
