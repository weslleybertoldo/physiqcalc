// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/questionarios/AplicacaoDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ListChecks, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import NivelBadge from "@/nutricao/prontuario/ui/NivelBadge";
import { atualizarAplicacao, criarAplicacao, type Aplicacao, type Questionario } from "@/nutricao/prontuario/lib/questionarios";
import {
  OBSERVACAO_QUESTIONARIO_MAX, RESPOSTA_TEXTO_MAX, aplicacaoParaForm, calcularResultado, contarRespondidas, ehDoSistema, formInicialAplicacao, formParaRegistroAplicacao, formatarPontos,
  lerFaixas, lerPerguntas, normalizarTexto, ordenarQuestionarios, pontuacaoMaxima, recalcularAplicacao, responder, textoPontuacao, textoRespondidas, validarAplicacao,
  type FormAplicacao, type Pergunta, type Resposta,
} from "@/nutricao/prontuario/lib/questionariosUtil";

// Modal da aplicação de um questionário no paciente. NOVA: select do questionário (favoritos → próprios → do sistema), data
// (hoje), as perguntas por tipo — escala = botões 0..máximo, sim/não = 2 botões, múltipla = opções, texto = campo livre —,
// 'N/M respondidas', pontuação/faixa/nível AO VIVO, observação. EDIÇÃO: o questionário fica TRAVADO (mostra o título copiado)
// e as perguntas vêm da CÓPIA gravada na aplicação; muda respostas/data/observação e o app recalcula. Cada aplicação guarda a
// PRÓPRIA cópia do título/perguntas/faixas — mudar o questionário depois não mexe no histórico.
const BTN_TOGGLE = (ativo: boolean) =>
  `inline-flex h-8 min-w-8 items-center justify-center border px-2.5 font-semibold text-xs tracking-wider transition-colors ${
    ativo ? "bg-verde text-[#04150F] border-verde" : "border-linha-2 text-texto-2 hover:text-texto hover:border-verde/50"
  }`;

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  questionarios: Questionario[];
  /** aplicação existente = modo edição (questionário travado) */
  aplicacao?: Aplicacao | null;
  onSalva: (a: Aplicacao) => void;
  onEditada: (a: Aplicacao) => void;
}

