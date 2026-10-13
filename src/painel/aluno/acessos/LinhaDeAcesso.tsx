import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Esqueleto } from "@/ui/premium/Estados";
import type { DefLinha, TomDoNivel } from "./regras";

/** A cor do nível marcado (spec §4.1): neutro · azul · verde — os tons dos chips do visual premium (g · c · n). */
const COR_MARCADO: Record<TomDoNivel, string> = {
  neutro: "peer-checked:bg-[var(--p-chip-g-fundo)] peer-checked:text-texto peer-checked:shadow-sm",
  azul: "peer-checked:bg-[var(--p-chip-c-fundo)] peer-checked:text-[var(--p-chip-c-texto)]",
  verde: "peer-checked:bg-[var(--p-chip-n-fundo)] peer-checked:text-[var(--p-chip-n-texto)]",
};

/**
 * Uma linha da aba Acessos (W-A P4 — spec §4.1): o nome, a dica, o aviso para ESTE aluno e o "Mudado por <nome> em dd/mm hh:mm"; à
 * direita os níveis como botões de rádio de verdade (Tab entra no grupo, as setas trocam — o molde AcessosDoMembro.tsx do Nativo OS),
 * ou o texto no lugar deles (`semNiveis`: "Este aluno não tem dieta", o Treino de outra conta…), ou o nível fixo (as rotinas), ou o
 * esqueleto (as séries carregando à parte).
 */
export function LinhaDeAcesso({
  def,
  dica,
  valor,
  desligado,
  aviso,
  mudanca,
  aoEscolher,
  carregando = false,
  semNiveis,
  fixo = false,
  acao,
  estado = "pronto",
}: {
  def: DefLinha;
  dica: string;
  valor: string | null;
  desligado: boolean;
  aviso?: string | null;
  mudanca?: string | null;
  aoEscolher: (valor: string) => void;
  carregando?: boolean;
  /** o texto no lugar dos níveis (a linha que não vale para este aluno) */
  semNiveis?: string | null;
  /** o nível que não muda (as rotinas: "Sempre liberadas", sem botão) */
  fixo?: boolean;
  /** uma ação embaixo (o "Tentar de novo" da linha das séries) */
  acao?: ReactNode;
  estado?: string;
}) {
  const id = useId();
  const rotuloId = `acesso-${def.chave}-${id}`;
  return (
    <li
      className="flex min-w-0 flex-col gap-2.5 border-b border-linha py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      data-acessos-linha={def.chave}
      data-acessos-nivel={valor ?? ""}
      data-acessos-estado={estado}
    >
      <div className="min-w-0 flex-1">
        <p id={rotuloId} className="text-[13.5px] font-semibold text-texto">{def.rotulo}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-texto-3">{dica}</p>
        {aviso && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ambar-3" data-acessos-aviso>{aviso}</p>}
        {mudanca && <p className="mt-1 text-[11px] text-texto-3" data-acessos-mudanca>{mudanca}</p>}
        {acao && <div className="mt-1.5">{acao}</div>}
      </div>
      {carregando ? (
        <Esqueleto className="h-8 w-[168px] flex-none self-start rounded-xl" />
      ) : semNiveis ? (
        <p className="flex-none self-start text-[12px] font-medium text-texto-2 sm:max-w-[45%] sm:text-right" data-acessos-sem>{semNiveis}</p>
      ) : fixo ? (
        <span
          className="flex-none self-start rounded-[9px] px-3 py-1.5 text-xs font-semibold"
          style={{ background: "var(--p-chip-n-fundo)", color: "var(--p-chip-n-texto)" }}
          data-acessos-fixo
        >
          {def.niveis[0]?.rotulo}
        </span>
      ) : (
        <div role="radiogroup" aria-labelledby={rotuloId} className="inline-flex flex-none self-start rounded-xl border border-linha bg-superficie p-[3px]">
          {def.niveis.map((n) => (
            <label key={n.valor} className="relative">
              <input
                type="radio"
                name={rotuloId}
                value={n.valor}
                checked={valor === n.valor}
                onChange={() => aoEscolher(n.valor)}
                disabled={desligado}
                className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
                data-acessos-radio={`${def.chave}:${n.valor}`}
              />
              <span
                className={cn(
                  "block whitespace-nowrap rounded-[9px] px-3 py-1.5 text-xs font-semibold text-texto-2 transition-colors duration-150",
                  "peer-hover:text-texto peer-focus-visible:ring-2 peer-focus-visible:ring-violeta-2/60 peer-disabled:opacity-60",
                  COR_MARCADO[n.tom],
                )}
              >
                {n.rotulo}
              </span>
            </label>
          ))}
        </div>
      )}
    </li>
  );
}
