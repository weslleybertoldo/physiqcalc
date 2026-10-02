// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Manipulados.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Beaker, ChevronDown, ChevronUp, Copy, FileDown, PenLine, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import FormulaDialog from "@/nutricao/editor/ui/FormulaDialog";
import ModelosFormulaDialog from "@/nutricao/editor/ui/ModelosFormulaDialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import type { DadosProfissionais } from "@/nutricao/editor/lib/profissional";
import {
  dadosProfissionais, duplicarFormula, excluirFormula, garantirModelosFormula, listarModelosFormula, listarFormulasDoPaciente, nomeDaNutricionista, salvarComoModelo, type Formula,
} from "@/nutricao/editor/lib/manipulados";
import { baixarPDFFormula, baixarPDFFormulas } from "@/nutricao/editor/lib/manipuladosPdf";
import { contarAtivos, inserirFormula, lerAtivos, ordenarFormulas, textoAtivo, textoContagemAtivos, textoContagemFormulas, textoPrescritaEm } from "@/nutricao/editor/lib/manipuladosUtil";
import { useAbrirPeloParametro, usePaciente } from "@/nutricao/editor/ui/contexto";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PRI = "inline-flex items-center gap-1 border border-verde/50 text-verde-3 font-semibold text-[10px] uppercase tracking-wider px-2.5 py-1 hover:bg-[rgba(16,185,129,.08)] transition-colors disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

