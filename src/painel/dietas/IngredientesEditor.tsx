import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { Alimento } from "@/nutricao/editor/lib/alimentos";
import { fmtQtd, resumoMacros, rotuloMedida } from "@/nutricao/editor/lib/alimentosUtil";
import { temMedidas } from "@/nutricao/editor/lib/dietaUtil";
import { fmtKcal } from "@/nutricao/editor/lib/energeticoUtil";
import {
  MAX_INGREDIENTES, OBSERVACAO_INGREDIENTE_MAX, formIngredienteNovo, gramasDoFormIngrediente, ingredienteCalcDoForm, macrosDoIngrediente, type FormIngrediente,
} from "@/nutricao/editor/lib/receitasUtil";
import BuscaAlimento, { BadgeFonte } from "@/nutricao/editor/ui/BuscaAlimento";
import { BTN_SEC, Campo, INPUT, SELECT } from "@/nutricao/editor/ui/estilos";

// Physiq W24 — porta do PhysiqNutri (src/components/receitas/IngredientesEditor.tsx) no visual premium: linhas dos ingredientes da
// receita — cada uma escolhe o alimento na busca da W16 (TACO + os seus) e informa a quantidade em GRAMAS ou por MEDIDA CASEIRA ×
// quantidade (só quando o alimento tem medidas), com as gramas e as kcal da linha ao vivo; observação, ▲▼ e remover.

interface Props {
  linhas: FormIngrediente[];
  onChange: (linhas: FormIngrediente[]) => void;
}

const ICONE = "pq-ibtn disabled:opacity-30";

