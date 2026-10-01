import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { atualizarAlimento, criarAlimento, type Alimento } from "@/nutricao/editor/lib/alimentos";
import {
  DESCRICAO_MAX, DIVERGENCIA_ALERTA_PCT, FORM_VAZIO, GRUPOS_TACO, GRUPO_MAX, LIMITE_MACRO, LIMITE_NUTRIENTE, MARCA_MAX, MEDIDAS_MAX, NOME_MAX, NUTRIENTES,
  PORCAO_PADRAO_G, baseDosValores, divergenciaKcal, excessosNaConversao, fmtQtd, formParaRegistro, kcalAtwater, macrosDoForm, medidaVazia, medidasDoForm,
  medidasInvalidas, numero, porGramas, porcaoValida, registroParaForm, totalNutrientesPreenchidos, type FormAlimento,
} from "@/nutricao/editor/lib/alimentosUtil";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";

// Physiq W24 — porta do PhysiqNutri (294887a, src/components/alimentos/AlimentoDialog.tsx, com a H1) no visual premium: o alimento
// PRÓPRIO — nome, marca (vira a etiqueta), grupo (sugestões da TACO e dos já usados), porção de referência, kcal e macros, "Demais
// nutrientes" (abre ao tocar; só o preenchido vai pro jsonb), medidas caseiras (descrição + gramas → kcal da medida) e a conferência
// (kcal estimada pelos fatores de Atwater 4/4/9 × a informada). A TACO não passa por aqui.
// H1 (regra do Weslley, 30/09): com a porção de referência preenchida (≠ 100 g) os campos são os valores do RÓTULO para a porção e o
// banco recebe SEMPRE o equivalente em 100 g (× 100 / N em todos os nutrientes; o que é % não escala); ao editar, o gravado volta pra
// porção (÷); sem porção = por 100 g; salvar sem mexer não muda o gravado (sem deriva de arredondamento — formParaRegistro com o
// registro gravado). Ex.: 127 kcal em 26 g → 488,46 kcal/100 g.

const opcional = (max: number, msg: string) =>
  z.string().refine((v) => {
    if (!v || !v.trim()) return true;
    const n = numero(v);
    return n !== null && n >= 0 && n < max;
  }, msg);

const schema = z
  .object({
    nome: z.string().refine((v) => v.trim().length >= 2, "Informe o nome do alimento").refine((v) => v.trim().length <= NOME_MAX, "Nome muito longo"),
    marca: z.string().max(MARCA_MAX, "Marca muito longa"),
    grupo: z.string().max(GRUPO_MAX, "Grupo muito longo"),
    porcao_g: z.string().refine((v) => !v || !v.trim() || porcaoValida(v) !== null, "Porção em gramas (ex.: 26)"),
    energia_kcal: opcional(LIMITE_MACRO.energia_kcal, "kcal, maior ou igual a zero (ex.: 124)"),
    proteina_g: opcional(LIMITE_MACRO.proteina_g, "gramas, maior ou igual a zero (ex.: 2,6)"),
    carboidrato_g: opcional(LIMITE_MACRO.carboidrato_g, "gramas, maior ou igual a zero (ex.: 25,8)"),
    lipidio_g: opcional(LIMITE_MACRO.lipidio_g, "gramas, maior ou igual a zero (ex.: 1)"),
    fibra_g: opcional(LIMITE_MACRO.fibra_g, "gramas, maior ou igual a zero (ex.: 2,7)"),
    sodio_mg: opcional(LIMITE_MACRO.sodio_mg, "miligramas, maior ou igual a zero (ex.: 480)"),
    nutrientes: z.record(z.string(), opcional(LIMITE_NUTRIENTE, "valor maior ou igual a zero (ex.: 1,5)")),
    medidas: z.array(z.object({ descricao: z.string().max(DESCRICAO_MAX, "Descrição muito longa"), gramas: z.string() })),
  })
  .superRefine((v, ctx) => {
    // porção muito pequena pro valor digitado: o equivalente em 100 g passaria do teto do campo (e da coluna do banco)
    const base = baseDosValores(v.porcao_g);
    for (const e of excessosNaConversao(montarForm(v))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: e.caminho.split("."), message: `Alto demais para ${fmtQtd(base)} g: daria ${fmtQtd(e.por100)} em 100 g` });
    }
  });
type Valores = z.infer<typeof schema>;

