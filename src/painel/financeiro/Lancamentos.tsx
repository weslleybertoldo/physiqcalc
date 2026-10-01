// Physiq W19 — Painel › Financeiro › Lançamentos (N-19): porta da tela Financeiro do PhysiqNutri (main ca9f66f,
// src/pages/consultorio/Financeiro.tsx) no visual premium: período (presets + datas), totais do período (estornadas fora), busca, tipo,
// categoria e FORMA de pagamento (novo — spec 4.4), lista com "ver detalhes", editar, estornar/desfazer e excluir (lixeira) — e, para a
// entrada ligada a um aluno, "Emitir recibo" (o recibo do Nutri, a partir da entrada). Estado dos filtros na URL
// (?de=&ate=&tipo=&categoria=&forma=&q=), como no site antigo — o mesmo período mostra os mesmos números.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronUp, Pencil, Plus, ReceiptText, RotateCcw, Search, Tags, Trash2, Undo2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, DESCRICAO_JANELA, INPUT, JANELA, SELECT, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { podeEmitirRecibo } from "@/financeiro/recibos";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { BTN_MINI, CategoriasDialog } from "./Categorias";
import { excluirTransacao, listarTransacoes, marcarEstorno, type Transacao } from "./dados";
import {
  CHAVES_FILTRO_URL, FILTRO_TIPOS, METODOS, PRESETS, ehMetodo, ehPreset, ehTipo, filtrarTransacoes, filtrosAtivos, filtrosDaURL, filtrosParaURL, fmtBRL,
  fmtValorComSinal, formatarData, formatarDataHora, inserirOrdenado, noPeriodo, ordenarTransacoes, periodoDoPreset, presetDoPeriodo, rotuloMetodo,
  rotuloPeriodo, rotuloTipo, textoContagem, totais, type FiltrosFinanceiro, type Preset,
} from "./financeiroUtil";
import MovimentacaoDialog from "./MovimentacaoDialog";
import ModelosReciboDialog from "./ModelosReciboDialog";
import ReciboDialog from "./ReciboDialog";
import { CHAVES, type FinanceiroConta } from "./useFinanceiro";

const PAGINA = 20;
const ROTULO = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4";

function Par({ rotulo, valor, marca }: { rotulo: string; valor: string; marca?: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dotted border-linha-2 pb-1 text-[12.5px]" {...(marca ? { [`data-detalhe-${marca}`]: valor } : {})}>
      <dt className="text-texto-3">{rotulo}</dt>
      <dd className="text-right text-texto-2">{valor}</dd>
    </div>
  );
}

function TotalCartao({ rotulo, valor, cor, marca, sub }: { rotulo: string; valor: number; cor: string; marca: string; sub: string }) {
  return (
    <Cartao className="px-[18px] py-3.5" {...{ [`data-total-${marca}`]: valor.toFixed(2) }}>
      <div className="text-[12px] font-medium text-texto-2">{rotulo}</div>
      <b className={cn("mt-1 block text-[22px] font-bold tabular-nums tracking-[-0.02em]", cor)} data-total-texto>{fmtBRL(valor)}</b>
      <div className="mt-0.5 text-[11.5px] text-texto-3">{sub}</div>
    </Cartao>
  );
}

const ICONE = "inline-flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border border-linha bg-superficie text-texto-2 transition-colors hover:text-texto";

