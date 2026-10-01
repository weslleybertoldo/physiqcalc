// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/gestacional/RegistroGestacionalDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { atualizarRegistro, salvarRegistro, type Gestacao, type RegistroGestacional } from "@/nutricao/prontuario/lib/gestacional";
import {
  OBSERVACAO_GESTACIONAL_MAX, PA_DIA_MAX, PA_DIA_MIN, PA_SIS_MAX, PA_SIS_MIN, PESO_MAX, PESO_MIN, alertaPA, fmtData, fmtPeso, formDoRegistro, formInicialRegistro,
  hojeISO, preencherDoExistente, previaRegistro, registroDoDia, semanaGestacional, textoPrevia, textoSemanaTrimestre, ultimoRegistro, validarRegistro,
  type FormRegistroGestacional,
} from "@/nutricao/editor/lib/gestacionalUtil";

// Modal "Registrar peso" / "Editar registro": data (entre a DUM e hoje; TRAVADA ao editar) com a semana gestacional ao vivo,
// peso (sugerido do último registro), pressão arterial opcional em par (com alerta 'PA elevada' ao vivo) e observação.
// Prévia 'ganho +N kg · faixa X–Y kg · situação' calculada pela mesma regra da tela. No modo novo, escolher um dia que JÁ tem
// registro avisa que vai ATUALIZAR aquele dia (upsert manual no acesso — 1 registro vivo por dia da gestação) e carrega os
// dados dele no formulário (senão o salvar apagaria a PA/observação daquele dia sem ela ver).
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  gestacao: Gestacao;
  /** registro existente → modo editar */
  registro: RegistroGestacional | null;
  /** registros vivos da gestação (pra avisar dia já registrado e sugerir o último peso); vem MEMOIZADO do pai */
  registros: RegistroGestacional[];
  onSalvo: (r: RegistroGestacional, criado: boolean) => void;
}

