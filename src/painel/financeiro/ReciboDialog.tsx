// Physiq W19 — "Emitir recibo" (N-59): porta do PhysiqNutri (main ca9f66f, src/components/recibos/ReciboDialog.tsx) no visual premium.
// Nasce de uma ENTRADA (descrição, valor e data dela) ou avulso ("Novo recibo" — na página, escolhendo o aluno). Modelo (★ primeiro),
// descrição, valor em BRL com prévia, data e a PRÉVIA do texto com as tags substituídas ao vivo (nº = o próximo do profissional).
// Emitir grava o recibo (o número vem do banco), liga a movimentação e baixa o PDF — o mesmo de hoje, com a marca Physiq.
// hml-14b (B19): no recibo avulso o aluno é escolhido pelo SeletorDeAluno (busca no banco: nome, apelido, e-mail, telefone e CPF,
// sem acento, 20 por vez; o CPF do recibo vem junto) — era um <select> com a lista de até 1000 alunos (a prop `alunos`, que saiu).
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FileDown, Tags } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { chaveDia, dataValida } from "@/nutricao/editor/lib/agendaUtil";
import { BTN_LINK, BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, SELECT, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { DESCRICAO_RECIBO_MAX, aplicarTags, formatarCPF, formatarNumeroRecibo, ordenarModelosRecibo, temTagPendente } from "@/financeiro/recibos";
import { SeletorDeAluno } from "@/painel/alunos/SeletorDeAluno";
import { useAlunoDoSeletor } from "@/painel/alunos/useSeletorDeAluno";
import { emitirRecibo, type AlunoResumido, type ModeloRecibo, type Recibo } from "./dados";
import { fmtBRL, fmtValorComSinal, formatarData, limparValorDigitado, parseValor, textoValor, valorValido } from "./financeiroUtil";
import { formInicial, formParaRegistro, modeloInicial, type FormRecibo, type PadraoRecibo } from "./recibosUtil";

const schema = z.object({
  modeloId: z.string().min(1, "Escolha um modelo de recibo"),
  descricao: z.string().refine((v) => v.trim().length >= 2, "Informe a descrição").refine((v) => v.trim().length <= DESCRICAO_RECIBO_MAX, "Descrição muito longa"),
  valor: z.string().refine(valorValido, "Informe um valor maior que zero (ex.: 180,00)"),
  data: z.string().refine(dataValida, "Data inválida"),
});
type Valores = z.infer<typeof schema>;

const montarForm = (v: Partial<Valores>): FormRecibo => ({ modeloId: v.modeloId ?? "", descricao: v.descricao ?? "", valor: v.valor ?? "", data: v.data ?? "" });

export interface OrigemRecibo {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data: string;
}

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** o aluno do recibo; null = escolher no seletor (recibo avulso da página) */
  aluno: AlunoResumido | null;
  /** movimentação de origem (recibo de uma entrada) ou null (avulso) */
  transacao?: OrigemRecibo | null;
  modelos: ModeloRecibo[];
  /** próximo número do profissional (prévia; o número real vem do banco) */
  proximoNumero: number;
  nomeProfissional: string | null;
  padrao: PadraoRecibo;
  uid: string;
  contaId: string | null;
  onSalvo: (r: Recibo) => void;
  onGerenciarModelos: () => void;
}

