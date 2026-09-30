import { useState } from "react";
import { Minus, Pause, Play, Plus, RotateCcw, SkipForward, Volume2, X } from "lucide-react";
import { lerSomDescanso, nomeDoSom, type SomDescanso } from "@/lib/somDescanso";
import { SheetSom } from "@/app-aluno/perfil/pecas/SheetSom";
import { Anel } from "@/ui/premium/Anel";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { formatarDescanso } from "../prescricao";
import { useDescanso, type OpcoesDescanso } from "../useDescanso";

const RAPIDOS = [30, 45, 60, 90, 120, 180];

function relogio(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Card do descanso (tela 2, `.timer`): anel com a contagem, "Depois: série 3 do crucifixo", −15 s e Pular. Flutua acima da
 * barra de abas. Tocar no anel ou no texto abre os ajustes de hoje: pausar/continuar, recomeçar, o tempo (0,5 a 10 min) e o
 * som do descanso (as mesmas chaves do Perfil).
 */
export function CartaoDescanso(props: OpcoesDescanso) {
  const d = useDescanso(props);
  const [ajustes, setAjustes] = useState(false);
  const [som, setSom] = useState<SomDescanso>(lerSomDescanso);
  const [folhaSom, setFolhaSom] = useState(false);
  if (!props.ativo) return null;

  const pct = d.duracao > 0 ? d.segundos / d.duracao : 0;
  const texto = d.acabou ? "Hora de treinar!" : d.pausado ? "Descanso pausado" : "Descanso";
  const depois = d.depois ? `Depois: ${d.depois}` : `${props.exercicioNome} — série ${props.numeroSerie}`;

  return (
    <>
      <div
        role="timer"
        aria-live="off"
        aria-label={`Descanso: ${relogio(d.segundos)}`}
        data-descanso={d.acabou ? "acabou" : d.pausado ? "pausado" : "correndo"}
        className="fixed inset-x-[14px] z-40 mx-auto flex max-w-[532px] items-center gap-3 rounded-[24px] py-3 pl-3.5 pr-3"
        style={{
          bottom: "calc(var(--casca-reserva-baixo, 16px) - 2px)",
          background: "rgba(28,24,40,.82)",
          backdropFilter: "blur(22px)",
          WebkitBackdropFilter: "blur(22px)",
          border: "1px solid rgba(167,139,250,.35)",
          boxShadow: "0 20px 50px -12px rgba(0,0,0,.95), 0 0 40px -10px rgba(139,92,246,.55)",
        }}
      >
        <button type="button" onClick={() => setAjustes(true)} aria-label="Ajustes do descanso" data-descanso-ajustes className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Anel pct={pct} tamanho={58} espessura={6} cor="#A78BFA" gradiente={["#C4B5FD", "#7C3AED"]} trilho="rgba(255,255,255,.08)" rotulo={`${d.segundos} segundos de descanso`}>
            <span className={`text-[14px] font-bold tabular-nums text-white ${d.acabou ? "animate-pulse" : ""}`} data-descanso-tempo>{relogio(d.segundos)}</span>
          </Anel>
          <span className="min-w-0 flex-1">
            <b className="block text-[14px] font-semibold text-white">{texto}</b>
            <span className="line-clamp-2 text-[12px] leading-snug text-[#A1A1AA]" data-descanso-depois>{depois}</span>
          </span>
        </button>
        {!d.acabou && (
          <button type="button" onClick={d.menos15} className="pq-botao pq-botao-g pq-botao-sm flex-none tabular-nums" data-descanso-menos15>
            −15 s
          </button>
        )}
        <button type="button" onClick={d.pular} className="pq-botao pq-botao-w pq-botao-sm flex-none" data-descanso-pular
          style={{ background: "#FAFAFA", color: "#09090B" }}>
          {d.acabou ? <X aria-hidden /> : <SkipForward aria-hidden />}
          {d.acabou ? "Fechar" : "Pular"}
        </button>
      </div>

      <PainelDeslizante aberto={ajustes} aoMudar={setAjustes} titulo="Descanso" descricao={`${props.exercicioNome} — série ${props.numeroSerie}`}>
        <div className="flex flex-col gap-4 pt-1" data-ajustes-descanso>
          <div className="flex items-center justify-center gap-6">
            <Anel pct={pct} tamanho={120} espessura={9} cor="#A78BFA" gradiente={["#C4B5FD", "#7C3AED"]}>
              <span className="text-[26px] font-bold tabular-nums text-texto">{relogio(d.segundos)}</span>
              <span className="text-[11px] text-texto-3">de {relogio(d.duracao)}</span>
            </Anel>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Botao variante="g" icone={d.pausado ? Play : Pause} onClick={d.pausarOuContinuar} disabled={d.acabou} data-descanso-pausar>
              {d.pausado ? "Continuar" : "Pausar"}
            </Botao>
            <Botao variante="g" icone={RotateCcw} onClick={d.recomecar} data-descanso-recomecar>Recomeçar</Botao>
            <Botao variante="g" className="px-4" onClick={d.menos15} disabled={d.acabou} data-descanso-menos15-ajuste>−15 s</Botao>
          </div>
          <div>
            <div className="pq-eyebrow mb-2">Tempo de descanso</div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Menos 15 segundos no tempo" onClick={() => d.mudarTempo(d.duracao - 15)} className="pq-ibtn" data-descanso-tempo-menos>
                <Minus aria-hidden />
              </button>
              <span className="flex-1 text-center text-[17px] font-semibold tabular-nums text-texto" data-descanso-duracao>{formatarDescanso(d.duracao)}</span>
              <button type="button" aria-label="Mais 15 segundos no tempo" onClick={() => d.mudarTempo(d.duracao + 15)} className="pq-ibtn" data-descanso-tempo-mais>
                <Plus aria-hidden />
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {RAPIDOS.map((s) => (
                <button key={s} type="button" onClick={() => d.mudarTempo(s)} data-descanso-rapido={s}
                  className={`pq-chip ${d.duracao === s ? "pq-chip-t" : "pq-chip-g"} h-8 px-3`}>
                  {formatarDescanso(s)}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setFolhaSom(true)} data-descanso-som
            className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 text-left">
            <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie-2 text-suave">
              <Volume2 aria-hidden className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="flex-1 text-[13.5px] font-medium text-texto">Som do descanso</span>
            <span className="text-[12.5px] text-texto-2" data-descanso-som-valor>{nomeDoSom(som)}</span>
          </button>
        </div>
      </PainelDeslizante>
      <SheetSom aberto={folhaSom} aoMudar={setFolhaSom} valor={som} aoEscolher={setSom} />
    </>
  );
}