export default function IngredientesEditor({ linhas, onChange }: Props) {
  const trocar = (k: number, fn: (l: FormIngrediente) => FormIngrediente) => onChange(linhas.map((l, i) => (i === k ? fn(l) : l)));
  const remover = (k: number) => {
    const resto = linhas.filter((_, i) => i !== k);
    onChange(resto.length ? resto : [formIngredienteNovo()]);
  };
  const mover = (k: number, d: -1 | 1) => {
    const j = k + d;
    if (j < 0 || j >= linhas.length) return;
    const c = [...linhas];
    [c[k], c[j]] = [c[j], c[k]];
    onChange(c);
  };
  const escolher = (k: number, a: Alimento) => trocar(k, (l) => ({ ...formIngredienteNovo(a), chave: l.chave, observacao: l.observacao }));
  const adicionar = () => {
    if (linhas.length >= MAX_INGREDIENTES) return;
    onChange([...linhas, formIngredienteNovo()]);
  };

  return (
    <div className="flex flex-col gap-2" data-lista-ingredientes data-total-ingredientes={linhas.length}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-3">Ingredientes</p>
      <ul className="flex flex-col gap-2">
        {linhas.map((l, k) => {
          const gramas = gramasDoFormIngrediente(l);
          const kcal = l.alimento && gramas ? macrosDoIngrediente(ingredienteCalcDoForm(l)).energia_kcal : null;
          const medidas = l.alimento?.medidas_caseiras ?? [];
          const podeMedida = temMedidas(l.alimento);
          return (
            <li key={l.chave} className="flex flex-col gap-2.5 rounded-[16px] border border-linha bg-superficie p-3" data-ingrediente={k} data-ingrediente-alimento={l.alimento?.id ?? ""} data-ingrediente-gramas={gramas ?? ""} data-ingrediente-kcal={kcal ?? ""}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-texto-3">Ingrediente {k + 1}</span>
                <div className="flex items-center gap-1">
                  <button type="button" className={ICONE} style={{ width: 30, height: 30, borderRadius: 10 }} onClick={() => mover(k, -1)} disabled={k === 0} aria-label="Subir ingrediente" title="Subir" data-btn-subir-ingrediente>
                    <ArrowUp aria-hidden />
                  </button>
                  <button type="button" className={ICONE} style={{ width: 30, height: 30, borderRadius: 10 }} onClick={() => mover(k, 1)} disabled={k === linhas.length - 1} aria-label="Descer ingrediente" title="Descer" data-btn-descer-ingrediente>
                    <ArrowDown aria-hidden />
                  </button>
                  <button type="button" className={`${ICONE} !text-rosa-3`} style={{ width: 30, height: 30, borderRadius: 10 }} onClick={() => remover(k)} aria-label="Remover ingrediente" title="Remover" data-btn-remover-ingrediente>
                    <Trash2 aria-hidden />
                  </button>
                </div>
              </div>

              {!l.alimento ? (
                <div data-campo-alimento-ingrediente={k}>
                  <BuscaAlimento onEscolher={(a) => escolher(k, a)} autoFocus={false} placeholder="Busque o ingrediente (TACO ou os seus)" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-linha-2 px-3 py-2">
                    <p className="flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] font-semibold text-texto">
                      <span data-ingrediente-nome>{l.alimento.nome}</span>
                      <BadgeFonte fonte={l.alimento.fonte} />
                      <span className="text-[11.5px] font-normal tabular-nums text-texto-3">{resumoMacros(l.alimento)} / 100 g</span>
                    </p>
                    <button type="button" className={BTN_SEC} onClick={() => trocar(k, (x) => ({ ...formIngredienteNovo(null), chave: x.chave, observacao: x.observacao }))} data-btn-trocar-ingrediente>
                      Trocar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[auto_1fr_1fr_auto]">
                    <fieldset className="flex flex-col gap-1" data-campo-modo-ingrediente={l.modo}>
                      <legend className="mb-1 text-[12px] font-semibold text-texto-2">Quantidade</legend>
                      <div className="flex flex-wrap gap-3 text-[12.5px] text-texto-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5">
                          <input type="radio" className="accent-[var(--p-verde)]" name={`modo-${l.chave}`} checked={l.modo === "gramas"} onChange={() => trocar(k, (x) => ({ ...x, modo: "gramas" }))} data-modo-gramas-ingrediente /> gramas
                        </label>
                        <label className={`inline-flex items-center gap-1.5 ${podeMedida ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`} title={podeMedida ? undefined : "Este alimento não tem medidas caseiras cadastradas"}>
                          <input
                            type="radio"
                            className="accent-[var(--p-verde)]"
                            name={`modo-${l.chave}`}
                            checked={l.modo === "medida"}
                            disabled={!podeMedida}
                            onChange={() => trocar(k, (x) => ({ ...x, modo: "medida", medida_caseira_id: x.medida_caseira_id || medidas[0]?.id || "", quantidade_medida: x.quantidade_medida || "1" }))}
                            data-modo-medida-ingrediente
                          />{" "}
                          medida caseira
                        </label>
                      </div>
                    </fieldset>

                    {l.modo === "gramas" ? (
                      <Campo rotulo="Gramas">
                        <input inputMode="decimal" placeholder="ex.: 100" className={INPUT} value={l.quantidade_g} onChange={(e) => trocar(k, (x) => ({ ...x, quantidade_g: e.target.value }))} data-campo-gramas-ingrediente />
                      </Campo>
                    ) : (
                      <>
                        <Campo rotulo="Medida caseira">
                          <select className={SELECT} value={l.medida_caseira_id} onChange={(e) => trocar(k, (x) => ({ ...x, medida_caseira_id: e.target.value }))} data-campo-medida-ingrediente>
                            {medidas.map((m) => (
                              <option key={m.id} value={m.id}>{rotuloMedida(m)}</option>
                            ))}
                          </select>
                        </Campo>
                        <Campo rotulo="Quantidade">
                          <input inputMode="decimal" placeholder="ex.: 2" className={INPUT} value={l.quantidade_medida} onChange={(e) => trocar(k, (x) => ({ ...x, quantidade_medida: e.target.value }))} data-campo-qtd-medida-ingrediente />
                        </Campo>
                      </>
                    )}

                    <div className="min-w-[7.5rem] pb-2.5 text-[13px] tabular-nums text-texto">
                      <span className="mb-1 block text-[11px] font-semibold text-texto-3">= gramas · kcal</span>
                      <span data-ingrediente-gramas-texto>{gramas === null ? "—" : `${fmtQtd(gramas)} g`}</span>
                      {" · "}
                      <span data-ingrediente-kcal-texto>{kcal === null ? "—" : `${fmtKcal(kcal)} kcal`}</span>
                    </div>
                  </div>

                  <input
                    className={INPUT}
                    value={l.observacao}
                    maxLength={OBSERVACAO_INGREDIENTE_MAX}
                    placeholder="Observação do ingrediente (ex.: picado · sem sal)"
                    onChange={(e) => trocar(k, (x) => ({ ...x, observacao: e.target.value }))}
                    data-campo-obs-ingrediente
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div>
        <button type="button" className={BTN_SEC} onClick={adicionar} disabled={linhas.length >= MAX_INGREDIENTES} data-btn-add-ingrediente>
          <Plus aria-hidden /> Adicionar ingrediente
        </button>
      </div>
      {linhas.length >= MAX_INGREDIENTES && <p className="text-[12px] text-texto-3">Máximo de {MAX_INGREDIENTES} ingredientes por receita.</p>}
    </div>
  );
}
