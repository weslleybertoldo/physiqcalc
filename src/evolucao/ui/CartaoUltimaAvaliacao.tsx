import { ClipboardCheck } from "lucide-react";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { linhaDaAvaliacao } from "../formato";
import type { Avaliacao } from "../tipos";

/**
 * Card da última avaliação (tela 4): ícone (violeta = do personal, verde = da nutricionista), "Avaliação por 7 dobras",
 * "14/06 · Lucas Ferreira, seu personal" e o botão Ver (a composição completa).
 */
export function CartaoUltimaAvaliacao({ av, aoVer }: { av: Avaliacao; aoVer: () => void }) {
  const nutri = av.autor.papel === "nutricionista";
  return (
    <Cartao className="flex items-center gap-3 px-3.5 py-3" data-ultima-avaliacao={av.id} data-ultima-origem={av.origem}>
      <span
        className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border"
        style={
          nutri
            ? { background: "var(--p-chip-n-fundo)", color: "var(--p-chip-n-texto)", borderColor: "var(--p-chip-n-borda)" }
            : { background: "var(--p-chip-t-fundo)", color: "var(--p-chip-t-texto)", borderColor: "var(--p-chip-t-borda)" }
        }
      >
        <ClipboardCheck aria-hidden className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-texto" data-ultima-titulo>
          {av.titulo}
        </b>
        <span className="mt-0.5 block truncate text-[12px] text-texto-2" data-ultima-linha>
          {linhaDaAvaliacao(av)}
        </span>
      </div>
      <Botao variante="g" tamanho="sm" onClick={aoVer} data-ver-avaliacao>
        Ver
      </Botao>
    </Cartao>
  );
}
