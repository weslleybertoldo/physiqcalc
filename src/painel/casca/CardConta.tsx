import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { Avatar } from "@/ui/premium/Avatar";
import type { ContaCasca } from "@/ui/casca/dadosCasca";

function Corpo({ conta, seta }: { conta: ContaCasca; seta: boolean }) {
  return (
    <>
      <Avatar src={conta.fotoUrl} nome={conta.nome} tamanho={30} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-semibold text-texto">{conta.nome}</span>
        <span className="block truncate text-[11.5px] font-medium text-texto-2">
          {conta.profissionais} {conta.profissionais === 1 ? "profissional" : "profissionais"}
        </span>
      </span>
      {seta && <ChevronDown aria-hidden className="h-4 w-4 flex-none text-texto-3" />}
    </>
  );
}

const CLASSE = "flex w-full items-center gap-2.5 rounded-[14px] border border-linha bg-superficie px-2.5 py-[9px]";

/** Card da conta no topo do menu (`.ws` da tela 6): nome, nº de profissionais e a troca de conta (NF13). */
export function CardConta({ conta, contas, trocarConta }: { conta: ContaCasca; contas: ContaCasca[]; trocarConta?: (id: string) => void }) {
  const varias = contas.length > 1 && Boolean(trocarConta);
  if (!varias) {
    return (
      <div className={CLASSE} data-card-conta>
        <Corpo conta={conta} seta={false} />
      </div>
    );
  }
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={`${CLASSE} transition-colors hover:border-linha-2`} data-card-conta aria-label="Trocar de conta">
          <Corpo conta={conta} seta />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[240px] rounded-2xl border border-linha-2 bg-tela p-1.5 text-texto shadow-[0_24px_60px_-20px_rgba(0,0,0,.85)]"
        >
          <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-texto-4">Suas contas</DropdownMenu.Label>
          {contas.map((c) => (
            <DropdownMenu.Item
              key={c.id ?? c.nome}
              onSelect={() => c.id && trocarConta?.(c.id)}
              className="flex h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-2 text-[13px] outline-none data-[highlighted]:bg-superficie-2"
            >
              <Avatar src={c.fotoUrl} nome={c.nome} tamanho={26} />
              <span className="min-w-0 flex-1 truncate font-medium">{c.nome}</span>
              {c.id === conta.id && <Check aria-hidden className="h-4 w-4 text-violeta-2" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
