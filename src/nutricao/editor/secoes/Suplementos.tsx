// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Suplementos.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, FileDown, Flag, Package, Pencil, Pill, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import CatalogoDialog from "@/nutricao/editor/ui/CatalogoDialog";
import IndicacaoDialog from "@/nutricao/editor/ui/IndicacaoDialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import {
  alternarAtiva, dadosProfissionais, excluirIndicacao, listarIndicacoesDoPaciente, listarProdutos, nomeDaNutricionista, salvarOrdem, type Indicacao, type Produto,
} from "@/nutricao/editor/lib/suplementos";
import { baixarPDFSuplementos } from "@/nutricao/editor/lib/suplementosPdf";
import {
  fmtData, inserirIndicacao, moverIndicacao, mudancasDeOrdem, proximaOrdem, rotuloCategoria, separarIndicacoes, textoContagemIndicacoes, textoEncerradas, textoPosologia,
  textoProduto,
} from "@/nutricao/editor/lib/suplementosUtil";
import { usePaciente } from "@/nutricao/editor/ui/contexto";

const CARD = "pq-cartao min-w-0 space-y-3 px-[18px] py-4";
const TITULO = "flex items-center gap-1.5 font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto";
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const BTN_SETA = "inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-30";
const CHIP = "pq-chip pq-chip-g";

