// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/FarmacoNutrientes.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Eye, FileDown, FlaskConical, HeartPulse, Pause, Pencil, Pill, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import AnaliseDialog, { type ModoAnalise } from "@/nutricao/prontuario/ui/AnaliseDialog";
import BadgeGravidade from "@/nutricao/prontuario/ui/BadgeGravidade";
import BaseInteracoesDialog from "@/nutricao/prontuario/ui/BaseInteracoesDialog";
import MedicamentoDialog from "@/nutricao/prontuario/ui/MedicamentoDialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import {
  alternarAtivo, dadosProfissionais, excluirAnalise, excluirMedicamento, listarAnalises, listarBase, listarMedicamentosDoPaciente, nomeDaNutricionista,
  type AnaliseFarmaco, type Medicamento,
} from "@/nutricao/prontuario/lib/farmaco";
import { baixarPDFFarmaco } from "@/nutricao/prontuario/lib/farmacoPdf";
import {
  cruzar, formatarDataHoraAnalise, gravidadeMaximaCruzamento, inserirRegistro, interacoesDoMedicamento, lerInteracoesJson, lerMedicamentosJson, ordenarAnalises,
  ordenarMedicamentos, resumoCruzamento, textoAnalise, textoContagemAnalises, textoContagemMedicamentos, textoDetalheMedicamento, textoInteracoesMedicamento,
  totalInteracoes, gravidadeMaxima,
} from "@/nutricao/prontuario/lib/farmacoUtil";
import { usePaciente } from "@/nutricao/prontuario/ui/contexto";

const CARD = "pq-cartao min-w-0 space-y-3 px-[18px] py-4";
const TITULO = "flex items-center gap-1.5 font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto";
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const CHIP = "pq-chip pq-chip-g";