const num = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export default function RegistroGestacionalDialog({ open, onOpenChange, nutricionistaId, gestacao, registro, registros, onSalvo }: Props) {
  const editar = !!registro;
  const hoje = hojeISO();
  const [form, setForm] = useState<FormRegistroGestacional>(() => formInicialRegistro(hoje, null));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const jaAberto = useRef(false);

  // só na ABERTURA: monta o formulário (um refetch dos registros com o modal aberto não mexe no que ela digitou)
  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setErro(null);
    if (registro) {
      setForm(formDoRegistro(registro));
      return;
    }
    const inicial = formInicialRegistro(hojeISO(), ultimoRegistro(registros)?.peso ?? null);
    const doDia = registroDoDia(registros, inicial.data);
    setForm(doDia ? preencherDoExistente(inicial, doDia) : inicial);
  }, [open, registro, registros]);

  const campo = <K extends keyof FormRegistroGestacional>(k: K, v: FormRegistroGestacional[K]) => setForm((f) => ({ ...f, [k]: v }));
  /** trocar a data (modo novo): dia que já tem registro carrega os dados dele; dia livre mantém o que ela digitou */
  const trocarData = (data: string) => {
    const doDia = !editar ? registroDoDia(registros, data) : null;
    setForm((f) => (doDia ? preencherDoExistente({ ...f, data }, doDia) : { ...f, data }));
  };
  // dia que já tem registro (só no modo novo): o salvar vira atualização daquele dia
  const existente = !editar ? registroDoDia(registros, form.data) : null;
  const semana = semanaGestacional(gestacao.dum, form.data);
  const previa = previaRegistro(form, gestacao);
  const alerta = alertaPA(num(form.pa_sistolica), num(form.pa_diastolica));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarRegistro(form, gestacao, hojeISO());
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (registro) {
        const r = await atualizarRegistro(registro.id, form);
        onSalvo(r, false);
        toast.success("Registro atualizado");
      } else {
        const { registro: r, criado } = await salvarRegistro(nutricionistaId, gestacao, form);
        onSalvo(r, criado);
        toast.success(criado ? "Peso registrado" : "Registro atualizado");
      }
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o registro");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-lg max-h-[92vh] overflow-y-auto" data-modal-registro-gestacional={editar ? "editar" : "novo"} data-salvando={salvando ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editar ? "Editar registro" : "Registrar peso"}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {editar ? `Registro de ${fmtData(registro.data)}: peso, pressão arterial e observação.` : "Peso do dia e, se medida, a pressão arterial. Um registro por dia — o mesmo dia é atualizado."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4" noValidate data-form-registro-gestacional>
          <Campo rotulo="Data" dica={editar ? "A data não muda ao editar" : `entre a DUM (${fmtData(gestacao.dum)}) e hoje`}>
            <input type="date" className={INPUT} value={form.data} min={gestacao.dum} max={hoje} disabled={editar} onChange={(e) => trocarData(e.target.value)} data-campo-data-registro />
            <p className="text-xs text-texto-2 font-body pt-1" data-semana-previa={semana ? `${semana.semanas}s ${semana.dias}d` : ""}>
              Semana gestacional: <span className="text-texto">{textoSemanaTrimestre(semana)}</span>
            </p>
            {existente && (
              <p className="text-xs text-verde-3 font-body pt-1" role="status" data-aviso-dia-existente={existente.id}>
                Já existe registro neste dia ({fmtPeso(existente.peso)}) — salvar vai atualizar.
              </p>
            )}
          </Campo>

          <Campo rotulo="Peso (kg)" dica={`${PESO_MIN}–${PESO_MAX}`}>
            <input
              type="number"
              inputMode="decimal"
              min={PESO_MIN}
              max={PESO_MAX}
              step={0.1}
              className={`${INPUT} sm:max-w-[12rem]`}
              value={form.peso}
              onChange={(e) => campo("peso", e.target.value)}
              placeholder="67,0"
              data-campo-peso
            />
            <p className="text-xs text-texto-2 font-body pt-1" data-ganho-previa={previa.situacao ?? ""}>
              Prévia: <span className="text-texto">{textoPrevia(previa)}</span>
            </p>
          </Campo>

          <Campo rotulo="Pressão arterial (mmHg)" dica="opcional · sistólica / diastólica">
            <div className="flex items-end gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={PA_SIS_MIN}
                max={PA_SIS_MAX}
                step={1}
                className={`${INPUT} sm:max-w-[7rem]`}
                value={form.pa_sistolica}
                onChange={(e) => campo("pa_sistolica", e.target.value)}
                placeholder="120"
                aria-label="Sistólica"
                data-campo-pa-sis
              />
              <span className="text-texto-2 pb-2">/</span>
              <input
                type="number"
                inputMode="numeric"
                min={PA_DIA_MIN}
                max={PA_DIA_MAX}
                step={1}
                className={`${INPUT} sm:max-w-[7rem]`}
                value={form.pa_diastolica}
                onChange={(e) => campo("pa_diastolica", e.target.value)}
                placeholder="80"
                aria-label="Diastólica"
                data-campo-pa-dia
              />
            </div>
            {alerta && <p className="text-xs text-rosa-3 font-body pt-1" role="status" data-alerta-pa>{alerta} — sistólica ≥ 140 ou diastólica ≥ 90</p>}
          </Campo>

          <Campo rotulo="Observação" dica={`${form.observacao.length}/${OBSERVACAO_GESTACIONAL_MAX} · opcional`}>
            <textarea
              className={TEXTAREA}
              value={form.observacao}
              maxLength={OBSERVACAO_GESTACIONAL_MAX}
              onChange={(e) => campo("observacao", e.target.value)}
              placeholder="Ex.: enjoo pela manhã, inchaço nos pés"
              data-campo-observacao-registro-gestacional
            />
          </Campo>

          {erro && <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-registro-gestacional>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} disabled={salvando} data-btn-cancelar-registro-gestacional>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-registro-gestacional>
              {salvando ? "Salvando..." : editar || existente ? "Salvar" : "Registrar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
