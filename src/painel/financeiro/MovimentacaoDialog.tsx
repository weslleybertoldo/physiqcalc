// Physiq W19 — "Nova movimentação" / "Editar movimentação" (N-19): porta do PhysiqNutri (main ca9f66f,
// src/components/financeiro/MovimentacaoDialog.tsx) no visual premium. Tipo entrada/saída, valor em BRL com prévia ("150", "150,00",
// "1.234,56"), data, categoria (com o atalho para gerenciar), forma, aluno opcional (busca por nome) e observação. Grava na conta ativa.
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Check, ChevronsUpDown, Tags } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { dataValida } from "@/nutricao/editor/lib/agendaUtil";
import { BTN_LINK, BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, SELECT, TEXTAREA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { atualizarTransacao, criarTransacao, type AlunoResumido, type CategoriaFinanceira, type Transacao } from "./dados";
import {
  DESCRICAO_MAX, METODOS, OBSERVACAO_MAX, TIPOS, ehMetodo, ehTipo, fmtBRL, formParaRegistro, formVazio, limparValorDigitado, parseValor, registroParaForm,
  textoValor, valorValido, type FormMovimentacao,
} from "./financeiroUtil";

const schema = z.object({
  tipo: z.string().refine(ehTipo, "Tipo inválido"),
  descricao: z.string().refine((v) => v.trim().length >= 2, "Informe a descrição").refine((v) => v.trim().length <= DESCRICAO_MAX, "Descrição muito longa"),
  valor: z.string().refine(valorValido, "Informe um valor maior que zero (ex.: 150,00)"),
  data: z.string().refine(dataValida, "Data inválida"),
  categoriaId: z.string(),
  metodo: z.string().refine(ehMetodo, "Forma inválida"),
  pacienteId: z.string().nullable(),
  observacao: z.string().max(OBSERVACAO_MAX, "Observação muito longa"),
});
type Valores = z.infer<typeof schema>;

// montado campo a campo: o tsconfig do repo não tem strictNullChecks e o zod infere tudo como opcional
const montarForm = (v: Partial<Valores>): FormMovimentacao => ({
  tipo: ehTipo(v.tipo) ? v.tipo : "entrada",
  descricao: v.descricao ?? "",
  valor: v.valor ?? "",
  data: v.data ?? "",
  categoriaId: v.categoriaId ?? "",
  metodo: ehMetodo(v.metodo) ? v.metodo : "pix",
  pacienteId: v.pacienteId ?? null,
  observacao: v.observacao ?? "",
});

const TIPO_BTN = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border font-body text-[13px] font-semibold transition-colors";
const TIPO_INATIVO = "border-linha-2 bg-[rgba(255,255,255,.03)] text-texto-3 hover:text-texto";
const TIPO_ENTRADA = "border-verde/50 bg-[rgba(16,185,129,.12)] text-verde-3";
const TIPO_SAIDA = "border-[rgba(244,63,94,.45)] bg-[rgba(244,63,94,.1)] text-rosa-3";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** com transação = edição; sem = nova */
  transacao?: Transacao | null;
  uid: string;
  contaId: string;
  categorias: CategoriaFinanceira[];
  alunos: AlunoResumido[];
  onSalvo: (t: Transacao, modo: "criado" | "editado") => void;
  onGerenciarCategorias: () => void;
}

