import type { ReactNode } from "react";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { teclaAtalho } from "./atalhos";

/** Campo de busca do topo (`.busca` da tela 6): parece um input, abre a paleta. */
export function BuscaGatilho({ aoAbrir, texto = "Buscar aluno, treino ou alimento", className }: { aoAbrir: () => void; texto?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      data-busca-gatilho
      className={cn(
        "flex h-10 w-[300px] min-w-0 items-center gap-[9px] rounded-xl border border-linha bg-superficie px-3 text-[13px] text-texto-3 transition-colors hover:border-linha-2",
        className,
      )}
    >
      <Search aria-hidden className="h-4 w-4 flex-none" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-left">{texto}</span>
      <kbd className="ml-auto flex-none rounded-md border border-linha-2 px-1.5 py-0.5 font-sans text-[11px] text-texto-2">{teclaAtalho()}</kbd>
    </button>
  );
}

/**
 * Paleta da busca global (NF10): janela com o campo e os grupos de resultados (cmdk). hml-18a (H-40, D): fundo e janela entram e
 * SAEM em 200 ms (fade; a janela com zoom-95) — antes sumiam em 48–120 ms, sem passar por data-state=closed. Quem abre limpa o
 * termo só depois da saída (`useTermoDaBusca`, src/ui/premium/atalhos.ts).
 */
export function PaletaBusca({
  aberto,
  aoMudar,
  placeholder = "Buscar aluno, treino ou alimento",
  vazio = "Nada encontrado.",
  termo,
  aoMudarTermo,
  children,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  placeholder?: string;
  vazio?: ReactNode;
  /** Texto digitado (controlado), para as fontes de busca que consultam o servidor. */
  termo?: string;
  aoMudarTermo?: (termo: string) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={aberto} onOpenChange={aoMudar}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          data-paleta-busca
          className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-[22px] border border-linha-2 bg-tela text-texto shadow-[0_30px_80px_-20px_rgba(0,0,0,.85)] outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <Dialog.Title className="sr-only">Busca</Dialog.Title>
          <Dialog.Description className="sr-only">Digite para buscar e use as setas para escolher.</Dialog.Description>
          <Command label="Busca" className="flex flex-col">
            <div className="flex items-center gap-2.5 border-b border-linha px-4">
              <Search aria-hidden className="h-[18px] w-[18px] flex-none text-texto-3" strokeWidth={1.75} />
              <Command.Input
                autoFocus
                value={termo}
                onValueChange={aoMudarTermo}
                placeholder={placeholder}
                className="h-14 w-full bg-transparent text-[15px] text-texto outline-none placeholder:text-texto-3"
              />
            </div>
            <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-texto-2">{vazio}</Command.Empty>
              {children}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Grupo de resultados da paleta (título em caixa alta pequena). */
export function GrupoBusca({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={titulo}
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-texto-4"
    >
      {children}
    </Command.Group>
  );
}

/** Um resultado da paleta: ícone, texto, detalhe à direita. */
export function ItemBusca({
  icone: Icone,
  rotulo,
  detalhe,
  palavras,
  aoEscolher,
}: {
  icone?: LucideIcon;
  rotulo: string;
  detalhe?: string;
  /** Termos extras que também acham o item. */
  palavras?: string[];
  aoEscolher: () => void;
}) {
  return (
    <Command.Item
      value={[rotulo, ...(palavras ?? [])].join(" ")}
      onSelect={aoEscolher}
      className="flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-texto-2 data-[selected=true]:bg-superficie-2 data-[selected=true]:text-texto"
    >
      {Icone && <Icone aria-hidden className="h-[18px] w-[18px] flex-none" strokeWidth={1.75} />}
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
      {detalhe && <span className="flex-none text-[11.5px] text-texto-3">{detalhe}</span>}
    </Command.Item>
  );
}
