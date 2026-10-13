// Physiq W-A P5 — a lista do DIA dentro da folha da refeição (spec §4.4): cada item do plano com "Tirar hoje" (fica riscado, com "Voltar"), os
// que ele pôs com o selo "você pôs" e "Tirar", e embaixo "Adicionar alimento". A mesma peça serve a refeição extra (só os que ele pôs). Os
// substitutos e as observações do plano continuam como na folha de hoje. Sem internet ou com uma gravação correndo, os botões ficam desligados.
import { LoaderCircle, Plus, Repeat, RotateCcw, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { macrosDoRetrato, type ItemDoPlanoNoDia } from "@/aluno-dia/regras";
import type { ItemDoDia } from "@/aluno-dia/tipos";
import { descricaoQuantidade, descricaoSubstituto, fmtKcal, lerSubstitutos, macrosDoItem } from "@/nutricao/app/dietaUtil";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { quantidadeDoItemDoDia } from "../regras";
import { TEXTOS } from "../textos";

function BotaoDaLinha({ rotulo, icone: Icone, girando, desligado, onClick, ...props }: {
  rotulo: string;
  icone: LucideIcon;
  girando: boolean;
  desligado: boolean;
  onClick: () => void;
} & Record<`data-${string}`, string>) {
  return (
    <button type="button" onClick={onClick} disabled={desligado} {...props}
      className="flex h-8 flex-none items-center gap-1 rounded-[10px] border border-linha bg-superficie-2 px-2.5 text-[12px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:opacity-50">
      {girando ? <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Icone aria-hidden className="h-3.5 w-3.5" />}
      {rotulo}
    </button>
  );
}

export function ItensDoDia({
  itensDoPlano,
  adicionados,
  ocupado,
  desligado,
  podeAdicionar,
  aviso,
  vazio = "Sem alimentos nesta refeição.",
  aoTirarDoPlano,
  aoVoltar,
  aoAdicionar,
}: {
  itensDoPlano: ItemDoPlanoNoDia[];
  adicionados: ItemDoDia[];
  /** a chave da gravação que está correndo (useGravarNoDia), ou null */
  ocupado: string | null;
  desligado: boolean;
  podeAdicionar: boolean;
  aviso?: string | null;
  vazio?: string;
  aoTirarDoPlano?: (itemDoPlano: string) => void;
  /** desfaz um registro do dia: o "tirei" (o item do plano volta) ou o "pus" (o que ele pôs sai) */
  aoVoltar: (itemDoDia: string) => void;
  aoAdicionar: () => void;
}) {
  const travado = desligado || !!ocupado;
  const total = itensDoPlano.length + adicionados.length;
  return (
    <div className="flex flex-col gap-3" data-dieta-livre-itens={total}>
      {total === 0 ? (
        <p className="rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] italic text-texto-3" data-refeicao-vazia>{vazio}</p>
      ) : (
        <ul className="divide-y divide-linha-3 rounded-2xl border border-linha bg-superficie px-3.5" data-folha-itens={total}>
          {itensDoPlano.map(({ item, tirado }) => {
            const subs = lerSubstitutos(item.substitutos);
            const m = macrosDoItem(item);
            return (
              <li key={item.id} className="py-2.5" data-item={item.id} data-item-tirado={tirado ? "1" : "0"}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13.5px] font-medium", tirado ? "text-texto-3 line-through" : "text-texto")} data-item-nome>
                      {item.alimento?.nome ?? "Alimento"}
                    </span>
                    <span className="block text-[12px] text-texto-2" data-item-qtd>
                      {tirado ? `${TEXTOS.tiradoHoje} · ` : ""}{descricaoQuantidade(item)} · {fmtKcal(m.energia_kcal)} kcal
                    </span>
                  </span>
                  {tirado ? (
                    <BotaoDaLinha rotulo={TEXTOS.voltar} icone={RotateCcw} girando={ocupado === `voltar:${tirado.id}`} desligado={travado}
                      onClick={() => aoVoltar(tirado.id)} data-item-voltar={item.id} />
                  ) : aoTirarDoPlano ? (
                    <BotaoDaLinha rotulo={TEXTOS.tirarHoje} icone={X} girando={ocupado === `tirar:${item.id}`} desligado={travado}
                      onClick={() => aoTirarDoPlano(item.id)} data-item-tirar={item.id} />
                  ) : null}
                </div>
                {subs.length > 0 && !tirado && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-verde-3" data-item-substitutos={subs.length}>
                    <Repeat aria-hidden className="mt-[2px] h-3.5 w-3.5 flex-none" strokeWidth={2} />
                    <span>ou {subs.map(descricaoSubstituto).join(" · ")}</span>
                  </div>
                )}
                {item.observacao?.trim() && !tirado && <p className="mt-1 text-[12px] italic text-texto-3">{item.observacao.trim()}</p>}
              </li>
            );
          })}
          {adicionados.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2.5" data-item-posto={i.id}>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium text-texto" data-item-nome>{i.nome}</span>
                  <Chip tom="n" className="flex-none" data-item-selo>{TEXTOS.vocePos}</Chip>
                </span>
                <span className="block text-[12px] text-texto-2" data-item-qtd>
                  {quantidadeDoItemDoDia(i)} · {fmtKcal(macrosDoRetrato(i).energia_kcal)} kcal
                </span>
              </span>
              <BotaoDaLinha rotulo={TEXTOS.tirar} icone={X} girando={ocupado === `voltar:${i.id}`} desligado={travado}
                onClick={() => aoVoltar(i.id)} data-item-posto-tirar={i.id} />
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="text-[12.5px] leading-snug text-texto-2" data-dieta-livre-aviso>{aviso}</p>}
      {podeAdicionar && (
        <Botao variante="g" icone={Plus} onClick={aoAdicionar} disabled={travado} data-dieta-adicionar>{TEXTOS.adicionar}</Botao>
      )}
    </div>
  );
}