// montado campo a campo: o zod infere tudo como opcional
const montarForm = (v: Partial<Valores>): FormAlimento => ({
  nome: v.nome ?? "",
  marca: v.marca ?? "",
  grupo: v.grupo ?? "",
  porcao_g: v.porcao_g ?? "",
  energia_kcal: v.energia_kcal ?? "",
  proteina_g: v.proteina_g ?? "",
  carboidrato_g: v.carboidrato_g ?? "",
  lipidio_g: v.lipidio_g ?? "",
  fibra_g: v.fibra_g ?? "",
  sodio_mg: v.sodio_mg ?? "",
  nutrientes: Object.fromEntries(Object.entries(v.nutrientes ?? {}).map(([chave, valor]) => [chave, valor ?? ""])),
  medidas: (v.medidas ?? []).map((m) => ({ descricao: m?.descricao ?? "", gramas: m?.gramas ?? "" })),
});

const LEGENDA = "mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-3";
const ROTULO_MEDIDA = "mb-1 block text-[11px] font-semibold text-texto-3";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** com alimento = edição; sem = novo */
  alimento?: Alimento | null;
  /** quem cria (o alimento novo é dele) */
  uid: string;
  /** grupos já existentes (viram sugestões junto dos grupos da TACO) */
  grupos?: string[];
  onSalvo: (a: Alimento, modo: "criado" | "editado") => void;
}

function Previa({ rotulo, valor, sub, marca, bruto }: { rotulo: string; valor: string; sub?: string | null; marca: string; bruto: number | null }) {
  return (
    <div className="rounded-[14px] border border-linha bg-superficie px-3 py-2.5 text-center" {...{ [`data-previa-${marca}`]: bruto ?? "" }}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-texto-3">{rotulo}</p>
      <p className="mt-0.5 text-[18px] font-bold tabular-nums tracking-[-0.02em] text-texto">{valor}</p>
      {sub && <p className="text-[11px] text-texto-3">{sub}</p>}
    </div>
  );
}

