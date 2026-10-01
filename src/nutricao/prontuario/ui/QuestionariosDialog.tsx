// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/questionarios/QuestionariosDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ListChecks, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import PerguntasEditor from "@/nutricao/prontuario/ui/PerguntasEditor";
import { atualizarQuestionario, criarQuestionario, duplicarQuestionario, excluirQuestionario, type Questionario } from "@/nutricao/prontuario/lib/questionarios";
import {
  DESCRICAO_QUESTIONARIO_MAX, NIVEIS, ROTULO_FAIXA_MAX, TITULO_QUESTIONARIO_MAX, ehDoSistema, formParaRegistroQuestionario, formQuestionarioVazio, formatarPontos, lerPerguntas,
  ordenarQuestionarios, pontuacaoMaxima, pontuacaoMaximaForm, questionarioParaForm, textoContagemPerguntas, textoContagemQuestionarios, textoNivel, validarQuestionario,
  type FormQuestionario, type Nivel,
} from "@/nutricao/prontuario/lib/questionariosUtil";

// Questionários disponíveis (padrão do CatalogoExamesDialog da W18): lista com os 4 do SISTEMA (só leitura — Duplicar) e os
// PRÓPRIOS (★ favorito, Duplicar, Editar, Excluir soft); "Novo questionário" e o formulário (título, descrição, editor de
// perguntas, 3 faixas de pontuação, favorito). As aplicações já feitas guardam a própria cópia — mudar/excluir um questionário
// não mexe no histórico. Quem chama recarrega pelo `onMudou`.
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const ROTULO = "block text-[10px] uppercase tracking-wider text-texto-2 font-body";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  questionarios: Questionario[];
  onMudou: () => Promise<void> | void;
}