// Seção "Fármaco-nutrientes" (referência: só o vazio 'Nenhuma análise fármaco-nutriente' / 'Registre os medicamentos em uso para
// gerar orientações nutricionais personalizadas.' / 'nova análise de fármaco'). A análise é nossa: a BASE de interações (sistema +
// próprias) cruzada com os MEDICAMENTOS EM USO do paciente, por nome/sinônimo. SEM medicamento E SEM análise → vazio da referência
// (o 1º passo é cadastrar o medicamento). COM → 3 cards: 'Medicamentos em uso' (Adicionar / Editar / Suspender-Retomar / Excluir),
// 'Interações encontradas' (cruzamento ao vivo dos ATIVOS, agrupado por medicamento; Nova análise / Base de interações) e 'Análises'
// (documentos CONGELADOS: Ver / PDF / Editar título-parecer / Excluir). Lê base, medicamentos e análises em paralelo.
export default function FarmacoNutrientes() {
  const { paciente: p, recarregar } = usePaciente();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const chaveB = useMemo(() => ["farmaco-base", uid], [uid]);
  const chaveM = useMemo(() => ["farmaco-medicamentos", p.id], [p.id]);
  const chaveA = useMemo(() => ["farmaco-analises", p.id], [p.id]);
  const bQ = useQuery({ queryKey: chaveB, queryFn: listarBase, enabled: !!uid });
  const mQ = useQuery({ queryKey: chaveM, queryFn: () => listarMedicamentosDoPaciente(p.id) });
  const aQ = useQuery({ queryKey: chaveA, queryFn: () => listarAnalises(p.id) });
  const perfilQ = useQuery({
    queryKey: ["perfil-pdf", uid],
    queryFn: async () => {
      const [nome, profissional] = await Promise.all([nomeDaNutricionista(uid ?? ""), dadosProfissionais(uid ?? "")]);
      return { nome, profissional };
    },
    enabled: !!uid,
  });
  const carregando = !uid || bQ.isPending || mQ.isPending || aQ.isPending;
  const atualizando = carregando || bQ.isFetching || mQ.isFetching || aQ.isFetching;
  const erro = bQ.error ?? mQ.error ?? aQ.error;

  const base = useMemo(() => bQ.data ?? [], [bQ.data]);
  const medicamentos = useMemo(() => ordenarMedicamentos(mQ.data ?? []), [mQ.data]);
  const analises = useMemo(() => ordenarAnalises(aQ.data ?? []), [aQ.data]);
  const ativos = useMemo(() => medicamentos.filter((m) => m.ativo), [medicamentos]);
  const cruzamento = useMemo(() => cruzar(medicamentos, base), [medicamentos, base]);
  const nInteracoes = totalInteracoes(cruzamento);
  const gravMax = gravidadeMaximaCruzamento(cruzamento);
  const interacoesPorMedicamento = useMemo(() => new Map(medicamentos.map((m) => [m.id, interacoesDoMedicamento(m.medicamento, base).length])), [medicamentos, base]);
  const total = medicamentos.length;
  const vazio = !carregando && !erro && total === 0 && analises.length === 0;

  const [modalMed, setModalMed] = useState<{ aberto: boolean; medicamento: Medicamento | null }>({ aberto: false, medicamento: null });
  const [modalAnalise, setModalAnalise] = useState<{ aberto: boolean; modo: ModoAnalise; analise: AnaliseFarmaco | null }>({ aberto: false, modo: "nova", analise: null });
  const [baseAberta, setBaseAberta] = useState(false);
  const [medParaExcluir, setMedParaExcluir] = useState<Medicamento | null>(null);
  const [analiseParaExcluir, setAnaliseParaExcluir] = useState<AnaliseFarmaco | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [salvando, setSalvando] = useState(0); // gravações assíncronas fora dos modais — o E2E espera voltar a 0

  const setMedicamentos = (fn: (old: Medicamento[]) => Medicamento[]) => qc.setQueryData<Medicamento[]>(chaveM, (old) => fn(old ?? []));
  const setAnalises = (fn: (old: AnaliseFarmaco[]) => AnaliseFarmaco[]) => qc.setQueryData<AnaliseFarmaco[]>(chaveA, (old) => fn(old ?? []));
  const onMedicamentoSalvo = (m: Medicamento) => {
    setMedicamentos((old) => inserirRegistro(old, m));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const onAnaliseSalva = (a: AnaliseFarmaco) => {
    setAnalises((old) => inserirRegistro(old, a));
    void recarregar();
  };
  const onBaseMudou = async () => {
    await bQ.refetch();
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

  /** Suspender / Retomar — reversível, sem confirmação. */
  const alternar = (m: Medicamento) =>
    rodar(async () => {
      const r = await alternarAtivo(m.id, !m.ativo);
      setMedicamentos((old) => inserirRegistro(old, r));
      toast.success(r.ativo ? "Medicamento retomado" : "Medicamento suspenso");
      void recarregar();
    }, "Não foi possível alterar o medicamento");

  const excluirMed = () =>
    rodar(async () => {
      if (!medParaExcluir) return;
      const alvo = medParaExcluir;
      await excluirMedicamento(alvo.id);
      setMedicamentos((old) => old.filter((x) => x.id !== alvo.id));
      setMedParaExcluir(null);
      toast.success("Medicamento excluído");
    }, "Não foi possível excluir o medicamento");

  const excluirAna = () =>
    rodar(async () => {
      if (!analiseParaExcluir) return;
      const alvo = analiseParaExcluir;
      await excluirAnalise(alvo.id);
      setAnalises((old) => old.filter((x) => x.id !== alvo.id));
      setAnaliseParaExcluir(null);
      toast.success("Análise excluída");
    }, "Não foi possível excluir a análise");

  const pdf = (a: AnaliseFarmaco) => {
    try {
      const nome = baixarPDFFarmaco({
        paciente: p.nome,
        nascimento: p.nascimento,
        nutricionista: perfilQ.data?.nome ?? null,
        profissional: perfilQ.data?.profissional ?? null,
        emitidoEm: new Date(),
        analise: { titulo: a.titulo, data: a.data, medicamentos: lerMedicamentosJson(a.medicamentos), interacoes: lerInteracoesJson(a.interacoes), parecer: a.parecer },
      });
      toast.success("PDF gerado", { description: nome });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  const abrirNovoMedicamento = () => setModalMed({ aberto: true, medicamento: null });
  const abrirNovaAnalise = () => setModalAnalise({ aberto: true, modo: "nova", analise: null });

  return (
    <div
      className="space-y-4"
      data-secao-farmaco
      data-atualizando={atualizando ? "1" : "0"}
      data-salvando-farmaco={salvando}
      data-total-medicamentos={total}
      data-contagem-medicamentos={ativos.length}
      data-total-interacoes={nInteracoes}
      data-gravidade-maxima={gravMax ?? ""}
      data-contagem-analises={analises.length}
      data-base-total={base.length}
    >
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-farmaco>
          Não foi possível carregar a seção fármaco-nutrientes: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      {vazio && (
        <section className={CARD} data-card="vazio">
          <h2 className={TITULO}>
            <HeartPulse size={12} aria-hidden="true" /> Fármaco-nutrientes
          </h2>
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-farmaco-vazio>
            <HeartPulse className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhuma análise fármaco-nutriente</p>
            <p className="text-xs text-texto-2 font-body">Registre os medicamentos em uso para gerar orientações nutricionais personalizadas.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button type="button" onClick={abrirNovoMedicamento} className={BTN_PRI} disabled={!uid} data-btn-nova-analise-vazio>
                <Plus size={12} aria-hidden="true" /> Nova análise de fármaco
              </button>
              <button type="button" onClick={() => setBaseAberta(true)} className={BTN_SEC} disabled={!uid} data-btn-base>
                <BookOpen size={12} aria-hidden="true" /> Base de interações
              </button>
            </div>
          </div>
        </section>
      )}

      {!carregando && !erro && !vazio && (
        <>
          {/* ---- Medicamentos em uso ---- */}
          <section className={CARD} data-card="medicamentos">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className={TITULO}>
                  <Pill size={12} aria-hidden="true" /> Medicamentos em uso
                </h2>
                <p className="text-[11px] text-texto-3 font-body" data-contagem-medicamentos-texto>{textoContagemMedicamentos(ativos.length, total)}</p>
              </div>
              <button type="button" onClick={abrirNovoMedicamento} className={BTN_PRI} data-btn-novo-medicamento>
                <Plus size={12} aria-hidden="true" /> Adicionar medicamento
              </button>
            </header>
            {total === 0 ? (
              <p className="text-xs text-texto-3 font-body italic" data-medicamentos-vazio>Nenhum medicamento em uso — as análises antigas continuam abaixo.</p>
            ) : (
              <ul className="divide-y divide-linha" data-lista-medicamentos>
                {medicamentos.map((m) => {
                  const n = interacoesPorMedicamento.get(m.id) ?? 0;
                  return (
                    <li
                      key={m.id}
                      className={`py-2.5 flex flex-wrap items-start justify-between gap-2 ${m.ativo ? "" : "opacity-70"}`}
                      data-medicamento={m.id}
                      data-medicamento-ativo={m.ativo ? "1" : "0"}
                      data-medicamento-interacoes={n}
                      data-medicamento-nome={m.medicamento}
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm text-texto font-body flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold" data-medicamento-nome-texto>{m.medicamento}</span>
                          {!m.ativo && <span className={CHIP} data-medicamento-chip="suspenso">suspenso</span>}
                          <span className={`${CHIP} ${n ? "border-verde/40 text-verde-3" : ""}`} data-medicamento-badge-interacoes>{textoInteracoesMedicamento(n)}</span>
                        </p>
                        <p className="text-xs text-texto-2 font-body" data-medicamento-detalhe>{textoDetalheMedicamento(m)}</p>
                        {m.observacao && <p className="text-xs text-texto-3 font-body whitespace-pre-line" data-medicamento-observacao>{m.observacao}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={() => setModalMed({ aberto: true, medicamento: m })} className={BTN_MINI} data-btn-editar-medicamento>
                          <Pencil size={12} aria-hidden="true" /> Editar
                        </button>
                        <button type="button" onClick={() => void alternar(m)} className={BTN_MINI} disabled={ocupado} data-btn-alternar-medicamento>
                          {m.ativo ? <Pause size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />} {m.ativo ? "Suspender" : "Retomar"}
                        </button>
                        <button type="button" onClick={() => setMedParaExcluir(m)} className={BTN_MINI_PERIGO} disabled={ocupado} data-btn-excluir-medicamento>
                          <Trash2 size={12} aria-hidden="true" /> Excluir
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---- Interações encontradas (cruzamento ao vivo dos ativos) ---- */}
          <section className={CARD} data-card="interacoes">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className={TITULO}>
                  <FlaskConical size={12} aria-hidden="true" /> Interações encontradas
                </h2>
                <p className="text-[11px] text-texto-3 font-body flex flex-wrap items-center gap-1.5">
                  <span data-resumo-cruzamento={resumoCruzamento(cruzamento)}>{resumoCruzamento(cruzamento)}</span>
                  {gravMax && (
                    <span className="inline-flex items-center gap-1" data-gravidade-maxima-badge={gravMax}>
                      · máx. <BadgeGravidade gravidade={gravMax} />
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={abrirNovaAnalise} className={BTN_PRI} disabled={ativos.length === 0} data-btn-nova-analise>
                  <Plus size={12} aria-hidden="true" /> Nova análise
                </button>
                <button type="button" onClick={() => setBaseAberta(true)} className={BTN_MINI} data-btn-base>
                  <BookOpen size={12} aria-hidden="true" /> Base de interações
                </button>
              </div>
            </header>
            {ativos.length === 0 ? (
              <p className="text-xs text-texto-3 font-body italic" data-cruzamento-vazio>Nenhum medicamento em uso — adicione ou retome um medicamento pra cruzar com a base.</p>
            ) : nInteracoes === 0 ? (
              <p className="text-xs text-texto-3 font-body italic" data-cruzamento-vazio>Nenhuma interação conhecida pros medicamentos em uso.</p>
            ) : (
              <ul className="space-y-3" data-lista-cruzamento>
                {cruzamento.map((g) => (
                  <li key={g.medicamento.id} className="space-y-1.5" data-grupo-medicamento={g.medicamento.id} data-grupo-interacoes={g.interacoes.length}>
                    <p className="text-sm text-texto font-semibold" data-grupo-nome>{g.medicamento.medicamento}</p>
                    {g.interacoes.length === 0 ? (
                      <p className="text-xs text-texto-3 font-body italic pl-3" data-grupo-vazio>sem interação conhecida na base</p>
                    ) : (
                      <ul className="divide-y divide-linha border-l-2 border-linha pl-3" data-lista-interacoes>
                        {g.interacoes.map((i) => (
                          <li key={i.id} className="py-1.5 space-y-0.5" data-interacao={i.id} data-interacao-gravidade={i.gravidade} data-interacao-origem={i.nutricionista_id ? "propria" : "sistema"}>
                            <p className="text-sm font-body flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-texto" data-interacao-nutriente>{i.nutriente}</span>
                              <BadgeGravidade gravidade={i.gravidade} />
                              {i.nutricionista_id && <span className={`${CHIP} border-verde/40 text-verde-3`}>minha</span>}
                            </p>
                            <p className="text-xs text-texto-2 font-body" data-interacao-efeito>{i.efeito}</p>
                            <p className="text-xs text-texto font-body" data-interacao-conduta>{i.conduta}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- Análises (documentos congelados) ---- */}
          <section className={CARD} data-card="analises">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={TITULO}>
                <Eye size={12} aria-hidden="true" /> Análises
              </h2>
              <p className="text-[11px] text-texto-3 font-body" data-contagem-analises-texto>{textoContagemAnalises(analises.length)}</p>
            </header>
            {analises.length === 0 ? (
              <p className="text-xs text-texto-3 font-body italic" data-analises-vazio>Nenhuma análise ainda — crie a primeira a partir das interações encontradas.</p>
            ) : (
              <ul className="divide-y divide-linha" data-lista-analises>
                {analises.map((a) => {
                  const meds = lerMedicamentosJson(a.medicamentos);
                  const ints = lerInteracoesJson(a.interacoes);
                  const g = gravidadeMaxima(ints);
                  return (
                    <li
                      key={a.id}
                      className="py-2.5 flex flex-wrap items-start justify-between gap-2"
                      data-analise={a.id}
                      data-analise-medicamentos={meds.length}
                      data-analise-interacoes={ints.length}
                      data-analise-gravidade={g ?? ""}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm text-texto font-body">
                          <span className="text-texto-2" data-analise-data>{formatarDataHoraAnalise(a.data)}</span> · <span className="font-semibold" data-analise-titulo>{a.titulo}</span>
                        </p>
                        <p className="text-xs text-texto-2 font-body" data-analise-resumo>{textoAnalise(a)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={() => setModalAnalise({ aberto: true, modo: "ver", analise: a })} className={BTN_MINI} data-btn-ver-analise>
                          <Eye size={12} aria-hidden="true" /> Ver
                        </button>
                        <button type="button" onClick={() => pdf(a)} className={BTN_MINI} data-btn-pdf-analise>
                          <FileDown size={12} aria-hidden="true" /> PDF
                        </button>
                        <button type="button" onClick={() => setModalAnalise({ aberto: true, modo: "editar", analise: a })} className={BTN_MINI} data-btn-editar-analise>
                          <Pencil size={12} aria-hidden="true" /> Editar
                        </button>
                        <button type="button" onClick={() => setAnaliseParaExcluir(a)} className={BTN_MINI_PERIGO} disabled={ocupado} data-btn-excluir-analise>
                          <Trash2 size={12} aria-hidden="true" /> Excluir
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <MedicamentoDialog
        open={modalMed.aberto}
        onOpenChange={(aberto) => setModalMed((m) => ({ ...m, aberto }))}
        nutricionistaId={uid ?? ""}
        pacienteId={p.id}
        base={base}
        medicamento={modalMed.medicamento}
        onSalvo={onMedicamentoSalvo}
      />
      <AnaliseDialog
        open={modalAnalise.aberto}
        onOpenChange={(aberto) => setModalAnalise((m) => ({ ...m, aberto }))}
        nutricionistaId={uid ?? ""}
        pacienteId={p.id}
        modo={modalAnalise.modo}
        analise={modalAnalise.analise}
        cruzamento={cruzamento}
        onSalvo={onAnaliseSalva}
        onPdf={pdf}
      />
      <BaseInteracoesDialog open={baseAberta} onOpenChange={setBaseAberta} nutricionistaId={uid ?? ""} base={base} onMudou={onBaseMudou} />

      <AlertDialog open={!!medParaExcluir} onOpenChange={(aberto) => { if (!aberto) setMedParaExcluir(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este medicamento?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {medParaExcluir ? <span className="text-texto">{medParaExcluir.medicamento}</span> : ""} sai da lista e vai pra lixeira. As análises já feitas mantêm a cópia. Pra só tirar do cruzamento, use Suspender.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluirMed(); }} disabled={ocupado} data-btn-confirmar-excluir-medicamento>
              {ocupado ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!analiseParaExcluir} onOpenChange={(aberto) => { if (!aberto) setAnaliseParaExcluir(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta análise?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {analiseParaExcluir ? <span className="text-texto">{analiseParaExcluir.titulo}</span> : ""} vai pra lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluirAna(); }} disabled={ocupado} data-btn-confirmar-excluir-analise>
              {ocupado ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
