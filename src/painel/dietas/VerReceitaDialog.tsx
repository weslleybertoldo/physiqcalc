import { FileDown, Pencil, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtQtd } from "@/nutricao/editor/lib/alimentosUtil";
import { fmtKcal } from "@/nutricao/editor/lib/energeticoUtil";
import type { Receita } from "@/nutricao/editor/lib/receitas";
import { calcularReceita, descricaoQuantidadeIngrediente, macrosDoIngrediente, textoDadosReceita, textoPorPorcao, textoReceitaInteira } from "@/nutricao/editor/lib/receitasUtil";
import { BadgeFonte } from "@/nutricao/editor/ui/BuscaAlimento";
import Blocos from "@/nutricao/editor/ui/Blocos";
import { BTN_PRI, BTN_SEC, DESCRICAO_JANELA, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";

// Physiq W24 — porta do PhysiqNutri (src/components/receitas/VerReceitaDialog.tsx) no visual premium: o "Ver" da receita — cabeçalho
// (nome, grupo, porções · rendimento · tempo), os ingredientes (quantidade · kcal · macros), "Por porção" e "Receita inteira"
// calculados na hora, modo de preparo nos Blocos e observação; PDF e (para quem criou) Editar.

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  receita: Receita | null;
  grupoNome: string | null;
  podeEditar: boolean;
  onPdf: (r: Receita) => void;
  onEditar: (r: Receita) => void;
}

const SECAO = "text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-3";

export default function VerReceitaDialog({ open, onOpenChange, receita, grupoNome, podeEditar, onPdf, onEditar }: Props) {
  const calc = receita ? calcularReceita({ porcoes: Number(receita.porcoes), rendimento_g: receita.rendimento_g === null ? null : Number(receita.rendimento_g) }, receita.ingredientes) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${JANELA} max-h-[92vh] overflow-y-auto sm:max-w-2xl`}
        data-modal-ver-receita={receita?.id ?? ""}
        data-ver-kcal-porcao={calc?.porPorcao.energia_kcal ?? ""}
        data-ver-kcal-total={calc?.totais.energia_kcal ?? ""}
        data-ver-peso={calc?.peso ?? ""}
      >
        <DialogHeader>
          <DialogTitle className={`${TITULO_JANELA} flex flex-wrap items-center gap-2`}>
            {receita?.favorita && <Star size={15} className="fill-[var(--p-ambar)] text-ambar" aria-label="Favorita" />}
            <span data-ver-nome>{receita?.nome ?? ""}</span>
          </DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA} data-ver-dados>
            {receita ? `${grupoNome ? `${grupoNome} · ` : ""}${textoDadosReceita({ porcoes: Number(receita.porcoes), rendimento_g: receita.rendimento_g, tempo_preparo_min: receita.tempo_preparo_min })}` : ""}
          </DialogDescription>
        </DialogHeader>

        {receita && calc && (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <p className={SECAO}>Ingredientes · {receita.ingredientes.length}</p>
              <ul className="divide-y divide-linha-3 rounded-[16px] border border-linha bg-superficie px-3.5" data-ver-lista-ingredientes>
                {receita.ingredientes.map((i) => {
                  const m = macrosDoIngrediente(i);
                  return (
                    <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5" data-ver-ingrediente={i.id} data-ver-gramas={i.quantidade_g} data-ver-kcal={m.energia_kcal ?? ""}>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-texto">
                          <span data-ver-ingrediente-nome>{i.alimento?.nome ?? "Alimento removido"}</span>
                          {i.alimento && <BadgeFonte fonte={i.alimento.fonte} />}
                        </p>
                        <p className="mt-0.5 text-[12px] tabular-nums text-texto-3">
                          <span data-ver-ingrediente-quantidade>{descricaoQuantidadeIngrediente(i)}</span>
                          {" · "}P {fmtQtd(m.proteina_g ?? 0)} g · C {fmtQtd(m.carboidrato_g ?? 0)} g · L {fmtQtd(m.lipidio_g ?? 0)} g
                        </p>
                        {i.observacao?.trim() && <p className="text-[12px] text-texto-2" data-ver-ingrediente-observacao>{i.observacao}</p>}
                      </div>
                      <span className="text-[13.5px] font-bold tabular-nums text-texto" data-ver-ingrediente-kcal-texto>{fmtKcal(m.energia_kcal ?? 0)} kcal</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="flex flex-col gap-1 rounded-[16px] border border-[rgba(16,185,129,.3)] bg-[rgba(16,185,129,.05)] p-3.5" data-ver-valor-nutricional>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-verde-3">Valor nutricional</p>
              <p className="text-[13.5px] tabular-nums text-texto" data-ver-porcao-texto>{textoPorPorcao(calc)}</p>
              <p className="text-[13.5px] tabular-nums text-texto" data-ver-inteira-texto>{textoReceitaInteira(calc)}</p>
              <p className="text-[12px] tabular-nums text-texto-3">
                Fibras {fmtQtd(calc.porPorcao.fibra_g)} g · Sódio {fmtQtd(calc.porPorcao.sodio_mg)} mg por porção
                {receita.rendimento_g === null ? " · peso = soma dos ingredientes" : ` · rendimento informado ${fmtQtd(Number(receita.rendimento_g))} g`}
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <p className={SECAO}>Modo de preparo{receita.tempo_preparo_min !== null ? ` · ${receita.tempo_preparo_min} min` : ""}</p>
              <div className="rounded-[14px] border border-linha bg-superficie p-3" data-ver-modo-preparo>
                {receita.modo_preparo?.trim() ? <Blocos conteudo={receita.modo_preparo} compacto /> : <p className="text-[12px] italic text-texto-3">Sem modo de preparo.</p>}
              </div>
            </section>

            {receita.observacao?.trim() && (
              <section className="flex flex-col gap-1">
                <p className={SECAO}>Observação</p>
                <p className="text-[13px] text-texto-2" data-ver-observacao>{receita.observacao}</p>
              </section>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-ver-receita>Fechar</button>
              {podeEditar && (
                <button type="button" className={BTN_SEC} onClick={() => onEditar(receita)} data-btn-editar-receita-modal>
                  <Pencil aria-hidden /> Editar
                </button>
              )}
              <button type="button" className={BTN_PRI} onClick={() => onPdf(receita)} data-btn-pdf-receita-modal>
                <FileDown aria-hidden /> PDF
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
