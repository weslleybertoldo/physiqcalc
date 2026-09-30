import { ChevronRight } from "lucide-react";
import { Anel } from "@/ui/premium/Anel";
import { Avatar } from "@/ui/premium/Avatar";
import { fracao, type ResumoDoDia } from "../dia";
import { fmtKcal } from "../numeros";

/** As 3 barras da tela 3: marcadas / do dia, com os gradientes do gerador (proteína ciano, carboidrato lima → verde, gordura âmbar). */
const MACROS: { chave: "proteina_g" | "carboidrato_g" | "lipidio_g"; rotulo: string; cor: string }[] = [
  { chave: "proteina_g", rotulo: "Proteína", cor: "linear-gradient(90deg, #22d3ee, #0ea5e9)" },
  { chave: "carboidrato_g", rotulo: "Carboidrato", cor: "linear-gradient(90deg, #a3e635, #10b981)" },
  { chave: "lipidio_g", rotulo: "Gordura", cor: "linear-gradient(90deg, #fcd34d, #f59e0b)" },
];

const gramasInteiros = (n: number): string => String(Math.round(n));

/**
 * Cartão do plano (tela 3, `.card.shine.resumo`): foto e nome da nutricionista + "atualizado em", o anel das kcal MARCADAS no dia
 * contra as do dia e as barras de proteína, carboidrato e gordura marcadas / do dia (NF5). Tocar abre o plano (PDF, planos
 * anteriores, observações). Dia sem refeição: o aviso no lugar do anel. Outro dia ou plano anterior (só para ver): o anel e as
 * barras mostram a composição do dia (as kcal e os gramas do plano), sem progresso.
 */
export function CartaoPlano({
  nutricionista,
  foto,
  atualizadoEm,
  resumo,
  aviso,
  leitura = false,
  aoAbrir,
}: {
  nutricionista: string | null;
  foto: string | null;
  /** "02/07" */
  atualizadoEm: string;
  resumo: ResumoDoDia | null;
  /** texto no lugar do anel (dia sem refeição / plano anterior) */
  aviso?: string | null;
  /** outro dia ou plano anterior: a composição do dia, sem o ✓ */
  leitura?: boolean;
  aoAbrir: () => void;
}) {
  const total = resumo?.total.energia_kcal ?? 0;
  const marcado = leitura ? total : resumo?.marcado.energia_kcal ?? 0;
  return (
    <button type="button" onClick={aoAbrir} data-cartao-plano className="pq-cartao pq-brilho mt-3 block w-full px-4 pb-4 pt-[15px] text-left">
      <span className="flex items-center gap-2 text-[12px] text-texto-2">
        <Avatar src={foto} nome={nutricionista} tamanho={22} />
        <span className="min-w-0 flex-1 truncate" data-plano-autor>
          {nutricionista ? `Plano de ${nutricionista}` : "Seu plano"} · atualizado em {atualizadoEm}
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 flex-none text-texto-3" />
      </span>
      {aviso || !resumo ? (
        <span className="mt-3 block rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] leading-relaxed text-texto-2" data-plano-aviso>
          {aviso}
        </span>
      ) : (
        <span className="mt-3 flex items-center gap-[18px]">
          <Anel pct={fracao(marcado, total)} tamanho={104} espessura={10} gradiente={["#a3e635", "#10b981"]} className={leitura ? "opacity-60" : undefined}
            rotulo={leitura ? `${fmtKcal(total)} kcal no dia` : `${fmtKcal(marcado)} de ${fmtKcal(total)} kcal`}>
            <span className="text-[20px] font-bold leading-none tracking-[-0.02em] text-texto tabular-nums" data-kcal-marcadas={leitura ? undefined : Math.round(marcado)}>
              {fmtKcal(leitura ? total : marcado)}
            </span>
            <span className="mt-1 text-[10.5px] text-texto-3" data-kcal-do-dia={Math.round(total)}>{leitura ? "kcal no dia" : `de ${fmtKcal(total)} kcal`}</span>
          </Anel>
          <span className="flex min-w-0 flex-1 flex-col gap-2.5">
            {MACROS.map((m) => {
              const alvo = resumo.total[m.chave];
              const feito = leitura ? alvo : resumo.marcado[m.chave];
              return (
                <span key={m.chave} className="block" data-macro={m.chave} data-macro-marcado={leitura ? undefined : Math.round(feito)} data-macro-total={Math.round(alvo)}>
                  <span className="flex items-baseline justify-between text-[12px]">
                    <span className="text-texto-2">{m.rotulo}</span>
                    {leitura ? (
                      <b className="font-semibold text-forte tabular-nums">{gramasInteiros(alvo)} g</b>
                    ) : (
                      <span className="text-texto-2 tabular-nums">
                        <b className="font-semibold text-forte">{gramasInteiros(feito)}</b> / {gramasInteiros(alvo)} g
                      </span>
                    )}
                  </span>
                  <span className="mt-[5px] block h-[6px] overflow-hidden rounded bg-superficie-2">
                    <i className={`block h-full rounded ${leitura ? "opacity-50" : ""}`} style={{ width: `${Math.round(fracao(feito, alvo) * 100)}%`, background: m.cor }} />
                  </span>
                </span>
              );
            })}
          </span>
        </span>
      )}
    </button>
  );
}