function Acao({ icone: Icone, rotulo, onClick, marca, perigo }: { icone: typeof Pencil; rotulo: string; onClick: () => void; marca: string; perigo?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={rotulo} title={rotulo} {...{ [marca]: "" }} className={cn(ICONE, perigo && "hover:text-rosa-3")}>
      <Icone aria-hidden className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}

/** Espaço da ação que não vale para a linha (as colunas ficam alinhadas). */
const Vaga = () => <span aria-hidden className="h-8 w-8 flex-none" />;

export default function Lancamentos({ f, params, setParams, aoNova }: {
  f: FinanceiroConta;
  params: URLSearchParams;
  setParams: (p: URLSearchParams, o?: { replace?: boolean }) => void;
  aoNova: () => void;
}) {
  const qc = useQueryClient();
  const filtros = useMemo(() => filtrosDaURL(params), [params]);
  const preset = useMemo(() => presetDoPeriodo(filtros), [filtros]);
  const [presetUI, setPresetUI] = useState<Preset | null>(null);
  const [busca, setBusca] = useState(filtros.q);

  const atualizar = useCallback((mudanca: Partial<FiltrosFinanceiro>) => {
    const novos = { ...filtrosDaURL(params), ...mudanca };
    const q = new URLSearchParams(params);
    for (const k of CHAVES_FILTRO_URL) q.delete(k);
    for (const [k, v] of Object.entries(filtrosParaURL(novos))) q.set(k, v);
    setParams(q, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (busca.trim() !== filtros.q) atualizar({ q: busca.trim() });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a digitação dispara
  }, [busca]);

  const escolherPreset = (p: string) => {
    if (!ehPreset(p)) return;
    if (p === "personalizado") return setPresetUI("personalizado");
    setPresetUI(null);
    atualizar(periodoDoPreset(p));
  };
  const mudarDe = (de: string) => {
    if (!de) return;
    setPresetUI(null);
    atualizar(de > filtros.ate ? { de, ate: de } : { de });
  };
  const mudarAte = (ate: string) => {
    if (!ate) return;
    setPresetUI(null);
    atualizar(ate < filtros.de ? { de: ate, ate } : { ate });
  };
  const limparFiltros = () => {
    setBusca("");
    atualizar({ tipo: "", categoria: "", metodo: "", q: "" });
  };

  const chave = useMemo(() => CHAVES.transacoes(f.contaId, filtros.de, filtros.ate), [f.contaId, filtros.de, filtros.ate]);
  const transacoesQ = useQuery({ queryKey: chave, queryFn: () => listarTransacoes(f.contaId, f.uid, filtros.de, filtros.ate), enabled: f.pronto });
  const lista = useMemo(() => transacoesQ.data ?? [], [transacoesQ.data]);
  const filtradas = useMemo(() => filtrarTransacoes(lista, filtros), [lista, filtros]);
  const tot = useMemo(() => totais(filtradas), [filtradas]);
  const comFiltro = filtrosAtivos(filtros);
  const [mostrando, setMostrando] = useState(PAGINA);
  useEffect(() => setMostrando(PAGINA), [filtros.de, filtros.ate, filtros.tipo, filtros.categoria, filtros.metodo, filtros.q]);
  const visiveis = filtradas.slice(0, mostrando);
  // categorias do filtro: as suas + as que aparecem no período (o dono vê as dos lançamentos da equipe)
  const opcoesCategoria = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of f.categorias.data ?? []) m.set(c.id, c.nome);
    for (const t of lista) if (t.categoria_id && t.categoria?.nome && !m.has(t.categoria_id)) m.set(t.categoria_id, t.categoria.nome);
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [f.categorias.data, lista]);

  const [modal, setModal] = useState<{ aberto: boolean; transacao: Transacao | null }>({ aberto: false, transacao: null });
  const [categoriasAberto, setCategoriasAberto] = useState(false);
  const [abertos, setAbertos] = useState<string[]>([]);
  const [paraEstornar, setParaEstornar] = useState<Transacao | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Transacao | null>(null);
  const [reciboDe, setReciboDe] = useState<Transacao | null>(null);
  const [modelosAberto, setModelosAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const alternar = (id: string) => setAbertos((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  /** Aplica a linha devolvida pelo banco na lista em memória (saiu do período? some) e confere com o servidor. */
  const aplicar = (t: Transacao) => {
    qc.setQueryData<Transacao[]>(chave, (old) => {
      const base = (old ?? []).filter((x) => x.id !== t.id);
      return noPeriodo(t.data, filtros) ? inserirOrdenado(base, t) : ordenarTransacoes(base);
    });
    void f.recarregar("transacoes");
  };
  const remover = (id: string) => {
    qc.setQueryData<Transacao[]>(chave, (old) => (old ?? []).filter((x) => x.id !== id));
    void f.recarregar("transacoes");
  };

  const estornar = async () => {
    if (!paraEstornar) return;
    const alvo = paraEstornar;
    setOcupado(true);
    try {
      const t = await marcarEstorno(alvo.id, !alvo.estornada);
      aplicar(t);
      setParaEstornar(null);
      toast.success(t.estornada ? "Movimentação estornada" : "Estorno desfeito");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível estornar");
    } finally {
      setOcupado(false);
    }
  };
  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setOcupado(true);
    try {
      await excluirTransacao(alvo.id);
      remover(alvo.id);
      setParaExcluir(null);
      toast.success("Movimentação excluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir");
    } finally {
      setOcupado(false);
    }
  };

  const carregando = (transacoesQ.isLoading && !transacoesQ.data) || (f.categorias.isLoading && !f.categorias.data);
  const contagem = carregando
    ? "Carregando..."
    : comFiltro
      ? `${textoContagem(filtradas.length)} de ${lista.length} no período`
      : `${textoContagem(lista.length)} no período`;
  const autor = (t: Transacao) => (f.dono && t.nutricionista_id !== f.uid ? f.assinaturaDe(t.nutricionista_id).nome ?? "outro profissional" : null);
  const alunoDo = (t: Transacao) => (t.paciente_id ? { id: t.paciente_id, nome: t.paciente?.nome ?? "Aluno", apelido: null, cpf: t.paciente?.cpf ?? null } : null);

  return (
    <div className="flex flex-col gap-3.5" data-aba-financeiro-conteudo="lancamentos" data-pagina-financeiro data-atualizando={transacoesQ.isFetching ? "1" : "0"}>
      <Cartao className="p-4" data-filtros-financeiro>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-[13px] text-texto-2" data-contagem={filtradas.length} data-contagem-periodo={lista.length}>{contagem}</p>
          <Botao tamanho="sm" icone={Tags} onClick={() => setCategoriasAberto(true)} data-btn-categorias>Categorias</Botao>
        </div>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]" data-periodo={`${filtros.de}|${filtros.ate}`}>
          <label className="block">
            <span className={ROTULO}>Período</span>
            <select className={SELECT} value={presetUI ?? preset} onChange={(e) => escolherPreset(e.target.value)} data-periodo-preset>
              {PRESETS.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={ROTULO}>De</span>
            <input type="date" className={INPUT} value={filtros.de} onChange={(e) => mudarDe(e.target.value)} data-periodo-de />
          </label>
          <label className="block">
            <span className={ROTULO}>Até</span>
            <input type="date" className={INPUT} value={filtros.ate} onChange={(e) => mudarAte(e.target.value)} data-periodo-ate />
          </label>
          <p className="pb-2.5 text-[12px] text-texto-3 sm:text-right" data-periodo-rotulo>{rotuloPeriodo(filtros)}</p>
        </div>
        <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <label className="relative flex items-center">
            <Search size={16} className="pointer-events-none absolute left-3 text-texto-3" aria-hidden="true" />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busque por descrição, aluno ou categoria"
              className="h-10 w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] pl-9 pr-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-verde-3"
              data-busca-transacoes />
          </label>
          <label className="block">
            <span className={ROTULO}>Tipo</span>
            <select className={SELECT} value={filtros.tipo} onChange={(e) => atualizar({ tipo: ehTipo(e.target.value) ? e.target.value : "" })} data-filtro-tipo>
              {FILTRO_TIPOS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={ROTULO}>Categoria</span>
            <select className={SELECT} value={filtros.categoria} onChange={(e) => atualizar({ categoria: e.target.value })} data-filtro-categoria>
              <option value="">Todas as categorias</option>
              {opcoesCategoria.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={ROTULO}>Forma</span>
            <select className={SELECT} value={filtros.metodo} onChange={(e) => atualizar({ metodo: ehMetodo(e.target.value) ? e.target.value : "" })} data-filtro-forma>
              <option value="">Todas as formas</option>
              {METODOS.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
            </select>
          </label>
        </div>
      </Cartao>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-totais>
        <TotalCartao rotulo="Entradas" valor={tot.entradas} cor="text-verde-2" marca="entradas" sub={`${tot.nEntradas} ${tot.nEntradas === 1 ? "entrada" : "entradas"}`} />
        <TotalCartao rotulo="Saídas" valor={tot.saidas} cor="text-rosa-3" marca="saidas" sub={`${tot.nSaidas} ${tot.nSaidas === 1 ? "saída" : "saídas"}`} />
        <TotalCartao rotulo="Saldo" valor={tot.saldo} cor={tot.saldo < 0 ? "text-rosa-3" : "text-texto"} marca="saldo"
          sub={tot.nEstornadas ? `${tot.nEstornadas} estornada${tot.nEstornadas === 1 ? "" : "s"} fora dos totais` : "entradas − saídas"} />
      </div>

      <Cartao className="px-[18px] pb-2 pt-4" data-lista-movimentacoes>
        <CabecalhoCartao titulo="Movimentações" extra={<Chip tom="g">{filtradas.length}</Chip>}
          acao={comFiltro ? <button type="button" onClick={limparFiltros} className={BTN_MINI} data-btn-limpar-filtros><X size={12} aria-hidden="true" /> Limpar filtros</button> : undefined} />
        {transacoesQ.error && (
          <EstadoErro titulo="Não foi possível carregar o financeiro" texto={transacoesQ.error instanceof Error ? transacoesQ.error.message : "erro"} aoTentar={() => void transacoesQ.refetch()} />
        )}
        {carregando ? (
          <div className="flex flex-col gap-2 pb-3" data-carregando-financeiro><Esqueleto className="h-12 w-full rounded-2xl" /><Esqueleto className="h-12 w-full rounded-2xl" /></div>
        ) : lista.length === 0 && !comFiltro ? (
          <EstadoVazio icone={Wallet} className="my-5" titulo="Nenhuma movimentação no período" texto="Registre entradas (consultas, planos) e saídas (aluguel, material) para ver o saldo do seu trabalho."
            acao={<Botao variante="w" icone={Plus} onClick={aoNova} data-btn-primeira-movimentacao>Nova movimentação</Botao>} />
        ) : filtradas.length === 0 ? (
          <EstadoVazio icone={Search} className="my-5" titulo="Nenhuma movimentação com esses filtros" acao={<Botao icone={X} onClick={limparFiltros}>Limpar filtros</Botao>} />
        ) : (
          <ul data-lista-transacoes>
            {visiveis.map((t) => {
              const aberto = abertos.includes(t.id);
              const entrada = t.tipo === "entrada";
              const por = autor(t);
              const pode = t.nutricionista_id === f.uid || f.dono;
              return (
                <li key={t.id} className="space-y-2 border-t border-linha-3 py-2.5 first:border-t-0" data-transacao={t.id} data-tipo={t.tipo}
                  data-estornada={t.estornada ? "1" : "0"} data-aberto={aberto ? "1" : "0"} data-valor={Number(t.valor).toFixed(2)}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-superficie", t.estornada ? "text-texto-4" : entrada ? "text-verde-2" : "text-rosa-3")}>
                        {entrada ? <ArrowUpCircle className="h-[18px] w-[18px]" aria-hidden="true" /> : <ArrowDownCircle className="h-[18px] w-[18px]" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-1.5 text-[13.5px] text-texto">
                          <span className={cn("text-texto-3", t.estornada && "line-through")} data-transacao-data>{formatarData(t.data)}</span>
                          <span className="text-texto-4">·</span>
                          <span className={cn("font-medium", t.estornada && "text-texto-3 line-through")} data-transacao-descricao>{t.descricao}</span>
                          {t.estornada && <Chip tom="a" className="h-[20px] text-[10px]" data-badge-estornada>ESTORNADA</Chip>}
                          {t.recibo_id && <Chip tom="t" className="h-[20px] text-[10px]" data-badge-recibo>RECIBO</Chip>}
                        </p>
                        <p className="flex flex-wrap gap-x-1.5 text-[11.5px] text-texto-3">
                          <span data-transacao-categoria>{t.categoria?.nome ?? "sem categoria"}</span>
                          <span>·</span>
                          <span data-transacao-metodo>{rotuloMetodo(t.metodo)}</span>
                          {t.paciente && (<><span>·</span><span data-transacao-paciente>{t.paciente.nome}</span></>)}
                          {por && (<><span>·</span><span data-transacao-autor>por {por}</span></>)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("w-[112px] text-right text-[14px] font-semibold tabular-nums", t.estornada ? "text-texto-3 line-through" : entrada ? "text-verde-2" : "text-rosa-3")} data-transacao-valor>
                        {fmtValorComSinal(t.tipo, Number(t.valor))}
                      </span>
                      <span className="flex flex-none items-center gap-1">
                        <Acao icone={aberto ? ChevronUp : ChevronDown} rotulo={aberto ? "Ocultar os detalhes" : "Ver detalhes"} onClick={() => alternar(t.id)} marca="data-btn-ver-transacao" />
                        {entrada && t.paciente_id && podeEmitirRecibo({ ...t, deleted_at: null })
                          ? <Acao icone={ReceiptText} rotulo="Emitir recibo" onClick={() => setReciboDe(t)} marca="data-btn-emitir-recibo" />
                          : <Vaga />}
                        {pode ? (
                          <>
                            <Acao icone={Pencil} rotulo="Editar" onClick={() => setModal({ aberto: true, transacao: t })} marca="data-btn-editar-transacao" />
                            <Acao icone={t.estornada ? Undo2 : RotateCcw} rotulo={t.estornada ? "Desfazer o estorno (volta a contar nos totais)" : "Estornar (sai dos totais sem apagar)"}
                              onClick={() => setParaEstornar(t)} marca="data-btn-estornar-transacao" />
                            <Acao icone={Trash2} rotulo="Excluir" perigo onClick={() => setParaExcluir(t)} marca="data-btn-excluir-transacao" />
                          </>
                        ) : (<><Vaga /><Vaga /><Vaga /></>)}
                      </span>
                    </div>
                  </div>
                  {aberto && (
                    <dl className="ml-0 grid grid-cols-1 gap-x-4 gap-y-1 rounded-2xl border border-linha bg-superficie-3 p-3 sm:ml-11 sm:grid-cols-2" data-transacao-detalhe>
                      <Par rotulo="Tipo" valor={rotuloTipo(t.tipo)} />
                      <Par rotulo="Valor" valor={fmtBRL(Number(t.valor))} />
                      <Par rotulo="Data" valor={formatarData(t.data)} />
                      <Par rotulo="Categoria" valor={t.categoria?.nome ?? "—"} marca="categoria" />
                      <Par rotulo="Forma" valor={rotuloMetodo(t.metodo)} marca="metodo" />
                      <Par rotulo="Aluno" valor={t.paciente?.nome ?? "—"} marca="paciente" />
                      <Par rotulo="Situação" valor={t.estornada ? "Estornada (fora dos totais)" : "Ativa"} />
                      <Par rotulo="Criada em" valor={formatarDataHora(t.created_at)} marca="criada" />
                      {por && <Par rotulo="Lançada por" valor={por} marca="autor" />}
                      {t.observacao && (
                        <div className="pt-1 text-[12.5px] sm:col-span-2">
                          <dt className="text-[11.5px] text-texto-3">Observação</dt>
                          <dd className="whitespace-pre-wrap text-texto-2" data-transacao-observacao>{t.observacao}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {filtradas.length > mostrando && (
          <div className="flex items-center justify-center gap-3 border-t border-linha-3 py-3">
            <span className="text-[12.5px] text-texto-3" data-mostrando>Mostrando {visiveis.length} de {filtradas.length} movimentações</span>
            <Botao tamanho="sm" onClick={() => setMostrando((m) => m + PAGINA)} data-ver-mais>Ver mais</Botao>
          </div>
        )}
      </Cartao>

      <MovimentacaoDialog open={modal.aberto} onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))} transacao={modal.transacao} uid={f.uid} contaId={f.contaId}
        categorias={f.categorias.data ?? []} alunos={f.alunos.data ?? []} onSalvo={aplicar} onGerenciarCategorias={() => setCategoriasAberto(true)} />
      <CategoriasDialog open={categoriasAberto} onOpenChange={setCategoriasAberto} uid={f.uid} contaId={f.contaId || null} categorias={f.categorias.data ?? []}
        onMudou={() => void f.recarregar("categorias")} />
      <ReciboDialog open={!!reciboDe} onOpenChange={(a) => { if (!a) setReciboDe(null); }} aluno={reciboDe ? alunoDo(reciboDe) : null}
        transacao={reciboDe ? { id: reciboDe.id, tipo: reciboDe.tipo, descricao: reciboDe.descricao, valor: Number(reciboDe.valor), data: reciboDe.data } : null}
        modelos={f.modelos.data ?? []} proximoNumero={(f.ultimo.data ?? 0) + 1} nomeProfissional={f.nomeProfissional} padrao={f.padrao} uid={f.uid}
        contaId={f.contaId || null} onSalvo={() => void f.recarregar("recibos")} onGerenciarModelos={() => setModelosAberto(true)} />
      <ModelosReciboDialog open={modelosAberto} onOpenChange={setModelosAberto} uid={f.uid} contaId={f.contaId || null} modelos={f.modelos.data ?? []}
        nomeProfissional={f.nomeProfissional} onMudou={() => f.recarregar("modelos")} />

      <AlertDialog open={!!paraEstornar} onOpenChange={(a) => { if (!a) setParaEstornar(null); }}>
        <AlertDialogContent className={JANELA}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>{paraEstornar?.estornada ? "Desfazer o estorno?" : "Estornar esta movimentação?"}</AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA}>
              {paraEstornar ? <><span className="text-texto">{paraEstornar.descricao}</span> ({fmtBRL(Number(paraEstornar.valor))}). </> : ""}
              {paraEstornar?.estornada ? "Ela volta a contar nos totais do período." : "Ela continua no histórico, riscada, mas sai dos totais do período."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PRI} onClick={(e) => { e.preventDefault(); void estornar(); }} disabled={ocupado} data-btn-confirmar-estorno>
              {ocupado ? "Salvando..." : paraEstornar?.estornada ? "Desfazer estorno" : "Estornar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!paraExcluir} onOpenChange={(a) => { if (!a) setParaExcluir(null); }}>
        <AlertDialogContent className={JANELA}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>Excluir esta movimentação?</AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA}>
              {paraExcluir ? <><span className="text-texto">{paraExcluir.descricao}</span> ({fmtBRL(Number(paraExcluir.valor))}) sai do financeiro e vai para a lixeira. Para manter o histórico, prefira estornar.</> : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={ocupado} data-btn-confirmar-excluir-transacao>
              {ocupado ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
