import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FolderPlus, Star } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fmtQtd } from "@/nutricao/editor/lib/alimentosUtil";
import { fmtKcal } from "@/nutricao/editor/lib/energeticoUtil";
import { atualizarReceita, criarGrupo, criarReceita, type GrupoReceita, type Receita } from "@/nutricao/editor/lib/receitas";
import {
  MODO_PREPARO_MAX, NOME_GRUPO_MAX, NOME_RECEITA_MAX, OBSERVACAO_RECEITA_MAX, formIngredienteNovo, formReceitaNova, ingredientesParaBanco, ingredientesParaForm,
  previaReceita, receitaParaBanco, receitaParaForm, textoPorPorcao, textoReceitaInteira, validarGrupo, validarReceita, type FormIngrediente, type FormReceita,
} from "@/nutricao/editor/lib/receitasUtil";
import Blocos from "@/nutricao/editor/ui/Blocos";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, SELECT, TEXTAREA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import IngredientesEditor from "./IngredientesEditor";

// Physiq W24 — porta do PhysiqNutri (src/components/receitas/ReceitaDialog.tsx) no visual premium: a receita (nova/editar) — nome,
// grupo (+ "Novo grupo" na hora), porções, rendimento (opcional; vazio = soma dos ingredientes), tempo, favorita; os ingredientes com
// a PRÉVIA AO VIVO (receita inteira × por porção); modo de preparo em markdown simples (Escrever/Visualizar com os Blocos da W16);
// observação. Montado só na ABERTURA; salvar = receita + ingredientes (editar regrava os ingredientes).

const msgErro = (e: unknown, padrao: string): string => {
  const m = e instanceof Error ? e.message : "";
  return /row-level security|violates/i.test(m) ? "Só a nutricionista da conta cadastra e muda receitas." : m || padrao;
};

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  /** com receita = edição; sem = nova */
  receita: Receita | null;
  grupos: GrupoReceita[];
  onSalvo: (r: Receita, modo: "criada" | "editada") => void;
  onGrupoCriado: (g: GrupoReceita) => void;
}