export default function AlimentoDialog({ open, onOpenChange, alimento, uid, grupos = [], onSalvo }: Props) {
  const editando = !!alimento;
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [mostrarNutrientes, setMostrarNutrientes] = useState(false);

  const { register, handleSubmit, reset, watch, control, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: FORM_VAZIO,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "medidas" });

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    // edição: os valores gravados (por 100 g) voltam NA PORÇÃO de referência do alimento
    const inicial = alimento ? registroParaForm(alimento) : FORM_VAZIO;
    reset(inicial);
    // edição de alimento que já tem "demais nutrientes" gravados abre a seção; cadastro novo nasce fechado
    setMostrarNutrientes(Object.keys(inicial.nutrientes).length > 0);
  }, [open, alimento, reset]);

  const form = montarForm(watch());
  // base dos valores digitados: a porção de referência (rótulo "por porção") ou 100 g
  const base = baseDosValores(form.porcao_g);
  const naPorcao = base !== PORCAO_PADRAO_G;
  const macros = macrosDoForm(form);
  const estimada = kcalAtwater(macros.proteina_g, macros.carboidrato_g, macros.lipidio_g);
  const divergencia = divergenciaKcal(macros.energia_kcal, estimada);
  // o que vai pro banco (sempre por 100 g) — a prévia e as medidas caseiras usam isto
  const gravar = formParaRegistro(form, alimento);
  const porcaoGravada = alimento ? Number(alimento.porcao_g) : null;
  const porcaoMudou = porcaoGravada !== null && Number.isFinite(porcaoGravada) && porcaoGravada !== base;
  const sugestoes = Array.from(new Set([...grupos, ...GRUPOS_TACO])).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const preenchidos = totalNutrientesPreenchidos(form.nutrientes);
  const errosNutrientes = errors.nutrientes as unknown as Record<string, { message?: string } | undefined> | undefined;
  const textoBase = `${fmtQtd(base)} g`;

  const onSubmit = async (v: Valores) => {
    const f = montarForm(v);
    const ruins = medidasInvalidas(f.medidas);
    if (ruins.length) {
      setErroGeral(`Complete descrição e gramas (maior que zero) da medida caseira ${ruins.join(", ")} — ou remova a linha`);
      return;
    }
    setErroGeral(null);
    // na porção → grava o equivalente em 100 g; o que não mudou na edição volta exatamente como estava
    const reg = formParaRegistro(f, alimento);
    const medidas = medidasDoForm(f.medidas);
    try {
      if (alimento) {
        onSalvo(await atualizarAlimento(alimento.id, reg, medidas), "editado");
        toast.success("Alimento atualizado");
      } else {
        if (!uid) throw new Error("Sua sessão terminou. Entre de novo.");
        onSalvo(await criarAlimento(uid, reg, medidas), "criado");
        toast.success("Alimento cadastrado");
      }
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(/row-level security|violates/i.test(m) ? "Só a nutricionista da conta cadastra e muda alimentos." : m || "Não foi possível salvar o alimento");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${JANELA} max-h-[90vh] overflow-y-auto sm:max-w-3xl`} data-modal-alimento={editando ? "editar" : "novo"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editando ? "Editar alimento" : "Novo alimento"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            Digite os valores como estão no rótulo: por 100 g ou pela porção de referência — o Physiq guarda sempre o equivalente em 100 g. A marca vira a etiqueta do alimento na lista. As medidas caseiras convertem a medida em gramas para usar no plano.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome do alimento" erro={errors.nome?.message}>
              <input className={INPUT} placeholder="ex.: Pão caseiro de aveia" maxLength={NOME_MAX} {...register("nome")} data-campo-nome-alimento />
            </Campo>
            <Campo rotulo="Marca" erro={errors.marca?.message} dica="opcional — aparece na etiqueta do alimento">
              <input className={INPUT} placeholder="ex.: Italac" maxLength={MARCA_MAX} {...register("marca")} data-campo-marca-alimento />
            </Campo>
            <Campo rotulo="Grupo" erro={errors.grupo?.message} dica="opcional — escolha um da lista ou escreva o seu">
              <input className={INPUT} list="grupos-alimentos-painel" placeholder="ex.: Cereais e derivados" maxLength={GRUPO_MAX} {...register("grupo")} data-campo-grupo-alimento />
              <datalist id="grupos-alimentos-painel">
                {sugestoes.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Campo>
            <Campo rotulo="Porção de referência (g)" erro={errors.porcao_g?.message} dica="a do rótulo — os valores abaixo valem para ela">
              <input inputMode="decimal" placeholder="100" className={INPUT} {...register("porcao_g")} data-campo-porcao />
            </Campo>
          </div>

          <fieldset className="flex flex-col gap-2" data-valores data-valores-base={base}>
            <legend className={LEGENDA} data-legenda-valores>{naPorcao ? `Valores por porção (${textoBase})` : "Valores por 100 g"}</legend>
            <p className="text-[12.5px] text-texto-2" data-explica-base={naPorcao ? "porcao" : "100g"}>
              {naPorcao ? (
                <>Digite os valores do rótulo para <b className="font-semibold text-texto">{textoBase}</b> — o Physiq guarda o equivalente em 100 g.</>
              ) : (
                <>Como no rótulo, por 100 g. Se o rótulo traz os valores por porção, preencha a porção de referência acima e digite os da porção.</>
              )}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              <Campo rotulo="Energia (kcal)" erro={errors.energia_kcal?.message}>
                <input inputMode="decimal" placeholder="ex.: 124" className={INPUT} {...register("energia_kcal")} data-campo-kcal />
              </Campo>
              <Campo rotulo="Proteína (g)" erro={errors.proteina_g?.message}>
                <input inputMode="decimal" placeholder="ex.: 2,6" className={INPUT} {...register("proteina_g")} data-campo-proteina />
              </Campo>
              <Campo rotulo="Carboidrato (g)" erro={errors.carboidrato_g?.message}>
                <input inputMode="decimal" placeholder="ex.: 25,8" className={INPUT} {...register("carboidrato_g")} data-campo-carboidrato />
              </Campo>
              <Campo rotulo="Lipídios (g)" erro={errors.lipidio_g?.message}>
                <input inputMode="decimal" placeholder="ex.: 1" className={INPUT} {...register("lipidio_g")} data-campo-lipidio />
              </Campo>
              <Campo rotulo="Fibra (g)" erro={errors.fibra_g?.message}>
                <input inputMode="decimal" placeholder="ex.: 2,7" className={INPUT} {...register("fibra_g")} data-campo-fibra />
              </Campo>
              <Campo rotulo="Sódio (mg)" erro={errors.sodio_mg?.message}>
                <input inputMode="decimal" placeholder="ex.: 1" className={INPUT} {...register("sodio_mg")} data-campo-sodio />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2" data-nutrientes-extra={mostrarNutrientes ? "1" : "0"} data-nutrientes-preenchidos={preenchidos}>
            <div>
              <button type="button" className={BTN_SEC} onClick={() => setMostrarNutrientes((v) => !v)} aria-expanded={mostrarNutrientes} data-demais-nutrientes>
                {mostrarNutrientes ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />} Demais nutrientes{preenchidos ? ` (${preenchidos})` : ""}
              </button>
            </div>
            {mostrarNutrientes && (
              <>
                <p className="text-[12px] text-texto-3">
                  {naPorcao
                    ? `Opcional — na porção (${textoBase}), como no rótulo; a umidade (%) não muda com a porção. Só o que você preencher é gravado.`
                    : "Opcional — por 100 g, como no rótulo. Só o que você preencher é gravado."}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" data-lista-nutrientes>
                  {NUTRIENTES.map((n) => (
                    <Campo key={n.chave} rotulo={`${n.rotulo} (${n.unidade})`} erro={errosNutrientes?.[n.chave]?.message}>
                      <input inputMode="decimal" placeholder="—" className={INPUT} {...register(`nutrientes.${n.chave}`)} data-campo-nutriente={n.chave} />
                    </Campo>
                  ))}
                </div>
              </>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2" data-medidas data-medidas-total={fields.length}>
            <legend className={LEGENDA}>
              Medidas caseiras <span className="font-normal normal-case tracking-normal text-texto-4">— opcional; "1 colher de sopa cheia" = quantos gramas?</span>
            </legend>
            {fields.length === 0 && <p className="text-[12px] text-texto-3">Nenhuma medida — o alimento é usado só em gramas.</p>}
            {fields.map((campo, i) => {
              const m = form.medidas[i];
              const g = numero(m?.gramas);
              // a medida sai do valor por 100 g (o que fica gravado), não do digitado na porção
              const kcal = g !== null && g > 0 ? porGramas(gravar.energia_kcal, g) : null;
              return (
                <div key={campo.id} className="grid grid-cols-2 items-end gap-x-3 gap-y-1 sm:grid-cols-[2fr_1fr_1fr_auto]" data-medida={i} data-medida-kcal={kcal ?? ""}>
                  <label className="col-span-2 block sm:col-span-1">
                    <span className={ROTULO_MEDIDA}>Descrição</span>
                    <input className={INPUT} placeholder="ex.: 1 colher de sopa cheia" maxLength={DESCRICAO_MAX} {...register(`medidas.${i}.descricao` as const)} data-campo-medida-descricao={i} />
                  </label>
                  <label className="block">
                    <span className={ROTULO_MEDIDA}>Gramas</span>
                    <input inputMode="decimal" placeholder="ex.: 25" className={INPUT} {...register(`medidas.${i}.gramas` as const)} data-campo-medida-gramas={i} />
                  </label>
                  <div className="pb-2.5 text-[13px] tabular-nums text-texto-2">
                    <span className={ROTULO_MEDIDA}>kcal na medida</span>
                    {kcal === null ? "—" : fmtQtd(kcal)}
                  </div>
                  <button type="button" className="pq-ibtn mb-0.5 !text-rosa-3" style={{ width: 36, height: 36, borderRadius: 12 }} onClick={() => remove(i)} aria-label="Remover medida" title="Remover medida" data-btn-remover-medida={i}>
                    <Trash2 aria-hidden />
                  </button>
                </div>
              );
            })}
            <div>
              <button type="button" className={BTN_SEC} onClick={() => append(medidaVazia())} disabled={fields.length >= MEDIDAS_MAX} data-btn-add-medida>
                <Plus aria-hidden /> Adicionar medida caseira
              </button>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-previa data-previa-base={base}>
            <Previa rotulo="kcal informada" valor={fmtQtd(macros.energia_kcal)} sub={naPorcao ? `na porção (${textoBase})` : "por 100 g"} marca="kcal" bruto={macros.energia_kcal} />
            <Previa rotulo="kcal estimada" valor={fmtQtd(estimada)} sub="4 × P + 4 × C + 9 × L" marca="kcal-estimada" bruto={estimada} />
            <Previa
              rotulo="Diferença"
              valor={divergencia === null ? "—" : `${divergencia > 0 ? "+" : ""}${fmtQtd(divergencia)}%`}
              sub={divergencia !== null && Math.abs(divergencia) > DIVERGENCIA_ALERTA_PCT ? "confira os valores" : "informada × estimada"}
              marca="divergencia"
              bruto={divergencia}
            />
            <Previa
              rotulo="Em 100 g (gravado)"
              valor={fmtQtd(gravar.energia_kcal)}
              sub={gravar.proteina_g !== null || gravar.carboidrato_g !== null || gravar.lipidio_g !== null
                ? `P ${fmtQtd(gravar.proteina_g)} · C ${fmtQtd(gravar.carboidrato_g)} · L ${fmtQtd(gravar.lipidio_g)} g`
                : "kcal"}
              marca="100g"
              bruto={gravar.energia_kcal}
            />
          </div>
          {porcaoMudou && (
            <p className="text-[12px] text-ambar-3" role="status" data-aviso-porcao-mudou>
              A porção mudou de {fmtQtd(porcaoGravada)} g para {textoBase}: os valores digitados passam a valer para {textoBase} e o equivalente em 100 g muda junto — confira na prévia.
            </p>
          )}
          {divergencia !== null && Math.abs(divergencia) > DIVERGENCIA_ALERTA_PCT && (
            <p className="text-[12px] text-texto-3" role="status" data-aviso-divergencia>
              A kcal informada destoa mais de {DIVERGENCIA_ALERTA_PCT}% da estimada pelos macros — dá para salvar assim mesmo, mas confira os valores.
            </p>
          )}

          {erroGeral && <p role="alert" className="text-[12px] text-rosa-3" data-erro-alimento>{erroGeral}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-alimento>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-alimento>{isSubmitting ? "Salvando…" : "Salvar"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