export default function MovimentacaoDialog({ open, onOpenChange, transacao, uid, contaId, categorias, alunos, onSalvo, onGerenciarCategorias }: Props) {
  const editando = !!transacao;
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: formVazio(),
  });

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    setBuscaAberta(false);
    reset(transacao ? registroParaForm(transacao) : formVazio());
  }, [open, transacao, reset]);

  const v = montarForm(watch());
  const valorNum = parseValor(v.valor);
  const alunoAtual = alunos.find((p) => p.id === v.pacienteId) ?? null;
  // aluno da movimentação editada que não está mais na lista (inativo/excluído): mostra o nome gravado
  const nomeAlunoFora = !alunoAtual && v.pacienteId && transacao?.paciente_id === v.pacienteId ? transacao?.paciente?.nome ?? null : null;
  const categoriaFora = transacao?.categoria_id && !categorias.some((c) => c.id === transacao.categoria_id) ? transacao : null;
  const valorReg = register("valor");

  const escolherAluno = (p: AlunoResumido | null) => {
    setValue("pacienteId", p?.id ?? null, { shouldDirty: true });
    setBuscaAberta(false);
  };

  const onSubmit = async (valores: Valores) => {
    setErroGeral(null);
    try {
      const reg = formParaRegistro(montarForm(valores));
      if (transacao) {
        onSalvo(await atualizarTransacao(transacao.id, reg), "editado");
        toast.success("Movimentação atualizada");
      } else {
        onSalvo(await criarTransacao(uid, contaId, reg), "criado");
        toast.success(reg.tipo === "entrada" ? "Entrada registrada" : "Saída registrada");
      }
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar a movimentação";
      setErroGeral(msg);
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "max-h-[92vh] overflow-y-auto sm:max-w-2xl")} data-modal-movimentacao={editando ? "editar" : "novo"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editando ? "Editar movimentação" : "Nova movimentação"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            {editando
              ? "Mude o que precisar — estornar é uma ação à parte, na lista."
              : "Entrada ou saída do seu trabalho. O aluno é opcional — com aluno, a entrada pode virar recibo."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-movimentacao>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo" data-campo-tipo={v.tipo}>
            {TIPOS.map((t) => {
              const ativo = v.tipo === t.valor;
              return (
                <button
                  key={t.valor}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => setValue("tipo", t.valor, { shouldDirty: true })}
                  className={cn(TIPO_BTN, ativo ? (t.valor === "entrada" ? TIPO_ENTRADA : TIPO_SAIDA) : TIPO_INATIVO)}
                  data-tipo-btn={t.valor}
                >
                  {t.valor === "entrada" ? <ArrowUpCircle size={15} aria-hidden="true" /> : <ArrowDownCircle size={15} aria-hidden="true" />} {t.rotulo}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <Campo rotulo="Descrição *" erro={errors.descricao?.message}>
              <input className={INPUT} placeholder="ex.: Consulta de retorno" maxLength={DESCRICAO_MAX} {...register("descricao")} data-campo-descricao />
            </Campo>
            <Campo rotulo="Valor (R$) *" erro={errors.valor?.message}>
              <input
                inputMode="decimal"
                className={INPUT}
                placeholder="ex.: 150,00"
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
                data-campo-valor
              />
              <p className="mt-1 font-body text-[11.5px] text-texto-3" data-previa-valor={valorNum !== null && valorNum > 0 ? valorNum.toFixed(2) : ""}>
                {valorNum !== null && valorNum > 0 ? fmtBRL(valorNum) : "—"}
              </p>
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo rotulo="Data *" erro={errors.data?.message}>
              <input type="date" className={INPUT} {...register("data")} data-campo-data-transacao />
            </Campo>
            <Campo rotulo="Categoria" erro={errors.categoriaId?.message}>
              <select className={SELECT} {...register("categoriaId")} data-campo-categoria>
                <option value="">Sem categoria</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
                {categoriaFora?.categoria_id && (
                  <option value={categoriaFora.categoria_id}>
                    {categoriaFora.categoria?.nome ?? "categoria"} {categoriaFora.nutricionista_id === uid ? "(excluída)" : "(de quem lançou)"}
                  </option>
                )}
              </select>
              <button type="button" className={`${BTN_LINK} mt-2`} onClick={onGerenciarCategorias} data-btn-gerenciar-categorias>
                <Tags size={12} aria-hidden="true" /> gerenciar categorias
              </button>
            </Campo>
            <Campo rotulo="Forma *" erro={errors.metodo?.message}>
              <select className={SELECT} {...register("metodo")} data-campo-metodo>
                {METODOS.map((m) => (
                  <option key={m.valor} value={m.valor}>{m.rotulo}</option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo rotulo="Aluno" erro={errors.pacienteId?.message} dica="opcional — liga a movimentação ao aluno (a entrada pode virar recibo)">
            <Popover open={buscaAberta} onOpenChange={setBuscaAberta}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={buscaAberta}
                  className={cn(SELECT, "flex items-center justify-between text-left")}
                  data-campo-paciente={v.pacienteId ?? "nenhum"}
                >
                  <span className={cn("truncate", !alunoAtual && !nomeAlunoFora && "text-texto-4")}>
                    {alunoAtual ? alunoAtual.nome : nomeAlunoFora ?? (v.pacienteId ? "Aluno selecionado" : "Sem aluno")}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] border-linha-2 bg-tela p-0 font-body text-texto" align="start">
                <Command>
                  <CommandInput placeholder="Buscar aluno…" data-busca-paciente />
                  <CommandList className="max-h-56">
                    <CommandEmpty>Nenhum aluno com esse nome.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="__nenhum__ sem aluno" onSelect={() => escolherAluno(null)} data-opcao-paciente="nenhum">
                        <Check className={cn("mr-2 h-4 w-4", v.pacienteId ? "opacity-0" : "opacity-100")} aria-hidden="true" />
                        Sem aluno
                      </CommandItem>
                      {alunos.map((p) => (
                        <CommandItem key={p.id} value={`${p.nome} ${p.apelido ?? ""} ${p.id}`} onSelect={() => escolherAluno(p)} data-opcao-paciente={p.id}>
                          <Check className={cn("mr-2 h-4 w-4", v.pacienteId === p.id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                          <span className="truncate">{p.nome}</span>
                          {p.apelido && <span className="ml-2 truncate text-xs text-texto-3">{p.apelido}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Campo>

          <Campo rotulo="Observação" erro={errors.observacao?.message}>
            <textarea className={TEXTAREA} rows={2} placeholder="Opcional" maxLength={OBSERVACAO_MAX} {...register("observacao")} data-campo-observacao-transacao />
          </Campo>

          {erroGeral && <p role="alert" className="font-body text-[12px] text-rosa-3" data-erro-movimentacao>{erroGeral}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-movimentacao>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-movimentacao>
              {isSubmitting ? "Salvando..." : editando ? "Salvar" : "Registrar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
