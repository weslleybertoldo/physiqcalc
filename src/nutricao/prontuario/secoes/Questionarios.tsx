// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Questionarios.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ClipboardCheck, FileDown, ListChecks, PenLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, SELECT } from "@/nutricao/editor/ui/estilos";
import AplicacaoDialog from "@/nutricao/prontuario/ui/AplicacaoDialog";
import NivelBadge from "@/nutricao/prontuario/ui/NivelBadge";
import QuestionariosDialog from "@/nutricao/prontuario/ui/QuestionariosDialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import type { DadosProfissionais } from "@/nutricao/prontuario/lib/documentosUtil";
import { dadosProfissionais, excluirAplicacao, listarAplicacoesDoPaciente, listarQuestionarios, nomeDaNutricionista, type Aplicacao } from "@/nutricao/prontuario/lib/questionarios";
import { baixarPDFAplicacao } from "@/nutricao/prontuario/lib/questionariosPdf";
import {
  contarRespondidas, filtrarPorQuestionario, formatarDataQuestionario, formatarPontos, inserirAplicacao, lerNivel, lerPerguntas, lerRespostas, ordenarAplicacoes, pontuacaoMaxima,
  pontuarPergunta, textoContagemAplicacoes, textoPontuacao, textoResposta, textoRespondidas, titulosAplicados,
} from "@/nutricao/prontuario/lib/questionariosUtil";
import { usePaciente } from "@/nutricao/prontuario/ui/contexto";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const TH = "text-left font-semibold text-[10px] uppercase tracking-wider text-texto-2 px-2 py-1.5";
const TD = "px-2 py-1.5 text-sm font-body align-top";

