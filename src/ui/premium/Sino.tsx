import { useState } from "react";
import { Popover } from "radix-ui";
import { Bell, BellRing, CalendarCheck, ClipboardCheck, MessageCircle, Receipt, Salad } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BotaoIcone } from "./Botao";
import { tempoDesde } from "./texto";
import { useAvisos, type AvisoSino } from "./useAvisos";

const ICONE_TIPO: Record<string, LucideIcon> = {
  plano_atualizado: Salad,
  reacao_diario: MessageCircle,
  pagamento_confirmado: Receipt,
  pagamento_recusado: Receipt,
  consulta_marcada: CalendarCheck,
  avaliacao_nova: ClipboardCheck,
};

function Linha({ aviso, aoAbrir }: { aviso: AvisoSino; aoAbrir: (a: AvisoSino) => void }) {
  const Icone = ICONE_TIPO[aviso.tipo] ?? BellRing;
  return (
    <button
      type="button"
      onClick={() => aoAbrir(aviso)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-superficie"
      data-aviso={aviso.id}
    >
      <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-suave">
        <Icone aria-hidden className="h-[15px] w-[15px]" strokeWidth={1.75} />
      </span>
      <span className={cn("min-w-0 flex-1 text-[13px] leading-snug", aviso.lido_em ? "text-texto-2" : "font-semibold text-texto")}>{aviso.titulo}</span>
      <span className="flex-none text-[11.5px] text-texto-3">{tempoDesde(aviso.criado_em)}</span>
    </button>
  );
}

/** Sino de avisos (NF9) do topo do painel e do Início do app: ponto rosa quando há aviso não lido. */
export function Sino({ className, tamanho }: { className?: string; tamanho?: number }) {
  const { avisos, naoLidos, marcarLidos, carregando } = useAvisos();
  const [aberto, setAberto] = useState(false);
  const navigate = useNavigate();

  const abrir = (a: AvisoSino) => {
    setAberto(false);
    if (a.link) {
      if (/^https?:\/\//.test(a.link)) window.open(a.link, "_blank", "noopener,noreferrer");
      else navigate(a.link);
    }
  };

  return (
    <Popover.Root
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) marcarLidos();
      }}
    >
      <Popover.Trigger asChild>
        <BotaoIcone icone={Bell} rotulo={naoLidos ? `Avisos (${naoLidos} novos)` : "Avisos"} ponto={naoLidos > 0} className={className} tamanho={tamanho} data-sino />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          data-sino-lista
          className="z-50 w-[min(360px,calc(100vw-32px))] rounded-[20px] border border-linha-2 bg-tela p-2 text-texto shadow-[0_24px_60px_-20px_rgba(0,0,0,.85)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
            <span className="text-[14px] font-semibold text-texto">Avisos</span>
            {naoLidos > 0 && <span className="pq-chip pq-chip-r">{naoLidos} novos</span>}
          </div>
          {carregando ? (
            <p className="px-2 py-6 text-center text-[13px] text-texto-2">Carregando…</p>
          ) : avisos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-7 text-center" data-sino-vazio>
              <Bell aria-hidden className="h-5 w-5 text-texto-3" strokeWidth={1.75} />
              <p className="text-[13px] font-semibold text-texto">Nenhum aviso por aqui</p>
              <p className="text-[12px] text-texto-2">Plano atualizado, pagamentos e consultas aparecem aqui.</p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {avisos.map((a) => (
                <Linha key={a.id} aviso={a} aoAbrir={abrir} />
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
