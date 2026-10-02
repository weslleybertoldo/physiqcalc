// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Metas.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDashed, Eye, EyeOff, FileDown, Minus, Pause, PenLine, Play, Plus, Star, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import MetaDialog from "@/nutricao/editor/ui/MetaDialog";
import ModelosMetaDialog from "@/nutricao/editor/ui/ModelosMetaDialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { alternarAtiva, excluirMeta, garantirModelosMeta, listarMetasDoPaciente, listarModelosMeta, nomeDaNutricionista, type Meta } from "@/nutricao/editor/lib/metas";
import { baixarPDFMetas } from "@/nutricao/editor/lib/metasPdf";
import {
  DIAS_SEMANA, contarAtivas, diasParaAttr, filtrarMetas, inserirMeta, normalizarDias, ordenarMetas, textoContagemMetas, textoDias, textoInicio, textoPausadas,
} from "@/nutricao/editor/lib/metasUtil";
import { usePaciente } from "@/nutricao/editor/ui/contexto";
import { ultimosDias } from "@/nutricao/editor/lib/adesao";
import { diasDaMeta, resumoDaMeta, useMetasConcluidas } from "@/nutricao/editor/lib/metasConcluidas";
import { diaDaSemana } from "@/nutricao/app/metasUtil";
import { hojeSP, rotuloDoDia } from "@/nutricao/app/dia";
import { cn } from "@/lib/utils";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PRI = "inline-flex items-center gap-1 border border-verde/50 text-verde-3 font-semibold text-[10px] uppercase tracking-wider px-2.5 py-1 hover:bg-[rgba(16,185,129,.08)] transition-colors disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const CHIP = "pq-chip pq-chip-g";
const CHIP_ATIVO = `${CHIP} border-verde text-verde-3 bg-[rgba(16,185,129,.1)]`;
const CHIP_INATIVO = `${CHIP} border-linha-2 text-texto-2 hover:text-texto hover:border-verde/50`;
const BOLINHA = "inline-flex h-7 w-7 items-center justify-center rounded-full border font-semibold text-[9px] uppercase tracking-wider";
const BOLINHA_ON = `${BOLINHA} border-verde bg-verde text-[#04150F]`;
const BOLINHA_OFF = `${BOLINHA} border-linha text-texto-4`;

// Seção "Prescrição de metas" do paciente (referência: metas com os dias da semana Seg–Dom). Cabeçalho "N metas · X ativas",
// botões "Nova meta" / "Modelos" / "PDF das metas" (só com meta ativa) e o filtro "Mostrar pausadas"; lista "título · como ·
// 7 bolinhas Seg…Dom" com Pausar/Retomar (otimista), Editar e Excluir (soft). A meta guarda a própria cópia do modelo.
/** Os ✓ do aluno nos últimos 7 dias (H5 — N-40): ✓ marcada · ○ valia e não marcou · – a meta não vale no dia. */
function MarcadasPeloAluno({ meta, dias, hoje, concluidas, erro }: {
  meta: Meta;
  dias: string[];
  hoje: string;
  concluidas: { meta_id: string; data: string }[] | null;
  erro: boolean;
}) {
  if (erro) return <p className="ml-6 text-[11.5px] text-rosa-3 font-body" data-meta-marcadas-erro>Não deu para ler os ✓ do aluno agora.</p>;
  if (!concluidas) return <p className="ml-6 text-[11.5px] text-texto-3 font-body" data-meta-marcadas-carregando>Lendo os ✓ do aluno…</p>;
  const lista = diasDaMeta(meta, concluidas, dias);
  const r = resumoDaMeta(lista);
  return (
    <div className="ml-6 flex flex-wrap items-center gap-1.5" data-meta-marcadas={r.feitas} data-meta-devidas={r.devidas}>
      <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wider text-texto-3 font-body">✓ do aluno · 7 dias · {r.texto}</span>
      {lista.map((d) => {
        const curto = DIAS_SEMANA.find((x) => x.n === diaDaSemana(d.dia))?.curto ?? "";
        const estado = d.feita ? "marcada pelo aluno" : d.vale ? "não marcada" : "a meta não vale neste dia";
        return (
          <span
            key={d.dia}
            className={cn(
              "inline-flex h-[24px] items-center gap-1 rounded-[8px] border px-1.5 text-[11px] font-semibold font-body",
              d.feita ? "border-verde/40 bg-[rgba(16,185,129,.1)] text-verde-3" : d.vale ? "border-linha bg-[rgba(255,255,255,.03)] text-texto-3" : "border-transparent text-texto-4",
            )}
            title={`${rotuloDoDia(d.dia, hoje)}: ${estado}`}
            data-meta-dia={d.dia}
            data-feita={d.feita ? "1" : "0"}
            data-vale={d.vale ? "1" : "0"}
          >
            {d.feita ? <Check aria-hidden className="h-3 w-3" /> : d.vale ? <CircleDashed aria-hidden className="h-3 w-3" /> : <Minus aria-hidden className="h-3 w-3" />}
            {d.dia === hoje ? "Hoje" : curto}
          </span>
        );
      })}
    </div>
  );
}

