import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Eye, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSessao } from "@/nucleo/sessao";
import { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
import { CampoBusca } from "@/painel/dietas/pecas";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoVazio } from "@/ui/premium/Estados";
import { abrirImpresso, baixarImpresso } from "@/ferramentas/impressos/impressosPdf";
import {
  CATEGORIAS, ID_CODIGO_ETICA, IMPRESSOS, LINK_CFN, cabecalhoPadrao, categoriaDaURL, categoriasComItens, contarPorCategoria, filtrarImpressos, infoCategoria,
  textoContagem, textoPaginas, type Impresso,
} from "@/ferramentas/impressos/impressosUtil";

const CLASSE_CAMPO =
  "h-11 w-full rounded-[14px] border border-linha-2 bg-superficie px-3.5 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-verde/60";

/**
 * Ferramentas › Impressos (W26 — spec 4.6 e N-20; padrão das telas 6 e 8; só com o módulo Nutrição — o menu e a rota recusam sem ele):
 * os 7 PDFs prontos do consultório (ficha antropométrica, rastreamento metabólico, carências, ética, higienização, temperatura e ficha
 * técnica), gerados na hora no navegador com o nome do profissional no cabeçalho — os MESMOS do site antigo do Nutri, com a marca
 * PHYSIQ. Nada é salvo: baixe ou visualize quando precisar.
 */
