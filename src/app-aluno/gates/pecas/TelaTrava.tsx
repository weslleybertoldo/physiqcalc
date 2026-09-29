import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { useSessao } from "@/nucleo/sessao";
import { Cartao } from "@/ui/premium/Cartao";
import { Marca } from "@/ui/premium/Marca";

/**
 * Tela inteira de trava do app do aluno (spec 9: "Acesso pausado", "Seu profissional ainda não liberou seu acesso"…),
 * no visual das telas aprovadas: cartão com borda de luz, ícone, título, texto e as ações. Sempre com "Sair".
 */
export function TelaTrava({
  icone: Icone,
  tom,
  titulo,
  texto,
  acoes,
  marca = "trava",
}: {
  icone: LucideIcon;
  tom: string;
  titulo: ReactNode;
  texto: ReactNode;
  acoes?: ReactNode;
  marca?: string;
}) {
  const { sair } = useSessao();
  return (
    <div data-trava-app={marca} className="relative flex min-h-[calc(100vh-40px)] flex-col items-center justify-center px-5 py-10">
      <Cartao brilho className="flex w-full max-w-sm flex-col items-center gap-4 px-6 py-8 text-center">
        <Marca tamanho={36} soIcone />
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie" style={{ color: tom }}>
          <Icone aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.8} />
        </span>
        <h1 className="font-body text-[19px] font-semibold normal-case tracking-[-0.02em] text-texto">{titulo}</h1>
        <p className="text-[13.5px] leading-relaxed text-texto-2">{texto}</p>
        <div className="mt-1 flex w-full flex-col gap-2">
          {acoes}
          <button type="button" onClick={() => void sair()} className="pq-botao pq-botao-g w-full" data-trava-sair>
            <LogOut aria-hidden /> Sair
          </button>
        </div>
      </Cartao>
    </div>
  );
}