export default function Metas() {
  const { paciente: p, recarregar, podeEditar } = usePaciente();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const [nomeNutri, setNomeNutri] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void nomeDaNutricionista(user.id).then(setNomeNutri);
  }, [user]);

  const chave = useMemo(() => ["metas-paciente", p.id], [p.id]);
  const metasQ = useQuery({ queryKey: chave, queryFn: () => listarMetasDoPaciente(p.id) });
  // H5 (item 10): quem só lê (o dono sem papel de nutri) não cria os modelos padrão — só lê os que existem (gravar é da nutri: RLS da W3)
  const modelosQ = useQuery({ queryKey: ["modelos-meta", uid, podeEditar], queryFn: () => (podeEditar ? garantirModelosMeta(uid!) : listarModelosMeta()), enabled: !!uid });

  const metas = useMemo(() => ordenarMetas(metasQ.data ?? []), [metasQ.data]);
  // H5 (N-40): os ✓ que o aluno marcou no app (metas_concluidas) nos últimos 7 dias — a nutri vê em cada meta
  const dias7 = useMemo(() => ultimosDias(7), []);
  const concluidasQ = useMetasConcluidas(p.id, dias7[0], dias7[dias7.length - 1]);
  const hoje = hojeSP();
  const modelos = useMemo(() => modelosQ.data ?? [], [modelosQ.data]);
  const ativas = useMemo(() => contarAtivas(metas), [metas]);
  const pausadas = metas.length - ativas;
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const visiveis = useMemo(() => filtrarMetas(metas, mostrarInativas), [metas, mostrarInativas]);

  const carregando = !uid || metasQ.isPending || modelosQ.isPending;
  const atualizando = carregando || metasQ.isFetching || modelosQ.isFetching;
  const erro = metasQ.error ?? modelosQ.error;

  const [modal, setModal] = useState<{ aberto: boolean; meta: Meta | null }>({ aberto: false, meta: null });
  const [modelosAberto, setModelosAberto] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<Meta | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [salvando, setSalvando] = useState(0); // gravações otimistas em andamento (o E2E espera voltar a 0)

  const onSalvo = (m: Meta) => {
    qc.setQueryData<Meta[]>(chave, (old) => inserirMeta(old ?? [], m));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const modelosMudaram = async () => {
    await qc.invalidateQueries({ queryKey: ["modelos-meta"] });
  };

  /** Pausar/retomar: a lista muda na hora; se o banco recusar, volta. */
  const alternar = async (m: Meta) => {
    const nova = !m.ativa;
    qc.setQueryData<Meta[]>(chave, (old) => (old ?? []).map((x) => (x.id === m.id ? { ...x, ativa: nova } : x)));
    setSalvando((n) => n + 1);
    try {
      const salva = await alternarAtiva(m.id, nova);
      qc.setQueryData<Meta[]>(chave, (old) => inserirMeta(old ?? [], salva));
      toast.success(nova ? `Meta "${m.titulo}" retomada` : `Meta "${m.titulo}" pausada`);
      void recarregar();
    } catch (e) {
      qc.setQueryData<Meta[]>(chave, (old) => (old ?? []).map((x) => (x.id === m.id ? { ...x, ativa: m.ativa } : x)));
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar a meta");
    } finally {
      setSalvando((n) => n - 1);
    }
  };

  const pdf = () => {
    const lista = metas.filter((m) => m.ativa);
    if (!lista.length) return;
    try {
      const nome = baixarPDFMetas({ paciente: p.nome, metas: lista, nutricionista: nomeNutri, emitidoEm: new Date() });
      toast.success(`PDF gerado: ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setExcluindo(true);
    try {
      await excluirMeta(alvo.id);
      qc.setQueryData<Meta[]>(chave, (old) => (old ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success(`Meta "${alvo.titulo}" excluída`);
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a meta");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="space-y-4" data-secao-metas data-atualizando={atualizando ? "1" : "0"} data-salvando-meta={salvando}>
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-metas>
          Não foi possível carregar as metas: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="metas">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Prescrição de metas</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem-metas={metas.length} data-contagem-ativas={ativas}>
              {carregando ? "Carregando..." : textoContagemMetas(metas.length, ativas)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setModelosAberto(true)} className={BTN_SEC} disabled={carregando} data-btn-modelos-meta>
              <Star className="h-3.5 w-3.5" aria-hidden="true" /> Modelos
            </button>
            <button type="button" onClick={pdf} className={BTN_SEC} disabled={carregando || ativas === 0} title={ativas === 0 ? "Nenhuma meta ativa pra imprimir" : "PDF com as metas ativas"} data-leitura data-btn-pdf-metas>
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" /> PDF das metas
            </button>
            <button type="button" onClick={() => setModal({ aberto: true, meta: null })} className={BTN_PRI} disabled={carregando} data-btn-nova-meta>
              <Plus size={12} aria-hidden="true" /> Nova meta
            </button>
          </div>
        </header>

        {!carregando && metas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMostrarInativas((v) => !v)}
              className={mostrarInativas ? CHIP_ATIVO : CHIP_INATIVO}
              aria-pressed={mostrarInativas}
              data-leitura data-toggle-inativas
              data-pausadas={pausadas}
            >
              {mostrarInativas ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />} Mostrar pausadas
              <span className="opacity-70 normal-case tracking-normal">({textoPausadas(pausadas)})</span>
            </button>
          </div>
        )}

        {!carregando && !erro && metas.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-metas-vazio>
            <Target className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhuma meta prescrita</p>
            <p className="text-xs text-texto-2 font-body">Metas simples e com dias marcados (beber água, caminhar, dormir bem) ajudam o aluno a manter a rotina entre as consultas.</p>
          </div>
        )}

        {!carregando && metas.length > 0 && visiveis.length === 0 && (
          <p className="text-sm text-texto-2 font-body rounded-2xl border border-dashed border-linha-2 p-4 text-center" data-metas-filtro-vazio>
            Todas as metas estão pausadas — ative "Mostrar pausadas" pra vê-las.
          </p>
        )}

        {visiveis.length > 0 && (
          <ul className="divide-y divide-linha border-t border-linha" data-lista-metas>
            {visiveis.map((m) => {
              const dias = normalizarDias(m.dias_semana);
              return (
                <li
                  key={m.id}
                  className={`py-3 space-y-2 ${m.ativa ? "" : "opacity-60"}`}
                  data-meta={m.id}
                  data-ativa={m.ativa ? "1" : "0"}
                  data-meta-titulo={m.titulo}
                  data-meta-dias={diasParaAttr(dias)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <Target className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span data-meta-titulo-texto>{m.titulo}</span>
                          {!m.ativa && (
                            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border border-linha-2 text-texto-2" data-badge-pausada>pausada</span>
                          )}
                        </p>
                        {(m.descricao ?? "").trim() && <p className="text-xs text-texto-2 font-body whitespace-pre-wrap" data-meta-descricao>{m.descricao}</p>}
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body" data-meta-detalhe>
                          {textoDias(dias)} · {textoInicio(m.inicio)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => void alternar(m)} className={m.ativa ? BTN_MINI : BTN_MINI_PRI} data-btn-alternar-meta>
                        {m.ativa ? <Pause size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />} {m.ativa ? "Pausar" : "Retomar"}
                      </button>
                      <button type="button" onClick={() => setModal({ aberto: true, meta: m })} className={BTN_MINI} data-btn-editar-meta>
                        <PenLine size={12} aria-hidden="true" /> Editar
                      </button>
                      <button type="button" onClick={() => setParaExcluir(m)} className={BTN_MINI_PERIGO} data-btn-excluir-meta>
                        <Trash2 size={12} aria-hidden="true" /> Excluir
                      </button>
                    </div>
                  </div>
                  <div className="ml-6 flex flex-wrap gap-1.5" data-dias-meta aria-label={`Dias: ${textoDias(dias)}`}>
                    {DIAS_SEMANA.map((x) => {
                      const on = dias.includes(x.n);
                      return (
                        <span key={x.n} className={on ? BOLINHA_ON : BOLINHA_OFF} title={x.nome} data-dia={x.n} data-marcado={on ? "1" : "0"}>
                          {x.curto}
                        </span>
                      );
                    })}
                  </div>
                  <MarcadasPeloAluno meta={m} dias={dias7} hoje={hoje} concluidas={concluidasQ.data ?? null} erro={!!concluidasQ.error} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <MetaDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        pacienteId={p.id}
        modelos={modelos}
        meta={modal.meta}
        onSalvo={onSalvo}
        onModeloCriado={modelosMudaram}
      />
      <ModelosMetaDialog open={modelosAberto} onOpenChange={setModelosAberto} modelos={modelos} onMudou={modelosMudaram} />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta meta?</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-texto-2">
              {paraExcluir ? <><span className="text-texto">{paraExcluir.titulo}</span> ({textoDias(paraExcluir.dias_semana)}) vai pra lixeira. </> : ""}
              Pra tirar de vigor sem apagar, use "Pausar".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-meta>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
