// Physiq W21 — porta de src/components/preconsulta/PerguntasResposta.tsx do PhysiqNutri (main 294887a), no visual premium: as perguntas
// por tipo para RESPONDER (escala = botões 0..máximo, sim/não = 2 botões, múltipla = opções, texto = campo livre). Usado na página
// pública /f/:slug. Os `data-*` são os do site antigo (o E2E lê igual). `mostrarPontos` esconde os pontos das opções do público.
import { cn } from "@/lib/utils";
import { RESPOSTA_TEXTO_MAX, formatarPontos, type Pergunta, type Resposta, type Respostas } from "@/nutricao/prontuario/lib/questionariosUtil";

const BTN_TOGGLE = (ativo: boolean) =>
  cn(
    "inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3.5 text-[13.5px] font-semibold tabular-nums transition-colors disabled:opacity-50",
    ativo ? "border-transparent bg-texto text-tela shadow-[0_8px_24px_-10px_rgba(255,255,255,.55)]" : "border-linha-2 bg-[rgba(255,255,255,.03)] text-texto-2 hover:border-linha-3 hover:text-texto",
  );
const TEXTAREA_RESPOSTA =
  "min-h-[88px] w-full rounded-[14px] border border-linha-2 bg-superficie px-4 py-3 text-[14.5px] leading-relaxed text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-violeta/60 disabled:opacity-60";

interface Props {
  perguntas: Pergunta[];
  respostas: Respostas;
  onResponder: (id: string, valor: Resposta) => void;
  mostrarPontos?: boolean;
  desabilitado?: boolean;
}

export default function PerguntasResposta({ perguntas, respostas, onResponder, mostrarPontos = false, desabilitado = false }: Props) {
  return (
    <div className="flex flex-col gap-3" data-perguntas-aplicacao data-perguntas-aplicacao-total={perguntas.length}>
      {perguntas.map((p, i) => {
        const r = respostas[p.id];
        return (
          <div key={p.id} className="rounded-2xl border border-linha bg-[rgba(255,255,255,.02)] px-4 py-3.5" data-pergunta-aplicacao={i} data-pergunta-tipo={p.tipo}>
            <p className="text-[14.5px] font-medium leading-snug text-texto">
              <span className="mr-1 tabular-nums text-texto-3">{i + 1}.</span> {p.texto}
            </p>
            <div className="mt-3">
              {p.tipo === "escala" && (
                <div className="flex flex-wrap items-center gap-1.5" data-escala={i}>
                  {Array.from({ length: p.max + 1 }, (_, v) => (
                    <button key={v} type="button" className={BTN_TOGGLE(r === v)} onClick={() => onResponder(p.id, v)} disabled={desabilitado} aria-pressed={r === v}
                      aria-label={`${p.texto}: ${v}`} data-escala-valor={`${i}-${v}`}>
                      {v}
                    </button>
                  ))}
                  <span className="ml-1 text-[11.5px] text-texto-3">0 = nunca · {p.max} = sempre</span>
                </div>
              )}
              {p.tipo === "sim_nao" && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" className={BTN_TOGGLE(r === true)} onClick={() => onResponder(p.id, true)} disabled={desabilitado} aria-pressed={r === true} data-sim={i}>Sim</button>
                  <button type="button" className={BTN_TOGGLE(r === false)} onClick={() => onResponder(p.id, false)} disabled={desabilitado} aria-pressed={r === false} data-nao={i}>Não</button>
                  {mostrarPontos && <span className="ml-1 text-[11.5px] text-texto-3">sim = {formatarPontos(p.pontos_sim)} pt</span>}
                </div>
              )}
              {p.tipo === "multipla" && (
                <div className="flex flex-col gap-1.5" data-opcoes={i}>
                  {p.opcoes.map((o, k) => (
                    <label key={k} className={cn("flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-[14px] transition-colors",
                      r === k ? "border-linha-3 bg-superficie-2 text-texto" : "border-linha text-texto-2 hover:text-texto")}>
                      <input type="radio" name={`resposta-${p.id}`} className="accent-[#FAFAFA]" checked={r === k} onChange={() => onResponder(p.id, k)} disabled={desabilitado} data-opcao={`${i}-${k}`} />
                      <span>{o.texto}</span>
                      {mostrarPontos && <span className="text-[11px] text-texto-3">({formatarPontos(o.pontos)} pt)</span>}
                    </label>
                  ))}
                </div>
              )}
              {p.tipo === "texto" && (
                <textarea
                  className={TEXTAREA_RESPOSTA}
                  maxLength={RESPOSTA_TEXTO_MAX}
                  placeholder="Sua resposta"
                  value={typeof r === "string" ? r : ""}
                  onChange={(e) => onResponder(p.id, e.target.value)}
                  disabled={desabilitado}
                  aria-label={p.texto}
                  data-campo-texto={i}
                />
              )}
            </div>
          </div>
        );
      })}
      {perguntas.length === 0 && <p className="text-[13px] text-texto-3" data-sem-perguntas>Este formulário ainda não tem perguntas.</p>}
    </div>
  );
}
