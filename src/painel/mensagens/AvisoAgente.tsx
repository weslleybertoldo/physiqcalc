import { Smartphone } from "lucide-react";
import { dataHoraCurta } from "./filaUtil";
import { estadoDoAgente, tempoSemSinal } from "./whatsappUtil";

/**
 * Physiq W22 — o aviso "o celular de envio está fora do ar" (spec 4.4 e risco 8: o WhatsApp depende do Moto G7 de casa e agora serve
 * também os personais). Pela última batida do agente (o ping geral, a cada 60 s); sem batida há mais de 3 min, a faixa âmbar aparece.
 * Nada do app para: as mensagens ficam na fila e saem quando ele voltar.
 */
export default function AvisoAgente({ ping, agora }: { ping: string | null | undefined; agora: number }) {
  const e = estadoDoAgente(ping, agora);
  if (e.estado !== "fora") return null;
  return (
    <div role="status" data-aviso-agente="fora" data-aviso-agente-minutos={e.minutos ?? 0}
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ambar/30 px-3.5 py-2.5 text-[13px] text-texto"
      style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}>
      <Smartphone aria-hidden className="h-[18px] w-[18px] flex-none text-ambar-3" strokeWidth={1.9} />
      <span className="min-w-[220px] flex-1 font-medium">
        O celular que envia as mensagens está fora do ar {tempoSemSinal(e.minutos ?? 0)}.{" "}
        <span className="font-normal text-texto-2">Nada se perde: as mensagens ficam na fila e saem quando ele voltar. Uma conexão nova também espera ele voltar.</span>
      </span>
      {e.desde && <span className="text-[12px] text-texto-3" data-aviso-agente-desde>Último sinal {dataHoraCurta(e.desde, new Date(agora))}</span>}
    </div>
  );
}
