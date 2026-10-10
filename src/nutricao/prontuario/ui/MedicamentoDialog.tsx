// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/farmaco/MedicamentoDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import BadgeGravidade from "@/nutricao/prontuario/ui/BadgeGravidade";
import { atualizarMedicamento, criarMedicamento, type Interacao, type Medicamento } from "@/nutricao/prontuario/lib/farmaco";
import {
  MEDICAMENTO_MAX, POSOLOGIAS_RAPIDAS, TEXTO_MAX, aplicarChip, chipAtivo, formDoMedicamento, formInicialMedicamento, hojeISO, interacoesDoMedicamento,
  normalizarMedicamento, sugerirMedicamentos, textoPreviaInteracoes, validarMedicamento, type FormMedicamento,
} from "@/nutricao/prontuario/lib/farmacoUtil";

// Modal do medicamento em uso (novo ou editar): nome com AUTOCOMPLETE da base (genéricos + sinônimos; escolher preenche o nome e
// guarda `interacao_id` só pra documentar) e PRÉVIA AO VIVO das interações que casam com o nome digitado — o cruzamento é por
// nome, então um nome livre que bata com um sinônimo ('Puran T4') também mostra as interações. Dose, posologia com chips (ligam/
// desligam trechos separados por vírgula), início (até hoje, opcional) e observação. Montado só na ABERTURA (ref `jaAberto`);
// o aviso de validação some assim que ela corrige.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  pacienteId: string;
  /** base viva (vem MEMOIZADA do pai) */
  base: Interacao[];
  /** medicamento existente → modo editar */
  medicamento: Medicamento | null;
  onSalvo: (m: Medicamento, criado: boolean) => void;
}

const CHIP_BTN = "rounded-[8px] border px-2 py-0.5 text-[11px] font-semibold transition-colors";

export default function MedicamentoDialog({ open, onOpenChange, nutricionistaId, pacienteId, base, medicamento, onSalvo }: Props) {
  const editar = !!medicamento;
  const hoje = hojeISO();
  const [form, setForm] = useState<FormMedicamento>(formInicialMedicamento);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const jaAberto = useRef(false);

  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setErro(null);
    setSugestoesAbertas(false);
    setForm(medicamento ? formDoMedicamento(medicamento) : formInicialMedicamento());
  }, [open, medicamento]);

  useEffect(() => {
    if (erro && validarMedicamento(form, hoje) === null) setErro(null);
  }, [erro, form, hoje]);

  const campo = <K extends keyof FormMedicamento>(k: K, v: FormMedicamento[K]) => setForm((f) => ({ ...f, [k]: v }));

  const previa = useMemo(() => interacoesDoMedicamento(form.medicamento, base), [form.medicamento, base]);
  const sugestoes = useMemo(
    () => (sugestoesAbertas ? sugerirMedicamentos(base, form.medicamento).filter((n) => normalizarMedicamento(n) !== normalizarMedicamento(form.medicamento)) : []),
    [sugestoesAbertas, base, form.medicamento],
  );

  const escolher = (nome: string) => {
    const primeira = interacoesDoMedicamento(nome, base)[0];
    setForm((f) => ({ ...f, medicamento: nome, interacaoId: primeira?.id ?? null }));
    setSugestoesAbertas(false);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarMedicamento(form, hoje);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (medicamento) {
        const m = await atualizarMedicamento(medicamento.id, form);
        onSalvo(m, false);
        toast.success("Medicamento atualizado");
      } else {
        const m = await criarMedicamento(nutricionistaId, pacienteId, form);
        onSalvo(m, true);
        toast.success("Medicamento adicionado");
      }
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o medicamento");
    } finally {
      setSalvando(false);
    }
  };

  const temNome = normalizarMedicamento(form.medicamento).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-xl max-h-[92vh] overflow-y-auto" data-modal-medicamento={editar ? "editar" : "novo"} data-salvando={salvando ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editar ? "Editar medicamento" : "Adicionar medicamento"}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            Digite o nome do medicamento — a base sugere os conhecidos e mostra na hora as interações com nutrientes. Depois, a posologia.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4" noValidate data-form-medicamento>
          <Campo rotulo="Medicamento" dica="nome genérico ou marca">
            <div className="relative">
              <input
                className={INPUT}
                value={form.medicamento}
                maxLength={MEDICAMENTO_MAX}
                autoComplete="off"
                onChange={(e) => {
                  campo("medicamento", e.target.value);
                  campo("interacaoId", null);
                  setSugestoesAbertas(true);
                }}
                onFocus={() => setSugestoesAbertas(true)}
                onBlur={() => setSugestoesAbertas(false)}
                placeholder="ex.: Metformina"
                data-campo-medicamento
              />
              {sugestoes.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-tela border border-linha-2 shadow-md" data-lista-sugestoes>
                  {sugestoes.map((nome) => (
                    <li key={nome}>
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 text-sm font-body hover:bg-[rgba(16,185,129,.06)]"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => escolher(nome)}
                        data-sugestao-medicamento={nome}
                      >
                        {nome}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {temNome ? (
              <div className="pt-2 space-y-1" data-previa-interacoes={previa.length}>
                <p className={`text-xs font-body ${previa.length ? "text-texto" : "text-texto-2 italic"}`} data-previa-texto>{textoPreviaInteracoes(previa)}</p>
                {previa.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" data-previa-lista>
                    {previa.map((i) => (
                      <li key={i.id} className="inline-flex items-center gap-1 text-[11px] font-body text-texto-2" data-previa-interacao={i.id}>
                        {i.nutriente} <BadgeGravidade gravidade={i.gravidade} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs text-texto-3 font-body italic pt-2" data-previa-vazia>Digite o nome pra ver as interações conhecidas.</p>
            )}
          </Campo>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo rotulo="Dose" dica="opcional">
              <input className={INPUT} value={form.dose} maxLength={TEXTO_MAX} onChange={(e) => campo("dose", e.target.value)} placeholder="ex.: 850 mg" data-campo-dose-medicamento />
            </Campo>
            <Campo rotulo="Início" dica="até hoje · opcional">
              <input type="date" className={INPUT} value={form.inicio} max={hoje} onChange={(e) => campo("inicio", e.target.value)} data-campo-inicio-medicamento />
            </Campo>
          </div>
          <Campo rotulo="Posologia" dica="texto livre · os atalhos entram separados por vírgula">
            <input className={INPUT} value={form.posologia} maxLength={TEXTO_MAX} onChange={(e) => campo("posologia", e.target.value)} placeholder="ex.: 2x ao dia, com as refeições" data-campo-posologia />
            <div className="flex flex-wrap gap-1.5 pt-2">
              {POSOLOGIAS_RAPIDAS.map((v) => {
                const ativo = chipAtivo(form.posologia, v);
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => campo("posologia", aplicarChip(form.posologia, v))}
                    className={`${CHIP_BTN} ${ativo ? "border-verde bg-[rgba(16,185,129,.1)] text-verde-3" : "border-linha-2 text-texto-2 hover:text-texto"}`}
                    data-chip-posologia={v}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </Campo>
          <Campo rotulo="Observação" dica={`${form.observacao.length}/${TEXTO_MAX} · opcional`}>
            <textarea className={TEXTAREA} value={form.observacao} maxLength={TEXTO_MAX} rows={2} onChange={(e) => campo("observacao", e.target.value)} placeholder="ex.: prescrito pelo endocrinologista" data-campo-observacao-medicamento />
          </Campo>

          {erro && <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-medicamento>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} disabled={salvando} data-btn-cancelar-medicamento>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-medicamento>
              {salvando ? "Salvando..." : editar ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
