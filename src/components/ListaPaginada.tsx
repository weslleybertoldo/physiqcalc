import { useCallback, useEffect, useRef, useState } from "react";

// Listas de 20 em 20 com "Ver mais" (decisão 14 do Weslley, 12/09/2026).
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

/**
 * Acumula páginas de uma fonte paginada { itens, total }.
 * `fetchPage(offset, limit)` deve devolver a página; `deps` reinicia a lista (ex.: busca).
 */
export function usePaginado<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ itens: T[]; total: number }>,
  deps: unknown[] = [],
  limit = ITENS_PAGINA,
) {
  const [itens, setItens] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const reqRef = useRef(0);

  const carregar = useCallback(async (offset: number) => {
    const meu = ++reqRef.current;
    if (offset === 0) setLoading(true); else setCarregandoMais(true);
    setErro(null);
    try {
      const r = await fetchPage(offset, limit);
      if (meu !== reqRef.current) return; // resposta antiga
      setItens((prev) => (offset === 0 ? r.itens : [...prev, ...r.itens]));
      setTotal(r.total);
    } catch (e: any) {
      if (meu !== reqRef.current) return;
      setErro(e?.message || "erro");
    } finally {
      if (meu === reqRef.current) { setLoading(false); setCarregandoMais(false); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, limit]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void carregar(0); }, deps);

  const verMais = useCallback(() => { void carregar(itens.length); }, [carregar, itens.length]);
  const recarregar = useCallback(() => carregar(0), [carregar]);

  return { itens, total, loading, carregandoMais, erro, verMais, recarregar, setItens };
}
