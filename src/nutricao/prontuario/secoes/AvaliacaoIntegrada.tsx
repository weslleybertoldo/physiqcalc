// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/AvaliacaoIntegrada.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, ChevronDown, ChevronUp, ClipboardList, FileDown, FolderOpen, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import AvaliacaoDialog from "@/nutricao/prontuario/ui/AvaliacaoIntegradaDialog";
import Blocos from "@/nutricao/editor/ui/Blocos";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import {
  dadosProfissionais, excluirAvaliacao, listarAnamneses, listarAntropometrias, listarAplicacoesDoPaciente, listarAvaliacoes, listarResultadosDoPaciente,
  nomeDaNutricionista, regerarSintese, type AvaliacaoIntegrada as Avaliacao,
} from "@/nutricao/prontuario/lib/avaliacaoIntegrada";
import { baixarPDFAvaliacao } from "@/nutricao/prontuario/lib/avaliacaoIntegradaPdf";
import {
  FONTES, alertas, contarFontes, detalheFonte, fmtDataFonte, formatarDataHoraAvaliacao, inserirAvaliacao, lerFontes, lerSintese, montarSintese,
  paresAntropometria, resumoAvaliacao, resumoFontes, textoContagemAvaliacoes, type Alerta, type ChaveFonte, type Sintese,
} from "@/nutricao/prontuario/lib/avaliacaoIntegradaUtil";
import { textoSituacaoCurto } from "@/nutricao/prontuario/lib/examesUtil";
import { formatarPontos, textoNivel } from "@/nutricao/prontuario/lib/questionariosUtil";
import { usePaciente } from "@/nutricao/prontuario/ui/contexto";

const CARD = "pq-cartao min-w-0 space-y-3 px-[18px] py-4";
const TITULO = "flex items-center gap-1.5 font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto";
const SUBTITULO = "font-semibold text-[11px] uppercase tracking-wider text-verde-3";
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

