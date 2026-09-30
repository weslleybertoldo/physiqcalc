import { Camera, Check, Repeat, Undo2 } from "lucide-react";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { descricaoQuantidade, descricaoSubstituto, fmtHorario, fmtKcal, fmtQtd, lerSubstitutos, macrosDoItem, totaisDosItens } from "../dietaUtil";
import { textoDias, normalizarDias } from "../metasUtil";
import type { RefeicaoDoPlano } from "../tipos";

/**
 * Folha da refeição (N-49): os alimentos com a quantidade (medida caseira ou gramas) e as kcal, os substitutos de cada alimento
 * ("ou 78 g de Pão, trigo, forma, integral" — até 6 por alimento, como o site antigo), as observações, os macros da refeição e,
 * embaixo, o ✓ (só hoje, no plano atual, com alimento) e a foto dela para o diário.
 */
export function SheetRefeicao({
  refeicao,
  aoFechar,
  foto,
  podeMarcar,
  marcada,
  salvando,
  desligado,
  aoMarcar,
  aoFoto,
}: {
  refeicao: RefeicaoDoPlano | null;
  aoFechar: () => void;
  /** a foto do diário de hoje desta refeição (P29), se houver */
  foto: string | null;
  podeMarcar: boolean;
  marcada: boolean;
  salvando: boolean;
  desligado?: boolean;
  aoMarcar: (concluida: boolean) => void;
  aoFoto: (() => void) | null;
}) {
  const t = refeicao ? totaisDosItens(refeicao.itens) : null;
  const hora = refeicao ? fmtHorario(refeicao.horario) : "";
  const dias = refeicao ? normalizarDias(refeicao.dias_semana) : [];
  const partes = [hora, t && refeicao?.itens.length ? `${fmtKcal(t.energia_kcal)} kcal` : null, dias.length ? textoDias(dias) : null].filter(Boolean);
  return (
    <PainelDeslizante
      aberto={!!refeicao}
      aoMudar={(v) => !v && aoFechar()}
      titulo={refeicao?.nome ?? "Refeição"}
      descricao={partes.join(" · ") || undefined}
      rodape={
        refeicao && (podeMarcar || aoFoto) ? (
          <div className="flex gap-2.5">
            {podeMarcar && (
              <Botao variante={marcada ? "g" : "w"} icone={marcada ? Undo2 : Check} className="flex-1" onClick={() => aoMarcar(!marcada)} disabled={salvando || desligado} data-folha-marcar={marcada ? "desmarcar" : "marcar"}>
                {marcada ? "Desmarcar" : "Marcar como feita"}
              </Botao>
            )}
            {aoFoto && (
              <Botao variante="g" icone={Camera} className="flex-1" onClick={aoFoto} data-folha-foto>
                Foto pro diário
              </Botao>
            )}
          </div>
        ) : undefined
      }
    >
      {refeicao && (
        <div className="flex flex-col gap-3" data-folha-refeicao={refeicao.id}>
          {foto && <img src={foto} alt="" aria-hidden className="h-40 w-full rounded-2xl border border-linha object-cover" data-folha-foto-diario />}
          {refeicao.itens.length === 0 ? (
            <p className="rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] italic text-texto-3" data-refeicao-vazia>
              Sem alimentos nesta refeição.
            </p>
          ) : (
            <ul className="divide-y divide-linha-3 rounded-2xl border border-linha bg-superficie px-3.5" data-folha-itens={refeicao.itens.length}>
              {refeicao.itens.map((i) => {
                const subs = lerSubstitutos(i.substitutos);
                const m = macrosDoItem(i);
                return (
                  <li key={i.id} className="py-2.5" data-item={i.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium text-texto" data-item-nome>{i.alimento?.nome ?? "Alimento"}</span>
                        <span className="block text-[12px] text-texto-2" data-item-qtd>{descricaoQuantidade(i)}</span>
                      </span>
                      <span className="flex-none text-[12.5px] font-semibold text-forte tabular-nums" data-item-kcal>{fmtKcal(m.energia_kcal)} kcal</span>
                    </div>
                    {subs.length > 0 && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-verde-3" data-item-substitutos={subs.length}>
                        <Repeat aria-hidden className="mt-[2px] h-3.5 w-3.5 flex-none" strokeWidth={2} />
                        <span>ou {subs.map(descricaoSubstituto).join(" · ")}</span>
                      </div>
                    )}
                    {i.observacao?.trim() && <p className="mt-1 text-[12px] italic text-texto-3">{i.observacao.trim()}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {t && refeicao.itens.length > 0 && (
            <div className="grid grid-cols-3 gap-2" data-folha-macros>
              {[
                ["Proteína", t.proteina_g],
                ["Carboidrato", t.carboidrato_g],
                ["Gordura", t.lipidio_g],
              ].map(([r, v]) => (
                <div key={r as string} className="rounded-2xl border border-linha bg-superficie px-3 py-2.5">
                  <span className="block text-[11px] text-texto-3">{r}</span>
                  <b className="text-[14px] font-semibold text-texto tabular-nums">{fmtQtd(Math.round((v as number) * 10) / 10)} g</b>
                </div>
              ))}
            </div>
          )}
          {refeicao.observacao?.trim() && (
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-texto-2" data-refeicao-observacao>{refeicao.observacao.trim()}</p>
          )}
        </div>
      )}
    </PainelDeslizante>
  );
}