export default function AplicacaoDialog({ open, onOpenChange, pacienteId, questionarios, aplicacao, onSalva, onEditada }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormAplicacao>(formInicialAplicacao());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const abriuRef = useRef(false);
  const edicao = !!aplicacao;

  // reinicia SÓ ao abrir
  useEffect(() => {
    if (open && !abriuRef.current) {
      setErro(null);
      setForm(aplicacao ? aplicacaoParaForm(aplicacao) : formInicialAplicacao());
    }
    abriuRef.current = open;
  }, [open, aplicacao]);

  const ordenados = useMemo(() => ordenarQuestionarios(questionarios), [questionarios]);
  const favoritos = useMemo(() => ordenados.filter((q) => !ehDoSistema(q) && q.favorito), [ordenados]);
  const proprios = useMemo(() => ordenados.filter((q) => !ehDoSistema(q) && !q.favorito), [ordenados]);
  const doSistema = useMemo(() => ordenados.filter(ehDoSistema), [ordenados]);
  const escolhido = useMemo(() => (edicao ? null : ordenados.find((q) => q.id === form.questionarioId) ?? null), [edicao, ordenados, form.questionarioId]);

  const perguntas: Pergunta[] = useMemo(() => lerPerguntas(aplicacao ? aplicacao.perguntas : escolhido?.perguntas), [aplicacao, escolhido]);
  const faixas = useMemo(() => lerFaixas(aplicacao ? aplicacao.faixas : escolhido?.faixas), [aplicacao, escolhido]);
  const titulo = aplicacao ? aplicacao.titulo : escolhido?.titulo ?? "";
  const descricao = escolhido?.descricao ?? "";
  const max = useMemo(() => pontuacaoMaxima(perguntas), [perguntas]);
  const respondidas = contarRespondidas(perguntas, form.respostas);
  const previa = useMemo(() => calcularResultado(perguntas, faixas, form.respostas), [perguntas, faixas, form.respostas]);

  const marcar = (id: string, valor: Resposta) => {
    setForm((f) => ({ ...f, respostas: responder(f.respostas, id, valor) }));
    if (erro) setErro(null);
  };
  const trocarQuestionario = (id: string) => {
    setForm((f) => ({ ...f, questionarioId: id, respostas: {} }));
    if (erro) setErro(null);
  };

  const salvar = async () => {
    const msg = validarAplicacao(form.data, perguntas, form.respostas);
    if (msg) return setErro(msg);
    setErro(null);
    setSalvando(true);
    try {
      if (!user) throw new Error("Sessão expirada — entre de novo");
      if (aplicacao) {
        const re = recalcularAplicacao(aplicacao, form.respostas);
        const a = await atualizarAplicacao(aplicacao.id, { ...re, data: form.data, observacao: normalizarTexto(form.observacao).slice(0, OBSERVACAO_QUESTIONARIO_MAX) });
        onEditada(a);
        toast.success(`Aplicação atualizada: ${textoPontuacao(a.pontuacao, max)}`);
      } else {
        if (!escolhido) throw new Error("Escolha o questionário");
        const a = await criarAplicacao(user.id, pacienteId, formParaRegistroAplicacao(form, escolhido));
        onSalva(a);
        toast.success(`${a.titulo} aplicado: ${textoPontuacao(a.pontuacao, max)}${a.faixa ? ` · ${a.faixa}` : ""}`);
      }
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível salvar a aplicação";
      setErro(m);
      toast.error(m);
    } finally {
      setSalvando(false);
    }
  };

  const grupo = (nome: string, lista: Questionario[]) =>
    lista.length ? (
      <optgroup label={nome}>
        {lista.map((q) => (
          <option key={q.id} value={q.id}>{q.titulo}</option>
        ))}
      </optgroup>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-3xl max-h-[92vh] overflow-y-auto" data-modal-aplicacao={edicao ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-verde-3" aria-hidden="true" /> {edicao ? "Editar aplicação" : "Aplicar questionário"}
          </DialogTitle>
          <DialogDescription className="font-body text-xs">
            {edicao
              ? "Ajuste as respostas, a data ou a observação. As perguntas são as que valiam na data da aplicação; a pontuação e a faixa são recalculadas."
              : "Escolha o questionário e responda com o paciente. A pontuação e a faixa aparecem ao vivo; o resultado fica guardado com a cópia das perguntas."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
          className="space-y-4"
          noValidate
          data-form-aplicacao
        >
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-3">
            {edicao ? (
              <Campo rotulo="Questionário">
                <p className="text-sm text-texto font-body py-2 border-b border-linha-2" data-titulo-aplicacao>{titulo}</p>
              </Campo>
            ) : (
              <Campo rotulo="Questionário *" dica={descricao || undefined}>
                <select className={SELECT} value={form.questionarioId} onChange={(e) => trocarQuestionario(e.target.value)} data-campo-questionario>
                  <option value="">Escolha o questionário…</option>
                  {grupo("Favoritos", favoritos)}
                  {grupo("Meus questionários", proprios)}
                  {grupo("Do sistema", doSistema)}
                </select>
              </Campo>
            )}
            <Campo rotulo="Data da aplicação *">
              <input
                type="date"
                className={INPUT}
                value={form.data}
                onChange={(e) => {
                  setForm((f) => ({ ...f, data: e.target.value }));
                  if (erro) setErro(null);
                }}
                data-campo-data-aplicacao
              />
            </Campo>
          </div>

          {perguntas.length > 0 && (
            <div className="space-y-2" data-perguntas-aplicacao data-perguntas-aplicacao-total={perguntas.length}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha pb-1.5">
                <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body" data-respondidas={respondidas}>{textoRespondidas(respondidas, perguntas.length)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-body text-texto tabular-nums" data-pontuacao-previa={formatarPontos(previa.pontuacao)}>{textoPontuacao(previa.pontuacao, max)}</span>
                  <NivelBadge nivel={previa.nivel} rotulo={previa.faixa} extras={{ "data-faixa-previa": previa.faixa, "data-nivel-previa": previa.nivel }} />
                </div>
              </div>
              {perguntas.map((p, i) => {
                const r = form.respostas[p.id];
                return (
                  <div key={p.id} className="rounded-xl border border-linha p-2.5 space-y-1.5" data-pergunta-aplicacao={i} data-pergunta-tipo={p.tipo}>
                    <p className="text-sm text-texto font-body">
                      <span className="text-texto-2">{i + 1}.</span> {p.texto}
                    </p>
                    {p.tipo === "escala" && (
                      <div className="flex flex-wrap items-center gap-1.5" data-escala={i}>
                        {Array.from({ length: p.max + 1 }, (_, v) => (
                          <button key={v} type="button" className={BTN_TOGGLE(r === v)} onClick={() => marcar(p.id, v)} aria-pressed={r === v} aria-label={`${p.texto}: ${v}`} data-escala-valor={`${i}-${v}`}>
                            {v}
                          </button>
                        ))}
                        <span className="text-[10px] text-texto-2 font-body ml-1">0 a {p.max}</span>
                      </div>
                    )}
                    {p.tipo === "sim_nao" && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" className={BTN_TOGGLE(r === true)} onClick={() => marcar(p.id, true)} aria-pressed={r === true} data-sim={i}>Sim</button>
                        <button type="button" className={BTN_TOGGLE(r === false)} onClick={() => marcar(p.id, false)} aria-pressed={r === false} data-nao={i}>Não</button>
                        <span className="text-[10px] text-texto-2 font-body ml-1">sim = {formatarPontos(p.pontos_sim)} pt</span>
                      </div>
                    )}
                    {p.tipo === "multipla" && (
                      <div className="space-y-1" data-opcoes={i}>
                        {p.opcoes.map((o, k) => (
                          <label key={k} className="flex items-center gap-2 text-sm font-body text-texto">
                            <input type="radio" name={`resposta-${p.id}`} className="accent-[#10B981]" checked={r === k} onChange={() => marcar(p.id, k)} data-opcao={`${i}-${k}`} />
                            <span>{o.texto}</span>
                            <span className="text-[10px] text-texto-2">({formatarPontos(o.pontos)} pt)</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {p.tipo === "texto" && (
                      <input
                        className={INPUT}
                        maxLength={RESPOSTA_TEXTO_MAX}
                        placeholder="resposta livre"
                        value={typeof r === "string" ? r : ""}
                        onChange={(e) => marcar(p.id, e.target.value)}
                        aria-label={p.texto}
                        data-campo-texto={i}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!edicao && !escolhido && <p className="text-xs text-texto-2 font-body" data-aplicacao-sem-questionario>Escolha um questionário pra ver as perguntas.</p>}

          <Campo rotulo="Observação (opcional)">
            <textarea
              className={TEXTAREA}
              maxLength={OBSERVACAO_QUESTIONARIO_MAX}
              rows={2}
              value={form.observacao}
              onChange={(e) => {
                setForm((f) => ({ ...f, observacao: e.target.value }));
                if (erro) setErro(null);
              }}
              data-campo-observacao-aplicacao
            />
          </Campo>

          {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-aplicacao>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-aplicacao>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-aplicacao>
              <Save size={12} aria-hidden="true" /> {salvando ? "Salvando..." : edicao ? "Salvar" : "Salvar aplicação"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
