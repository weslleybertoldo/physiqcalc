// Physiq W17 — porta do PhysiqNutri (main ca9f66f, src/components/antropometria/AntropometriaDialog.tsx) para o banco principal (Perfil do
// aluno › Avaliação › Antropometria): os imports e as classes do visual premium mudaram; os campos, as contas e a validação são os do site antigo.
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, SELECT, TEXTAREA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { dataValida, horaValida } from "@/nutricao/editor/lib/agendaUtil";
import { atualizarAntropometria, criarAntropometria, type Antropometria } from "@/nutricao/editor/lib/antropometrias";
import {
  CIRCUNFERENCIAS, OBSERVACAO_MAX, PROTOCOLOS, SEXOS, chavesDobrasDoForm, dobrasFaltando, ehProtocolo, ehSexo, fmtNum, formNovo,
  formParaRegistro, numero, previaDoForm, protocoloPrecisaIdade, protocoloPrecisaSexo, registroParaForm, rotuloDobra,
  type FormAntropometria, type Protocolo,
} from "@/nutricao/editor/lib/antropometriaUtil";

// Modal da avaliação antropométrica: data/hora, peso, altura, sexo (vem do gênero do cadastro), idade (calculada do
// nascimento, editável), protocolo de % de gordura (mostra só as dobras que ele usa), circunferências em cm, dobras
// em mm, prévia dos resultados enquanto digita e observações. Edição carrega a avaliação gravada.

const medida = (max: number, msg: string) =>
  z.string().refine((v) => {
    if (!v || !v.trim()) return true;
    const n = numero(v);
    return n !== null && n > 0 && n < max;
  }, msg);

const schema = z.object({
  data: z.string().refine(dataValida, "Data inválida"),
  hora: z.string().refine(horaValida, "Hora inválida"),
  peso: z.string().refine((v) => {
    const n = numero(v);
    return n !== null && n > 0 && n < 1000;
  }, "Informe o peso em kg"),
  altura: medida(1000, "Altura em cm (ex.: 172)"),
  sexo: z.enum(["", "masculino", "feminino"]),
  idade: z.string().refine((v) => {
    if (!v || !v.trim()) return true;
    const n = numero(v);
    return n !== null && Number.isInteger(n) && n >= 0 && n <= 130;
  }, "Idade inválida"),
  protocolo: z.enum(["nenhum", "pollock3", "pollock7", "faulkner", "guedes"]),
  circunferencias: z.record(medida(1000, "Medida em cm")),
  dobras: z.record(medida(200, "Dobra em mm")),
  observacao: z.string().max(OBSERVACAO_MAX, "Observação muito longa"),
});
type Valores = z.infer<typeof schema>;

const limpar = (m: Record<string, string | undefined> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(m ?? {}).map(([k, x]) => [k, x ?? ""]));

// montado campo a campo: o tsconfig do repo não tem strictNullChecks e o zod infere tudo como opcional
const montarForm = (v: Partial<Valores>): FormAntropometria => ({
  data: v.data ?? "",
  hora: v.hora ?? "",
  peso: v.peso ?? "",
  altura: v.altura ?? "",
  sexo: ehSexo(v.sexo) ? v.sexo : "",
  idade: v.idade ?? "",
  protocolo: ehProtocolo(v.protocolo) ? v.protocolo : "nenhum",
  circunferencias: limpar(v.circunferencias),
  dobras: limpar(v.dobras),
  observacao: v.observacao ?? "",
});

const GRID = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 gap-y-2.5";
const INPUT_MEDIDA = INPUT;
const LEGENDA = "mb-1 font-body text-[12px] font-semibold text-texto-2";
const ROTULO_MEDIDA = "mb-1 block font-body text-[11.5px] text-texto-3";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  paciente: { id: string; genero: string | null; nascimento: string | null };
  /** protocolo da última avaliação (a nova já nasce com ele) */
  protocoloPadrao?: Protocolo;
  /** com avaliação = edição; sem = nova */
  antropometria?: Antropometria | null;
  onSalvo: (a: Antropometria, modo: "criada" | "editada") => void;
  /** Physiq W17: sem gênero/nascimento no cadastro, o sexo e a idade do perfil do Treino (o aluno que veio do Calc) — a nova nasce com eles */
  sexoPadrao?: "masculino" | "feminino" | null;
  idadePadrao?: number | null;
  /** Physiq W17: a nova já nasce com o peso e a altura do aluno (o último registro) */
  pesoPadrao?: number | null;
  alturaPadrao?: number | null;
}