export default function ReceitaDialog({ open, onOpenChange, nutricionistaId, receita, grupos, onSalvo, onGrupoCriado }: Props) {
  const editar = !!receita;
  const [form, setForm] = useState<FormReceita>(() => formReceitaNova());
  const [linhas, setLinhas] = useState<FormIngrediente[]>(() => [formIngredienteNovo()]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<"escrever" | "visualizar">("escrever");
  const [novoGrupo, setNovoGrupo] = useState<{ aberto: boolean; nome: string; erro: string | null; salvando: boolean }>({ aberto: false, nome: "", erro: null, salvando: false });
  const jaAberto = useRef(false);

  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setErro(null);
    setAba("escrever");
    setNovoGrupo({ aberto: false, nome: "", erro: null, salvando: false });
    setForm(receita ? receitaParaForm(receita) : formReceitaNova());
    setLinhas(receita && receita.ingredientes.length ? ingredientesParaForm(receita.ingredientes) : [formIngredienteNovo()]);
  }, [open, receita]);

  // o aviso some assim que ela resolve
  useEffect(() => {
    if (erro && validarReceita(form, linhas) === null) setErro(null);
  }, [erro, form, linhas]);

  const campo = <K extends keyof FormReceita>(k: K, v: FormReceita[K]) => setForm((f) => ({ ...f, [k]: v }));
  const previa = useMemo(() => previaReceita(form, linhas), [form, linhas]);

  const criarGrupoInline = async () => {
    const problema = validarGrupo(novoGrupo.nome, grupos.map((g) => g.nome));
    if (problema) {
      setNovoGrupo((n) => ({ ...n, erro: problema }));
      return;
    }
    setNovoGrupo((n) => ({ ...n, salvando: true, erro: null }));
    try {
      const g = await criarGrupo(nutricionistaId, novoGrupo.nome);
      onGrupoCriado(g);
      campo("grupo_id", g.id);
      setNovoGrupo({ aberto: false, nome: "", erro: null, salvando: false });
      toast.success("Grupo criado");
    } catch (e) {
      setNovoGrupo((n) => ({ ...n, salvando: false, erro: msgErro(e, "Não foi possível criar o grupo") }));
    }
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarReceita(form, linhas);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const reg = receitaParaBanco(form);
      const ings = ingredientesParaBanco(linhas);
      const r = receita ? await atualizarReceita(receita.id, reg, ings) : await criarReceita(nutricionistaId, reg, ings);
      toast.success(receita ? "Receita atualizada" : "Receita criada");
      onSalvo(r, receita ? "editada" : "criada");
      onOpenChange(false);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível salvar a receita"));
    } finally {
      setSalvando(false);
    }
  };

  const abaClasse = (ativa: boolean) =>
    cn("h-7 rounded-[9px] px-3 text-[12px] font-semibold transition-colors", ativa ? "text-[var(--p-botao-w-texto)]" : "text-texto-2 hover:text-texto");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${JANELA} max-h-[92vh] overflow-y-auto sm:max-w-3xl`} data-modal-receita={editar ? "editar" : "nova"} data-receita-editando={receita?.id ?? ""}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editar ? "Editar receita" : "Nova receita"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            A receita é calculada pelos ingredientes: os totais e o valor por porção aparecem enquanto você monta. O rendimento (peso pronto) é opcional.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void salvar(e)} className="flex flex-col gap-5" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <Campo rotulo="Nome da receita">
              <input className={INPUT} value={form.nome} maxLength={NOME_RECEITA_MAX} placeholder="ex.: Bolinho de atum assado" onChange={(e) => campo("nome", e.target.value)} autoFocus data-campo-nome-receita />
            </Campo>
            <div className="flex flex-col gap-1">
              <Campo rotulo="Grupo">
                <select className={SELECT} value={form.grupo_id} onChange={(e) => campo("grupo_id", e.target.value)} data-campo-grupo-receita>
                  <option value="">Sem grupo</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>
              </Campo>
              {!novoGrupo.aberto ? (
                <button type="button" className="inline-flex items-center gap-1 self-start text-[12px] font-semibold text-verde-3 hover:text-verde-2" onClick={() => setNovoGrupo((n) => ({ ...n, aberto: true }))} data-btn-novo-grupo-inline>
                  <FolderPlus aria-hidden className="h-3.5 w-3.5" /> Novo grupo
                </button>
              ) : (
                <div className="flex flex-col gap-1" data-novo-grupo-inline>
                  <div className="flex items-end gap-2">
                    <input
                      className={INPUT}
                      value={novoGrupo.nome}
                      maxLength={NOME_GRUPO_MAX}
                      placeholder="Nome do grupo (ex.: Lanches)"
                      onChange={(e) => setNovoGrupo((n) => ({ ...n, nome: e.target.value, erro: null }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void criarGrupoInline();
                        }
                      }}
                      data-campo-novo-grupo-inline
                    />
                    <button type="button" className={`${BTN_SEC} shrink-0`} onClick={() => void criarGrupoInline()} disabled={novoGrupo.salvando} data-btn-salvar-grupo-inline>
                      {novoGrupo.salvando ? "…" : "Salvar"}
                    </button>
                    <button type="button" className={`${BTN_SEC} shrink-0`} onClick={() => setNovoGrupo({ aberto: false, nome: "", erro: null, salvando: false })} data-btn-cancelar-grupo-inline>
                      Cancelar
                    </button>
                  </div>
                  {novoGrupo.erro && <p role="alert" className="text-[11.5px] text-rosa-3" data-erro-grupo-inline>{novoGrupo.erro}</p>}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
            <Campo rotulo="Porções">
              <input inputMode="decimal" className={INPUT} value={form.porcoes} placeholder="ex.: 4" onChange={(e) => campo("porcoes", e.target.value)} data-campo-porcoes />
            </Campo>
            <Campo rotulo="Rendimento (g)" dica="vazio = soma dos ingredientes">
              <input inputMode="decimal" className={INPUT} value={form.rendimento_g} placeholder="peso pronto" onChange={(e) => campo("rendimento_g", e.target.value)} data-campo-rendimento />
            </Campo>
            <Campo rotulo="Tempo (min)">
              <input inputMode="numeric" className={INPUT} value={form.tempo_preparo_min} placeholder="ex.: 30" onChange={(e) => campo("tempo_preparo_min", e.target.value)} data-campo-tempo />
            </Campo>
            <label className="inline-flex cursor-pointer items-center gap-2 pb-2.5 text-[13px] text-texto-2">
              <input type="checkbox" className="accent-[var(--p-verde)]" checked={form.favorita} onChange={(e) => campo("favorita", e.target.checked)} data-campo-favorita />
              <Star aria-hidden className={cn("h-4 w-4", form.favorita ? "fill-[var(--p-ambar)] text-ambar" : "text-texto-3")} /> Favorita
            </label>
          </div>

          <IngredientesEditor linhas={linhas} onChange={setLinhas} />

          <div
            className="flex flex-col gap-1 rounded-[16px] border border-[rgba(16,185,129,.3)] bg-[rgba(16,185,129,.05)] p-3.5"
            data-previa-receita
            data-previa-kcal-total={previa.totais.energia_kcal}
            data-previa-kcal-porcao={previa.porPorcao.energia_kcal}
            data-previa-peso={previa.peso}
            data-previa-gramas-porcao={previa.gramasPorcao}
            data-previa-ingredientes={previa.ingredientes}
            data-previa-porcoes={previa.porcoes}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-verde-3">Prévia · {previa.ingredientes === 1 ? "1 ingrediente" : `${previa.ingredientes} ingredientes`}</p>
            <p className="text-[13.5px] tabular-nums text-texto" data-previa-inteira-texto>{textoReceitaInteira(previa)}</p>
            <p className="text-[13.5px] tabular-nums text-texto" data-previa-porcao-texto>{textoPorPorcao(previa)}</p>
            <p className="text-[12px] tabular-nums text-texto-3">
              Fibras {fmtQtd(previa.porPorcao.fibra_g)} g · Sódio {fmtQtd(previa.porPorcao.sodio_mg)} mg por porção · {fmtKcal(previa.totais.energia_kcal)} kcal na receita inteira
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-texto-2">Modo de preparo</span>
              <div className="inline-flex rounded-xl border border-linha bg-superficie p-[3px]" role="tablist" data-abas-modo-preparo={aba}>
                <button type="button" role="tab" aria-selected={aba === "escrever"} onClick={() => setAba("escrever")} className={abaClasse(aba === "escrever")}
                  style={aba === "escrever" ? { background: "var(--p-botao-w-fundo)" } : undefined} data-btn-aba-escrever>
                  Escrever
                </button>
                <button type="button" role="tab" aria-selected={aba === "visualizar"} onClick={() => setAba("visualizar")} className={abaClasse(aba === "visualizar")}
                  style={aba === "visualizar" ? { background: "var(--p-botao-w-fundo)" } : undefined} data-btn-aba-visualizar>
                  Visualizar
                </button>
              </div>
            </div>
            <textarea
              className={cn(TEXTAREA, "min-h-[140px]", aba === "visualizar" && "hidden")}
              value={form.modo_preparo}
              maxLength={MODO_PREPARO_MAX}
              placeholder={"## Preparo\n- Misture o atum com os ovos\n- Asse por **25 min** a 180 °C"}
              onChange={(e) => campo("modo_preparo", e.target.value)}
              data-campo-modo-preparo
            />
            {aba === "visualizar" && (
              <div className="rounded-[14px] border border-linha bg-superficie p-3" data-previa-modo-preparo>
                {form.modo_preparo.trim() ? <Blocos conteudo={form.modo_preparo} compacto /> : <p className="text-[12px] italic text-texto-3">Sem modo de preparo.</p>}
              </div>
            )}
            <p className="text-[11px] text-texto-4">Markdown simples: `## título`, `- item`, `**negrito**`.</p>
          </div>

          <Campo rotulo="Observação">
            <textarea className={TEXTAREA} rows={2} value={form.observacao} maxLength={OBSERVACAO_RECEITA_MAX} placeholder="ex.: rende bem congelada · trocar o atum por frango" onChange={(e) => campo("observacao", e.target.value)} data-campo-observacao-receita />
          </Campo>

          {erro && <p role="alert" className="text-[12px] text-rosa-3" data-erro-receita>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-receita>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-receita>
              {salvando ? "Salvando…" : editar ? "Salvar" : "Criar receita"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
