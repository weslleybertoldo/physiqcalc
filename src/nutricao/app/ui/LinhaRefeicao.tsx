import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type EstadoRefeicao = "feita" | "agora" | "pendente" | "vazia" | "leitura";

/**
 * Refeição do dia (tela 3, `.card.meal`): foto (a do diário do dia — P29 — ou a padrão do tipo), nome, "07:00 · Ovo · Aveia ·
 * Whey protein", as kcal e o estado: feita = ✓ verde (tocar desmarca); a próxima pendente ganha o contorno verde e o botão
 * "Feito"; as outras pendentes marcam pela folha da refeição (tocar no cartão). Refeição sem alimento não tem ✓ (a regra de hoje).
 */
export function LinhaRefeicao({
  id,
  nome,
  linha,
  kcal,
  foto,
  fotoPadrao,
  estado,
  salvando,
  desligado,
  aoAbrir,
  aoMarcar,
}: {
  id: string;
  nome: string;
  /** "07:00 · Ovo · Aveia · Whey protein" */
  linha: string;
  kcal: string;
  foto: string;
  fotoPadrao: string;
  estado: EstadoRefeicao;
  salvando: boolean;
  /** sem internet: o ✓ fica esperando */
  desligado?: boolean;
  aoAbrir: () => void;
  aoMarcar: (concluida: boolean) => void;
}) {
  const [quebrou, setQuebrou] = useState(false);
  const feita = estado === "feita";
  const agora = estado === "agora";
  return (
    <article
      data-refeicao={id}
      data-refeicao-estado={estado}
      className={cn("pq-cartao flex h-16 items-center gap-3 rounded-[18px] py-[7px] pl-[7px] pr-3 transition-shadow", agora && "border-verde/50")}
      style={agora ? { boxShadow: "0 0 0 1px rgba(16,185,129,.2), 0 14px 34px -12px rgba(16,185,129,.45)" } : undefined}
    >
      <button type="button" onClick={aoAbrir} aria-label={`Ver ${nome}`} data-refeicao-abrir className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <img
          src={quebrou ? fotoPadrao : foto}
          alt=""
          aria-hidden
          onError={() => setQuebrou(true)}
          data-refeicao-foto={foto === fotoPadrao || quebrou ? "padrao" : "diario"}
          className="h-[50px] w-[50px] flex-none rounded-[14px] object-cover"
        />
        <span className="min-w-0 flex-1">
          <b className={cn("block truncate text-[14px] font-semibold", feita ? "text-texto-2" : "text-texto")} data-refeicao-nome>{nome}</b>
          <span className="mt-[3px] block truncate text-[11.5px] text-texto-2" data-refeicao-linha>{linha}</span>
        </span>
        <span className="flex-none text-right text-[12px] text-texto-2" data-refeicao-kcal>
          <b className="block text-[13.5px] font-semibold text-forte tabular-nums">{kcal}</b>
          {kcal !== "—" && "kcal"}
        </span>
      </button>
      {feita && (
        <button
          type="button"
          onClick={() => aoMarcar(false)}
          disabled={salvando || desligado}
          aria-pressed
          aria-label={`Desmarcar ${nome}`}
          title="Feita — toque para desmarcar"
          data-refeicao-marcar="desmarcar"
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-verde/15 text-verde-2 disabled:opacity-60"
        >
          {salvando ? <LoaderCircle aria-hidden className="h-[15px] w-[15px] animate-spin" /> : <Check aria-hidden className="h-[15px] w-[15px]" strokeWidth={2.6} />}
        </button>
      )}
      {agora && (
        <button
          type="button"
          onClick={() => aoMarcar(true)}
          disabled={salvando || desligado}
          aria-label={`Marcar ${nome} como feita`}
          data-refeicao-marcar="feito"
          className="pq-botao pq-botao-w pq-botao-sm flex-none disabled:opacity-60"
          style={{ height: 32 }}
        >
          {salvando ? <LoaderCircle aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          Feito
        </button>
      )}
    </article>
  );
}
