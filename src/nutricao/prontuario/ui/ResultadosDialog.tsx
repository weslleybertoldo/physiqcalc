// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/exames/ResultadosDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import ResultadosEditor from "@/nutricao/prontuario/ui/ResultadosEditor";
import { atualizarResultado, criarResultados, type ExameCatalogo, type ResultadoExame } from "@/nutricao/prontuario/lib/exames";
import {
  OBSERVACAO_EXAME_MAX, dataValida, formParaRegistroResultado, hojeISO, linhaVazia, normalizarTexto, resultadoParaForm, textoContagemResultados, validarLinhaResultado,
  type FormLinhaResultado,
} from "@/nutricao/prontuario/lib/examesUtil";

// Modal dos resultados. LANÇAMENTO EM LOTE: data (hoje) + linhas dinâmicas (exame do catálogo ou Outro…, valor, unidade, referência
// copiada, prévia da situação) gravadas de uma vez. EDIÇÃO DE 1 RESULTADO: a mesma linha (fixa) + data + observação. Cada resultado
// guarda a PRÓPRIA cópia da unidade/referência — mudar o catálogo depois não mexe no histórico.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pacienteId: string;
  catalogo: ExameCatalogo[];
  /** resultado existente = modo edição (1 linha) */
  resultado?: ResultadoExame | null;
  onSalvos: (novos: ResultadoExame[]) => void;
  onEditado: (r: ResultadoExame) => void;
}

export default function ResultadosDialog({ open, onOpenChange, pacienteId, catalogo, resultado, onSalvos, onEditado }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [linhas, setLinhas] = useState<FormLinhaResultado[]>([linhaVazia()]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const abriuRef = useRef(false);
  const edicao = !!resultado;

  // reinicia SÓ ao abrir
  useEffect(() => {
    if (open && !abriuRef.current) {
      setErro(null);
      if (resultado) {
        setData(resultado.data);
        setObservacao(resultado.observacao ?? "");
        setLinhas([resultadoParaForm(resultado)]);
      } else {
        setData(hojeISO());
        setObservacao("");
        setLinhas([linhaVazia()]);
      }
    }
    abriuRef.current = open;
  }, [open, resultado]);

  const mudarLinhas = (l: FormLinhaResultado[]) => {
    setLinhas(l);
    if (erro) setErro(null);
  };

  const validar = (): string | null => {
    if (!dataValida(data)) return "Informe a data dos resultados";
    for (let i = 0; i < linhas.length; i += 1) {
      const l = linhas[i];
      const m = validarLinhaResultado(l.exame, l.valor, l.unidade);
      if (m) return linhas.length > 1 ? `Linha ${i + 1}: ${m}` : m;
    }
    if (edicao && (observacao ?? "").length > OBSERVACAO_EXAME_MAX) return "Observação muito longa";
    return null;
  };

  const salvar = async () => {
    const msg = validar();
    if (msg) return setErro(msg);
    setErro(null);
    setSalvando(true);
    try {
      if (!user) throw new Error("Sessão expirada — entre de novo");
      if (resultado) {
        const r = await atualizarResultado(resultado.id, { ...formParaRegistroResultado(linhas[0]), data, observacao: normalizarTexto(observacao).slice(0, OBSERVACAO_EXAME_MAX) });
        onEditado(r);
        toast.success("Resultado atualizado");
      } else {
        const novos = await criarResultados(user.id, pacienteId, data, linhas.map(formParaRegistroResultado));
        onSalvos(novos);
        toast.success(`${textoContagemResultados(novos.length)} lançado${novos.length === 1 ? "" : "s"}`);
      }
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível salvar os resultados";
      setErro(m);
      toast.error(m);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-tela border-linha-2 sm:max-w-3xl max-h-[92vh] overflow-y-auto"
        {...(edicao ? { "data-modal-resultado": "editar" } : { "data-modal-resultados": "" })}
      >
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-verde-3" aria-hidden="true" /> {edicao ? "Editar resultado" : "Lançar resultados"}
          </DialogTitle>
          <DialogDescription className="font-body text-xs">
            {edicao
              ? "Ajuste o exame, o valor, a unidade, a data ou a observação deste resultado. A referência é a que valia na data do lançamento."
              : "Informe a data e um exame por linha. Escolher um exame do catálogo copia a unidade e a referência; o valor aceita número (5,6) ou texto (negativo)."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
          className="space-y-4"
          noValidate
          data-form-resultados
        >
          <Campo rotulo={edicao ? "Data do resultado *" : "Data dos resultados *"}>
            <input
              type="date"
              className={INPUT}
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                if (erro) setErro(null);
              }}
              data-campo-data-resultados
            />
          </Campo>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1.5">{edicao ? "Exame" : "Exames *"}</p>
            <ResultadosEditor
              linhas={linhas}
              onChange={mudarLinhas}
              catalogo={catalogo}
              unica={edicao}
              attrLinha="data-linha-resultado"
              attrExame="data-campo-exame"
              attrExameOutro="data-campo-exame-outro"
              attrValor="data-campo-valor"
              attrUnidade="data-campo-unidade"
              attrRef="data-ref"
              attrSituacao="data-situacao-previa"
              attrRemover="data-btn-remover-resultado"
              attrAdicionar="data-btn-adicionar-resultado"
            />
          </div>

          {edicao && (
            <Campo rotulo="Observação (opcional)">
              <textarea
                className={TEXTAREA}
                maxLength={OBSERVACAO_EXAME_MAX}
                rows={2}
                value={observacao}
                onChange={(e) => {
                  setObservacao(e.target.value);
                  if (erro) setErro(null);
                }}
                data-campo-observacao-resultado
              />
            </Campo>
          )}

          {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-resultados>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-resultados>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} {...(edicao ? { "data-btn-salvar-resultado": "" } : { "data-btn-salvar-resultados": "" })}>
              <Save size={12} aria-hidden="true" /> {salvando ? "Salvando..." : edicao ? "Salvar" : "Lançar resultados"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
