// Physiq W-A P5 — a busca do aluno (padrão 11 da spec): as receitas dele, os alimentos dele, os dos planos dele e a TACO, 20 por página, a partir
// de 2 letras (300 ms depois de parar de digitar). Serve o "Adicionar alimento" do dia e os ingredientes da receita (sem as receitas). Tocar
// num resultado = escolher. Erro → a frase e "Tentar de novo"; nada achado → o vazio.
import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { ItemDaBusca } from "@/aluno-dia/tipos";
import { Campo } from "@/entrada/pecas/Campo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { LIMITES_DO_DIA, linhaDaBusca } from "../regras";
import { ROTULO_DA_BUSCA, TEXTOS } from "../textos";
import { termoDaBusca, useAtrasado, useBuscaDoAluno } from "../useDietaLivre";

const TOM_DA_BUSCA: Record<ItemDaBusca["tipo"], "n" | "c" | "t" | "g"> = { receita: "t", meu: "n", plano: "c", taco: "g" };

export function BuscaDeAlimentos({ ativo, semReceitas = false, aoEscolher }: { ativo: boolean; semReceitas?: boolean; aoEscolher: (i: ItemDaBusca) => void }) {
  const [termo, setTermo] = useState("");
  const atrasado = useAtrasado(termo, 300);
  const busca = useBuscaDoAluno(atrasado, ativo);
  const curto = termoDaBusca(atrasado).length < LIMITES_DO_DIA.termoMinimo;
  const itens = (busca.data?.pages ?? []).flatMap((p) => p.itens).filter((i) => !semReceitas || i.tipo !== "receita");

  let lista: React.ReactNode;
  if (curto) lista = <p className="text-[12.5px] text-texto-3" data-busca-estado="curto">{TEXTOS.buscarDica}</p>;
  else if (busca.isError && !busca.data) {
    lista = (
      <span className="flex items-center justify-between gap-3" data-busca-estado="erro">
        <span className="text-[12.5px] text-texto-2">{TEXTOS.buscarErro}</span>
        <Botao tamanho="sm" icone={RefreshCw} onClick={() => void busca.refetch()}>Tentar de novo</Botao>
      </span>
    );
  } else if (!busca.data) {
    lista = (
      <div role="status" aria-busy="true" aria-label="Buscando" className="flex flex-col gap-2" data-busca-estado="carregando">
        {[0, 1, 2].map((i) => <Esqueleto key={i} className="h-11 w-full rounded-xl" />)}
      </div>
    );
  } else if (itens.length === 0) lista = <p className="text-[12.5px] text-texto-3" data-busca-estado="vazio">{TEXTOS.buscarNada}</p>;
  else {
    lista = (
      <ul className="flex flex-col gap-1.5" data-busca-estado="lista" data-busca-itens={itens.length}>
        {itens.map((i) => (
          <li key={`${i.tipo}:${i.id}`}>
            <button type="button" onClick={() => aoEscolher(i)} data-busca-item={i.id} data-busca-tipo={i.tipo}
              className="flex w-full items-center gap-3 rounded-xl border border-linha bg-superficie px-3 py-2.5 text-left transition-colors hover:border-linha-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-texto">{i.nome}</span>
                <span className="block truncate text-[11.5px] text-texto-3">{linhaDaBusca(i, ROTULO_DA_BUSCA[i.tipo])}</span>
              </span>
              <Chip tom={TOM_DA_BUSCA[i.tipo]} className="flex-none">{i.tipo === "taco" ? "TACO" : i.tipo === "receita" ? "receita" : i.tipo === "meu" ? "seu" : "plano"}</Chip>
            </button>
          </li>
        ))}
        {busca.hasNextPage && (
          <li>
            <Botao variante="g" tamanho="sm" className="w-full" onClick={() => void busca.fetchNextPage()} disabled={busca.isFetchingNextPage} data-busca-mais>
              {busca.isFetchingNextPage ? "Buscando…" : TEXTOS.verMais}
            </Botao>
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-busca-alimentos={semReceitas ? "ingrediente" : "dia"}>
      <span className="relative">
        <Campo rotulo={TEXTOS.buscar} value={termo} onChange={(e) => setTermo(e.target.value)} maxLength={LIMITES_DO_DIA.termo} autoComplete="off"
          enterKeyHint="search" placeholder={TEXTOS.buscarPlaceholder} className="pl-10" data-busca-termo />
        <Search aria-hidden className="pointer-events-none absolute bottom-[15px] left-3.5 h-4 w-4 text-texto-3" strokeWidth={1.75} />
      </span>
      {lista}
    </div>
  );
}
