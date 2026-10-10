// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/farmaco/InteracaoDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { atualizarInteracao, criarInteracao, type Interacao } from "@/nutricao/prontuario/lib/farmaco";
import {
  CLASSE_MAX, CONDUTA_MAX, GRAVIDADES, MEDICAMENTO_MAX, NUTRIENTE_MAX, TEXTO_MAX, formDaInteracao, formInicialInteracao, validarInteracao, type FormInteracao,
  type Gravidade,
} from "@/nutricao/prontuario/lib/farmacoUtil";

// Modal de uma interação PRÓPRIA da nutricionista (nova ou editar): medicamento (genérico) + sinônimos separados por vírgula
// (o app casa o medicamento do paciente por qualquer um deles, sem acento/caixa), classe, nutriente, efeito, gravidade, conduta
// e fonte. As do sistema não passam por aqui (só 'Duplicar', que cria a cópia própria e abre este modal em modo editar).
// Montado só na ABERTURA (ref `jaAberto`); o aviso de validação some assim que ela corrige.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  /** interação própria existente → modo editar */
  interacao: Interacao | null;
  onSalvo: (i: Interacao, criada: boolean) => void;
}

export default function InteracaoDialog({ open, onOpenChange, nutricionistaId, interacao, onSalvo }: Props) {
  const editar = !!interacao;
  const [form, setForm] = useState<FormInteracao>(formInicialInteracao);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const jaAberto = useRef(false);

  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setErro(null);
    setForm(interacao ? formDaInteracao(interacao) : formInicialInteracao());
  }, [open, interacao]);

  useEffect(() => {
    if (erro && validarInteracao(form) === null) setErro(null);
  }, [erro, form]);

  const campo = <K extends keyof FormInteracao>(k: K, v: FormInteracao[K]) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // pode estar por cima de outro modal
    const problema = validarInteracao(form);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (interacao) {
        const i = await atualizarInteracao(interacao.id, form);
        onSalvo(i, false);
        toast.success("Interação atualizada");
      } else {
        const i = await criarInteracao(nutricionistaId, form);
        onSalvo(i, true);
        toast.success("Interação criada");
      }
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a interação");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-xl max-h-[92vh] overflow-y-auto" data-modal-interacao={editar ? "editar" : "nova"} data-salvando={salvando ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editar ? "Editar interação" : "Nova interação"}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            Interação sua: vale pra todos os seus pacientes. O medicamento do paciente casa pelo nome genérico ou por qualquer sinônimo (sem acento nem caixa).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-3" noValidate data-form-interacao>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo rotulo="Medicamento (genérico)">
              <input className={INPUT} value={form.medicamento} maxLength={MEDICAMENTO_MAX} onChange={(e) => campo("medicamento", e.target.value)} placeholder="ex.: Metformina" data-campo-medicamento-base />
            </Campo>
            <Campo rotulo="Classe" dica="opcional">
              <input className={INPUT} value={form.classe} maxLength={CLASSE_MAX} onChange={(e) => campo("classe", e.target.value)} placeholder="ex.: Antidiabético" data-campo-classe />
            </Campo>
          </div>
          <Campo rotulo="Sinônimos e marcas" dica="separados por vírgula · opcional">
            <input className={INPUT} value={form.sinonimos} onChange={(e) => campo("sinonimos", e.target.value)} placeholder="ex.: Glifage, Glucoformin" data-campo-sinonimos />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-3">
            <Campo rotulo="Nutriente ou alimento">
              <input className={INPUT} value={form.nutriente} maxLength={NUTRIENTE_MAX} onChange={(e) => campo("nutriente", e.target.value)} placeholder="ex.: Vitamina B12" data-campo-nutriente />
            </Campo>
            <Campo rotulo="Gravidade">
              <select className={SELECT} value={form.gravidade} onChange={(e) => campo("gravidade", e.target.value as Gravidade)} data-campo-gravidade>
                {GRAVIDADES.map((g) => (
                  <option key={g.valor} value={g.valor}>{g.rotulo}</option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo rotulo="Efeito" dica={`${form.efeito.length}/${TEXTO_MAX}`}>
            <input className={INPUT} value={form.efeito} maxLength={TEXTO_MAX} onChange={(e) => campo("efeito", e.target.value)} placeholder="ex.: reduz a absorção de vitamina B12" data-campo-efeito />
          </Campo>
          <Campo rotulo="Conduta nutricional" dica={`${form.conduta.length}/${CONDUTA_MAX}`}>
            <textarea className={TEXTAREA} value={form.conduta} maxLength={CONDUTA_MAX} rows={3} onChange={(e) => campo("conduta", e.target.value)} placeholder="ex.: acompanhar a B12 sérica e reforçar as fontes alimentares" data-campo-conduta />
          </Campo>
          <Campo rotulo="Fonte" dica="opcional">
            <input className={INPUT} value={form.fonte} maxLength={TEXTO_MAX} onChange={(e) => campo("fonte", e.target.value)} placeholder="ex.: bula, artigo, diretriz" data-campo-fonte />
          </Campo>

          {erro && <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-interacao>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} disabled={salvando} data-btn-cancelar-interacao>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-interacao>
              {salvando ? "Salvando..." : editar ? "Salvar" : "Criar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