// Seção "Prescrição de manipulados" do paciente (referência: fórmulas manipuladas com PDF global). Cabeçalho "N fórmulas", botões
// "Nova fórmula" / "Modelos" / "PDF global" (só com fórmula); lista "título · N ativos · Prescrito em dd/MM/yyyy" com Ver (detalhe
// dos ativos, posologia, quantidade, observações), PDF individual, Duplicar (cópia com a data de hoje), Editar, Favoritar (vira
// modelo ★) e Excluir (soft). A fórmula guarda a própria cópia do modelo.
export default function Manipulados() {
  const { paciente: p, recarregar, podeEditar } = usePaciente();
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

  const chave = useMemo(() => ["formulas-paciente", p.id], [p.id]);
  const formulasQ = useQuery({ queryKey: chave, queryFn: () => listarFormulasDoPaciente(p.id) });
  // H5 (item 10): quem só lê não cria os modelos padrão (gravar é da nutri — RLS da W3)
  const modelosQ = useQuery({ queryKey: ["modelos-formula", uid, podeEditar], queryFn: () => (podeEditar ? garantirModelosFormula(uid!) : listarModelosFormula()), enabled: !!uid });

  const formulas = useMemo(() => ordenarFormulas(formulasQ.data ?? []), [formulasQ.data]);
  const modelos = useMemo(() => modelosQ.data ?? [], [modelosQ.data]);

  const carregando = !uid || formulasQ.isPending || modelosQ.isPending;
  const atualizando = carregando || formulasQ.isFetching || modelosQ.isFetching;
  const erro = formulasQ.error ?? modelosQ.error;

  const [modal, setModal] = useState<{ aberto: boolean; formula: Formula | null }>({ aberto: false, formula: null });
  const abrirNovaFormula = useCallback(() => setModal({ aberto: true, formula: null }), []);
  useAbrirPeloParametro("novo", "manipulado", abrirNovaFormula, podeEditar, "manipulados");
  const [modelosAberto, setModelosAberto] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<Formula | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [salvando, setSalvando] = useState(0); // gravações assíncronas fora do modal (duplicar/favoritar) — o E2E espera voltar a 0
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  const onSalvo = (f: Formula) => {
    qc.setQueryData<Formula[]>(chave, (old) => inserirFormula(old ?? [], f));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const modelosMudaram = async () => {
    await qc.invalidateQueries({ queryKey: ["modelos-formula"] });
  };

  const pdfUma = (f: Formula) => {
    try {
      const nome = baixarPDFFormula({ paciente: p.nome, formula: f, nutricionista: nomeNutri, profissional, emitidoEm: new Date() });
      toast.success(`PDF gerado: ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };
  const pdfGlobal = () => {
    if (!formulas.length) return;
    try {
      const nome = baixarPDFFormulas({ paciente: p.nome, formulas, nutricionista: nomeNutri, profissional, emitidoEm: new Date() });
      toast.success(`PDF gerado: ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  /** Cópia com a data de hoje (mesmo título/ativos/posologia/quantidade/observação e modelo de origem). */
  const duplicar = async (f: Formula) => {
    setSalvando((n) => n + 1);
    try {
      const nova = await duplicarFormula(f);
      qc.setQueryData<Formula[]>(chave, (old) => inserirFormula(old ?? [], nova));
      toast.success(`Fórmula "${f.titulo}" duplicada com a data de hoje`);
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível duplicar a fórmula");
    } finally {
      setSalvando((n) => n - 1);
    }
  };

  /** Favoritar = salvar a fórmula como modelo ★ (a fórmula continua igual). */
  const favoritar = async (f: Formula) => {
    if (!user) return;
    setSalvando((n) => n + 1);
    try {
      await salvarComoModelo(user.id, { modelo_id: null, titulo: f.titulo, ativos: lerAtivos(f.ativos), posologia: f.posologia ?? "", quantidade: f.quantidade ?? "", observacao: f.observacao ?? "" }, true);
      await modelosMudaram();
      toast.success(`"${f.titulo}" salva como modelo favorito`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o modelo");
    } finally {
      setSalvando((n) => n - 1);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setExcluindo(true);
    try {
      await excluirFormula(alvo.id);
      qc.setQueryData<Formula[]>(chave, (old) => (old ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success(`Fórmula "${alvo.titulo}" excluída`);
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a fórmula");
    } finally {
      setExcluindo(false);
    }
  };

  const alternarDetalhe = (id: string) => setAbertas((a) => ({ ...a, [id]: !a[id] }));

  return (
    <div className="space-y-4" data-secao-manipulados data-atualizando={atualizando ? "1" : "0"} data-salvando-formula={salvando}>
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-formulas>
          Não foi possível carregar as fórmulas: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="manipulados">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Prescrição de manipulados</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem-formulas={formulas.length}>
              {carregando ? "Carregando..." : textoContagemFormulas(formulas.length)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setModelosAberto(true)} className={BTN_SEC} disabled={carregando} data-btn-modelos-formula>
              <Star className="h-3.5 w-3.5" aria-hidden="true" /> Modelos
            </button>
            <button type="button" onClick={pdfGlobal} className={BTN_SEC} disabled={carregando || formulas.length === 0} title={formulas.length === 0 ? "Nenhuma fórmula pra imprimir" : "PDF com todas as fórmulas, uma por página"} data-leitura data-btn-pdf-global>
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" /> PDF global
            </button>
            <button type="button" onClick={() => setModal({ aberto: true, formula: null })} className={BTN_PRI} disabled={carregando} data-btn-nova-formula>
              <Plus size={12} aria-hidden="true" /> Nova fórmula
            </button>
          </div>
        </header>

        {!carregando && !erro && formulas.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-formulas-vazio>
            <Beaker className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhuma fórmula prescrita</p>
            <p className="text-xs text-texto-2 font-body">Prescreva fórmulas manipuladas a partir de um modelo favorito ou em branco: ativos com dose, posologia e quantidade, com PDF pra farmácia.</p>
          </div>
        )}

        {formulas.length > 0 && (
          <ul className="divide-y divide-linha border-t border-linha" data-lista-formulas>
            {formulas.map((f) => {
              const ativos = lerAtivos(f.ativos).filter((a) => a.ativo);
              const n = contarAtivos(f.ativos);
              const aberta = !!abertas[f.id];
              return (
                <li key={f.id} className="py-3 space-y-2" data-formula={f.id} data-formula-titulo={f.titulo} data-formula-ativos={n} data-formula-data={f.prescrita_em}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <Beaker className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body" data-formula-titulo-texto>{f.titulo}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body" data-formula-resumo>
                          {textoContagemAtivos(n)} · {textoPrescritaEm(f.prescrita_em)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => alternarDetalhe(f.id)} className={BTN_MINI} aria-expanded={aberta} data-leitura data-btn-ver-formula>
                        {aberta ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />} {aberta ? "Fechar" : "Ver"}
                      </button>
                      <button type="button" onClick={() => pdfUma(f)} className={BTN_MINI} data-leitura data-btn-pdf-formula>
                        <FileDown size={12} aria-hidden="true" /> PDF
                      </button>
                      <button type="button" onClick={() => void duplicar(f)} className={BTN_MINI} data-btn-duplicar-formula>
                        <Copy size={12} aria-hidden="true" /> Duplicar
                      </button>
                      <button type="button" onClick={() => setModal({ aberto: true, formula: f })} className={BTN_MINI} data-btn-editar-formula>
                        <PenLine size={12} aria-hidden="true" /> Editar
                      </button>
                      <button type="button" onClick={() => void favoritar(f)} className={BTN_MINI_PRI} title="Salvar como modelo favorito" data-btn-favoritar-formula>
                        <Star size={12} aria-hidden="true" /> Favoritar
                      </button>
                      <button type="button" onClick={() => setParaExcluir(f)} className={BTN_MINI_PERIGO} data-btn-excluir-formula>
                        <Trash2 size={12} aria-hidden="true" /> Excluir
                      </button>
                    </div>
                  </div>
                  {aberta && (
                    <div className="ml-6 border-l-2 border-verde/30 pl-3 space-y-1.5 text-xs font-body" data-formula-detalhe>
                      <ul className="space-y-0.5" data-formula-lista-ativos>
                        {ativos.map((a, i) => (
                          <li key={i} className="text-texto" data-ativo={i}>{textoAtivo(a)}</li>
                        ))}
                        {ativos.length === 0 && <li className="text-texto-2" data-ativo-vazio>Sem ativos</li>}
                      </ul>
                      <p className="text-texto-2 whitespace-pre-wrap" data-formula-posologia><span className="uppercase tracking-wider text-[10px]">Posologia:</span> {(f.posologia ?? "").trim() || "—"}</p>
                      <p className="text-texto-2" data-formula-quantidade><span className="uppercase tracking-wider text-[10px]">Quantidade:</span> {(f.quantidade ?? "").trim() || "—"}</p>
                      {(f.observacao ?? "").trim() && (
                        <p className="text-texto-2 whitespace-pre-wrap" data-formula-observacao><span className="uppercase tracking-wider text-[10px]">Observações:</span> {f.observacao}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <FormulaDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        pacienteId={p.id}
        modelos={modelos}
        formula={modal.formula}
        onSalvo={onSalvo}
        onModeloCriado={modelosMudaram}
      />
      <ModelosFormulaDialog open={modelosAberto} onOpenChange={setModelosAberto} modelos={modelos} onMudou={modelosMudaram} />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta fórmula?</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-texto-2">
              {paraExcluir ? <><span className="text-texto">{paraExcluir.titulo}</span> ({textoPrescritaEm(paraExcluir.prescrita_em).toLowerCase()}) vai pra lixeira. </> : ""}
              Os modelos e as outras fórmulas não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-formula>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