export default function QuestionariosDialog({ open, onOpenChange, questionarios, onMudou }: Props) {
  const { user } = useAuth();
  const [editando, setEditando] = useState<{ item: Questionario | null } | null>(null); // null = lista; {item:null} = novo
  const [form, setForm] = useState<FormQuestionario>(formQuestionarioVazio());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<Questionario | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null); // id em favoritar/duplicar
  const ordenados = useMemo(() => ordenarQuestionarios(questionarios), [questionarios]);
  const maxForm = useMemo(() => pontuacaoMaximaForm(form.perguntas), [form.perguntas]);

  useEffect(() => {
    if (erro && editando && validarQuestionario(form.titulo, form.perguntas, form.faixas) === null) setErro(null); // o aviso some assim que ela resolve
  }, [erro, editando, form]);

  useEffect(() => {
    if (!open) {
      setEditando(null);
      setErro(null);
    }
  }, [open]);

  const abrirNovo = () => {
    setForm(formQuestionarioVazio());
    setErro(null);
    setEditando({ item: null });
  };
  const abrirEdicao = (q: Questionario) => {
    setForm(questionarioParaForm(q));
    setErro(null);
    setEditando({ item: q });
  };
  const mudar = (patch: Partial<FormQuestionario>) => setForm((f) => ({ ...f, ...patch }));
  const mudarFaixa = (k: number, patch: Partial<FormQuestionario["faixas"][number]>) => setForm((f) => ({ ...f, faixas: f.faixas.map((x, i) => (i === k ? { ...x, ...patch } : x)) }));

  const salvar = async () => {
    const msg = validarQuestionario(form.titulo, form.perguntas, form.faixas);
    if (msg) return setErro(msg);
    setErro(null);
    setSalvando(true);
    const reg = formParaRegistroQuestionario(form);
    try {
      if (editando?.item) {
        await atualizarQuestionario(editando.item.id, reg);
        toast.success("Questionário atualizado");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        await criarQuestionario(user.id, reg);
        toast.success("Questionário criado");
      }
      await onMudou();
      setEditando(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível salvar o questionário";
      setErro(m);
      toast.error(m);
    } finally {
      setSalvando(false);
    }
  };

  const alternarFavorito = async (q: Questionario) => {
    setOcupado(q.id);
    try {
      await atualizarQuestionario(q.id, { favorito: !q.favorito });
      await onMudou();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o favorito");
    } finally {
      setOcupado(null);
    }
  };

  const duplicar = async (q: Questionario) => {
    setOcupado(q.id);
    try {
      if (!user) throw new Error("Sessão expirada — entre de novo");
      const copia = await duplicarQuestionario(q, user.id);
      await onMudou();
      toast.success(`Cópia criada: ${copia.titulo}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível duplicar o questionário");
    } finally {
      setOcupado(null);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirQuestionario(paraExcluir.id);
      toast.success("Questionário excluído");
      setParaExcluir(null);
      await onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o questionário");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-modal-questionarios={editando ? (editando.item ? "editar" : "novo") : "lista"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editando ? (editando.item ? "Editar questionário" : "Novo questionário") : "Questionários de saúde"}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {editando
              ? "Título, descrição, perguntas (escala, sim/não, múltipla escolha ou texto) e as 3 faixas de pontuação. As aplicações já feitas não mudam."
              : "Os do sistema valem pra todas e não mudam — duplique pra ter a sua versão editável. Os seus aceitam estrela (aparecem primeiro), edição e exclusão."}
          </DialogDescription>
        </DialogHeader>

        {editando ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
            className="space-y-4"
            noValidate
            data-form-questionario
          >
            <Campo rotulo="Título *">
              <input className={INPUT} maxLength={TITULO_QUESTIONARIO_MAX} placeholder="ex.: Hábitos de sono" value={form.titulo} onChange={(e) => mudar({ titulo: e.target.value })} data-campo-titulo-questionario />
            </Campo>
            <Campo rotulo="Descrição (opcional)" dica="aparece pra você na hora de aplicar (ex.: como responder a escala)">
              <textarea className={TEXTAREA} maxLength={DESCRICAO_QUESTIONARIO_MAX} rows={2} value={form.descricao} onChange={(e) => mudar({ descricao: e.target.value })} data-campo-descricao-questionario />
            </Campo>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1.5">
                Perguntas * <span className="normal-case text-texto-3">· pontuação máxima com as perguntas atuais: <span className="text-texto" data-pontuacao-maxima-form={formatarPontos(maxForm)}>{formatarPontos(maxForm)}</span></span>
              </p>
              <PerguntasEditor perguntas={form.perguntas} onChange={(perguntas) => mudar({ perguntas })} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1.5">Faixas de pontuação *</p>
              <div className="space-y-2">
                {form.faixas.map((f, k) => (
                  <div key={k} className="grid grid-cols-2 sm:grid-cols-[5rem_5rem_1fr_9rem] gap-2 items-end border border-linha p-2" data-faixa={k}>
                    <div className="space-y-1">
                      <span className={ROTULO}>Mínimo</span>
                      <input className={INPUT} inputMode="decimal" value={f.min} onChange={(e) => mudarFaixa(k, { min: e.target.value })} aria-label={`Mínimo da faixa ${k + 1}`} data-campo-faixa-min={k} />
                    </div>
                    <div className="space-y-1">
                      <span className={ROTULO}>Máximo</span>
                      <input className={INPUT} inputMode="decimal" value={f.max} onChange={(e) => mudarFaixa(k, { max: e.target.value })} aria-label={`Máximo da faixa ${k + 1}`} data-campo-faixa-max={k} />
                    </div>
                    <div className="space-y-1 col-span-2 sm:col-span-1">
                      <span className={ROTULO}>Rótulo</span>
                      <input className={INPUT} maxLength={ROTULO_FAIXA_MAX} placeholder="ex.: Baixa suspeita" value={f.rotulo} onChange={(e) => mudarFaixa(k, { rotulo: e.target.value })} aria-label={`Rótulo da faixa ${k + 1}`} data-campo-faixa-rotulo={k} />
                    </div>
                    <div className="space-y-1 col-span-2 sm:col-span-1">
                      <span className={ROTULO}>Nível</span>
                      <select className={SELECT} value={f.nivel} onChange={(e) => mudarFaixa(k, { nivel: e.target.value as Nivel })} aria-label={`Nível da faixa ${k + 1}`} data-campo-faixa-nivel={k}>
                        {NIVEIS.map((n) => (
                          <option key={n} value={n}>{textoNivel(n)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
              <input type="checkbox" className="accent-[#10B981]" checked={form.favorito} onChange={(e) => mudar({ favorito: e.target.checked })} data-campo-favorito-questionario /> Favorito
            </label>
            {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-questionario>{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => { setEditando(null); setErro(null); }} data-btn-cancelar-questionario>Cancelar</button>
              <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-questionario>{salvando ? "Salvando..." : "Salvar questionário"}</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-texto-2 font-body" data-questionarios-total={ordenados.length}>{textoContagemQuestionarios(ordenados.length)}</p>
              <button type="button" className={BTN_PRI} onClick={abrirNovo} data-btn-novo-questionario><Plus size={12} aria-hidden="true" /> Novo questionário</button>
            </div>
            {ordenados.length === 0 && <p className="text-sm text-texto-2 font-body" data-questionarios-vazio>Nenhum questionário disponível.</p>}
            <ul className="divide-y divide-linha" data-lista-questionarios>
              {ordenados.map((q) => {
                const sistema = ehDoSistema(q);
                const perguntas = lerPerguntas(q.perguntas);
                return (
                  <li
                    key={q.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                    data-questionario={q.id}
                    data-favorito={q.favorito && !sistema ? "1" : "0"}
                    data-questionario-origem={sistema ? "sistema" : "proprio"}
                    data-questionario-perguntas={perguntas.length}
                    data-questionario-titulo={q.titulo}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      {sistema ? (
                        <ListChecks size={16} className="text-texto-3 shrink-0" aria-hidden="true" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => void alternarFavorito(q)}
                          disabled={ocupado === q.id}
                          className="text-verde-3 disabled:opacity-40"
                          title={q.favorito ? "Tirar dos favoritos" : "Marcar como favorito"}
                          data-btn-favorito-questionario
                        >
                          <Star size={16} className={q.favorito ? "fill-verde-3" : ""} aria-hidden="true" />
                        </button>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body truncate" data-questionario-nome>{q.titulo}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body truncate">
                          {sistema ? "Do sistema" : "Meu questionário"} · {textoContagemPerguntas(perguntas.length)} · máx. {formatarPontos(pontuacaoMaxima(perguntas))} pontos
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className={BTN_MINI} onClick={() => void duplicar(q)} disabled={ocupado === q.id} data-btn-duplicar-questionario><Copy size={12} aria-hidden="true" /> Duplicar</button>
                      {!sistema && <button type="button" className={BTN_MINI} onClick={() => abrirEdicao(q)} data-btn-editar-questionario><Pencil size={12} aria-hidden="true" /> Editar</button>}
                      {!sistema && <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(q)} data-btn-excluir-questionario><Trash2 size={12} aria-hidden="true" /> Excluir</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-questionarios>Fechar</button>
            </div>
          </div>
        )}

        <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
          <AlertDialogContent className="bg-tela border-linha-2">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este questionário?</AlertDialogTitle>
              <AlertDialogDescription className="font-body">
                {paraExcluir?.titulo}. As aplicações já feitas continuam iguais (guardam a própria cópia das perguntas) — só o questionário sai da lista.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-questionario>
                {excluindo ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
