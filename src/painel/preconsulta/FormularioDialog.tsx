// Physiq W21 — porta de src/components/preconsulta/FormularioDialog.tsx do PhysiqNutri (main 294887a), no visual premium. NOVO: passo
// da ORIGEM (Pré-anamnese → modelo de anamnese; Questionário de saúde → questionário; Em branco) que PREENCHE título/perguntas/faixas,
// e depois o formulário: título, descrição, o editor de perguntas da W18 (REUSADO), as 3 faixas só na origem questionário, ativo.
// A origem clínica (anamnese/questionário) só aparece para a nutricionista da conta (preconsultaUtil.origensPara); o personal e o
// dono sem papel de nutricionista vão direto ao formulário em branco. EDIÇÃO: direto aos dados (a origem não muda).
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList, FileText, ListChecks, PenLine, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import PerguntasEditor from "@/nutricao/prontuario/ui/PerguntasEditor";
import {
  DESCRICAO_QUESTIONARIO_MAX, NIVEIS, ROTULO_FAIXA_MAX, TITULO_QUESTIONARIO_MAX, ehDoSistema, formatarPontos, ordenarQuestionarios, pontuacaoMaximaForm, textoNivel, type Nivel,
} from "@/nutricao/prontuario/lib/questionariosUtil";
import { atualizarFormulario, criarFormulario, type FormularioPreconsulta, type ModeloAnamnese, type Questionario } from "./dados";
import {
  ORIGENS, formParaRegistroFormulario, formularioDeAnamnese, formularioDeQuestionario, formularioEmBranco, formularioParaForm, origensPara, textoOrigem, validarFormulario,
  type FormFormulario, type Origem,
} from "./preconsultaUtil";

const ROTULO = "block font-body text-[11px] font-semibold text-texto-3";
const ICONE: Record<Origem, typeof FileText> = { anamnese: FileText, questionario: ListChecks, personalizado: PenLine };

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** formulário existente = modo edição */
  formulario?: FormularioPreconsulta | null;
  uid: string;
  contaId: string;
  souNutri: boolean;
  modelos: ModeloAnamnese[];
  questionarios: Questionario[];
  onSalvo: (f: FormularioPreconsulta) => void;
}

