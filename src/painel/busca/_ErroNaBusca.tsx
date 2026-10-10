// Physiq hml-17 (H-39) — a linha de erro das fontes da busca global (Ctrl K). Arquivo com "_" no começo: o registro não o trata como
// fonte (src/rotas/registro.ts › montarPadrao).
import { Command } from "cmdk";
import { CircleAlert } from "lucide-react";
import { GrupoBusca } from "@/ui/premium/Busca";

/**
 * A fonte falhou (a API caindo, por exemplo): o grupo fica com 1 linha "Não deu para buscar <o quê> agora — tocar para tentar de
 * novo" — antes o grupo sumia e a paleta dizia "Nada encontrado." (ou só o "Ir para"), como se não houvesse resultado. As palavras
 * da linha levam o termo digitado: o filtro do cmdk não a esconde. Tocar (ou Enter) faz a busca de novo.
 */
export function ErroNaBusca({ titulo, oque, termo, tentar }: { titulo: string; oque: "alunos" | "alimentos" | "treinos"; termo: string; tentar: () => void }) {
  return (
    <GrupoBusca titulo={titulo}>
      <Command.Item
        value={`erro ${oque} ${termo}`}
        onSelect={tentar}
        data-busca-erro={oque}
        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-texto-2 data-[selected=true]:bg-superficie-2 data-[selected=true]:text-texto"
      >
        <CircleAlert aria-hidden className="h-[18px] w-[18px] flex-none text-rosa-3" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">Não deu para buscar {oque} agora — tocar para tentar de novo</span>
      </Command.Item>
    </GrupoBusca>
  );
}
