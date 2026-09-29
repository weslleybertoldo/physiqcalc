import { Check, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CountdownNotification, { isNativeApp } from "@/lib/countdownNotification";
import {
  SOM_OPCOES, VIBRACAO_FIM_DESCANSO, deveVibrar, gravarSomDescanso, nomeDoSom, temSom, tocarSom, type SomDescanso,
} from "@/lib/somDescanso";
import { PainelDeslizante } from "@/ui/premium/Sheet";

/** Prévia do som (a mesma do popup antigo Configurações › Som: no APK a vibração vai pelo nativo, uso alarme). */
async function ouvir(som: SomDescanso): Promise<void> {
  try {
    if (deveVibrar(som)) {
      if (isNativeApp) CountdownNotification.vibrar().catch(() => {});
      else if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(VIBRACAO_FIM_DESCANSO);
    }
    if (!temSom(som)) return;
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    tocarSom(ctx, som);
  } catch {
    /* sem áudio neste aparelho/navegador */
  }
}

/**
 * Perfil › Som do descanso (C75): Bip, Sino, Alarme, Só vibrar, Silencioso. A MESMA preferência de hoje (localStorage
 * physiq_som_descanso + o evento que faz o descanso da TreinosPage re-armar o serviço nativo) — o timer continua lendo daqui.
 */
export function SheetSom({
  aberto,
  aoMudar,
  valor,
  aoEscolher,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  valor: SomDescanso;
  aoEscolher: (s: SomDescanso) => void;
}) {
  const escolher = (s: SomDescanso) => {
    gravarSomDescanso(s);
    aoEscolher(s);
    toast.success(`Som do descanso: ${nomeDoSom(s)}`);
  };
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Som do descanso"
      descricao="Toca quando o tempo de descanso acaba. Vale neste aparelho; no app Android, com fone conectado, sai só no fone.">
      <ul className="flex flex-col gap-2 pt-2" data-sheet-som role="radiogroup" aria-label="Som do descanso">
        {SOM_OPCOES.map((op) => {
          const ativo = op.valor === valor;
          return (
            <li key={op.valor} className="flex items-center gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => escolher(op.valor)}
                data-som-opcao={op.valor}
                className={cn(
                  "flex min-h-[52px] flex-1 items-center gap-3 rounded-2xl border px-3.5 py-2 text-left transition-colors",
                  ativo ? "border-violeta/55 bg-violeta/10" : "border-linha bg-superficie hover:border-linha-2",
                )}
              >
                <span className={cn("flex h-5 w-5 flex-none items-center justify-center rounded-full border", ativo ? "border-violeta bg-violeta text-white" : "border-linha-2")}>
                  {ativo && <Check aria-hidden className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-texto">{op.nome}</span>
                  <span className="block text-[12px] text-texto-2">{op.descricao}</span>
                </span>
              </button>
              <button type="button" onClick={() => void ouvir(op.valor)} data-som-ouvir={op.valor} aria-label={`Ouvir ${op.nome}`}
                className="pq-ibtn flex-none" style={{ width: 44, height: 44 }}>
                <Volume2 aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </PainelDeslizante>
  );
}
