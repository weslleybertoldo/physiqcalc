// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/CalculoEnergetico.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, FileDown, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import CalculoDialog from "@/nutricao/editor/ui/CalculoDialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
import { listarAntropometrias, type Antropometria } from "@/nutricao/editor/lib/antropometrias";
import { rotuloSexo } from "@/nutricao/editor/lib/antropometriaUtil";
import { excluirCalculo, listarCalculos, type CalculoEnergetico as Calculo } from "@/nutricao/editor/lib/calculosEnergeticos";
import { baixarPDFEnergetico } from "@/nutricao/editor/lib/energeticoPdf";
import {
  FORMULA_PADRAO, ehFormula, fmtAjuste, fmtKcal, fmtNum, formatarDataHoraCalculo, gastoAtividade, gastoAtividades, inserirOrdenado, lerAtividades,
  resumoCalculo, rotuloFator, rotuloFormula, rotuloObjetivo, textoContagem, type Formula,
} from "@/nutricao/editor/lib/energeticoUtil";
import { usePaciente } from "@/nutricao/editor/ui/contexto";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

const Bloco = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <div>
    <p className="text-xs text-texto-2 font-body mb-1">{titulo}</p>
    <dl className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1">{children}</dl>
  </div>
);
const Par = ({ rotulo, valor, largo = false }: { rotulo: string; valor: string; largo?: boolean }) => (
  <div className={`flex justify-between gap-2 text-sm font-body border-b border-dotted border-linha pb-0.5${largo ? " col-span-2" : ""}`}>
    <dt className="text-texto-3">{rotulo}</dt>
    <dd className="text-texto-2 text-right">{valor}</dd>
  </div>
);

/** "Ver": dados usados, atividades, resultados e observações do cálculo. */
function Detalhe({ c }: { c: Calculo }) {
  const ativ = lerAtividades(c.atividades);
  const extra = gastoAtividades(ativ, c.peso);
  return (
    <div className="ml-6 space-y-3 border-l-2 border-verde/40 pl-3" data-calculo-detalhe>
      <Bloco titulo="Dados">
        <Par rotulo="Fórmula" valor={rotuloFormula(c.formula, false)} largo />
        <Par rotulo="Fator de atividade" valor={rotuloFator(c.fator_atividade)} largo />
        <Par rotulo="Peso" valor={c.peso === null ? "—" : `${fmtNum(c.peso, 1)} kg`} />
        <Par rotulo="Altura" valor={c.altura === null ? "—" : `${fmtNum(c.altura, 1)} cm`} />
        <Par rotulo="Idade" valor={c.idade === null ? "—" : `${c.idade} anos`} />
        <Par rotulo="Sexo" valor={rotuloSexo(c.sexo)} />
        <Par rotulo="Massa magra" valor={c.massa_magra === null ? "—" : `${fmtNum(c.massa_magra, 1)} kg`} />
        <Par rotulo="Objetivo" valor={rotuloObjetivo(c.objetivo)} />
        <Par rotulo="Ajuste" valor={`${fmtAjuste(c.ajuste_kcal)} kcal`} />
      </Bloco>
      {ativ.length > 0 && (
        <Bloco titulo="Atividades físicas (MET)">
          {ativ.map((a, i) => (
            <Par key={i} rotulo={`${a.descricao || "Atividade"} · MET ${fmtNum(a.met, 1)} · ${a.minutos_por_dia} min/dia`} valor={c.peso ? `${fmtKcal(gastoAtividade(a, c.peso))} kcal` : "—"} largo />
          ))}
        </Bloco>
      )}
      <Bloco titulo="Resultados (kcal/dia)">
        <Par rotulo="TMB" valor={fmtKcal(c.tmb)} />
        <Par rotulo="Atividades" valor={extra === null ? "—" : `+${fmtKcal(extra)}`} />
        <Par rotulo="GET" valor={fmtKcal(c.get)} />
        <Par rotulo="VET" valor={fmtKcal(c.vet)} />
      </Bloco>
      {c.observacao?.trim() && (
        <div>
          <p className="text-xs text-texto-2 font-body">Observações</p>
          <p className="text-sm text-texto-2 font-body whitespace-pre-wrap" data-calculo-observacao>{c.observacao}</p>
        </div>
      )}
    </div>
  );
}

