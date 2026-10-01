import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CamposAvaliacao from "@/components/avaliacao/CamposAvaliacao";
import SeletorTmb from "@/components/avaliacao/SeletorTmb";
import { calcularComposicao, numero, rotuloTmb, tmbMetodoDe, tmbValida, valoresDoRegistro, type Sexo } from "@/lib/avaliacao";
import { MEDIDA_FIELDS, MEDIDA_GROUPS } from "@/lib/medidas";
import { classificarGordura } from "@/utils/composicaoCorporal";
import { calcularIdade } from "@/utils/formatDate";
import { hojeSP } from "@/evolucao/serie";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, SELECT, TEXTAREA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { mensagemDoErro } from "./mensagens";
import { avisarAvaliacaoNova, registrarAvaliacaoFisica } from "./avaliacaoApi";
import { colunasDaFisica, eAMaisRecente, faltandoNaFisica, type FormFisica } from "./regras";
import type { Avaliacao } from "@/evolucao/tipos";

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** O formulário abre com a composição atual do perfil (como a aba Dobras & Medidas do Calc) e a data de hoje. */
function formInicial(perfil: Record<string, unknown> | null, hoje: string): FormFisica {
  const p = perfil ?? {};
  const nasc = typeof p.data_nascimento === "string" ? p.data_nascimento : "";
  const idade = nasc ? String(calcularIdade(nasc)) : texto(p.idade);
  return {
    data: hoje,
    sexo: p.sexo === "female" ? "female" : "male",
    idade,
    peso: texto(p.peso),
    altura: texto(p.altura),
    valores: valoresDoRegistro(p),
    tmb: tmbMetodoDe(p.tmb_metodo),
    medidas: Object.fromEntries(MEDIDA_FIELDS.map((f) => [f.key, texto(p[f.key])])),
    observacao: "",
  };
}

/**
 * "Nova avaliação › Avaliação física" (W17 — C34, C35, C83): o formulário do Calc (3 dobras, 7 dobras ou bioimpedância; a TMB
 * Mifflin, Katch ou da balança; as 13 medidas; observação) — os campos de dobras e a TMB são os componentes de hoje, por import
 * (CamposAvaliacao e SeletorTmb). Grava no Banco do Treino o registro da evolução e, sendo a mais recente, a composição atual do
 * perfil (o "Salvar" de Dobras & Medidas fazia os dois) e avisa o aluno no sino.
 */
