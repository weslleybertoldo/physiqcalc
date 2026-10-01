// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/gestacional/GestacaoDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { atualizarGestacao, iniciarGestacao, type Antropometria, type Gestacao } from "@/nutricao/prontuario/lib/gestacional";
import {
  ALTURA_MAX, ALTURA_MIN, OBSERVACAO_GESTACIONAL_MAX, PESO_MAX, PESO_MIN, calcularDPP, classificarIMCPre, dataLocalISO, dataValida, faixaTotal, fmtData, fmtFaixa, formDaGestacao,
  formInicialGestacao, hojeISO, imcDoForm, textoIMCPre, ultimaAntropometria, validarGestacao, type FormGestacao,
} from "@/nutricao/editor/lib/gestacionalUtil";

// Modal "Iniciar acompanhamento gestacional" / "Editar dados da gestação": DUM (com a DPP calculada ao vivo), peso e altura
// pré-gestacionais (no modo novo vêm PRÉ-PREENCHIDOS da última antropometria, com aviso da data), IMC pré + classificação ao
// vivo, gemelar e observação. O formulário é montado só na ABERTURA (um refetch das antropometrias com o modal aberto não mexe
// no que ela digitou). DPP e IMC são calculados aqui e gravados pelo acesso.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  pacienteId: string;
  /** gestação existente → modo editar */
  gestacao: Gestacao | null;
  /** antropometrias vivas do paciente (fonte da sugestão de peso/altura); vem MEMOIZADO do pai */
  antropometrias: Antropometria[];
  onSalvo: (g: Gestacao, criada: boolean) => void;
}

export default function GestacaoDialog({ open, onOpenChange, nutricionistaId, pacienteId, gestacao, antropometrias, onSalvo }: Props) {
  const editar = !!gestacao;
  const hoje = hojeISO();
  const [form, setForm] = useState<FormGestacao>(() => formInicialGestacao(null));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const jaAberto = useRef(false);

  // só na ABERTURA: monta o formulário (editar → dados da gestação; novo → sugestão da última antropometria)
  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setErro(null);
    setForm(gestacao ? formDaGestacao(gestacao) : formInicialGestacao(ultimaAntropometria(antropometrias)));
  }, [open, gestacao, antropometrias]);

  const campo = <K extends keyof FormGestacao>(k: K, v: FormGestacao[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dpp = dataValida(form.dum) ? calcularDPP(form.dum) : null;
  const imc = useMemo(() => imcDoForm(form), [form]);
  const total = imc !== null ? faixaTotal(classificarIMCPre(imc), form.gemelar) : null;

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarGestacao(form, hojeISO());
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (gestacao) {
        const g = await atualizarGestacao(gestacao.id, form);
        onSalvo(g, false);
        toast.success("Dados atualizados");
      } else {
        const g = await iniciarGestacao(nutricionistaId, pacienteId, form);
        onSalvo(g, true);
        toast.success("Acompanhamento iniciado");
      }
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a gestação");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-lg max-h-[92vh] overflow-y-auto" data-modal-gestacao={editar ? "editar" : "nova"} data-salvando={salvando ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editar ? "Editar dados da gestação" : "Iniciar acompanhamento gestacional"}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {editar
              ? "DPP, IMC pré-gestacional e as faixas de ganho são recalculados com os dados novos."
              : "Data da última menstruação e peso/altura pré-gestacionais. A faixa de ganho de peso segue o IOM 2009."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4" noValidate data-form-gestacao>
          <Campo rotulo="Data da última menstruação (DUM)" dica={dpp ? `DPP ${fmtData(dpp)}` : "não pode ser futura"}>
            <input type="date" className={INPUT} value={form.dum} max={hoje} onChange={(e) => campo("dum", e.target.value)} data-campo-dum />
            <p className="text-xs text-texto-2 font-body pt-1" data-dpp-previa={dpp ?? ""}>
              Data provável do parto: <span className="text-texto">{dpp ? fmtData(dpp) : "—"}</span>
            </p>
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Peso pré-gestacional (kg)" dica={`${PESO_MIN}–${PESO_MAX}`}>
              <input
                type="number"
                inputMode="decimal"
                min={PESO_MIN}
                max={PESO_MAX}
                step={0.1}
                className={INPUT}
                value={form.peso_pre}
                onChange={(e) => campo("peso_pre", e.target.value)}
                placeholder="60,0"
                data-campo-peso-pre
              />
            </Campo>
            <Campo rotulo="Altura (cm)" dica={`${ALTURA_MIN}–${ALTURA_MAX}`}>
              <input
                type="number"
                inputMode="decimal"
                min={ALTURA_MIN}
                max={ALTURA_MAX}
                step={0.5}
                className={INPUT}
                value={form.altura}
                onChange={(e) => campo("altura", e.target.value)}
                placeholder="165"
                data-campo-altura
              />
            </Campo>
          </div>
          {!editar && form.origemSugestao && (
            <p className="text-xs text-verde-3 font-body" role="status" data-aviso-sugestao={dataLocalISO(form.origemSugestao)}>
              Peso e altura sugeridos da antropometria de {fmtData(form.origemSugestao)} — confira antes de salvar.
            </p>
          )}
          <p className="text-xs text-texto-2 font-body" data-imc-previa={imc ?? ""}>
            IMC pré-gestacional: <span className="text-texto">{textoIMCPre(imc)}</span>
            {total && <span data-faixa-previa> · ganho recomendado {fmtFaixa(total.faixa)}</span>}
          </p>
          {total?.aviso && <p className="text-xs text-verde-3 font-body" data-aviso-gemelar>{total.aviso}</p>}

          <label className="flex items-center gap-2 text-sm font-body text-texto cursor-pointer">
            <input type="checkbox" className="accent-[#10B981]" checked={form.gemelar} onChange={(e) => campo("gemelar", e.target.checked)} disabled={salvando} data-campo-gemelar /> Gestação gemelar
          </label>

          <Campo rotulo="Observação" dica={`${form.observacao.length}/${OBSERVACAO_GESTACIONAL_MAX} · opcional`}>
            <textarea
              className={TEXTAREA}
              value={form.observacao}
              maxLength={OBSERVACAO_GESTACIONAL_MAX}
              onChange={(e) => campo("observacao", e.target.value)}
              placeholder="Ex.: gestação de risco habitual, acompanhamento pré-natal com Dra. …"
              data-campo-observacao-gestacao
            />
          </Campo>

          {erro && <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-gestacao>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} disabled={salvando} data-btn-cancelar-gestacao>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-gestacao>
              {salvando ? "Salvando..." : editar ? "Salvar" : "Iniciar acompanhamento"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