export default function FormularioDialog({ open, onOpenChange, formulario, uid, contaId, souNutri, modelos, questionarios, onSalvo }: Props) {
  const edicao = !!formulario;
  const origens = useMemo(() => ORIGENS.filter((o) => origensPara(souNutri).includes(o.valor)), [souNutri]);
  const comOrigem = origens.length > 1;
  const [etapa, setEtapa] = useState<"origem" | "dados">("origem");
  const [origemEscolhida, setOrigemEscolhida] = useState<Origem | null>(null);
  const [fonteId, setFonteId] = useState("");
  const [form, setForm] = useState<FormFormulario>(formularioEmBranco());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const abriuRef = useRef(false);

  // reinicia SÓ ao abrir: edição (e quem só monta em branco) vai direto aos dados; o novo da nutricionista começa na origem
  useEffect(() => {
    if (open && !abriuRef.current) {
      setErro(null);
      setFonteId("");
      setOrigemEscolhida(null);
      if (formulario) {
        setForm(formularioParaForm(formulario));
        setEtapa("dados");
      } else {
        setForm(formularioEmBranco());
        setEtapa(comOrigem ? "origem" : "dados");
      }
    }
    abriuRef.current = open;
  }, [open, formulario, comOrigem]);

  useEffect(() => {
    if (erro && etapa === "dados" && validarFormulario(form) === null) setErro(null); // o aviso some assim que resolve
  }, [erro, etapa, form]);

  const ordenados = useMemo(() => ordenarQuestionarios(questionarios), [questionarios]);
  const favoritos = useMemo(() => ordenados.filter((q) => !ehDoSistema(q) && q.favorito), [ordenados]);
  const proprios = useMemo(() => ordenados.filter((q) => !ehDoSistema(q) && !q.favorito), [ordenados]);
  const doSistema = useMemo(() => ordenados.filter(ehDoSistema), [ordenados]);
  const maxForm = useMemo(() => pontuacaoMaximaForm(form.perguntas), [form.perguntas]);
  const tituloFonte = useMemo(() => {
    if (form.origem === "anamnese") return modelos.find((m) => m.id === form.origemId)?.titulo ?? "";
    if (form.origem === "questionario") return questionarios.find((q) => q.id === form.origemId)?.titulo ?? "";
    return "";
  }, [form.origem, form.origemId, modelos, questionarios]);

  const mudar = (patch: Partial<FormFormulario>) => setForm((f) => ({ ...f, ...patch }));
  const mudarFaixa = (k: number, patch: Partial<FormFormulario["faixas"][number]>) => setForm((f) => ({ ...f, faixas: f.faixas.map((x, i) => (i === k ? { ...x, ...patch } : x)) }));

  const escolherOrigem = (o: Origem) => {
    setOrigemEscolhida(o);
    setFonteId("");
    setErro(null);
    if (o === "personalizado") {
      setForm(formularioEmBranco());
      setEtapa("dados");
    }
  };
  const escolherModelo = (id: string) => {
    setFonteId(id);
    const m = modelos.find((x) => x.id === id);
    if (!m) return;
    setForm(formularioDeAnamnese(m));
    setEtapa("dados");
  };
  const escolherQuestionario = (id: string) => {
    setFonteId(id);
    const q = questionarios.find((x) => x.id === id);
    if (!q) return;
    setForm(formularioDeQuestionario(q));
    setEtapa("dados");
  };

  const salvar = async () => {
    const msg = validarFormulario(form);
    if (msg) return setErro(msg);
    setErro(null);
    setSalvando(true);
    const reg = formParaRegistroFormulario(form);
    try {
      if (formulario) {
        const f = await atualizarFormulario(formulario.id, reg);
        onSalvo(f);
        toast.success("Formulário atualizado");
      } else {
        if (!uid || !contaId) throw new Error("Sessão expirada — entre de novo");
        const f = await criarFormulario(uid, contaId, reg);
        onSalvo(f);
        toast.success(`Formulário criado: /f/${f.slug}`);
      }
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível salvar o formulário";
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

  const IconeOrigem = ICONE[form.origem];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-linha-2 bg-tela text-texto sm:max-w-3xl sm:rounded-[24px]" data-modal-formulario={edicao ? "editar" : "novo"}
        data-etapa-formulario={etapa}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">
            <ClipboardList aria-hidden className="h-[18px] w-[18px] text-texto-2" strokeWidth={1.75} /> {edicao ? "Editar formulário" : "Novo formulário"}
          </DialogTitle>
          <DialogDescription className="font-body text-[13px] leading-relaxed text-texto-2">
            {etapa === "origem"
              ? "Escolha de onde o formulário parte. As perguntas vêm preenchidas e você ajusta o que quiser antes de salvar."
              : "Título, descrição e perguntas. Quem recebe o link responde sem login; as respostas chegam em Pré-consulta › Respostas."}
          </DialogDescription>
        </DialogHeader>

        {etapa === "origem" ? (
          <div className="space-y-4" data-passo-origem>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {origens.map((o) => {
                const Icone = ICONE[o.valor];
                const ativo = origemEscolhida === o.valor;
                return (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => escolherOrigem(o.valor)}
                    aria-pressed={ativo}
                    className={cn("flex flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-colors",
                      ativo ? "border-linha-3 bg-superficie-2" : "border-linha-2 bg-[rgba(255,255,255,.02)] hover:border-linha-3")}
                    data-origem={o.valor}
                  >
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold text-texto">
                      <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-superficie text-texto-2"><Icone aria-hidden className="h-[15px] w-[15px]" strokeWidth={1.75} /></span>
                      {o.rotulo}
                    </span>
                    <span className="text-[12px] leading-snug text-texto-3">{o.descricao}</span>
                  </button>
                );
              })}
            </div>
            {origemEscolhida === "anamnese" && (
              <Campo rotulo="Modelo de anamnese" dica={modelos.length ? "cada pergunta do modelo vira uma pergunta de texto livre" : "você ainda não tem modelos — crie um na anamnese de um aluno (Prontuário)"}>
                <select className={SELECT} value={fonteId} onChange={(e) => escolherModelo(e.target.value)} data-campo-origem-anamnese>
                  <option value="">Escolha o modelo…</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>{m.titulo}</option>
                  ))}
                </select>
              </Campo>
            )}
            {origemEscolhida === "questionario" && (
              <Campo rotulo="Questionário de saúde" dica="as perguntas e as 3 faixas vêm copiadas; quem responde vê a pontuação e a faixa na hora">
                <select className={SELECT} value={fonteId} onChange={(e) => escolherQuestionario(e.target.value)} data-campo-origem-questionario>
                  <option value="">Escolha o questionário…</option>
                  {grupo("Favoritos", favoritos)}
                  {grupo("Meus questionários", proprios)}
                  {grupo("Do sistema", doSistema)}
                </select>
              </Campo>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-formulario>Cancelar</button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
            className="space-y-4"
            noValidate
            data-form-formulario
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha-3 pb-2.5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-texto-2" data-form-origem={form.origem}>
                <IconeOrigem aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} /> {textoOrigem(form.origem)}
                {tituloFonte && <span className="font-normal text-texto-3">· {tituloFonte}</span>}
              </p>
              {!edicao && comOrigem && (
                <button type="button" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-violeta-3 hover:text-violeta-2" onClick={() => { setEtapa("origem"); setErro(null); }}
                  data-btn-voltar-origem>
                  <ArrowLeft aria-hidden size={13} /> Trocar origem
                </button>
              )}
            </div>
            <Campo rotulo="Título">
              <input className={INPUT} maxLength={TITULO_QUESTIONARIO_MAX} placeholder="ex.: Pré-consulta da primeira avaliação" value={form.titulo}
                onChange={(e) => mudar({ titulo: e.target.value })} data-campo-titulo-formulario />
            </Campo>
            <Campo rotulo="Descrição (opcional)" dica="aparece para quem responde, embaixo do título (ex.: como responder a escala)">
              <textarea className={TEXTAREA} maxLength={DESCRICAO_QUESTIONARIO_MAX} rows={2} value={form.descricao} onChange={(e) => mudar({ descricao: e.target.value })}
                data-campo-descricao-formulario />
            </Campo>
            <div>
              <p className="mb-1.5 font-body text-[12px] font-semibold text-texto-2">
                Perguntas
                {form.origem === "questionario" && (
                  <span className="font-normal text-texto-3"> · pontuação máxima com as perguntas atuais: <span className="text-texto" data-pontuacao-maxima-form={formatarPontos(maxForm)}>{formatarPontos(maxForm)}</span></span>
                )}
              </p>
              <PerguntasEditor perguntas={form.perguntas} onChange={(perguntas) => mudar({ perguntas })} />
            </div>
            {form.origem === "questionario" && (
              <div>
                <p className="mb-1.5 font-body text-[12px] font-semibold text-texto-2">Faixas de pontuação <span className="font-normal text-texto-3">· quem responde vê a faixa em que caiu</span></p>
                <div className="space-y-2">
                  {form.faixas.map((f, k) => (
                    <div key={k} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-linha p-2.5 sm:grid-cols-[5rem_5rem_1fr_9rem]" data-faixa={k}>
                      <div className="space-y-1">
                        <span className={ROTULO}>Mínimo</span>
                        <input className={INPUT} inputMode="decimal" value={f.min} onChange={(e) => mudarFaixa(k, { min: e.target.value })} aria-label={`Mínimo da faixa ${k + 1}`} data-campo-faixa-min={k} />
                      </div>
                      <div className="space-y-1">
                        <span className={ROTULO}>Máximo</span>
                        <input className={INPUT} inputMode="decimal" value={f.max} onChange={(e) => mudarFaixa(k, { max: e.target.value })} aria-label={`Máximo da faixa ${k + 1}`} data-campo-faixa-max={k} />
                      </div>
                      <div className="col-span-2 space-y-1 sm:col-span-1">
                        <span className={ROTULO}>Rótulo</span>
                        <input className={INPUT} maxLength={ROTULO_FAIXA_MAX} placeholder="ex.: Baixa suspeita" value={f.rotulo} onChange={(e) => mudarFaixa(k, { rotulo: e.target.value })}
                          aria-label={`Rótulo da faixa ${k + 1}`} data-campo-faixa-rotulo={k} />
                      </div>
                      <div className="col-span-2 space-y-1 sm:col-span-1">
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
            )}
            <label className="inline-flex items-center gap-2 font-body text-[13px] text-texto">
              <input type="checkbox" className="accent-[#FAFAFA]" checked={form.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} data-campo-ativo-formulario /> Ativo — o link recebe respostas
            </label>
            {erro && <p role="alert" className="font-body text-[12.5px] text-rosa-3" data-erro-formulario>{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-formulario>Cancelar</button>
              <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-formulario>
                <Save aria-hidden /> {salvando ? "Salvando…" : edicao ? "Salvar" : "Salvar formulário"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
