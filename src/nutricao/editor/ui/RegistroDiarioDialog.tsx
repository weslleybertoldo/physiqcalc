// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/acompanhamento/RegistroDiarioDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { atualizarRegistro, salvarRegistro, type RegistroDiario } from "@/nutricao/editor/lib/acompanhamento";
import {
  AGUA_ATALHOS, AGUA_MAX, AGUA_PASSO, OBSERVACAO_REGISTRO_MAX, SINTOMAS, SINTOMAS_MAX, adicionarSintomaLivre, alternarSintoma, fmtAgua, formDoRegistro, formInicialRegistro,
  formatarDataRegistro, hojeISO, registroDoDia, rotuloSintoma, sintomasLivres, somarAgua, validarRegistro, type FormRegistro,
} from "@/nutricao/editor/lib/acompanhamentoUtil";

const CHIP = "pq-chip pq-chip-g";
const CHIP_ON = "border-verde text-verde-3 bg-[rgba(16,185,129,.1)]";
const CHIP_OFF = "border-linha-2 text-texto-2 hover:text-texto hover:border-verde/50";
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";

// Modal "Registrar dia" / "Editar registro": data (padrão hoje, nunca futura), água em ml (com +250 / +500 / limpar), sintomas do
// catálogo em chips + 'Outro sintoma' livre (vira chip removível) e observação. No modo novo, escolher um dia que JÁ tem registro
// avisa que vai ATUALIZAR aquele dia (upsert manual no acesso — 1 registro vivo por dia).
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  pacienteId: string;
  /** registro existente → modo editar */
  registro: RegistroDiario | null;
  /** registros vivos do paciente (pra avisar dia já registrado); vem MEMOIZADO do pai */
  registros: RegistroDiario[];
  onSalvo: (r: RegistroDiario, criado: boolean) => void;
}

