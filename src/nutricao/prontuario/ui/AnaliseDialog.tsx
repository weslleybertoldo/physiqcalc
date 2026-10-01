// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/farmaco/AnaliseDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Eye, FileDown, PenLine } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import BadgeGravidade from "@/nutricao/prontuario/ui/BadgeGravidade";
import Blocos from "@/nutricao/editor/ui/Blocos";
import { atualizarAnalise, criarAnalise, type AnaliseFarmaco, type Interacao, type Medicamento } from "@/nutricao/prontuario/lib/farmaco";
import {
  PARECER_MAX, TITULO_MAX, agruparCongeladas, congelarInteracoes, congelarMedicamentos, formatarDataHoraAnalise, gravidadeMaxima, lerInteracoesJson,
  lerMedicamentosJson, montarParecer, textoMedicamento, tituloPadraoAnalise, validarAnalise, type FormAnalise, type GrupoCruzamento, type InteracaoCongelada,
  type MedicamentoCongelado,
} from "@/nutricao/prontuario/lib/farmacoUtil";

// Modal da análise fármaco-nutriente. NOVA: congela na ABERTURA (ref `jaAberto`) os medicamentos ATIVOS + o cruzamento com a base
// (prévia 'N medicamentos · N interações' + lista agrupada) e pré-preenche o parecer pelo `montarParecer` (abas Escrever/Visualizar
// com os Blocos da W10). EDITAR: só título e parecer, com aviso de que medicamentos e interações ficaram congelados na data da
// análise. VER: só leitura + PDF. O que está congelado nunca muda por aqui.
export type ModoAnalise = "nova" | "editar" | "ver";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  pacienteId: string;
  modo: ModoAnalise;
  /** análise existente (editar/ver) */
  analise: AnaliseFarmaco | null;
  /** cruzamento ATUAL dos ativos (vem MEMOIZADO do pai) — usado só na NOVA */
  cruzamento: GrupoCruzamento<Medicamento, Interacao>[];
  onSalvo: (a: AnaliseFarmaco, criada: boolean) => void;
  onPdf: (a: AnaliseFarmaco) => void;
}

const ABA = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto";
const ABA_ATIVA = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-verde/40 bg-[rgba(16,185,129,.1)] px-2.5 text-[11.5px] font-semibold text-verde-3";
const ROTULO = "text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1 block";
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

type Congelado = { medicamentos: MedicamentoCongelado[]; interacoes: InteracaoCongelada[] };

