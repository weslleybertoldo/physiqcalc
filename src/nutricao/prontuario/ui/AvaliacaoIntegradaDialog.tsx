// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/avaliacao-integrada/AvaliacaoDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT } from "@/nutricao/editor/ui/estilos";
import { DICA_MARKDOWN, TEXTAREA_CONTEUDO } from "@/nutricao/editor/ui/ModelosDialog";
import { atualizarAvaliacao, criarAvaliacao, type AvaliacaoIntegrada } from "@/nutricao/prontuario/lib/avaliacaoIntegrada";
import {
  FONTES, TEXTO_MAX, TITULO_MAX, alertas, contarItens, detalheFonte, formDaAvaliacao, formInicialAvaliacao, formatarDataHoraAvaliacao, montarSintese,
  temFontes, textoItensFonte, textoSugerido, validarAvaliacao, type Fontes, type FontesBrutas, type FormAvaliacao, type Sintese,
} from "@/nutricao/prontuario/lib/avaliacaoIntegradaUtil";

// Modal "nova avaliação" / "editar avaliação" (W24). NOVA: ao abrir, congela a síntese das fontes de AGORA (última anamnese,
// antropometria, exames e questionários) e mostra a prévia (4 blocos com a contagem de itens + nº de alertas); título padrão
// 'Avaliação integrada — dd/MM/yyyy' e parecer pré-preenchido com o texto sugerido (markdown simples da W10). Sem nenhuma fonte
// com dado, avisa e não deixa salvar. EDITAR: só título e parecer — a síntese fica como foi gerada (aviso), 'Regerar síntese' é
// uma ação da lista. O objeto `fontes` vem MEMOIZADO do pai; a prévia só é recalculada quando o modal ABRE (não a cada refetch).

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  pacienteId: string;
  /** com avaliação = edição (título + parecer); sem = nova (congela a síntese das fontes de agora) */
  avaliacao?: AvaliacaoIntegrada | null;
  /** as 4 listas das seções donas, memoizadas pelo pai */
  fontes: FontesBrutas;
  onSalvo: (a: AvaliacaoIntegrada, modo: "criada" | "editada") => void;
}

export default function AvaliacaoDialog({ open, onOpenChange, nutricionistaId, pacienteId, avaliacao, fontes, onSalvo }: Props) {
  const editando = !!avaliacao;
  const [congelada, setCongelada] = useState<{ sintese: Sintese; fontes: Fontes } | null>(null);
  const [form, setForm] = useState<FormAvaliacao>({ titulo: "", texto: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const jaAberto = useRef(false);

  // só na ABERTURA: congela a síntese e monta o formulário (um refetch das fontes com o modal aberto não mexe no que ela digita)
  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setErro(null);
    if (avaliacao) {
      setCongelada(null);
      setForm(formDaAvaliacao(avaliacao));
      return;
    }
    const m = montarSintese(fontes);
    setCongelada(m);
    setForm(formInicialAvaliacao(new Date(), textoSugerido(m.sintese)));
  }, [open, avaliacao, fontes]);

  const al = useMemo(() => (congelada ? alertas(congelada.sintese) : []), [congelada]);
  const tem = congelada ? temFontes(congelada.sintese) : false;

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarAvaliacao(form);
    if (problema) {
      setErro(problema);
      return;
    }
    if (!editando && (!congelada || !tem)) {
      setErro("Registre anamnese, antropometria, exames ou questionário antes de gerar a avaliação");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      if (avaliacao) {
        const a = await atualizarAvaliacao(avaliacao.id, form);
        toast.success("Avaliação atualizada");
        onSalvo(a, "editada");
      } else {
        if (!nutricionistaId) throw new Error("Sessão expirada — entre de novo");
        const a = await criarAvaliacao(nutricionistaId, pacienteId, { ...form, sintese: congelada!.sintese, fontes: congelada!.fontes });
        toast.success("Avaliação criada");
        onSalvo(a, "criada");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a avaliação");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-2xl max-h-[88vh] overflow-y-auto" data-modal-avaliacao={editando ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editando ? "Editar avaliação" : "Nova avaliação integrada"}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {editando
              ? "Título e parecer. A síntese fica como foi gerada — 'Regerar síntese' na lista atualiza com as fontes de agora. "
              : "A síntese abaixo é congelada junto com a avaliação; o parecer já vem preenchido e pode ser editado. "}
            {DICA_MARKDOWN}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void salvar(e)} className="space-y-4" noValidate data-form-avaliacao>
          {!editando && congelada && (
            <div className="space-y-2" data-previa>
              <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body">Síntese que será congelada</p>
              <div className="grid grid-cols-2 gap-2">
                {FONTES.map((f) => {
                  const det = detalheFonte(congelada.fontes, f.chave);
                  const n = contarItens(congelada.sintese, f.chave);
                  return (
                    <div
                      key={f.chave}
                      className={`rounded-xl border px-3 py-2 min-w-0 ${det.tem ? "border-linha-2" : "border-dashed border-linha-2"}`}
                      data-previa-bloco={f.chave}
                      data-previa-n={n}
                      data-previa-sem-dado={det.tem ? undefined : ""}
                    >
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-texto-2 truncate">{f.rotulo}</p>
                      <p className={`text-xs font-body ${det.tem ? "text-texto" : "text-texto-3"}`}>{det.texto}</p>
                      {det.tem && f.chave !== "questionarios" && <p className="text-[11px] text-texto-2 font-body">{textoItensFonte(f.chave, n)}</p>}
                    </div>
                  );
                })}
              </div>
              <p className={`text-xs font-body flex items-center gap-1.5 ${al.length ? "text-texto" : "text-texto-2"}`} data-previa-alertas={al.length}>
                <AlertTriangle size={12} aria-hidden="true" className={al.length ? "text-verde-3" : ""} />
                {al.length === 0 ? "Nenhum ponto de atenção automático" : al.length === 1 ? "1 ponto de atenção automático" : `${al.length} pontos de atenção automáticos`}
              </p>
              {!tem && (
                <p role="alert" className="text-xs text-rosa-3 font-body" data-aviso-sem-fontes>
                  Registre anamnese, antropometria, exames ou questionário antes de gerar a avaliação.
                </p>
              )}
            </div>
          )}

          {editando && avaliacao && (
            <p className="text-xs text-texto-2 font-body flex items-center gap-1.5 border border-linha-2 p-2" data-aviso-sintese-congelada>
              <Lock size={12} aria-hidden="true" className="shrink-0" />
              Síntese de {formatarDataHoraAvaliacao(avaliacao.data)} — use Regerar síntese pra atualizar com as fontes de agora.
            </p>
          )}

          <Campo rotulo="Título">
            <input
              className={INPUT}
              value={form.titulo}
              maxLength={TITULO_MAX}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              data-campo-titulo-avaliacao
            />
          </Campo>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-[11px] uppercase tracking-wider text-texto-2 font-body">Parecer</label>
              <span className="text-[11px] text-texto-2 font-body" data-contador-texto={form.texto.length}>
                {form.texto.length}/{TEXTO_MAX}
              </span>
            </div>
            <textarea
              className={TEXTAREA_CONTEUDO}
              maxLength={TEXTO_MAX}
              value={form.texto}
              onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))}
              data-campo-texto-avaliacao
            />
          </div>

          {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-avaliacao>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-avaliacao>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando || (!editando && !tem)} data-btn-salvar-avaliacao>
              {salvando ? "Salvando..." : editando ? "Salvar" : "Gerar avaliação"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
