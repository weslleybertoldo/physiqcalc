// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/dieta/BuscaAlimento.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Alimento } from "@/nutricao/editor/lib/alimentos";
import { etiquetaAlimento, resumoMacros } from "@/nutricao/editor/lib/alimentosUtil";
import { buscarAlimentosDoPlano } from "@/nutricao/editor/lib/planos";

// Busca de alimento do editor do plano (TACO + os próprios da nutricionista): digita → 300 ms → até 12 resultados
// com a etiqueta (marca do próprio ou fonte), macros por 100 g e quantas medidas caseiras tem. Reusa a consulta da
// tela Meus alimentos (a coluna `busca` inclui a marca desde a W38 — "italac" acha o alimento da marca).

/** Etiqueta do alimento nos resultados/itens: a MARCA do alimento próprio quando houver, senão a fonte (TACO / Meu alimento). */
export const BadgeFonte = ({ fonte, marca }: { fonte: string; marca?: string | null }) => {
  const m = fonte === "proprio" ? (marca ?? "").trim() : "";
  return (
    <span
      className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border ${fonte === "proprio" ? "border-verde/50 text-verde-3" : "border-linha-2 text-texto-2"}`}
      data-badge-fonte={fonte}
      data-badge-marca={m || undefined}
    >
      {etiquetaAlimento({ fonte, marca })}
    </span>
  );
};

interface Props {
  onEscolher: (a: Alimento) => void;
  /** ids que não devem aparecer (ex.: o próprio alimento do item, nos substitutos) */
  excluirIds?: string[];
  autoFocus?: boolean;
  placeholder?: string;
}

export default function BuscaAlimento({ onEscolher, excluirIds = [], autoFocus = true, placeholder = "Busque o alimento (TACO ou os seus)" }: Props) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Alimento[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const req = useRef(0);

  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) {
      setResultados(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const meu = ++req.current;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const lista = await buscarAlimentosDoPlano(q, 12);
          if (meu !== req.current) return;
          setResultados(lista);
          setErro(null);
        } catch (e) {
          if (meu !== req.current) return;
          setErro(e instanceof Error ? e.message : "Não foi possível buscar os alimentos");
          setResultados([]);
        } finally {
          if (meu === req.current) setBuscando(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [termo]);

  const excluir = new Set(excluirIds);
  const visiveis = (resultados ?? []).filter((a) => !excluir.has(a.id));
  const curto = termo.trim().length > 0 && termo.trim().length < 2;

  return (
    <div className="space-y-2" data-busca-alimento-bloco data-buscando={buscando ? "1" : "0"}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-2" />
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="h-10 w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] pl-9 pr-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-verde-3"
          data-busca-alimento
        />
      </div>
      {erro && <p role="alert" className="text-xs text-rosa-3 font-body">{erro}</p>}
      {curto && <p className="text-xs text-texto-3 font-body">Digite pelo menos 2 letras.</p>}
      {resultados !== null && (
        visiveis.length === 0 ? (
          <p className="text-sm text-texto-2 font-body py-2" data-busca-nenhum>
            {buscando ? "Buscando..." : "Nenhum alimento encontrado — confira a grafia ou cadastre em Meus alimentos."}
          </p>
        ) : (
          <ul className="max-h-64 overflow-y-auto divide-y divide-linha border border-linha-2" data-resultados-alimento={visiveis.length}>
            {visiveis.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onEscolher(a)}
                  className="w-full text-left px-3 py-2 hover:bg-[rgba(16,185,129,.08)] transition-colors"
                  data-resultado-alimento={a.id}
                  data-resultado-fonte={a.fonte}
                >
                  <span className="text-sm text-texto font-body flex flex-wrap items-center gap-2">
                    <span data-resultado-nome>{a.nome}</span>
                    <BadgeFonte fonte={a.fonte} marca={a.marca} />
                  </span>
                  <span className="block text-[10px] uppercase tracking-wider text-texto-3 font-body">
                    {resumoMacros(a)} / 100 g
                    {a.medidas_caseiras.length ? ` · ${a.medidas_caseiras.length} medida${a.medidas_caseiras.length > 1 ? "s" : ""} caseira${a.medidas_caseiras.length > 1 ? "s" : ""}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