function Previa({ rotulo, valor, sub, marca, bruto }: { rotulo: string; valor: string; sub?: string | null; marca: string; bruto: number | null }) {
  return (
    <div {...{ [`data-previa-${marca}`]: bruto ?? "" }}>
      <p className="font-body text-[11px] font-medium text-texto-3">{rotulo}</p>
      <p className="font-body text-[18px] font-bold leading-tight tabular-nums text-texto">{valor}</p>
      {sub && <p className="font-body text-[11px] text-texto-3">{sub}</p>}
    </div>
  );
}

export default function AntropometriaDialog({ open, onOpenChange, paciente, protocoloPadrao = "nenhum", antropometria, onSalvo, sexoPadrao, idadePadrao, pesoPadrao, alturaPadrao }: Props) {
  const { user } = useAuth();
  const { id: pacienteId, genero, nascimento } = paciente;
  const editando = !!antropometria;
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: formNovo({ genero, nascimento }, protocoloPadrao),
  });

  useEffect(() => {
    if (!open) return;
    setErroGeral(null);
    if (antropometria) {
      reset(registroParaForm(antropometria));
      return;
    }
    const novo = formNovo({ genero, nascimento }, protocoloPadrao);
    reset({
      ...novo,
      sexo: novo.sexo || sexoPadrao || "",
      idade: novo.idade || (idadePadrao ? String(idadePadrao) : ""),
      peso: novo.peso || (pesoPadrao ? String(pesoPadrao).replace(".", ",") : ""),
      altura: novo.altura || (alturaPadrao ? String(alturaPadrao).replace(".", ",") : ""),
    });
  }, [open, antropometria, genero, nascimento, protocoloPadrao, reset, sexoPadrao, idadePadrao, pesoPadrao, alturaPadrao]);

  const form = montarForm(watch());
  const previa = previaDoForm(form);
  const dobrasVisiveis = chavesDobrasDoForm(form.protocolo, form.sexo);
  const precisaSexo = protocoloPrecisaSexo(form.protocolo);
  const precisaIdade = protocoloPrecisaIdade(form.protocolo);

  const onSubmit = async (v: Valores) => {
    const f = montarForm(v);
    if (f.protocolo !== "nenhum") {
      if (protocoloPrecisaSexo(f.protocolo) && !f.sexo) {
        setErroGeral("Escolha o sexo pra calcular o % de gordura por esse protocolo");
        return;
      }
      if (protocoloPrecisaIdade(f.protocolo) && numero(f.idade) === null) {
        setErroGeral("Informe a idade pra calcular o % de gordura por esse protocolo");
        return;
      }
      const faltando = dobrasFaltando(f);
      if (faltando.length) {
        setErroGeral(`Preencha as dobras do protocolo: ${faltando.join(", ")}`);
        return;
      }
    }
    setErroGeral(null);
    const reg = formParaRegistro(f);
    try {
      if (antropometria) {
        onSalvo(await atualizarAntropometria(antropometria.id, reg), "editada");
        toast.success("Avaliação atualizada");
      } else {
        if (!user) throw new Error("Sessão expirada — entre de novo");
        onSalvo(await criarAntropometria(user.id, pacienteId, reg), "criada");
        toast.success("Avaliação salva");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a avaliação");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-modal-antropometria={editando ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editando ? "Editar antropometria" : "Nova antropometria"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            Peso em kg, altura e circunferências em cm, dobras em mm. O que ficar em branco não entra no cálculo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Campo rotulo="Data" erro={errors.data?.message}>
              <input type="date" className={INPUT} {...register("data")} data-campo-data-antropometria />
            </Campo>
            <Campo rotulo="Hora" erro={errors.hora?.message}>
              <input type="time" className={INPUT} {...register("hora")} data-campo-hora-antropometria />
            </Campo>
            <Campo rotulo="Peso (kg)" erro={errors.peso?.message}>
              <input inputMode="decimal" placeholder="ex.: 72,5" className={INPUT} {...register("peso")} data-campo-peso />
            </Campo>
            <Campo rotulo="Altura (cm)" erro={errors.altura?.message}>
              <input inputMode="decimal" placeholder="ex.: 172" className={INPUT} {...register("altura")} data-campo-altura />
            </Campo>
            <Campo rotulo="Sexo" erro={errors.sexo?.message} dica={precisaSexo && !form.sexo ? "o protocolo precisa do sexo" : undefined}>
              <select className={SELECT} {...register("sexo")} data-campo-sexo>
                <option value="">—</option>
                {SEXOS.map((s) => (
                  <option key={s.valor} value={s.valor}>{s.rotulo}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Idade" erro={errors.idade?.message} dica={precisaIdade && !form.idade ? "o protocolo precisa da idade" : undefined}>
              <input inputMode="numeric" placeholder="anos" className={INPUT} {...register("idade")} data-campo-idade />
            </Campo>
            <div className="col-span-2">
              <Campo rotulo="Protocolo de % de gordura" erro={errors.protocolo?.message}>
                <select className={SELECT} {...register("protocolo")} data-campo-protocolo>
                  {PROTOCOLOS.map((p) => (
                    <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                  ))}
                </select>
              </Campo>
            </div>
          </div>

          <fieldset className="space-y-2" data-circunferencias>
            <legend className={LEGENDA}>Circunferências (cm)</legend>
            <div className={GRID}>
              {CIRCUNFERENCIAS.map((c) => (
                <label key={c.chave} className="block">
                  <span className={ROTULO_MEDIDA}>{c.rotulo}</span>
                  <input inputMode="decimal" className={INPUT_MEDIDA} {...register(`circunferencias.${c.chave}` as const)} data-campo-circ={c.chave} />
                  {errors.circunferencias?.[c.chave]?.message && (
                    <span className="font-body text-[11.5px] text-rosa-3" role="alert">{errors.circunferencias[c.chave]?.message}</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2" data-dobras data-dobras-protocolo={dobrasVisiveis.length}>
            <legend className={LEGENDA}>
              Dobras cutâneas (mm)
              {form.protocolo !== "nenhum" && <span className="font-normal text-texto-3"> — as {dobrasVisiveis.length} do protocolo</span>}
            </legend>
            <div className={GRID}>
              {dobrasVisiveis.map((chave) => (
                <label key={chave} className="block">
                  <span className={ROTULO_MEDIDA}>{rotuloDobra(chave)}</span>
                  <input inputMode="decimal" className={INPUT_MEDIDA} {...register(`dobras.${chave}` as const)} data-campo-dobra={chave} />
                  {errors.dobras?.[chave]?.message && (
                    <span className="font-body text-[11.5px] text-rosa-3" role="alert">{errors.dobras[chave]?.message}</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-linha-2 bg-superficie p-3 text-center sm:grid-cols-4" data-previa>
            <Previa rotulo="IMC" valor={fmtNum(previa.imc, 1)} sub={previa.classificacao_imc} marca="imc" bruto={previa.imc} />
            <Previa rotulo="% gordura" valor={previa.percentual_gordura === null ? "—" : `${fmtNum(previa.percentual_gordura, 1)}%`} marca="gordura" bruto={previa.percentual_gordura} />
            <Previa rotulo="Massa magra" valor={previa.massa_magra === null ? "—" : `${fmtNum(previa.massa_magra, 1)} kg`} marca="magra" bruto={previa.massa_magra} />
            <Previa rotulo="Cintura/quadril" valor={fmtNum(previa.rcq, 2)} marca="rcq" bruto={previa.rcq} />
          </div>

          <Campo rotulo="Observações" erro={errors.observacao?.message}>
            <textarea className={TEXTAREA} rows={2} maxLength={OBSERVACAO_MAX} {...register("observacao")} data-campo-observacao />
          </Campo>

          {erroGeral && <p role="alert" className="font-body text-[12px] text-rosa-3" data-erro-antropometria>{erroGeral}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-antropometria>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-antropometria>{isSubmitting ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