// Seção "Avaliação integrada" (referência: lista com 'Nenhuma avaliação' / 'nova avaliação'; a avaliação em si é a nossa síntese).
// Lê as seções donas SEM mexer nelas — última anamnese (W5), última antropometria (W6), exames da data mais recente (W18) e a
// última aplicação de cada questionário (W19) — e grava só na tabela nova `avaliacoes_integradas`: um documento DATADO com a
// síntese e as fontes CONGELADAS em jsonb, alertas automáticos derivados e o parecer da nutricionista (markdown simples da W10).
// Painel 'Fontes disponíveis' (4 chips), lista (mais recente primeiro) com Ver / Editar / Regerar síntese / PDF / Excluir.
export default function AvaliacaoIntegrada() {
  const { paciente: p, recarregar } = usePaciente();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const chaveAv = useMemo(() => ["avaliacoes-integradas", p.id], [p.id]);
  const chaveAn = useMemo(() => ["avaliacao-anamneses", p.id], [p.id]);
  const chaveAt = useMemo(() => ["avaliacao-antropometrias", p.id], [p.id]);
  const chaveEx = useMemo(() => ["avaliacao-exames", p.id], [p.id]);
  const chaveAp = useMemo(() => ["avaliacao-aplicacoes", p.id], [p.id]);
  const avQ = useQuery({ queryKey: chaveAv, queryFn: () => listarAvaliacoes(p.id) });
  const anQ = useQuery({ queryKey: chaveAn, queryFn: () => listarAnamneses(p.id) });
  const atQ = useQuery({ queryKey: chaveAt, queryFn: () => listarAntropometrias(p.id) });
  const exQ = useQuery({ queryKey: chaveEx, queryFn: () => listarResultadosDoPaciente(p.id) });
  const apQ = useQuery({ queryKey: chaveAp, queryFn: () => listarAplicacoesDoPaciente(p.id) });
  const perfilQ = useQuery({
    queryKey: ["perfil-pdf", uid],
    queryFn: async () => {
      const [nome, profissional] = await Promise.all([nomeDaNutricionista(uid ?? ""), dadosProfissionais(uid ?? "")]);
      return { nome, profissional };
    },
    enabled: !!uid,
  });
  const carregando = !uid || avQ.isPending || anQ.isPending || atQ.isPending || exQ.isPending || apQ.isPending;
  const atualizando = carregando || avQ.isFetching || anQ.isFetching || atQ.isFetching || exQ.isFetching || apQ.isFetching;
  const erro = avQ.error ?? anQ.error ?? atQ.error ?? exQ.error ?? apQ.error;

  // as 4 listas das seções donas (memoizadas: vão por prop pro modal)
  const fontes = useMemo(
    () => ({ anamneses: anQ.data ?? [], antropometrias: atQ.data ?? [], resultados: exQ.data ?? [], aplicacoes: apQ.data ?? [] }),
    [anQ.data, atQ.data, exQ.data, apQ.data],
  );
  const disponiveis = useMemo(() => montarSintese(fontes).fontes, [fontes]);
  const lista = useMemo(() => avQ.data ?? [], [avQ.data]);

  const [modal, setModal] = useState<{ aberto: boolean; avaliacao: Avaliacao | null }>({ aberto: false, avaliacao: null });
  const [abertas, setAbertas] = useState<string[]>([]);
  const [paraExcluir, setParaExcluir] = useState<Avaliacao | null>(null);
  const [paraRegerar, setParaRegerar] = useState<Avaliacao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [salvando, setSalvando] = useState(0); // gravações assíncronas fora do modal — o E2E espera voltar a 0

  const onSalvo = (a: Avaliacao) => {
    qc.setQueryData<Avaliacao[]>(chaveAv, (old) => inserirAvaliacao(old ?? [], a));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const alternar = (id: string) => setAbertas((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  /** Regerar: relê as 4 fontes AGORA (não a cache), monta a síntese e grava; título e parecer ficam. */
  const regerar = async () => {
    if (!paraRegerar) return;
    const alvo = paraRegerar;
    setOcupado(true);
    setSalvando((n) => n + 1);
    try {
      const [anamneses, antropometrias, resultados, aplicacoes] = await Promise.all([
        listarAnamneses(p.id), listarAntropometrias(p.id), listarResultadosDoPaciente(p.id), listarAplicacoesDoPaciente(p.id),
      ]);
      qc.setQueryData(chaveAn, anamneses);
      qc.setQueryData(chaveAt, antropometrias);
      qc.setQueryData(chaveEx, resultados);
      qc.setQueryData(chaveAp, aplicacoes);
      const m = montarSintese({ anamneses, antropometrias, resultados, aplicacoes });
      const a = await regerarSintese(alvo.id, m.sintese, m.fontes);
      qc.setQueryData<Avaliacao[]>(chaveAv, (old) => inserirAvaliacao(old ?? [], a));
      setParaRegerar(null);
      toast.success("Síntese regerada");
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível regerar a síntese");
    } finally {
      setOcupado(false);
      setSalvando((n) => n - 1);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setOcupado(true);
    setSalvando((n) => n + 1);
    try {
      await excluirAvaliacao(alvo.id);
      qc.setQueryData<Avaliacao[]>(chaveAv, (old) => (old ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success("Avaliação excluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a avaliação");
    } finally {
      setOcupado(false);
      setSalvando((n) => n - 1);
    }
  };

  const pdf = (a: Avaliacao) => {
    try {
      const nome = baixarPDFAvaliacao({
        paciente: p.nome,
        nascimento: p.nascimento,
        nutricionista: perfilQ.data?.nome ?? null,
        profissional: perfilQ.data?.profissional ?? null,
        emitidoEm: new Date(),
        avaliacao: { titulo: a.titulo, data: a.data, sintese: lerSintese(a.sintese), texto: a.texto },
      });
      toast.success("PDF gerado", { description: nome });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  return (
    <div className="space-y-4" data-secao-avaliacao-integrada data-atualizando={atualizando ? "1" : "0"} data-salvando-avaliacao={salvando}>
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-avaliacao-integrada>
          Não foi possível carregar a avaliação integrada: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      <section className={CARD} data-card="avaliacoes">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className={TITULO}>
              <BarChart3 size={12} aria-hidden="true" /> Avaliação integrada
            </h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem-avaliacoes={lista.length}>
              {avQ.isPending ? "Carregando..." : textoContagemAvaliacoes(lista.length)}
            </p>
          </div>
          <button type="button" onClick={() => setModal({ aberto: true, avaliacao: null })} className={BTN_PRI} disabled={carregando} data-btn-nova-avaliacao>
            <Plus size={12} aria-hidden="true" /> Nova avaliação
          </button>
        </header>

        {/* fontes disponíveis AGORA (o que uma avaliação nova congelaria) */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-texto-2 font-body">Fontes disponíveis</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-fontes data-fontes-n={contarFontes(disponiveis)}>
            {FONTES.map((f) => {
              const det = detalheFonte(disponiveis, f.chave);
              return (
                <div
                  key={f.chave}
                  className={`rounded-xl border px-3 py-2 min-w-0 ${det.tem ? "border-linha-2" : "border-dashed border-linha-2"}`}
                  data-fonte={f.chave}
                  data-fonte-tem={det.tem && !carregando ? "1" : "0"}
                >
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-texto-2 truncate">{f.rotulo}</p>
                  <p className={`text-xs font-body truncate ${det.tem ? "text-texto" : "text-texto-3"}`} data-fonte-detalhe>
                    {carregando ? "…" : det.texto}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {!carregando && !erro && lista.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-avaliacoes-vazio>
            <FolderOpen className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhuma avaliação</p>
            <p className="text-xs text-texto-2 font-body">Crie agora a primeira avaliação para seu paciente.</p>
            <button type="button" onClick={() => setModal({ aberto: true, avaliacao: null })} className={BTN_SEC} data-btn-primeira-avaliacao>
              Nova avaliação
            </button>
          </div>
        )}

        {lista.length > 0 && (
          <ul className="divide-y divide-linha" data-lista-avaliacoes>
            {lista.map((a) => (
              <ItemAvaliacao
                key={a.id}
                a={a}
                aberta={abertas.includes(a.id)}
                ocupado={ocupado}
                onVer={() => alternar(a.id)}
                onEditar={() => setModal({ aberto: true, avaliacao: a })}
                onRegerar={() => setParaRegerar(a)}
                onPdf={() => pdf(a)}
                onExcluir={() => setParaExcluir(a)}
              />
            ))}
          </ul>
        )}
      </section>

      <AvaliacaoDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        nutricionistaId={uid ?? ""}
        pacienteId={p.id}
        avaliacao={modal.avaliacao}
        fontes={fontes}
        onSalvo={onSalvo}
      />

      <AlertDialog open={!!paraRegerar} onOpenChange={(aberto) => { if (!aberto) setParaRegerar(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Regerar a síntese?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {paraRegerar ? <span className="text-texto">{resumoAvaliacao(paraRegerar)}. </span> : ""}
              A síntese passa a refletir a última anamnese, antropometria, exames e questionários de AGORA. O título e o parecer ficam como estão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PRI} onClick={(e) => { e.preventDefault(); void regerar(); }} disabled={ocupado} data-btn-confirmar-regerar>
              {ocupado ? "Regerando..." : "Regerar síntese"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta avaliação?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {paraExcluir ? <span className="text-texto">{formatarDataHoraAvaliacao(paraExcluir.data)} · {paraExcluir.titulo}</span> : ""} sai da lista do paciente e vai pra lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={ocupado} data-btn-confirmar-excluir-avaliacao>
              {ocupado ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Uma avaliação da lista ----
interface ItemProps {
  a: Avaliacao;
  aberta: boolean;
  ocupado: boolean;
  onVer: () => void;
  onEditar: () => void;
  onRegerar: () => void;
  onPdf: () => void;
  onExcluir: () => void;
}

function ItemAvaliacao({ a, aberta, ocupado, onVer, onEditar, onRegerar, onPdf, onExcluir }: ItemProps) {
  const sintese = useMemo(() => lerSintese(a.sintese), [a.sintese]);
  const fontes = useMemo(() => lerFontes(a.fontes), [a.fontes]);
  const al = useMemo(() => alertas(sintese), [sintese]);
  return (
    <li className="py-3 space-y-2" data-avaliacao={a.id} data-avaliacao-data={a.data} data-avaliacao-fontes={contarFontes(fontes)} data-avaliacao-alertas={al.length} data-aberta={aberta ? "1" : "0"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <ClipboardList className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm text-texto font-body">
              <span data-avaliacao-data-texto>{formatarDataHoraAvaliacao(a.data)}</span> · <span data-avaliacao-titulo>{a.titulo}</span>
            </p>
            <p className="text-xs text-texto-2 font-body" data-avaliacao-resumo>
              {resumoFontes(fontes)}
              {al.length > 0 && <span className="text-verde-3"> · {al.length === 1 ? "1 ponto de atenção" : `${al.length} pontos de atenção`}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={onVer} className={BTN_MINI} data-btn-ver-avaliacao>
            {aberta ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />} {aberta ? "Ocultar" : "Ver"}
          </button>
          <button type="button" onClick={onEditar} className={BTN_MINI} data-btn-editar-avaliacao>
            <Pencil size={12} aria-hidden="true" /> Editar
          </button>
          <button type="button" onClick={onRegerar} className={BTN_MINI} disabled={ocupado} title="Refazer a síntese com as fontes de agora (o parecer fica)" data-btn-regerar-avaliacao>
            <RefreshCw size={12} aria-hidden="true" /> Regerar síntese
          </button>
          <button type="button" onClick={onPdf} className={BTN_MINI} data-btn-pdf-avaliacao>
            <FileDown size={12} aria-hidden="true" /> PDF
          </button>
          <button type="button" onClick={onExcluir} className={BTN_MINI_PERIGO} disabled={ocupado} data-btn-excluir-avaliacao>
            <Trash2 size={12} aria-hidden="true" /> Excluir
          </button>
        </div>
      </div>
      {aberta && (
        <div className="ml-6 border-l-2 border-verde/40 pl-3 space-y-3" data-avaliacao-aberta={a.id}>
          <SinteseView s={sintese} al={al} />
          <div className="space-y-1" data-parecer>
            <p className={SUBTITULO}>Parecer</p>
            <Blocos conteudo={a.texto} />
          </div>
        </div>
      )}
    </li>
  );
}

// ---- Os 4 blocos congelados + pontos de atenção ----
function SinteseView({ s, al }: { s: Sintese; al: Alerta[] }) {
  const an = s.anamnese;
  const at = s.antropometria;
  const ex = s.exames;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <BlocoSintese chave="anamnese" titulo="Anamnese" vazio={!an} detalhe={an ? `"${an.titulo}" · ${fmtDataFonte(an.data, "dd/MM/yyyy HH:mm")}` : undefined}>
        {an && (
          <div className="space-y-1.5">
            {an.itens.length === 0 && !an.texto_livre && <p className="text-xs text-texto-3 font-body italic">Sem respostas registradas.</p>}
            {an.itens.map((i, k) => (
              <div key={k} className="text-xs font-body" data-item-anamnese>
                <p className="text-texto-2">{i.pergunta}</p>
                <p className="text-texto">{i.resposta}</p>
              </div>
            ))}
            {an.texto_livre && <p className="text-xs text-texto-2 font-body whitespace-pre-line border-t border-linha pt-1.5" data-anamnese-texto-livre>{an.texto_livre}</p>}
          </div>
        )}
      </BlocoSintese>

      <BlocoSintese chave="antropometria" titulo="Antropometria" vazio={!at} detalhe={at ? fmtDataFonte(at.data, "dd/MM/yyyy HH:mm") : undefined}>
        {at && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {paresAntropometria(at).map((par) => (
              <div key={par.chave} className="min-w-0" data-par={par.chave} data-par-valor={par.valor}>
                <dt className="text-[10px] uppercase tracking-wider text-texto-2 font-body truncate">{par.rotulo}</dt>
                <dd className="text-sm text-texto font-semibold">{par.valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </BlocoSintese>

      <BlocoSintese chave="exames" titulo="Exames" vazio={!ex} detalhe={ex ? fmtDataFonte(ex.data) : undefined}>
        {ex && (
          <ul className="divide-y divide-linha">
            {ex.itens.map((i, k) => {
              const fora = i.situacao === "abaixo" || i.situacao === "acima";
              return (
                <li key={k} className="py-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-body" data-exame={i.exame} data-situacao={i.situacao}>
                  <span className={fora ? "text-rosa-3 font-semibold" : "text-texto"}>
                    {i.exame} <span className="font-semibold">{i.valor}{i.unidade ? ` ${i.unidade}` : ""}</span>
                  </span>
                  <span className={fora ? "text-rosa-3" : "text-texto-2"}>ref. {i.referencia} · {textoSituacaoCurto(i.situacao)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </BlocoSintese>

      <BlocoSintese chave="questionarios" titulo="Questionários" vazio={s.questionarios.length === 0}>
        <ul className="divide-y divide-linha">
          {s.questionarios.map((q) => (
            <li key={q.id || q.titulo} className="py-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-body" data-questionario={q.id} data-nivel={q.nivel}>
              <span className={q.nivel === "alto" ? "text-rosa-3 font-semibold" : "text-texto"}>
                {q.titulo} <span className="font-semibold">{formatarPontos(q.pontuacao)}/{formatarPontos(q.maximo)} pontos</span>
              </span>
              <span className="text-texto-2">{q.faixa ? `${q.faixa} · ` : ""}{textoNivel(q.nivel)} · {fmtDataFonte(q.data)}</span>
            </li>
          ))}
        </ul>
      </BlocoSintese>

      <div className="md:col-span-2 border border-linha p-3 space-y-1.5" data-alertas={al.length}>
        <p className={`${SUBTITULO} flex items-center gap-1.5`}>
          <AlertTriangle size={12} aria-hidden="true" /> Pontos de atenção
        </p>
        {al.length === 0 ? (
          <p className="text-xs text-texto-3 font-body italic" data-alertas-vazio>Nenhum ponto de atenção automático.</p>
        ) : (
          <ul className="list-disc pl-5 space-y-1 text-xs font-body marker:text-verde-3">
            {al.map((x) => (
              <li key={x.chave} className={x.nivel === "alto" ? "text-rosa-3 font-semibold" : "text-texto"} data-alerta={x.chave} data-alerta-nivel={x.nivel}>
                {x.texto}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BlocoSintese({ chave, titulo, detalhe, vazio, children }: { chave: ChaveFonte; titulo: string; detalhe?: string; vazio: boolean; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-linha p-3 space-y-1.5 min-w-0" data-bloco={chave} data-bloco-vazio={vazio ? "" : undefined}>
      <p className={SUBTITULO}>
        {titulo}
        {detalhe && <span className="text-texto-2 normal-case tracking-normal font-body"> · {detalhe}</span>}
      </p>
      {vazio ? <p className="text-xs text-texto-3 font-body italic">Sem dado nesta síntese.</p> : children}
    </div>
  );
}