// Seção "Suplementos e produtos" (referência: só o vazio 'Nenhum produto indicado' / 'criar lista de produtos' — o WDMarket deles é
// marketplace; o nosso é o CATÁLOGO da nutricionista + a lista de produtos indicados pro paciente). SEM indicação → vazio da
// referência. COM → cabeçalho 'N produtos indicados · N ativos' + Indicar produto / Meus produtos / PDF (só das ativas), lista das
// ATIVAS na `ordem` (▲▼, Editar, Encerrar, Excluir) e bloco 'Encerradas (N)' colapsável (Reativar, Excluir). Cada indicação guarda a
// CÓPIA do produto: editar/excluir o catálogo não reescreve o histórico. Lê `produtos` (catálogo) e `indicacoes_produto` em paralelo.
export default function Suplementos() {
  const { paciente: p, recarregar } = usePaciente();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const chaveP = useMemo(() => ["produtos", uid], [uid]);
  const chaveI = useMemo(() => ["indicacoes-produto", p.id], [p.id]);
  const pQ = useQuery({ queryKey: chaveP, queryFn: listarProdutos, enabled: !!uid });
  const iQ = useQuery({ queryKey: chaveI, queryFn: () => listarIndicacoesDoPaciente(p.id) });
  const perfilQ = useQuery({
    queryKey: ["perfil-pdf", uid],
    queryFn: async () => {
      const [nome, profissional] = await Promise.all([nomeDaNutricionista(uid ?? ""), dadosProfissionais(uid ?? "")]);
      return { nome, profissional };
    },
    enabled: !!uid,
  });
  const carregando = !uid || pQ.isPending || iQ.isPending;
  const atualizando = carregando || pQ.isFetching || iQ.isFetching;
  const erro = pQ.error ?? iQ.error;

  const produtos = useMemo(() => pQ.data ?? [], [pQ.data]);
  const indicacoes = useMemo(() => iQ.data ?? [], [iQ.data]);
  const { ativas, encerradas } = useMemo(() => separarIndicacoes(indicacoes), [indicacoes]);
  const total = indicacoes.length;

  const [modalIndicacao, setModalIndicacao] = useState<{ aberto: boolean; indicacao: Indicacao | null }>({ aberto: false, indicacao: null });
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<Indicacao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [salvando, setSalvando] = useState(0); // gravações assíncronas fora dos modais — o E2E espera voltar a 0

  const setIndicacoes = (fn: (old: Indicacao[]) => Indicacao[]) => qc.setQueryData<Indicacao[]>(chaveI, (old) => fn(old ?? []));
  const onIndicacaoSalva = (i: Indicacao) => {
    setIndicacoes((old) => inserirIndicacao(old, i));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const onProdutoCriado = (novo: Produto) => qc.setQueryData<Produto[]>(chaveP, (old) => [novo, ...(old ?? []).filter((x) => x.id !== novo.id)]);
  const onCatalogoMudou = async () => {
    await pQ.refetch();
  };

  const rodar = async (acao: () => Promise<void>, erroPadrao: string) => {
    setOcupado(true);
    setSalvando((n) => n + 1);
    try {
      await acao();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : erroPadrao);
    } finally {
      setOcupado(false);
      setSalvando((n) => n - 1);
    }
  };

  /** ▲▼: reordena as ativas (0..n) na cache e grava só as que mudaram; erro → relê do banco. */
  const mover = (id: string, direcao: -1 | 1) =>
    rodar(async () => {
      const depois = moverIndicacao(indicacoes, id, direcao);
      const mudancas = mudancasDeOrdem(ativas, depois);
      if (!mudancas.length) return;
      setIndicacoes((old) => old.map((x) => {
        const m = mudancas.find((c) => c.id === x.id);
        return m ? { ...x, ordem: m.ordem } : x;
      }));
      try {
        await salvarOrdem(mudancas);
      } catch (e) {
        await iQ.refetch();
        throw e;
      }
    }, "Não foi possível reordenar");

  /** Encerrar (sai das ativas, fica no histórico) / Reativar (volta no fim da lista). Reversível — sem confirmação. */
  const alternar = (i: Indicacao) =>
    rodar(async () => {
      const r = await alternarAtiva(i.id, !i.ativa, proximaOrdem(ativas));
      setIndicacoes((old) => inserirIndicacao(old, r));
      toast.success(r.ativa ? "Indicação reativada" : "Indicação encerrada");
      void recarregar();
    }, "Não foi possível alterar a indicação");

  const excluir = () =>
    rodar(async () => {
      if (!paraExcluir) return;
      const alvo = paraExcluir;
      await excluirIndicacao(alvo.id);
      setIndicacoes((old) => old.filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success("Indicação excluída");
    }, "Não foi possível excluir a indicação");

  const pdf = () => {
    try {
      const nome = baixarPDFSuplementos({
        paciente: p.nome,
        nascimento: p.nascimento,
        nutricionista: perfilQ.data?.nome ?? null,
        profissional: perfilQ.data?.profissional ?? null,
        emitidoEm: new Date(),
        ativas,
      });
      toast.success("PDF gerado", { description: nome });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  const abrirNova = () => setModalIndicacao({ aberto: true, indicacao: null });

  return (
    <div
      className="space-y-4"
      data-secao-suplementos
      data-atualizando={atualizando ? "1" : "0"}
      data-salvando-suplementos={salvando}
      data-total-indicacoes={total}
      data-contagem-indicacoes={ativas.length}
    >
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-suplementos>
          Não foi possível carregar os suplementos e produtos: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      {!carregando && !erro && total === 0 && (
        <section className={CARD} data-card="vazio">
          <h2 className={TITULO}>
            <Pill size={12} aria-hidden="true" /> Suplementos e produtos
          </h2>
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-suplementos-vazio>
            <Pill className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhum produto indicado</p>
            <p className="text-xs text-texto-2 font-body">Monte uma lista de produtos para complementar a dieta do seu aluno.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button type="button" onClick={abrirNova} className={BTN_PRI} disabled={!uid} data-btn-criar-lista>
                <Plus size={12} aria-hidden="true" /> Criar lista de produtos
              </button>
              <button type="button" onClick={() => setCatalogoAberto(true)} className={BTN_SEC} disabled={!uid} data-btn-meus-produtos>
                <Package size={12} aria-hidden="true" /> Meus produtos
              </button>
            </div>
          </div>
        </section>
      )}

      {total > 0 && (
        <section className={CARD} data-card="indicacoes">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className={TITULO}>
                <Pill size={12} aria-hidden="true" /> Suplementos e produtos
              </h2>
              <p className="text-[11px] text-texto-3 font-body" data-contagem-texto>{textoContagemIndicacoes(ativas.length, total)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={abrirNova} className={BTN_PRI} disabled={carregando} data-btn-nova-indicacao>
                <Plus size={12} aria-hidden="true" /> Indicar produto
              </button>
              <button type="button" onClick={() => setCatalogoAberto(true)} className={BTN_MINI} data-btn-meus-produtos>
                <Package size={12} aria-hidden="true" /> Meus produtos
              </button>
              <button type="button" onClick={pdf} className={BTN_MINI} disabled={!ativas.length} data-leitura data-btn-pdf-suplementos>
                <FileDown size={12} aria-hidden="true" /> PDF
              </button>
            </div>
          </header>

          {ativas.length === 0 ? (
            <p className="text-xs text-texto-3 font-body italic" data-ativas-vazio>Nenhum produto ativo — reative um encerrado ou indique outro.</p>
          ) : (
            <ol className="divide-y divide-linha" data-lista-indicacoes>
              {ativas.map((i, k) => (
                <ItemIndicacao
                  key={i.id}
                  i={i}
                  posicao={k}
                  ultimo={k === ativas.length - 1}
                  ocupado={ocupado}
                  onSubir={() => void mover(i.id, -1)}
                  onDescer={() => void mover(i.id, 1)}
                  onEditar={() => setModalIndicacao({ aberto: true, indicacao: i })}
                  onAlternar={() => void alternar(i)}
                  onExcluir={() => setParaExcluir(i)}
                />
              ))}
            </ol>
          )}

          {encerradas.length > 0 && (
            <div className="border-t border-linha pt-3" data-indicacoes-encerradas={encerradas.length}>
              <button
                type="button"
                onClick={() => setMostrarEncerradas((v) => !v)}
                aria-expanded={mostrarEncerradas}
                className="text-xs text-texto-2 font-semibold uppercase tracking-wider inline-flex items-center gap-1 hover:text-texto"
                data-leitura data-btn-toggle-encerradas
              >
                {mostrarEncerradas ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />} {textoEncerradas(encerradas.length)}
              </button>
              {mostrarEncerradas && (
                <ul className="divide-y divide-linha mt-2" data-lista-encerradas>
                  {encerradas.map((i) => (
                    <ItemIndicacao key={i.id} i={i} posicao={null} ultimo ocupado={ocupado} onAlternar={() => void alternar(i)} onExcluir={() => setParaExcluir(i)} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <IndicacaoDialog
        open={modalIndicacao.aberto}
        onOpenChange={(aberto) => setModalIndicacao((m) => ({ ...m, aberto }))}
        nutricionistaId={uid ?? ""}
        pacienteId={p.id}
        produtos={produtos}
        indicacao={modalIndicacao.indicacao}
        proximaOrdem={proximaOrdem(ativas)}
        onSalvo={onIndicacaoSalva}
        onProdutoCriado={onProdutoCriado}
      />
      <CatalogoDialog open={catalogoAberto} onOpenChange={setCatalogoAberto} nutricionistaId={uid ?? ""} produtos={produtos} onMudou={onCatalogoMudou} />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta indicação?</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-texto-2">
              {paraExcluir ? <span className="text-texto">{textoProduto(paraExcluir)} · {textoPosologia(paraExcluir)}</span> : ""} sai da lista e vai pra lixeira. Pra só tirar da lista atual, use Encerrar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={ocupado} data-btn-confirmar-excluir-indicacao>
              {ocupado ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Uma indicação da lista (ativa: posição + ▲▼ + Editar + Encerrar + Excluir; encerrada: Reativar + Excluir) ----
function ItemIndicacao({
  i, posicao, ultimo, ocupado, onSubir, onDescer, onEditar, onAlternar, onExcluir,
}: {
  i: Indicacao;
  /** índice entre as ativas; null = encerrada */
  posicao: number | null;
  ultimo: boolean;
  ocupado: boolean;
  onSubir?: () => void;
  onDescer?: () => void;
  onEditar?: () => void;
  onAlternar: () => void;
  onExcluir: () => void;
}) {
  const ativa = posicao !== null;
  return (
    <li
      className={`py-2.5 flex flex-wrap items-start justify-between gap-2 ${ativa ? "" : "opacity-75"}`}
      data-indicacao={i.id}
      data-indicacao-ativa={ativa ? "1" : "0"}
      data-indicacao-ordem={i.ordem}
      data-indicacao-produto={i.produto_id ?? ""}
      data-indicacao-nome={i.produto_nome}
      data-indicacao-marca={i.produto_marca}
      data-indicacao-dose={i.dose}
    >
      <div className="min-w-0 flex items-start gap-2">
        {ativa && <span className="font-semibold text-xs text-verde-3 w-5 shrink-0 pt-0.5" data-indicacao-posicao={posicao + 1}>{posicao + 1}.</span>}
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-texto font-body flex flex-wrap items-center gap-1.5">
            <span className="font-semibold" data-indicacao-nome-texto>{i.produto_nome}</span>
            {i.produto_marca && <span className={CHIP} data-indicacao-chip="marca">{i.produto_marca}</span>}
            {i.produto_apresentacao && <span className={CHIP} data-indicacao-chip="apresentacao">{i.produto_apresentacao}</span>}
            <span className={CHIP} data-indicacao-chip="categoria">{rotuloCategoria(i.produto_categoria)}</span>
          </p>
          <p className="text-xs text-texto-2 font-body" data-indicacao-posologia>
            <span className="text-texto">{textoPosologia(i)}</span> · desde {fmtData(i.inicio)}
          </p>
          {i.observacao && <p className="text-xs text-texto-3 font-body whitespace-pre-line" data-indicacao-observacao>{i.observacao}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {ativa && (
          <>
            <button type="button" onClick={onSubir} className={BTN_SETA} disabled={ocupado || posicao === 0} title="Subir" aria-label="Subir" data-btn-subir-indicacao>
              <ArrowUp size={12} aria-hidden="true" />
            </button>
            <button type="button" onClick={onDescer} className={BTN_SETA} disabled={ocupado || ultimo} title="Descer" aria-label="Descer" data-btn-descer-indicacao>
              <ArrowDown size={12} aria-hidden="true" />
            </button>
            <button type="button" onClick={onEditar} className={BTN_MINI} data-btn-editar-indicacao>
              <Pencil size={12} aria-hidden="true" /> Editar
            </button>
          </>
        )}
        <button type="button" onClick={onAlternar} className={BTN_MINI} disabled={ocupado} data-btn-alternar-indicacao>
          {ativa ? <Flag size={12} aria-hidden="true" /> : <RotateCcw size={12} aria-hidden="true" />} {ativa ? "Encerrar" : "Reativar"}
        </button>
        <button type="button" onClick={onExcluir} className={BTN_MINI_PERIGO} disabled={ocupado} data-btn-excluir-indicacao>
          <Trash2 size={12} aria-hidden="true" /> Excluir
        </button>
      </div>
    </li>
  );
}
