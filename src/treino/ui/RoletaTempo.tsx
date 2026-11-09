import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { ALTURA_ITEM, itemNaPosicao, partesDoTempo, segundosDasPartes, type PartesDoTempo } from "../roletaTempo";

const VISIVEIS = 5;
/** Depois do último movimento do dedo (e do encaixe), a coluna lê o número do meio. */
const ASSENTAR_MS = 90;

/**
 * A roleta do tempo (09/11/2026, pedido do Weslley: "não tem como colocar tipo o relógio? E eu seleciono quanto tempo foi?"): o
 * teclado numérico do celular não tem o ":" e o tempo da corrida não entrava. Tocar no Tempo abre esta folha; a pessoa gira as
 * colunas (horas · min · seg na corrida, min · seg na prancha) ou toca no número e confirma. Confirmar no zero = sem tempo.
 */
export function FolhaRoletaTempo({
  aberto,
  aoMudar,
  titulo,
  descricao,
  segundos,
  comHoras = false,
  maxSegundos,
  aoConfirmar,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  titulo: string;
  descricao?: string;
  /** o tempo que a roleta abre marcando (vazio = zero) */
  segundos: number | null | undefined;
  /** corrida: horas · min · seg; prancha: min · seg */
  comHoras?: boolean;
  /** o teto (a prancha vai a 10 min) */
  maxSegundos: number;
  /** o tempo escolhido em segundos (0 = sem tempo) */
  aoConfirmar: (segundos: number) => void;
}) {
  const [valor, setValor] = useState<PartesDoTempo>(() => partesDoTempo(Math.min(segundos ?? 0, maxSegundos), comHoras));
  // abriu de novo: começa no tempo de agora (estado derivado na própria renderização, sem piscar o valor antigo)
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) setValor(partesDoTempo(Math.min(segundos ?? 0, maxSegundos), comHoras));
  }

  const confirmar = () => {
    aoConfirmar(Math.min(maxSegundos, segundosDasPartes(valor)));
    aoMudar(false);
  };
  const mudar = (parte: keyof PartesDoTempo) => (n: number) => setValor((v) => ({ ...v, [parte]: n }));

  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={aoMudar}
      titulo={titulo}
      descricao={descricao}
      rodape={
        <div className="grid grid-cols-2 gap-2">
          <Botao variante="g" onClick={() => aoMudar(false)} data-roleta-cancelar>Cancelar</Botao>
          <Botao variante="w" icone={Check} onClick={confirmar} data-roleta-confirmar>Confirmar</Botao>
        </div>
      }
    >
      <div className="flex items-start gap-1 pt-1" data-roleta-tempo>
        {comHoras && (
          <ColunaRoleta rotulo="Horas" unidade={["hora", "horas"]} valor={valor.h} max={Math.floor(maxSegundos / 3600)} aoMudar={mudar("h")} formatar={String} />
        )}
        <Separador />
        <ColunaRoleta rotulo="Min" unidade={["minuto", "minutos"]} valor={valor.m} max={comHoras ? 59 : Math.floor(maxSegundos / 60)} aoMudar={mudar("m")} />
        <Separador />
        <ColunaRoleta rotulo="Seg" unidade={["segundo", "segundos"]} valor={valor.s} max={59} aoMudar={mudar("s")} />
      </div>
    </PainelDeslizante>
  );
}

/** O ":" entre as colunas, na altura do número do meio (sem horas, o 1º some). */
function Separador() {
  return (
    <div aria-hidden className="flex flex-none flex-col items-center gap-1 first:hidden">
      <span className="invisible text-[11.5px] font-medium">:</span>
      <span className="flex items-center text-[22px] font-semibold text-texto-3" style={{ height: ALTURA_ITEM * VISIVEIS }}>:</span>
    </div>
  );
}

const dois = (n: number) => String(n).padStart(2, "0");

/** Uma coluna da roleta: rola com o dedo e encaixa no número; tocar num número também escolhe; ↑/↓ no teclado. */
function ColunaRoleta({
  rotulo,
  unidade,
  valor,
  max,
  aoMudar,
  formatar = dois,
}: {
  rotulo: string;
  unidade: [string, string];
  valor: number;
  max: number;
  aoMudar: (n: number) => void;
  formatar?: (n: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rolando = useRef(false);
  const pularAjuste = useRef(false);
  const espera = useRef<number | undefined>(undefined);
  const itens = Array.from({ length: max + 1 }, (_, i) => i);

  const irPara = (i: number, suave: boolean) => {
    const el = ref.current;
    if (!el) return;
    const top = i * ALTURA_ITEM;
    if (suave && typeof el.scrollTo === "function") el.scrollTo({ top, behavior: "smooth" });
    else el.scrollTop = top;
  };

  // o número escolhido fica no meio (ao abrir, pelo teclado) — sem brigar com o dedo nem com o toque, que já rola suave
  useLayoutEffect(() => {
    if (pularAjuste.current) {
      pularAjuste.current = false;
      return;
    }
    if (rolando.current) return;
    const el = ref.current;
    if (el && Math.abs(el.scrollTop - valor * ALTURA_ITEM) > 1) irPara(valor, false);
  }, [valor]);

  useLayoutEffect(() => () => window.clearTimeout(espera.current), []);

  const aoRolar = () => {
    rolando.current = true;
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => {
      rolando.current = false;
      const el = ref.current;
      if (!el) return;
      const i = itemNaPosicao(el.scrollTop, max);
      if (Math.abs(el.scrollTop - i * ALTURA_ITEM) > 1) irPara(i, true);
      if (i !== valor) {
        pularAjuste.current = true;
        aoMudar(i);
      }
    }, ASSENTAR_MS);
  };

  const tocar = (i: number) => {
    irPara(i, true);
    if (i === valor) return;
    pularAjuste.current = true;
    aoMudar(i);
  };

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const alvo = e.key === "ArrowUp" ? valor - 1 : e.key === "ArrowDown" ? valor + 1 : e.key === "Home" ? 0 : e.key === "End" ? max : null;
    if (alvo === null) return;
    e.preventDefault();
    const i = Math.min(max, Math.max(0, alvo));
    if (i !== valor) aoMudar(i);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span className="text-[11.5px] font-medium text-texto-3">{rotulo}</span>
      <div className="relative w-full">
        <div aria-hidden className="pointer-events-none absolute inset-x-1 top-1/2 h-11 -translate-y-1/2 rounded-xl border border-violeta-2/50 bg-violeta/10" />
        <div
          ref={ref}
          role="spinbutton"
          tabIndex={0}
          aria-label={rotulo}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={valor}
          aria-valuetext={`${valor} ${valor === 1 ? unidade[0] : unidade[1]}`}
          data-roleta-coluna={rotulo}
          onScroll={aoRolar}
          onKeyDown={teclas}
          className="relative snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-xl outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-violeta-2 [&::-webkit-scrollbar]:hidden"
          style={{
            height: ALTURA_ITEM * VISIVEIS,
            paddingBlock: ALTURA_ITEM * 2,
            WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 32%, #000 68%, transparent)",
            maskImage: "linear-gradient(to bottom, transparent, #000 32%, #000 68%, transparent)",
          }}
        >
          {itens.map((i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => tocar(i)}
              data-roleta-item={i}
              className={cn(
                "flex w-full snap-center items-center justify-center text-[22px] font-semibold tabular-nums transition-colors",
                i === valor ? "text-forte" : "text-texto-3",
              )}
              style={{ height: ALTURA_ITEM }}
            >
              {formatar(i)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