// Seção "Questionários de saúde" do paciente (referência: questionários aplicados na consulta com pontuação). "Aplicar
// questionário" (os 4 do sistema + os próprios), "Questionários" (gerenciar: duplicar/editar/excluir/★), filtro por
// questionário (evolução da pontuação de 1 questionário em todas as datas), lista 'título · dd/MM/yyyy · N/M pontos · faixa'
// com badge do nível, Ver (pergunta · resposta · pontos + observação), PDF, Editar e Excluir (soft). Cada aplicação guarda a
// própria cópia do título/perguntas/faixas — o histórico não muda quando o questionário muda.
export default function Questionarios() {
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

  const chaveAplicacoes = useMemo(() => ["aplicacoes-questionario", p.id], [p.id]);
  const aplicacoesQ = useQuery({ queryKey: chaveAplicacoes, queryFn: () => listarAplicacoesDoPaciente(p.id) });
  const questionariosQ = useQuery({ queryKey: ["questionarios", uid], queryFn: () => listarQuestionarios(), enabled: !!uid });

  const aplicacoes = useMemo(() => ordenarAplicacoes(aplicacoesQ.data ?? []), [aplicacoesQ.data]);
  const questionarios = useMemo(() => questionariosQ.data ?? [], [questionariosQ.data]);

  const carregando = !uid || aplicacoesQ.isPending || questionariosQ.isPending;
  const atualizando = carregando || aplicacoesQ.isFetching || questionariosQ.isFetching;
  const erro = aplicacoesQ.error ?? questionariosQ.error;

  const [modalAplicacao, setModalAplicacao] = useState<{ aberto: boolean; aplicacao: Aplicacao | null }>({ aberto: false, aplicacao: null });
  const [questionariosAberto, setQuestionariosAberto] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<Aplicacao | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState("");
  const [salvando, setSalvando] = useState(0); // gravações assíncronas fora dos modais — o E2E espera voltar a 0

  const titulos = useMemo(() => titulosAplicados(aplicacoes), [aplicacoes]);
  const filtradas = useMemo(() => filtrarPorQuestionario(aplicacoes, filtro), [aplicacoes, filtro]);

  useEffect(() => {
    if (filtro && !titulos.some((t) => t === filtro)) setFiltro(""); // o questionário filtrado sumiu (excluído)
  }, [filtro, titulos]);

  const onAplicacaoSalva = (a: Aplicacao) => {
    qc.setQueryData<Aplicacao[]>(chaveAplicacoes, (old) => inserirAplicacao(old ?? [], a));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const questionariosMudaram = async () => {
    await qc.invalidateQueries({ queryKey: ["questionarios"] });
  };

  const pdf = (a: Aplicacao) => {
    try {
      const nome = baixarPDFAplicacao({ paciente: p.nome, aplicacao: a, nutricionista: nomeNutri, profissional, emitidoEm: new Date() });
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
      await excluirAplicacao(alvo.id);
      qc.setQueryData<Aplicacao[]>(chaveAplicacoes, (old) => (old ?? []).filter((x) => x.id !== alvo.id));
      toast.success(`${alvo.titulo} de ${formatarDataQuestionario(alvo.data)} excluído`);
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

  return (
    <div className="space-y-4" data-secao-questionarios data-atualizando={atualizando ? "1" : "0"} data-salvando-aplicacao={salvando}>
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-questionarios>
          Não foi possível carregar os questionários: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="aplicacoes">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Questionários aplicados</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem-aplicacoes={aplicacoes.length}>
              {carregando ? "Carregando..." : textoContagemAplicacoes(aplicacoes.length)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setQuestionariosAberto(true)} className={BTN_SEC} disabled={carregando} data-btn-questionarios>
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" /> Questionários
            </button>
            <button type="button" onClick={() => setModalAplicacao({ aberto: true, aplicacao: null })} className={BTN_PRI} disabled={carregando} data-btn-nova-aplicacao>
              <Plus size={12} aria-hidden="true" /> Aplicar questionário
            </button>
          </div>
        </header>

        {aplicacoes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-texto-2 font-body" htmlFor="filtro-questionario">Ver evolução de</label>
            <select id="filtro-questionario" className={`${SELECT} sm:max-w-xs`} value={filtro} onChange={(e) => setFiltro(e.target.value)} data-filtro-questionario>
              <option value="">Todos os questionários</option>
              {titulos.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        {!carregando && !erro && aplicacoes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-aplicacoes-vazio>
            <ClipboardCheck className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhum questionário aplicado</p>
            <p className="text-xs text-texto-2 font-body">Aplique um questionário na consulta: a pontuação e a faixa saem na hora e ficam guardadas pra acompanhar a evolução.</p>
          </div>
        )}

        {filtradas.length > 0 && (
          <ul className="divide-y divide-linha border-t border-linha" data-lista-aplicacoes>
            {filtradas.map((a) => {
              const perguntas = lerPerguntas(a.perguntas);
              const respostas = lerRespostas(a.respostas);
              const max = pontuacaoMaxima(perguntas);
              const nivel = lerNivel(a.nivel);
              const aberto = !!abertos[a.id];
              return (
                <li
                  key={a.id}
                  className="py-3 space-y-2"
                  data-aplicacao={a.id}
                  data-aplicacao-titulo={a.titulo}
                  data-aplicacao-data={a.data}
                  data-aplicacao-pontos={formatarPontos(a.pontuacao)}
                  data-aplicacao-max={formatarPontos(max)}
                  data-aplicacao-faixa={a.faixa ?? ""}
                  data-aplicacao-nivel={nivel}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <ClipboardCheck className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body" data-aplicacao-resumo>{a.titulo}</p>
                        <p className="text-[11px] text-texto-2 font-body flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span data-aplicacao-linha>{formatarDataQuestionario(a.data)} · {textoPontuacao(a.pontuacao, max)} · {textoRespondidas(contarRespondidas(perguntas, respostas), perguntas.length)}</span>
                          <NivelBadge nivel={nivel} rotulo={a.faixa ?? ""} />
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => alternarDetalhe(a.id)} className={BTN_MINI} aria-expanded={aberto} data-leitura data-btn-ver-aplicacao>
                        {aberto ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />} {aberto ? "Fechar" : "Ver"}
                      </button>
                      <button type="button" onClick={() => pdf(a)} className={BTN_MINI} data-leitura data-btn-pdf-aplicacao>
                        <FileDown size={12} aria-hidden="true" /> PDF
                      </button>
                      <button type="button" onClick={() => setModalAplicacao({ aberto: true, aplicacao: a })} className={BTN_MINI} data-btn-editar-aplicacao>
                        <PenLine size={12} aria-hidden="true" /> Editar
                      </button>
                      <button type="button" onClick={() => setParaExcluir(a)} className={BTN_MINI_PERIGO} data-btn-excluir-aplicacao>
                        <Trash2 size={12} aria-hidden="true" /> Excluir
                      </button>
                    </div>
                  </div>
                  {aberto && (
                    <div className="ml-6 border-l-2 border-verde/30 pl-3 space-y-1.5 text-xs font-body" data-aplicacao-detalhe>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-linha">
                              <th className={TH}>Pergunta</th>
                              <th className={TH}>Resposta</th>
                              <th className={`${TH} text-right`}>Pontos</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-linha">
                            {perguntas.map((q, i) => {
                              const r = respostas[q.id];
                              const pts = pontuarPergunta(q, r);
                              return (
                                <tr key={q.id} data-resposta={i} data-resposta-valor={textoResposta(q, r)} data-resposta-pontos={formatarPontos(pts)}>
                                  <td className={`${TD} text-texto`}>{i + 1}. {q.texto}</td>
                                  <td className={`${TD} text-texto`}>{textoResposta(q, r)}</td>
                                  <td className={`${TD} text-right tabular-nums text-texto`}>{formatarPontos(pts)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {(a.observacao ?? "").trim() && (
                        <p className="text-texto-2 whitespace-pre-wrap" data-aplicacao-observacao><span className="uppercase tracking-wider text-[10px]">Observações:</span> {a.observacao}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {aplicacoes.length > 0 && filtradas.length === 0 && <p className="text-sm text-texto-2 font-body" data-aplicacoes-filtro-vazio>Nenhuma aplicação desse questionário.</p>}
      </section>

      <AplicacaoDialog
        open={modalAplicacao.aberto}
        onOpenChange={(aberto) => setModalAplicacao((m) => ({ ...m, aberto }))}
        pacienteId={p.id}
        questionarios={questionarios}
        aplicacao={modalAplicacao.aplicacao}
        onSalva={onAplicacaoSalva}
        onEditada={onAplicacaoSalva}
      />
      <QuestionariosDialog open={questionariosAberto} onOpenChange={setQuestionariosAberto} questionarios={questionarios} onMudou={questionariosMudaram} />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta aplicação?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              <span className="text-texto">{paraExcluir?.titulo}</span> de {formatarDataQuestionario(paraExcluir?.data)} vai pra lixeira. As outras aplicações não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-aplicacao>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