/** Documento congelado agrupado por medicamento (prévia da nova, corpo do editar/ver). */
function GruposCongelados({ c }: { c: Congelado }) {
  const grupos = useMemo(() => agruparCongeladas(c.medicamentos, c.interacoes), [c]);
  const g = gravidadeMaxima(c.interacoes);
  return (
    <div className="space-y-2" data-previa-analise={`${c.medicamentos.length}|${c.interacoes.length}`} data-previa-gravidade={g ?? ""}>
      <p className="text-xs text-texto font-body" data-previa-analise-texto>
        {plural(c.medicamentos.length, "medicamento", "medicamentos")} · {c.interacoes.length ? plural(c.interacoes.length, "interação", "interações") : "nenhuma interação"}
        {g ? ` · gravidade máx. ${g}` : ""}
      </p>
      {grupos.length === 0 ? (
        <p className="text-xs text-texto-2 font-body italic" data-previa-analise-vazia>Nenhum medicamento em uso.</p>
      ) : (
        <ul className="divide-y divide-linha border border-linha max-h-56 overflow-y-auto" data-lista-congelada>
          {grupos.map((gr) => (
            <li key={gr.medicamento.medicamento} className="px-2 py-1.5 space-y-1" data-grupo-congelado={gr.medicamento.medicamento} data-grupo-congelado-interacoes={gr.interacoes.length}>
              <p className="text-sm text-texto font-body font-semibold" data-grupo-congelado-texto>{textoMedicamento(gr.medicamento)}</p>
              {gr.interacoes.length === 0 ? (
                <p className="text-[11px] text-texto-2 font-body italic pl-2">sem interação conhecida na base</p>
              ) : (
                <ul className="space-y-0.5 pl-2">
                  {gr.interacoes.map((i, k) => (
                    <li key={`${i.id}-${k}`} className="text-[11px] font-body text-texto-2 flex flex-wrap items-center gap-1.5" data-interacao-congelada={i.id}>
                      <span className="text-texto">{i.nutriente}</span> <BadgeGravidade gravidade={i.gravidade} /> <span>{i.efeito}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AnaliseDialog({ open, onOpenChange, nutricionistaId, pacienteId, modo, analise, cruzamento, onSalvo, onPdf }: Props) {
  const [form, setForm] = useState<FormAnalise>({ titulo: "", parecer: "" });
  const [congelada, setCongelada] = useState<Congelado>({ medicamentos: [], interacoes: [] });
  const [aba, setAba] = useState<"escrever" | "visualizar">("escrever");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const jaAberto = useRef(false);

  // só na ABERTURA: congela o cruzamento (nova) ou lê o documento (editar/ver); um refetch com o modal aberto não mexe no texto
  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setErro(null);
    setAba(modo === "ver" ? "visualizar" : "escrever");
    if (modo === "nova" || !analise) {
      const c = { medicamentos: congelarMedicamentos(cruzamento), interacoes: congelarInteracoes(cruzamento) };
      setCongelada(c);
      setForm({ titulo: tituloPadraoAnalise(new Date()), parecer: montarParecer(cruzamento) });
      return;
    }
    setCongelada({ medicamentos: lerMedicamentosJson(analise.medicamentos), interacoes: lerInteracoesJson(analise.interacoes) });
    setForm({ titulo: analise.titulo, parecer: analise.parecer });
  }, [open, modo, analise, cruzamento]);

  useEffect(() => {
    if (erro && validarAnalise(form) === null) setErro(null);
  }, [erro, form]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarAnalise(form);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (modo === "editar" && analise) {
        const a = await atualizarAnalise(analise.id, form);
        onSalvo(a, false);
        toast.success("Análise atualizada");
      } else {
        const a = await criarAnalise(nutricionistaId, pacienteId, { form, medicamentos: congelada.medicamentos, interacoes: congelada.interacoes });
        onSalvo(a, true);
        toast.success("Análise criada");
      }
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a análise");
    } finally {
      setSalvando(false);
    }
  };

  const ver = modo === "ver";
  const titulo = modo === "nova" ? "Nova análise de fármaco" : modo === "editar" ? "Editar análise" : form.titulo || "Análise";
  const dataAnalise = analise ? formatarDataHoraAnalise(analise.data) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-2xl max-h-[92vh] overflow-y-auto" data-modal-analise={modo} data-salvando={salvando ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{titulo}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {modo === "nova"
              ? "Os medicamentos em uso e as interações encontradas ficam CONGELADOS nesta análise — mudanças depois não a alteram. O parecer já vem com as condutas; edite à vontade."
              : modo === "editar"
                ? `Só o título e o parecer mudam. Medicamentos e interações ficaram congelados em ${dataAnalise}.`
                : `Análise de ${dataAnalise}.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4" noValidate data-form-analise>
          {modo === "editar" && (
            <p className="text-xs text-texto-2 font-body border border-linha-2 p-2" data-aviso-congelado>
              Medicamentos e interações congelados em {dataAnalise}.
            </p>
          )}

          {ver ? (
            <div>
              <p className={ROTULO}>Título</p>
              <p className="text-sm text-texto font-body" data-analise-titulo-texto>{form.titulo}</p>
            </div>
          ) : (
            <Campo rotulo="Título">
              <input className={INPUT} value={form.titulo} maxLength={TITULO_MAX} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} data-campo-titulo-analise />
            </Campo>
          )}

          <div>
            <p className={ROTULO}>{modo === "nova" ? "Medicamentos e interações (congelados agora)" : "Medicamentos e interações (congelados)"}</p>
            <GruposCongelados c={congelada} />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className={`${ROTULO} mb-0`}>Parecer</p>
              {!ver && (
                <div className="flex items-center gap-1" role="tablist" data-abas-parecer={aba}>
                  <button type="button" role="tab" aria-selected={aba === "escrever"} onClick={() => setAba("escrever")} className={aba === "escrever" ? ABA_ATIVA : ABA} data-btn-aba-escrever>
                    <PenLine size={12} aria-hidden="true" /> Escrever
                  </button>
                  <button type="button" role="tab" aria-selected={aba === "visualizar"} onClick={() => setAba("visualizar")} className={aba === "visualizar" ? ABA_ATIVA : ABA} data-btn-aba-visualizar>
                    <Eye size={12} aria-hidden="true" /> Visualizar
                  </button>
                </div>
              )}
            </div>
            {!ver && (
              <textarea
                className={`${TEXTAREA} min-h-[220px]${aba === "visualizar" ? " hidden" : ""}`}
                value={form.parecer}
                maxLength={PARECER_MAX}
                onChange={(e) => setForm((f) => ({ ...f, parecer: e.target.value }))}
                placeholder="## Medicamento&#10;- **Nutriente** (gravidade): conduta"
                data-campo-parecer
              />
            )}
            {(ver || aba === "visualizar") && (
              <div className="rounded-xl border border-linha-2 p-3 min-h-[120px] max-h-[50vh] overflow-y-auto" data-preview-parecer>
                {form.parecer.trim() ? <Blocos conteudo={form.parecer} compacto /> : <p className="text-xs text-texto-2 font-body italic">Sem parecer.</p>}
              </div>
            )}
            {!ver && <p className="text-[11px] text-texto-3 font-body mt-1">{form.parecer.length}/{PARECER_MAX} · markdown simples: ## subtítulo, - item, **negrito**</p>}
          </div>

          {erro && <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-analise>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            {ver && analise && (
              <button type="button" className={BTN_SEC} onClick={() => onPdf(analise)} data-btn-pdf-analise-modal>
                <FileDown size={12} aria-hidden="true" /> PDF
              </button>
            )}
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} disabled={salvando} data-btn-cancelar-analise>{ver ? "Fechar" : "Cancelar"}</button>
            {!ver && (
              <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-analise>
                {salvando ? "Salvando..." : modo === "editar" ? "Salvar" : "Criar análise"}
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