export default function ReciboDialog({
  open, onOpenChange, aluno, transacao, modelos, proximoNumero, nomeProfissional, padrao, uid, contaId, onSalvo, onGerenciarModelos,
}: Props) {
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [alunoId, setAlunoId] = useState("");
  const abriuRef = useRef(false);
  const ordenados = useMemo(() => ordenarModelosRecibo(modelos), [modelos]);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: formInicial(null, "", padrao.descricao),
  });

  // reinicia SÓ ao abrir (a lista de modelos pode mudar com a janela aberta — "gerenciar modelos" — sem perder o que foi digitado)
  useEffect(() => {
    if (open && !abriuRef.current) {
      setErroGeral(null);
      setAlunoId(aluno?.id ?? "");
      reset(formInicial(transacao, modeloInicial(modelos)?.id ?? "", padrao.descricao));
    }
    abriuRef.current = open;
  }, [open, transacao, modelos, reset, aluno, padrao.descricao]);

  const v = montarForm(watch());
  const modelo = ordenados.find((m) => m.id === v.modeloId) ?? null;
  // o escolhido no seletor (do cache da busca, ou lido pelo id — com o CPF, que só o Recibo pede): nome e CPF para a prévia e o recibo
  const escolhido = useAlunoDoSeletor(contaId, aluno ? null : alunoId || null, true);
  const doSeletor = !aluno && alunoId && escolhido.data ? escolhido.data : null;
  const pessoa: AlunoResumido | null = aluno ?? (doSeletor ? { id: doSeletor.id, nome: doSeletor.nome, apelido: doSeletor.apelido, cpf: doSeletor.cpf } : null);

  // sem modelo escolhido (ou o escolhido foi excluído) → cai no 1º favorito
  useEffect(() => {
    if (!open || modelo || !modelos.length) return;
    setValue("modeloId", modeloInicial(modelos)?.id ?? "", { shouldDirty: true });
  }, [open, modelo, modelos, setValue]);

  const valorNum = parseValor(v.valor);
  const dados = {
    nomePaciente: pessoa?.nome ?? "",
    cpf: pessoa?.cpf ?? null,
    valor: valorNum !== null && valorNum > 0 ? valorNum : 0,
    data: dataValida(v.data) ? v.data : chaveDia(new Date()),
    numero: proximoNumero,
    nomeProfissional,
  };
  const previa = modelo && pessoa ? aplicarTags(modelo.conteudo, dados) : "";
  const valorReg = register("valor");

  const onSubmit = async (valores: Valores) => {
    const f = montarForm(valores);
    const m = modelos.find((x) => x.id === f.modeloId);
    if (!m) return setErroGeral("Escolha um modelo de recibo");
    if (!pessoa) return setErroGeral("Escolha o aluno do recibo");
    if (!uid) return setErroGeral("Sessão expirada — entre de novo");
    setErroGeral(null);
    try {
      const valor = parseValor(f.valor) ?? 0;
      const dadosTags = { ...dados, valor, data: f.data };
      const texto = aplicarTags(m.conteudo, dadosTags);
      const recibo = await emitirRecibo({
        uid, contaId, pacienteId: pessoa.id, transacaoId: transacao?.id ?? null, conteudoModelo: m.conteudo,
        registro: formParaRegistro(f, texto, padrao.descricao), dadosTags, numeroPrevisto: proximoNumero,
      });
      onSalvo(recibo);
      try {
        const { baixarPDFRecibo } = await import("./reciboPdf");
        const nome = await baixarPDFRecibo({
          numero: recibo.numero, valor: Number(recibo.valor), data: recibo.data, descricao: recibo.descricao, texto: recibo.texto, paciente: pessoa.nome,
          profissional: nomeProfissional, rotuloProfissional: padrao.rotuloProfissional, rotuloPaciente: padrao.rotuloPaciente, emitidoEm: new Date(),
        });
        toast.success(`Recibo nº ${formatarNumeroRecibo(recibo.numero)} emitido — PDF ${nome}`);
      } catch {
        toast.success(`Recibo nº ${formatarNumeroRecibo(recibo.numero)} emitido`);
        toast.error("Não foi possível gerar o PDF agora — use o botão PDF na lista");
      }
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível emitir o recibo";
      setErroGeral(msg);
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "max-h-[92vh] overflow-y-auto sm:max-w-2xl")} data-modal-recibo={transacao ? "movimentacao" : "avulso"}>
        <DialogHeader>
          <DialogTitle className={cn(TITULO_JANELA, "flex flex-wrap items-center gap-2")}>
            Emitir recibo
            <span className="pq-chip pq-chip-t" data-previa-numero={formatarNumeroRecibo(proximoNumero)}>nº {formatarNumeroRecibo(proximoNumero)} (previsto)</span>
          </DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            {transacao ? (
              <span data-recibo-origem={transacao.id}>
                A partir da movimentação de {formatarData(transacao.data)} · {transacao.descricao} · {fmtValorComSinal(transacao.tipo, Number(transacao.valor))}. O recibo guarda o texto final — mudar o modelo depois não mexe nele.
              </span>
            ) : (
              "Recibo avulso, sem movimentação ligada. O recibo guarda o texto final — mudar o modelo depois não mexe nele."
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-recibo>
          {!aluno && (
            <Campo rotulo={`${padrao.rotuloPaciente} *`}>
              <SeletorDeAluno campo="recibo" contaId={contaId} valor={alunoId || null} aoMudar={(a) => setAlunoId(a?.id ?? "")}
                rotulo={`Buscar o ${padrao.rotuloPaciente.toLowerCase()} do recibo`} />
            </Campo>
          )}
          <Campo rotulo="Modelo *" erro={errors.modeloId?.message}>
            <select className={SELECT} {...register("modeloId")} data-campo-modelo-recibo>
              {ordenados.length === 0 && <option value="">Nenhum modelo — crie um em "gerenciar modelos"</option>}
              {ordenados.map((m) => (
                <option key={m.id} value={m.id}>{m.favorito ? "★ " : ""}{m.titulo}</option>
              ))}
            </select>
            <button type="button" className={`${BTN_LINK} mt-2`} onClick={onGerenciarModelos} data-btn-gerenciar-modelos-recibo>
              <Tags size={12} aria-hidden="true" /> gerenciar modelos
            </button>
          </Campo>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <Campo rotulo="Descrição *" erro={errors.descricao?.message}>
              <input className={INPUT} placeholder={`ex.: ${padrao.descricao}`} maxLength={DESCRICAO_RECIBO_MAX} {...register("descricao")} data-campo-descricao-recibo />
            </Campo>
            <Campo rotulo="Valor (R$) *" erro={errors.valor?.message}>
              <input
                inputMode="decimal"
                className={INPUT}
                placeholder="ex.: 180,00"
                {...valorReg}
                onChange={(e) => {
                  e.target.value = limparValorDigitado(e.target.value);
                  void valorReg.onChange(e);
                }}
                onBlur={(e) => {
                  void valorReg.onBlur(e);
                  const n = parseValor(e.target.value);
                  if (n !== null && n > 0) setValue("valor", textoValor(n), { shouldValidate: true });
                }}
                data-campo-valor-recibo
              />
              <p className="mt-1 font-body text-[11.5px] text-texto-3" data-previa-valor-recibo={valorNum !== null && valorNum > 0 ? valorNum.toFixed(2) : ""}>
                {valorNum !== null && valorNum > 0 ? fmtBRL(valorNum) : "—"}
              </p>
            </Campo>
            <Campo rotulo="Data *" erro={errors.data?.message}>
              <input type="date" className={INPUT} {...register("data")} data-campo-data-recibo />
            </Campo>
          </div>

          <div>
            <p className="mb-1.5 font-body text-[12px] font-semibold text-texto-2">Prévia do recibo</p>
            <div
              className="max-h-[40vh] min-h-[120px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-linha-2 bg-[rgba(255,255,255,.03)] p-3.5 font-body text-[13px] leading-relaxed text-texto"
              data-previa-recibo
              data-tag-pendente={temTagPendente(previa) ? "1" : "0"}
            >
              {previa || <span className="text-texto-3">{pessoa ? "Escolha um modelo para ver o texto do recibo." : `Escolha o ${padrao.rotuloPaciente.toLowerCase()} para ver o texto do recibo.`}</span>}
            </div>
            {pessoa && (
              <p className="mt-1.5 font-body text-[11.5px] text-texto-3">
                {padrao.rotuloPaciente}: <span className="text-texto">{pessoa.nome}</span> · CPF: <span className="text-texto">{formatarCPF(pessoa.cpf)}</span>
                {!pessoa.cpf?.trim() && " — cadastre o CPF nos dados do aluno para ele sair no recibo."}
              </p>
            )}
          </div>

          {erroGeral && <p role="alert" className="font-body text-[12px] text-rosa-3" data-erro-recibo>{erroGeral}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-recibo>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting || !modelo || !pessoa} data-btn-salvar-recibo>
              <FileDown size={13} aria-hidden="true" /> {isSubmitting ? "Emitindo..." : "Emitir e baixar PDF"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