export function DialogAvaliacaoFisica({
  aberto,
  aoMudar,
  alunoId,
  treinoUserId,
  perfil,
  avaliacoes,
  aoSalvar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  alunoId: string;
  treinoUserId: string;
  /** o perfil do Treino (composição atual, sexo, nascimento) — da função treino-leitura */
  perfil: Record<string, unknown> | null;
  /** as avaliações da série (para saber se a nova é a mais recente do Treino) */
  avaliacoes: Avaliacao[];
  aoSalvar: () => void;
}) {
  const hoje = useMemo(() => hojeSP(), []);
  const [f, setF] = useState<FormFisica>(() => formInicial(perfil, hoje));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setF(formInicial(perfil, hojeSP()));
  }, [aberto, perfil]);

  const comp = useMemo(
    () => calcularComposicao(f.valores, { sexo: f.sexo, idade: numero(f.idade), peso: numero(f.peso), altura: numero(f.altura) }),
    [f.valores, f.sexo, f.idade, f.peso, f.altura],
  );
  const tmbEfetiva = tmbValida(f.tmb, comp);
  const tmbValor = { mifflin: comp.tmbMifflin, katch: comp.tmbKatch, balanca: comp.tmbBalanca }[tmbEfetiva];
  const cls = comp.bf !== null ? classificarGordura(comp.bf, f.sexo === "male" ? "M" : "F", numero(f.idade) ?? 25) : null;
  const campo = <K extends keyof FormFisica>(k: K, v: FormFisica[K]) => setF((x) => ({ ...x, [k]: v }));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const falta = faltandoNaFisica(f, hojeSP());
    if (falta) {
      setErro(falta);
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const r = await registrarAvaliacaoFisica(treinoUserId, { data: f.data, colunas: colunasDaFisica(f), atualizarPerfil: eAMaisRecente(f.data, avaliacoes) });
      const aviso = await avisarAvaliacaoNova(alunoId);
      toast.success(aviso.avisado ? "Avaliação física salva. O aluno vê na Evolução, com o aviso no sino." : "Avaliação física salva. O aluno vê na Evolução do app.");
      if (eAMaisRecente(f.data, avaliacoes) && !r.perfilAtualizado) toast.warning("A composição atual do perfil não foi atualizada agora; a avaliação ficou no histórico.");
      aoMudar(false);
      aoSalvar();
    } catch (err) {
      setErro(mensagemDoErro(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-linha-2 bg-tela text-texto sm:max-w-3xl sm:rounded-[24px]" data-modal-avaliacao-fisica>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>Nova avaliação física</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            O formulário do Calc: dobras ou bioimpedância, a TMB e as medidas. Fica no histórico do aluno e na Evolução do app.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="flex flex-col gap-5" noValidate data-form-avaliacao-fisica>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Campo rotulo="Data">
              <input type="date" className={INPUT} value={f.data} max={hoje} onChange={(e) => campo("data", e.target.value)} data-fisica-data />
            </Campo>
            <Campo rotulo="Peso (kg)">
              <input inputMode="decimal" className={INPUT} value={f.peso} placeholder="ex.: 84,2" onChange={(e) => campo("peso", e.target.value)} data-fisica-peso />
            </Campo>
            <Campo rotulo="Altura (cm)">
              <input inputMode="decimal" className={INPUT} value={f.altura} placeholder="ex.: 178" onChange={(e) => campo("altura", e.target.value)} data-fisica-altura />
            </Campo>
            <Campo rotulo="Sexo">
              <select className={SELECT} value={f.sexo} onChange={(e) => campo("sexo", e.target.value as Sexo)} data-fisica-sexo>
                <option value="male">Masculino</option>
                <option value="female">Feminino</option>
              </select>
            </Campo>
            <Campo rotulo="Idade">
              <input inputMode="numeric" className={INPUT} value={f.idade} placeholder="anos" onChange={(e) => campo("idade", e.target.value)} data-fisica-idade />
            </Campo>
          </div>

          <div className="rounded-2xl border border-linha-2 bg-superficie p-4" data-fisica-campos>
            <CamposAvaliacao valores={f.valores} onChange={(v) => campo("valores", v)} sexo={f.sexo} compacto />
            <div className="mt-5">
              <SeletorTmb valor={f.tmb} onChange={(m) => campo("tmb", m)} composicao={comp} metodo={f.valores.metodo} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-linha-2 bg-superficie p-3 text-center sm:grid-cols-4" data-fisica-resultado={comp.bf ?? ""}>
            {[
              { r: "% de gordura", v: comp.bf !== null ? `${comp.bf.toFixed(1).replace(".", ",")}%` : "—", m: "gordura" },
              { r: "Massa gorda", v: comp.massaGorda !== null ? `${comp.massaGorda.toFixed(1).replace(".", ",")} kg` : "—", m: "gorda" },
              { r: "Massa magra", v: comp.massaMagra !== null ? `${comp.massaMagra.toFixed(1).replace(".", ",")} kg` : "—", m: "magra" },
              { r: `TMB ${rotuloTmb(tmbEfetiva)}`, v: tmbValor !== null ? `${Math.round(tmbValor)} kcal` : "—", m: "tmb" },
            ].map((x) => (
              <div key={x.m} data-fisica-previa={x.m}>
                <p className="font-body text-[11px] font-medium text-texto-3">{x.r}</p>
                <p className="font-body text-[18px] font-bold leading-tight tabular-nums text-texto">{x.v}</p>
              </div>
            ))}
            {cls && (
              <p className="col-span-2 font-body text-[12px] text-texto-2 sm:col-span-4" data-fisica-classificacao>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: cls.cor }} />
                {cls.label} — {cls.descricao}
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-3" data-fisica-medidas>
            <legend className="mb-1 font-body text-[12px] font-semibold text-texto-2">Medidas (cm)</legend>
            {MEDIDA_GROUPS.map((g) => (
              <div key={g.key}>
                <p className="mb-1.5 font-body text-[11.5px] text-texto-3">{g.label}</p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {MEDIDA_FIELDS.filter((m) => m.group === g.key).map((m) => (
                    <label key={m.key} className="block">
                      <span className="mb-1 block font-body text-[11.5px] text-texto-3">{m.label}</span>
                      <input inputMode="decimal" className={INPUT} value={f.medidas[m.key] ?? ""} onChange={(e) => campo("medidas", { ...f.medidas, [m.key]: e.target.value })} data-fisica-medida={m.key} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <Campo rotulo="Observação" dica="Ex.: início do protocolo, reavaliação de 30 dias…">
            <textarea className={TEXTAREA} rows={2} maxLength={500} value={f.observacao} onChange={(e) => campo("observacao", e.target.value)} data-fisica-observacao />
          </Campo>

          {erro && <p role="alert" className="font-body text-[12.5px] text-rosa-3" data-erro-avaliacao-fisica>{erro}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SEC} onClick={() => aoMudar(false)} disabled={salvando}>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-fisica>{salvando ? "Salvando…" : "Salvar avaliação"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
