// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/suplementos/CatalogoDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, INPUT, SELECT } from "@/nutricao/editor/ui/estilos";
import ProdutoDialog from "@/nutricao/editor/ui/ProdutoDialog";
import { alternarFavorito, excluirProduto, type Produto } from "@/nutricao/editor/lib/suplementos";
import { CATEGORIAS, filtrarProdutos, ordenarProdutos, textoContagemProdutos, textoProdutoCatalogo } from "@/nutricao/editor/lib/suplementosUtil";

// 'Meus produtos' — o catálogo da nutricionista: busca sem acento + filtro de categoria, lista 'nome · marca · apresentação ·
// categoria · dose padrão' com ★ favorito, Editar e Excluir (soft, em AlertDialog: as indicações já feitas mantêm a cópia), e
// 'Novo produto' (ProdutoDialog por cima). Quem chama recarrega pelo `onMudou`.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  /** catálogo vivo (vem MEMOIZADO do pai) */
  produtos: Produto[];
  onMudou: (p?: Produto) => Promise<void> | void;
}

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

export default function CatalogoDialog({ open, onOpenChange, nutricionistaId, produtos, onMudou }: Props) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [produtoDialog, setProdutoDialog] = useState<{ aberto: boolean; produto: Produto | null }>({ aberto: false, produto: null });
  const [paraExcluir, setParaExcluir] = useState<Produto | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [mudandoFav, setMudandoFav] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusca("");
      setCategoria("");
      setParaExcluir(null);
    }
  }, [open]);

  const lista = useMemo(() => filtrarProdutos(ordenarProdutos(produtos), busca, categoria), [produtos, busca, categoria]);

  const favorito = async (p: Produto) => {
    setMudandoFav(p.id);
    try {
      const novo = await alternarFavorito(p.id, !p.favorito);
      await onMudou(novo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar o favorito");
    } finally {
      setMudandoFav(null);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirProduto(paraExcluir.id);
      toast.success("Produto excluído");
      setParaExcluir(null);
      await onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o produto");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-2xl max-h-[88vh] overflow-y-auto" data-modal-catalogo data-catalogo-total={produtos.length} data-catalogo-filtrados={lista.length}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Meus produtos</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            O catálogo é seu e vale pra todos os pacientes. A estrela marca os favoritos (aparecem primeiro). As indicações já feitas mantêm nome, marca e apresentação de quando foram indicadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input className={INPUT} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou marca" data-campo-busca-catalogo />
            <select className={`${SELECT} sm:max-w-[13rem]`} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria" data-campo-filtro-catalogo>
              <option value="">Todas as categorias</option>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>{c.rotulo}</option>
              ))}
            </select>
            <button type="button" className={`${BTN_PRI} shrink-0`} onClick={() => setProdutoDialog({ aberto: true, produto: null })} data-btn-novo-produto>
              <Plus size={12} aria-hidden="true" /> Novo produto
            </button>
          </div>
          <p className="text-[11px] text-texto-2 font-body" data-catalogo-contagem-texto>
            {textoContagemProdutos(produtos.length)}{busca || categoria ? ` · ${lista.length} no filtro` : ""}
          </p>
          {produtos.length === 0 ? (
            <p className="text-sm text-texto-2 font-body" data-catalogo-vazio>Nenhum produto no catálogo ainda — cadastre o primeiro.</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-texto-2 font-body" data-catalogo-busca-vazia>Nenhum produto com esse filtro.</p>
          ) : (
            <ul className="divide-y divide-linha" data-lista-catalogo>
              {lista.map((p) => (
                <li key={p.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2" data-produto={p.id} data-favorito={p.favorito ? "1" : "0"} data-produto-categoria={p.categoria}>
                  <div className="min-w-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void favorito(p)}
                      disabled={mudandoFav === p.id}
                      className="text-verde-3 disabled:opacity-40"
                      title={p.favorito ? "Tirar dos favoritos" : "Marcar como favorito"}
                      data-btn-favorito-produto
                    >
                      <Star size={16} className={p.favorito ? "fill-verde-3" : ""} aria-hidden="true" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm text-texto font-body truncate" data-produto-nome>{p.nome}</p>
                      <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body truncate" data-produto-detalhe>{textoProdutoCatalogo(p) || "sem detalhes"}</p>
                      {p.link && (
                        <a href={p.link} target="_blank" rel="noreferrer" className="text-[11px] text-verde-3 font-body inline-flex items-center gap-1 hover:underline" data-produto-link>
                          <ExternalLink size={10} aria-hidden="true" /> abrir link
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className={BTN_MINI} onClick={() => setProdutoDialog({ aberto: true, produto: p })} data-btn-editar-produto>
                      <Pencil size={12} aria-hidden="true" /> Editar
                    </button>
                    <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(p)} data-btn-excluir-produto>
                      <Trash2 size={12} aria-hidden="true" /> Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-catalogo>Fechar</button>
          </div>
        </div>

        <ProdutoDialog
          open={produtoDialog.aberto}
          onOpenChange={(aberto) => setProdutoDialog((m) => ({ ...m, aberto }))}
          nutricionistaId={nutricionistaId}
          produto={produtoDialog.produto}
          onSalvo={(p) => void onMudou(p)}
        />

        <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
          <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este produto?</AlertDialogTitle>
              <AlertDialogDescription className="font-body text-texto-2">
                <span className="text-texto">{paraExcluir?.nome}</span> sai do catálogo e vai pra lixeira. As indicações já feitas mantêm nome, marca e apresentação.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-produto>
                {excluindo ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