export default function Impressos() {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? "";
  const [sp, setSp] = useSearchParams();
  const busca = sp.get("q") ?? "";
  const cat = categoriaDaURL(sp.get("cat"));
  const [buscaLocal, setBuscaLocal] = useState(busca);
  const [nome, setNome] = useState("");
  const [nomeTocado, setNomeTocado] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);

  const perfilQ = useQuery({ queryKey: ["impressos-nome", uid], queryFn: () => nomeDaNutricionista(uid), enabled: !!uid, staleTime: 60_000 });
  // o nome do perfil; sem ele, o do cadastro (Google) — nunca o e-mail
  const meta = (usuario as { user_metadata?: { full_name?: string; name?: string } } | null)?.user_metadata;
  const nomePerfil = (perfilQ.data || meta?.full_name || meta?.name || "").trim();
  useEffect(() => {
    if (!nomeTocado && nomePerfil) setNome(nomePerfil);
  }, [nomePerfil, nomeTocado]);

  const contagens = useMemo(() => contarPorCategoria(IMPRESSOS), []);
  const nCategorias = categoriasComItens(IMPRESSOS).length;
  const filtrados = useMemo(() => filtrarImpressos(IMPRESSOS, busca, cat), [busca, cat]);

  const setFiltro = useCallback(
    (mud: { q?: string; cat?: string }) => {
      const q = mud.q ?? busca;
      const c = mud.cat ?? cat ?? "";
      const novos: Record<string, string> = {};
      if (q) novos.q = q;
      if (c) novos.cat = c;
      setSp(novos, { replace: true });
    },
    [busca, cat, setSp],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      if (buscaLocal.trim() !== busca) setFiltro({ q: buscaLocal.trim() });
    }, 250);
    return () => clearTimeout(t);
  }, [buscaLocal, busca, setFiltro]);

  const gerar = async (i: Impresso, modo: "baixar" | "abrir") => {
    if (gerando) return;
    setGerando(i.id);
    await new Promise((r) => setTimeout(r, 0)); // deixa o "Gerando…" aparecer antes do trabalho síncrono do jsPDF
    try {
      const ctx = cabecalhoPadrao(nome, new Date());
      if (modo === "baixar") {
        const arquivo = baixarImpresso(i.id, ctx);
        toast.success("PDF gerado", { description: arquivo });
      } else {
        const r = abrirImpresso(i.id, ctx);
        if (r.aberto) toast.success("PDF aberto em nova aba", { description: r.nome });
        else toast.message("Pop-up bloqueado: o PDF foi baixado", { description: r.nome });
      }
    } catch (e) {
      toast.error("Não foi possível gerar o PDF", { description: e instanceof Error ? e.message : "erro inesperado" });
    } finally {
      setGerando(null);
    }
  };

  return (
    <div
      className="flex flex-col gap-4"
      data-pagina-impressos
      data-total-impressos={IMPRESSOS.length}
      data-total-filtrados={filtrados.length}
      data-categoria-ativa={cat ?? "todos"}
      data-gerando={gerando ? "1" : "0"}
      data-perfil-carregando={perfilQ.isLoading ? "1" : "0"}
    >
      <TopoPagina titulo="Impressos" subtitulo={<span data-subtitulo-impressos>Impressos para o seu consultório · {textoContagem(IMPRESSOS.length, nCategorias)}</span>} />

      <Cartao className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">Nome no cabeçalho</span>
            <input
              type="text"
              value={nome}
              maxLength={80}
              onChange={(e) => {
                setNome(e.target.value);
                setNomeTocado(true);
              }}
              placeholder={perfilQ.isLoading ? "Carregando o nome do perfil…" : "Seu nome"}
              className={CLASSE_CAMPO}
              data-campo-nutricionista
              data-nome-do-perfil={nomePerfil}
            />
            <span className="text-[11.5px] text-texto-4">Vai no cabeçalho e no rodapé de todos os PDFs desta página.</span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">Buscar</span>
            <CampoBusca valor={buscaLocal} aoMudar={setBuscaLocal} placeholder="Busque pelo nome do impresso" data-campo-busca-impressos />
            <span className="text-[11.5px] text-texto-4">Materiais prontos para imprimir, gerados na hora. Nada aqui é salvo.</span>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-1.5" data-chips-categoria>
          <button type="button" aria-pressed={!cat} onClick={() => setFiltro({ cat: "" })} data-categoria="todos" data-categoria-total={IMPRESSOS.length}
            className={cn("pq-chip h-8 px-3 text-[12px] normal-case tracking-normal", !cat ? "pq-chip-n" : "pq-chip-g")}>
            Todos · {IMPRESSOS.length}
          </button>
          {CATEGORIAS.map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} title={c.descricao} onClick={() => setFiltro({ cat: cat === c.id ? "" : c.id })}
              data-categoria={c.id} data-categoria-total={contagens[c.id]}
              className={cn("pq-chip h-8 px-3 text-[12px] normal-case tracking-normal", cat === c.id ? "pq-chip-n" : "pq-chip-g")}>
              {c.rotulo} · {contagens[c.id]}
            </button>
          ))}
        </div>
      </Cartao>

      {filtrados.length === 0 ? (
        <EstadoVazio icone={Search} titulo="Nenhum impresso com esse nome" texto="Mude a busca ou a categoria."
          acao={<Botao tamanho="sm" onClick={() => { setBuscaLocal(""); setFiltro({ q: "", cat: "" }); }} data-btn-limpar-busca>Limpar busca</Botao>} />
      ) : (
        <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3" data-lista-impressos>
          {filtrados.map((i) => {
            const c = infoCategoria(i.categoria);
            const esteGerando = gerando === i.id;
            return (
              <li key={i.id} data-impresso={i.id} data-impresso-categoria={i.categoria} data-impresso-paginas={i.paginas}>
                <Cartao className="flex h-full flex-col gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] border border-linha bg-[rgba(16,185,129,.10)] text-verde">
                      <Printer aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </span>
                    <Chip tom="n" className="h-[22px] px-2 text-[10px]" data-impresso-chip>{c.rotulo.toUpperCase()}</Chip>
                  </div>
                  <h2 className="font-body text-[15px] font-semibold normal-case leading-snug tracking-[-0.01em] text-texto" data-impresso-titulo>{i.titulo}</h2>
                  <p className="flex-1 text-[12.5px] leading-relaxed text-texto-2" data-impresso-descricao>{i.descricao}</p>
                  <p className="text-[11.5px] text-texto-4" data-impresso-paginas-texto>{textoPaginas(i.paginas)} · PDF A4</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Botao tamanho="sm" icone={Eye} disabled={gerando !== null} onClick={() => void gerar(i, "abrir")} data-btn-visualizar>Visualizar</Botao>
                    <Botao tamanho="sm" variante="w" icone={Download} disabled={gerando !== null} onClick={() => void gerar(i, "baixar")} data-btn-baixar>
                      {esteGerando ? "Gerando…" : "Baixar"}
                    </Botao>
                    {i.id === ID_CODIGO_ETICA && (
                      <a href={LINK_CFN} target="_blank" rel="noopener noreferrer" className="pq-botao pq-botao-g pq-botao-sm" data-link-cfn>
                        <ExternalLink aria-hidden /> Ver no CFN
                      </a>
                    )}
                  </div>
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
