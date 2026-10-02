// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/energetico/CalculoDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { dataValida, horaValida } from "@/nutricao/editor/lib/agendaUtil";
import type { Antropometria } from "@/nutricao/editor/lib/antropometrias";
import { SEXOS } from "@/nutricao/editor/lib/antropometriaUtil";
import { atualizarCalculo, criarCalculo, type CalculoEnergetico } from "@/nutricao/editor/lib/calculosEnergeticos";
import {
  DESCRICAO_MAX, FATORES_ATIVIDADE, FATOR_PADRAO, FORMULAS, FORMULA_PADRAO, OBJETIVOS, OBSERVACAO_MAX, atividadeVazia, atividadesDoForm,
  atividadesInvalidas, dadosDoForm, dadosFaltando, dicaObjetivo, ehFormula, ehObjetivo, ehSexo, fmtAjuste, fmtKcal, formNovo, formParaRegistro,
  gastoAtividade, numero, origemDosDados, previaDoForm, registroParaForm, requisitosDaFormula, rotuloFormula,
  type FormEnergetico, type Formula,
} from "@/nutricao/editor/lib/energeticoUtil";

// Modal do cálculo energético: data/hora, fórmula da TMB, dados do paciente (peso, altura, idade, sexo e massa magra
// já preenchidos pela última antropometria — ou pelo cadastro, sem ela), fator de atividade, atividades físicas em
// MET (linhas opcionais: descrição, MET, minutos por dia → kcal/dia), objetivo com ajuste em kcal, prévia de
// TMB / atividades / GET / VET enquanto digita e observações. Edição carrega o cálculo gravado.

const opcional = (max: number, msg: string) =>
  z.string().refine((v) => {
    if (!v || !v.trim()) return true;
    const n = numero(v);
    return n !== null && n > 0 && n < max;
  }, msg);

const schema = z.object({
  data: z.string().refine(dataValida, "Data inválida"),
  hora: z.string().refine(horaValida, "Hora inválida"),
  formula: z.enum(["mifflin", "harris_benedict_1919", "harris_benedict_1984", "fao_oms_1985", "cunningham", "tinsley"]),
  peso: opcional(1000, "Peso em kg (ex.: 72,5)"),
  altura: opcional(1000, "Altura em cm (ex.: 172)"),
  idade: z.string().refine((v) => {
    if (!v || !v.trim()) return true;
    const n = numero(v);
    return n !== null && Number.isInteger(n) && n >= 0 && n <= 130;
  }, "Idade inválida"),
  sexo: z.enum(["", "masculino", "feminino"]),
  massa_magra: opcional(1000, "Massa magra em kg"),
  fator_atividade: z.string().refine((v) => {
    const n = numero(v);
    return n !== null && n >= 1 && n <= 3;
  }, "Fator inválido"),
  atividades: z.array(
    z.object({
      descricao: z.string().max(DESCRICAO_MAX, "Descrição muito longa"),
      met: z.string(),
      minutos_por_dia: z.string(),
    }),
  ),
  ajuste_kcal: z.string().refine((v) => {
    if (!v || !v.trim()) return true;
    const n = numero(v);
    return n !== null && Math.abs(n) < 10000;
  }, "Ajuste em kcal/dia (ex.: -500)"),
  objetivo: z.enum(["manter", "emagrecer", "ganhar"]),
  observacao: z.string().max(OBSERVACAO_MAX, "Observação muito longa"),
});
type Valores = z.infer<typeof schema>;

// montado campo a campo: o tsconfig do repo não tem strictNullChecks e o zod infere tudo como opcional
const montarForm = (v: Partial<Valores>): FormEnergetico => ({
  data: v.data ?? "",
  hora: v.hora ?? "",
  formula: ehFormula(v.formula) ? v.formula : FORMULA_PADRAO,
  peso: v.peso ?? "",
  altura: v.altura ?? "",
  idade: v.idade ?? "",
  sexo: ehSexo(v.sexo) ? v.sexo : "",
  massa_magra: v.massa_magra ?? "",
  fator_atividade: v.fator_atividade ?? FATOR_PADRAO,
  atividades: (v.atividades ?? []).map((a) => ({ descricao: a?.descricao ?? "", met: a?.met ?? "", minutos_por_dia: a?.minutos_por_dia ?? "" })),
  ajuste_kcal: v.ajuste_kcal ?? "",
  objetivo: ehObjetivo(v.objetivo) ? v.objetivo : "manter",
  observacao: v.observacao ?? "",
});