// Seção "Cálculo energético" (referência: fórmulas da TMB, fator de atividade, MET e ajuste do objetivo). Lista mais
// recente primeiro: "<fórmula> · TMB x · GET y · VET z kcal" + data e objetivo, com Ver, Editar, PDF, Excluir. O novo
// cálculo nasce com peso/altura/sexo/massa magra da última antropometria e com a fórmula do último cálculo.
export default function CalculoEnergetico() {
  const { paciente: p, recarregar } = usePaciente();
  const { user } = useAuth();
  const [lista, setLista] = useState<Calculo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeNutri, setNomeNutri] = useState<string | null>(null);
  const [ultimaAntro, setUltimaAntro] = useState<Antropometria | null>(null);
  const [modal, setModal] = useState<{ aberto: boolean; calculo: Calculo | null }>({ aberto: false, calculo: null });
  const [abertos, setAbertos] = useState<string[]>([]);
  const [paraExcluir, setParaExcluir] = useState<Calculo | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(await listarCalculos(p.id));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os cálculos");
      setLista([]);
    }
    try {
      const antros = await listarAntropometrias(p.id);
      setUltimaAntro(antros[0] ?? null);
    } catch {
      setUltimaAntro(null);
    }
  }, [p.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!user) return;
    void nomeDaNutricionista(user.id).then(setNomeNutri);
  }, [user]);

  const itens = useMemo(() => lista ?? [], [lista]);
  const formulaPadrao: Formula = itens[0] && ehFormula(itens[0].formula) ? itens[0].formula : FORMULA_PADRAO;

  const abrirNovo = () => setModal({ aberto: true, calculo: null });
  const abrirEdicao = (c: Calculo) => setModal({ aberto: true, calculo: c });

  const onSalvo = (c: Calculo) => {
    setLista((l) => inserirOrdenado(l ?? [], c));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };

  const alternar = (id: string) => setAbertos((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  const pdf = (c: Calculo) => {
    try {
      const nome = baixarPDFEnergetico({
        paciente: p.nome,
        nutricionista: nomeNutri,
        data: new Date(c.data),
        formula: c.formula,
        peso: c.peso,
        altura: c.altura,
        idade: c.idade,
        sexo: c.sexo,
        massa_magra: c.massa_magra,
        fator_atividade: c.fator_atividade,
        atividades: c.atividades,
        tmb: c.tmb,
        get: c.get,
        ajuste_kcal: c.ajuste_kcal,
        vet: c.vet,
        objetivo: c.objetivo,
        observacao: c.observacao,
      });
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
      await excluirCalculo(alvo.id);
      setLista((l) => (l ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success("Cálculo excluído");
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o cálculo");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="space-y-4" data-secao-calculo-energetico>
      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="calculo-energetico">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Cálculo energético</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem={itens.length}>
              {lista === null ? "Carregando..." : textoContagem(itens.length)}
              {itens[0] && (
                <>
                  {" · último em "}
                  <span className="text-texto" data-ultimo-calculo={itens[0].id}>{formatarDataHoraCalculo(itens[0].data)}</span>
                  {itens[0].vet !== null && (
                    <>
                      {" · VET "}
                      <span className="text-texto" data-ultimo-vet={itens[0].vet}>{fmtKcal(itens[0].vet)} kcal</span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          <button type="button" onClick={abrirNovo} className={BTN_PRI} data-btn-novo-calculo>
            <Plus size={12} /> Novo cálculo
          </button>
        </header>

        {erro && <p role="alert" className="text-sm text-rosa-3 font-body">{erro}</p>}

        {lista !== null && !erro && itens.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-calculos-vazio>
            <Flame className="mx-auto h-6 w-6 text-texto-3" />
            <p className="text-sm text-texto font-body">Nenhum cálculo energético</p>
            <p className="text-xs text-texto-2 font-body">
              Calcule a TMB pela fórmula que preferir, aplique o fator de atividade, as atividades em MET e o ajuste do objetivo — o VET é a base do plano alimentar.
            </p>
            <button type="button" onClick={abrirNovo} className={BTN_SEC} data-btn-primeiro-calculo>
              Novo cálculo
            </button>
          </div>
        )}

        {itens.length > 0 && (
          <ul className="divide-y divide-linha" data-lista-calculos>
            {itens.map((c) => {
              const aberto = abertos.includes(c.id);
              return (
                <li
                  key={c.id}
                  className="py-3 space-y-2"
                  data-calculo={c.id}
                  data-aberto={aberto ? "1" : "0"}
                  data-formula={c.formula}
                  data-tmb={c.tmb ?? ""}
                  data-get={c.get ?? ""}
                  data-vet={c.vet ?? ""}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <Flame className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" />
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body" data-calculo-resumo>{resumoCalculo(c)}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body" data-calculo-data>
                          {formatarDataHoraCalculo(c.data)} · {rotuloObjetivo(c.objetivo)}
                          {c.ajuste_kcal ? ` (${fmtAjuste(c.ajuste_kcal)} kcal)` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => alternar(c.id)} className={BTN_MINI} data-leitura data-btn-ver-calculo>
                        {aberto ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {aberto ? "Ocultar" : "Ver"}
                      </button>
                      <button type="button" onClick={() => abrirEdicao(c)} className={BTN_MINI} data-btn-editar-calculo>
                        <Pencil size={12} /> Editar
                      </button>
                      <button type="button" onClick={() => pdf(c)} className={BTN_MINI} data-leitura data-btn-pdf-calculo>
                        <FileDown size={12} /> PDF
                      </button>
                      <button type="button" onClick={() => setParaExcluir(c)} className={BTN_MINI_PERIGO} data-btn-excluir-calculo>
                        <Trash2 size={12} /> Excluir
                      </button>
                    </div>
                  </div>
                  {aberto && <Detalhe c={c} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CalculoDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        paciente={p}
        ultimaAntropometria={ultimaAntro}
        formulaPadrao={formulaPadrao}
        calculo={modal.calculo}
        onSalvo={onSalvo}
      />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este cálculo?</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-texto-2">
              {paraExcluir ? `Cálculo de ${formatarDataHoraCalculo(paraExcluir.data)} (${rotuloFormula(paraExcluir.formula)}). ` : ""}Ele sai do prontuário do paciente e vai pra lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-calculo>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