export default function RegistroDiarioDialog({ open, onOpenChange, nutricionistaId, pacienteId, registro, registros, onSalvo }: Props) {
  const editar = !!registro;
  const hoje = hojeISO();
  const [form, setForm] = useState<FormRegistro>(() => formInicialRegistro(hoje));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setForm(registro ? formDoRegistro(registro) : formInicialRegistro(hojeISO()));
  }, [open, registro]);

  const campo = <K extends keyof FormRegistro>(k: K, v: FormRegistro[K]) => setForm((f) => ({ ...f, [k]: v }));
  // dia que já tem registro (só no modo novo): o salvar vira atualização daquele dia
  const existente = !editar ? registroDoDia(registros, form.data) : null;
  const livres = sintomasLivres(form.sintomas);
  const aguaAtual = Number(form.agua_ml) || 0;

  const adicionarLivre = () => {
    const { lista, chave } = adicionarSintomaLivre(form.sintomas, form.sintomaLivre);
    if (!chave) {
      if (form.sintomaLivre.trim() && form.sintomas.length >= SINTOMAS_MAX) setErro(`No máximo ${SINTOMAS_MAX} sintomas`);
      return;
    }
    setErro(null);
    setForm((f) => ({ ...f, sintomas: lista, sintomaLivre: "" }));
  };
  const enterAdiciona = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      adicionarLivre();
    }
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarRegistro(form, hojeISO());
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
        const { registro: r, criado } = await salvarRegistro(nutricionistaId, pacienteId, form);
        onSalvo(r, criado);
        toast.success(criado ? "Dia registrado" : "Registro atualizado");
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
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-lg max-h-[92vh] overflow-y-auto" data-modal-registro={editar ? "editar" : "novo"} data-salvando={salvando ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editar ? "Editar registro" : "Registrar dia"}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {editar ? `Registro de ${formatarDataRegistro(registro.data)}: água, sintomas e observação.` : "Água ingerida, sintomas e observação do dia. Um registro por dia — o mesmo dia é atualizado."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4" noValidate data-form-registro>
          <Campo rotulo="Dia" dica={editar ? "A data não muda ao editar" : "Padrão hoje · não pode ser futura"}>
            <input type="date" className={INPUT} value={form.data} max={hoje} disabled={editar} onChange={(e) => campo("data", e.target.value)} data-campo-data-registro />
            {existente && (
              <p className="text-xs text-verde-3 font-body pt-1" role="status" data-aviso-dia-existente={existente.id}>
                Já existe registro neste dia ({fmtAgua(existente.agua_ml)}) — salvar vai atualizar.
              </p>
            )}
          </Campo>

          <Campo rotulo="Água (ml)" dica={`${fmtAgua(aguaAtual)} · passos de ${AGUA_PASSO} ml`}>
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={AGUA_MAX}
                step={AGUA_PASSO}
                className={`${INPUT} sm:max-w-[10rem]`}
                value={form.agua_ml}
                onChange={(e) => campo("agua_ml", e.target.value)}
                placeholder="0"
                data-campo-agua
              />
              <div className="flex flex-wrap gap-1.5 pb-1">
                {AGUA_ATALHOS.map((n) => (
                  <button key={n} type="button" className={BTN_MINI} onClick={() => campo("agua_ml", somarAgua(form.agua_ml, n))} disabled={salvando} data-btn-agua-mais={n}>
                    <Plus size={11} aria-hidden="true" /> {n} ml
                  </button>
                ))}
                <button type="button" className={BTN_MINI} onClick={() => campo("agua_ml", "")} disabled={salvando || !form.agua_ml} data-btn-agua-zerar>
                  Limpar
                </button>
              </div>
            </div>
          </Campo>

          <Campo rotulo="Sintomas" dica={`${form.sintomas.length}/${SINTOMAS_MAX} · toque pra marcar`}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sintomas do dia">
              {SINTOMAS.map((s) => {
                const on = form.sintomas.includes(s.chave);
                return (
                  <button
                    key={s.chave}
                    type="button"
                    aria-pressed={on}
                    onClick={() => campo("sintomas", alternarSintoma(form.sintomas, s.chave))}
                    className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                    disabled={salvando}
                    data-campo-sintoma={s.chave}
                  >
                    {s.rotulo}
                  </button>
                );
              })}
            </div>
            {livres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2" data-sintomas-livres={livres.length}>
                {livres.map((chave) => (
                  <span key={chave} className={`${CHIP} ${CHIP_ON} inline-flex items-center gap-1`} data-sintoma-livre={chave}>
                    {rotuloSintoma(chave)}
                    <button type="button" onClick={() => campo("sintomas", alternarSintoma(form.sintomas, chave))} aria-label={`Remover ${rotuloSintoma(chave)}`} className="hover:opacity-70" disabled={salvando} data-btn-remover-sintoma>
                      <X size={11} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 pt-2">
              <input
                type="text"
                className={INPUT}
                value={form.sintomaLivre}
                maxLength={40}
                onChange={(e) => campo("sintomaLivre", e.target.value)}
                onKeyDown={enterAdiciona}
                placeholder="Outro sintoma (ex.: tontura)"
                aria-label="Outro sintoma"
                data-campo-sintoma-outro
              />
              <button type="button" className={BTN_SEC} onClick={adicionarLivre} disabled={salvando || !form.sintomaLivre.trim()} data-btn-adicionar-sintoma>
                <Plus size={12} aria-hidden="true" /> Adicionar
              </button>
            </div>
          </Campo>

          <Campo rotulo="Observação" dica={`${form.observacao.length}/${OBSERVACAO_REGISTRO_MAX} · opcional`}>
            <textarea
              className={TEXTAREA}
              value={form.observacao}
              maxLength={OBSERVACAO_REGISTRO_MAX}
              onChange={(e) => campo("observacao", e.target.value)}
              placeholder="Ex.: dormiu mal, comeu fora"
              data-campo-observacao-registro
            />
          </Campo>

          {erro && <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-registro>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} disabled={salvando} data-btn-cancelar-registro>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-registro>
              {salvando ? "Salvando..." : editar || existente ? "Salvar" : "Registrar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