const INPUT_MEDIDA = "h-9 w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[13.5px] text-texto outline-none placeholder:text-texto-4 focus:border-verde-3";
const LEGENDA = "mb-1 font-body text-[12px] font-semibold text-texto-2";
const ROTULO_MEDIDA = "text-[10px] text-texto-3 font-body";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  paciente: { id: string; genero: string | null; nascimento: string | null };
  /** última avaliação antropométrica do paciente (pré-preenche peso, altura, sexo e massa magra) */
  ultimaAntropometria: Antropometria | null;
  /** fórmula do último cálculo (o novo já nasce com ela) */
  formulaPadrao?: Formula;
  /** com cálculo = edição; sem = novo */
  calculo?: CalculoEnergetico | null;
  onSalvo: (c: CalculoEnergetico, modo: "criado" | "editado") => void;
}

function Previa({ rotulo, valor, sub, marca, bruto }: { rotulo: string; valor: string; sub?: string | null; marca: string; bruto: number | null }) {
  return (
    <div {...{ [`data-previa-${marca}`]: bruto ?? "" }}>
      <p className="text-[10px] uppercase tracking-wider text-texto-2 font-body">{rotulo}</p>
      <p className="text-lg font-semibold text-texto leading-tight">{valor}</p>
      {sub && <p className="text-[10px] text-texto-3 font-body">{sub}</p>}
    </div>
  );
}

