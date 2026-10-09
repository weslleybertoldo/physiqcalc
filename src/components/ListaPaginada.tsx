// Listas de 20 em 20 com "Ver mais" (decisão 14 do Weslley, 12/09/2026) — hoje só a Biblioteca do master. hml-14b: o usePaginado
// (as páginas acumuladas no navegador) saiu; as listas do painel são páginas do banco (src/ui/premium/Paginacao.tsx).
export const ITENS_PAGINA = 20;

interface Props {
  total: number;
  mostrando: number;
  carregandoMais?: boolean;
  onVerMais: () => void;
  rotulo?: string;
}

export function ListaPaginada({ total, mostrando, carregandoMais, onVerMais, rotulo = "itens" }: Props) {
  if (total === 0) return null;
  return (
    <div className="flex justify-between items-center pt-3 text-[11px] text-muted-foreground font-body" data-lista-paginada>
      <span>Mostrando {Math.min(mostrando, total)} de {total} {rotulo}</span>
      {mostrando < total && (
        <button type="button" onClick={onVerMais} disabled={carregandoMais}
          className="font-heading uppercase tracking-widest text-[10px] text-primary border border-primary/50 px-3 py-1.5 hover:bg-primary/10 transition-colors disabled:opacity-50">
          {carregandoMais ? "Carregando..." : `Ver mais (${total - mostrando})`}
        </button>
      )}
    </div>
  );
}