export default function CalculoDialog({ open, onOpenChange, paciente, ultimaAntropometria, formulaPadrao = FORMULA_PADRAO, calculo, onSalvo }: Props) {
  const { user } = useAuth();
  const { id: pacienteId, genero, nascimento } = paciente;
  const editando = !!calculo;
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const origem = useMemo(() => origemDosDados({ genero, nascimento }, ultimaAntropometria), [genero, nascimento, ultimaAntropometria]);

  const { register, handleSubmit, reset, watch, control, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: formNovo(origem, formulaPadrao),
  });
  const { fields, append, remove } = useFieldArray({ control, name: "atividades" });

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    reset(calculo ? registroParaForm(calculo) : formNovo(origem, formulaPadrao));
  }, [open, calculo, origem, formulaPadrao, reset]);

  const form = montarForm(watch());
  const dados = dadosDoForm(form);
  const previa = previaDoForm(form);
  const faltam = dadosFaltando(form.formula, dados);
  const req = requisitosDaFormula(form.formula);
  const temAtividadeSemPeso = atividadesDoForm(form.atividades).length > 0 && (dados.peso === null || dados.peso <= 0);
  const ajusteN = numero(form.ajuste_kcal) ?? 0;

  const onSubmit = async (v: Valores) => {
    const f = montarForm(v);
    const d = dadosDoForm(f);
    const falta = dadosFaltando(f.formula, d);
    if (falta.length) {
      setErroGeral(`A fórmula ${rotuloFormula(f.formula)} precisa de: ${falta.join(", ")}`);
      return;
    }
    const ruins = atividadesInvalidas(f.atividades);
    if (ruins.length) {
      setErroGeral(`Complete descrição, MET (até 30) e minutos por dia (até 1440) da atividade ${ruins.join(", ")} — ou remova a linha`);
      return;
    }
    if (atividadesDoForm(f.atividades).length && (d.peso === null || d.peso <= 0)) {
      setErroGeral("Informe o peso pra calcular o gasto das atividades");
      return;
    }
    setErroGeral(null);
    const reg = formParaRegistro(f);
    try {
      if (calculo) {
        onSalvo(await atualizarCalculo(calculo.id, reg), "editado");
        toast.success("Cálculo atualizado");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        onSalvo(await criarCalculo(user.id, pacienteId, reg), "criado");
        toast.success("Cálculo salvo");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o cálculo");
    }
  };

  const textoOrigem = editando
    ? "Dados gravados neste cálculo — altere o que precisar."
    : origem.tipo === "antropometria"
      ? `Peso, altura, sexo e massa magra vieram da última antropometria${origem.data ? ` (${format(new Date(origem.data), "dd/MM/yyyy")})` : ""}; a idade, do nascimento no cadastro.`
      : "Sem antropometria registrada — idade e sexo vieram do cadastro; informe peso e altura (ou a massa magra).";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-modal-calculo={editando ? "editar" : "novo"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editando ? "Editar cálculo energético" : "Novo cálculo energético"}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            TMB pela fórmula escolhida; GET = TMB × fator de atividade + atividades em MET; VET = GET + ajuste do objetivo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Campo rotulo="Data" erro={errors.data?.message}>
              <input type="date" className={INPUT} {...register("data")} data-campo-data-calculo />
            </Campo>
            <Campo rotulo="Hora" erro={errors.hora?.message}>
              <input type="time" className={INPUT} {...register("hora")} data-campo-hora-calculo />
            </Campo>
            <div className="col-span-2">
              <Campo rotulo="Fórmula da TMB" erro={errors.formula?.message} dica={FORMULAS.find((f) => f.valor === form.formula)?.precisa}>
                <select className={SELECT} {...register("formula")} data-campo-formula>
                  {FORMULAS.map((f) => (
                    <option key={f.valor} value={f.valor}>{f.rotulo}</option>
                  ))}
                </select>
              </Campo>
            </div>
          </div>

          <fieldset className="space-y-2" data-dados-paciente>
            <legend className={LEGENDA}>Dados do aluno</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <Campo rotulo="Peso (kg)" erro={errors.peso?.message} dica={req.peso && dados.peso === null ? "a fórmula precisa do peso" : undefined}>
                <input inputMode="decimal" placeholder="ex.: 72,5" className={INPUT} {...register("peso")} data-campo-peso-calculo />
              </Campo>
              <Campo rotulo="Altura (cm)" erro={errors.altura?.message} dica={req.altura && dados.altura === null ? "a fórmula precisa da altura" : undefined}>
                <input inputMode="decimal" placeholder="ex.: 172" className={INPUT} {...register("altura")} data-campo-altura-calculo />
              </Campo>
              <Campo rotulo="Idade" erro={errors.idade?.message} dica={req.idade && dados.idade === null ? "a fórmula precisa da idade" : undefined}>
                <input inputMode="numeric" placeholder="anos" className={INPUT} {...register("idade")} data-campo-idade-calculo />
              </Campo>
              <Campo rotulo="Sexo" erro={errors.sexo?.message} dica={req.sexo && !dados.sexo ? "a fórmula precisa do sexo" : undefined}>
                <select className={SELECT} {...register("sexo")} data-campo-sexo-calculo>
                  <option value="">—</option>
                  {SEXOS.map((s) => (
                    <option key={s.valor} value={s.valor}>{s.rotulo}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Massa magra (kg)" erro={errors.massa_magra?.message} dica={req.massaMagra && dados.massaMagra === null ? "a fórmula precisa da massa magra" : undefined}>
                <input inputMode="decimal" placeholder="ex.: 62,4" className={INPUT} {...register("massa_magra")} data-campo-massa-magra />
              </Campo>
            </div>
            <p className="text-[11px] text-texto-3 font-body" data-origem={editando ? "calculo" : origem.tipo}>{textoOrigem}</p>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr] gap-3">
            <Campo rotulo="Fator de atividade" erro={errors.fator_atividade?.message}>
              <select className={SELECT} {...register("fator_atividade")} data-campo-fator>
                {FATORES_ATIVIDADE.map((f) => (
                  <option key={f.valor} value={f.valor}>{f.rotulo}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Objetivo" erro={errors.objetivo?.message} dica={dicaObjetivo(form.objetivo)}>
              <select className={SELECT} {...register("objetivo")} data-campo-objetivo>
                {OBJETIVOS.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Ajuste (kcal/dia)" erro={errors.ajuste_kcal?.message} dica="negativo = déficit · positivo = superávit">
              <input inputMode="numeric" placeholder="ex.: -500" className={INPUT} {...register("ajuste_kcal")} data-campo-ajuste />
            </Campo>
          </div>

          <fieldset className="space-y-2" data-atividades data-atividades-total={fields.length}>
            <legend className={LEGENDA}>
              Atividades físicas (MET)
              <span className="normal-case tracking-normal text-texto-3"> — opcional; gasto = MET × peso × horas por dia</span>
            </legend>
            {fields.length === 0 && <p className="text-xs text-texto-3 font-body">Nenhuma atividade — o GET usa só o fator de atividade.</p>}
            {fields.map((campo, i) => {
              const a = form.atividades[i];
              const met = numero(a?.met);
              const min = numero(a?.minutos_por_dia);
              const kcal = dados.peso !== null && dados.peso > 0 && met !== null && met > 0 && min !== null && min > 0 ? gastoAtividade({ met, minutos_por_dia: min }, dados.peso) : null;
              return (
                <div key={campo.id} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-x-3 gap-y-1 items-end" data-atividade={i} data-atividade-kcal={kcal ?? ""}>
                  <label className="block col-span-2 sm:col-span-1">
                    <span className={ROTULO_MEDIDA}>Descrição</span>
                    <input className={INPUT_MEDIDA} placeholder="ex.: caminhada" maxLength={DESCRICAO_MAX} {...register(`atividades.${i}.descricao` as const)} data-campo-atividade-descricao={i} />
                  </label>
                  <label className="block">
                    <span className={ROTULO_MEDIDA}>MET</span>
                    <input inputMode="decimal" placeholder="ex.: 3,5" className={INPUT_MEDIDA} {...register(`atividades.${i}.met` as const)} data-campo-atividade-met={i} />
                  </label>
                  <label className="block">
                    <span className={ROTULO_MEDIDA}>Min/dia</span>
                    <input inputMode="numeric" placeholder="ex.: 30" className={INPUT_MEDIDA} {...register(`atividades.${i}.minutos_por_dia` as const)} data-campo-atividade-minutos={i} />
                  </label>
                  <div className="text-sm font-body text-texto-2 pb-1.5">
                    <span className={`${ROTULO_MEDIDA} block`}>kcal/dia</span>
                    {kcal === null ? "—" : fmtKcal(kcal)}
                  </div>
                  <button type="button" className={BTN_MINI_PERIGO} onClick={() => remove(i)} aria-label="Remover atividade" title="Remover atividade" data-btn-remover-atividade={i}>
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
            <button type="button" className={BTN_SEC} onClick={() => append(atividadeVazia())} data-btn-add-atividade>
              <Plus size={12} /> Adicionar atividade
            </button>
            {temAtividadeSemPeso && <p className="text-xs text-rosa-3 font-body" role="alert">Informe o peso pra calcular o gasto das atividades.</p>}
          </fieldset>

          <div className="border border-linha-2 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center" data-previa>
            <Previa rotulo="TMB" valor={fmtKcal(previa.tmb)} sub={faltam.length ? `faltam: ${faltam.join(", ")}` : rotuloFormula(form.formula)} marca="tmb" bruto={previa.tmb} />
            <Previa rotulo="Atividades" valor={previa.extra === null ? "—" : `+${fmtKcal(previa.extra)}`} sub="kcal/dia extras" marca="extra" bruto={previa.extra} />
            <Previa rotulo="GET" valor={fmtKcal(previa.get)} sub="TMB × fator + atividades" marca="get" bruto={previa.get} />
            <Previa rotulo="VET" valor={fmtKcal(previa.vet)} sub={ajusteN ? `ajuste ${fmtAjuste(ajusteN)} kcal` : "sem ajuste"} marca="vet" bruto={previa.vet} />
          </div>

          <Campo rotulo="Observações" erro={errors.observacao?.message}>
            <textarea className={TEXTAREA} rows={2} maxLength={OBSERVACAO_MAX} {...register("observacao")} data-campo-observacao-calculo />
          </Campo>

          {erroGeral && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-calculo>{erroGeral}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-calculo>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-calculo>{isSubmitting ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
