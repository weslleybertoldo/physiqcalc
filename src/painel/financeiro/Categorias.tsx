// Physiq W19 — Categorias do Financeiro (spec 4.4): porta do PhysiqNutri (main ca9f66f, src/components/financeiro/CategoriasDialog.tsx)
// no visual premium — lista as categorias do profissional (cada um as suas), cria, renomeia na linha e exclui (soft: as movimentações
// antigas continuam com a categoria pelo id). Nome único entre as vivas, sem caixa/acento. A mesma peça é a aba "Categorias" da página
// e a janela "gerenciar categorias" da movimentação.
import { useEffect, useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, DESCRICAO_JANELA, INPUT, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { criarCategoria, excluirCategoria, renomearCategoria, type CategoriaFinanceira } from "./dados";
import { CATEGORIA_NOME_MAX, validarNomeCategoria } from "./financeiroUtil";

export const BTN_MINI =
  "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
export const BTN_MINI_PERIGO =
  "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const ROTULO = "mb-1.5 block font-body text-[12px] font-semibold text-texto-2";

interface Props {
  uid: string;
  contaId: string | null;
  categorias: CategoriaFinanceira[];
  /** a lista ainda não chegou — esqueleto no lugar do "Nenhuma categoria ainda" (que não é verdade enquanto carrega) */
  carregando?: boolean;
  /** a lista não veio — avisa em vez de dizer que não há categorias */
  erro?: boolean;
  /** algo mudou (criou/renomeou/excluiu) — quem chama recarrega */
  onMudou: () => void;
}

/** O corpo: a lista + nova categoria (sem a moldura — a aba põe o cartão, a janela põe o diálogo). */
export function GerenciarCategorias({ uid, contaId, categorias, carregando = false, erro: erroLista = false, onMudou, aberto = true }: Props & { aberto?: boolean }) {
  // sem a lista, o "nome repetido" não tem com o que comparar: criar só depois que ela chega
  const semLista = carregando || erroLista;
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [paraExcluir, setParaExcluir] = useState<CategoriaFinanceira | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setNova("");
    setErro(null);
    setEditando(null);
    setParaExcluir(null);
  }, [aberto]);

  const rodar = async (acao: () => Promise<void>, sucesso: string) => {
    setOcupado(true);
    try {
      await acao();
      setErro(null);
      toast.success(sucesso);
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a categoria");
    } finally {
      setOcupado(false);
    }
  };

  const adicionar = () => {
    const msg = validarNomeCategoria(nova, categorias);
    if (msg) return setErro(msg);
    if (!uid) return setErro("Sessão expirada — entre de novo");
    void rodar(async () => {
      await criarCategoria(uid, contaId, nova);
      setNova("");
    }, "Categoria criada");
  };

  const salvarRenome = () => {
    if (!editando) return;
    const alvo = editando;
    const msg = validarNomeCategoria(alvo.nome, categorias, alvo.id);
    if (msg) return setErro(msg);
    void rodar(async () => {
      await renomearCategoria(alvo.id, alvo.nome);
      setEditando(null);
    }, "Categoria renomeada");
  };

  const excluir = () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    void rodar(async () => {
      await excluirCategoria(alvo.id);
      setParaExcluir(null);
    }, "Categoria excluída");
  };

  return (
    <div className="space-y-4" data-gerenciar-categorias>
      {carregando ? (
        <div role="status" aria-busy="true" aria-label="Carregando as categorias" className="flex flex-col gap-2" data-carregando-categorias>
          <Esqueleto className="h-11 w-full rounded-2xl" />
          <Esqueleto className="h-11 w-full rounded-2xl" />
          <Esqueleto className="h-11 w-full rounded-2xl" />
        </div>
      ) : erroLista ? (
        <p role="alert" className="font-body text-[13px] text-rosa-3" data-categorias-erro>
          Não deu para carregar as categorias. Confira a internet e abra de novo.
        </p>
      ) : categorias.length === 0 ? (
        <p className="font-body text-[13px] text-texto-3" data-categorias-vazio>Nenhuma categoria ainda — crie a primeira abaixo.</p>
      ) : (
        <ul className="divide-y divide-linha-3" data-lista-categorias data-categorias-total={categorias.length}>
          {categorias.map((c) => (
            <li key={c.id} className="flex min-h-[48px] items-center justify-between gap-2 py-1.5" data-categoria={c.id} data-categoria-nome={c.nome}>
              {editando?.id === c.id ? (
                <form className="flex flex-1 flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); salvarRenome(); }}>
                  <input className={`${INPUT} min-w-[140px] flex-1`} value={editando.nome} onChange={(e) => setEditando({ id: c.id, nome: e.target.value })}
                    maxLength={CATEGORIA_NOME_MAX} autoFocus data-campo-renomear-categoria />
                  <button type="submit" className={BTN_PRI} disabled={ocupado} data-btn-salvar-renomear>Salvar</button>
                  <button type="button" className={BTN_SEC} onClick={() => { setEditando(null); setErro(null); }} data-btn-cancelar-renomear>Cancelar</button>
                </form>
              ) : (
                <>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-violeta-3">
                      <Tags aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span className="truncate font-body text-[13.5px] font-medium text-texto" data-categoria-rotulo>{c.nome}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" className={BTN_MINI} onClick={() => { setEditando({ id: c.id, nome: c.nome }); setErro(null); }} disabled={ocupado} data-btn-renomear-categoria>
                      <Pencil size={12} aria-hidden="true" /> Renomear
                    </button>
                    <button type="button" className={BTN_MINI_PERIGO} onClick={() => setParaExcluir(c)} disabled={ocupado} data-btn-excluir-categoria>
                      <Trash2 size={12} aria-hidden="true" /> Excluir
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); adicionar(); }} data-form-nova-categoria>
        <label className="block flex-1">
          <span className={ROTULO}>Nova categoria</span>
          <input className={INPUT} value={nova} onChange={(e) => setNova(e.target.value)} placeholder="ex.: Cursos" maxLength={CATEGORIA_NOME_MAX} data-campo-nova-categoria />
        </label>
        <button type="submit" className={cn(BTN_PRI, "h-10")} disabled={ocupado || semLista || !nova.trim()} data-btn-add-categoria>
          <Plus size={13} aria-hidden="true" /> Adicionar
        </button>
      </form>

      {erro && <p role="alert" className="font-body text-[12px] text-rosa-3" data-erro-categoria>{erro}</p>}

      <AlertDialog open={!!paraExcluir} onOpenChange={(a) => { if (!a) setParaExcluir(null); }}>
        <AlertDialogContent className={JANELA}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>Excluir esta categoria?</AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA}>
              {paraExcluir ? <><span className="text-texto">{paraExcluir.nome}</span> vai para a lixeira. As movimentações antigas continuam com ela.</> : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); excluir(); }} disabled={ocupado} data-btn-confirmar-excluir-categoria>
              {ocupado ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** A aba "Categorias" da página. */
export default function AbaCategorias(props: Props) {
  return (
    <Cartao className="px-[18px] pb-3 pt-4" data-aba-financeiro-conteudo="categorias">
      <CabecalhoCartao titulo="Categorias" extra={<Chip tom="g">{props.carregando || props.erro ? "…" : props.categorias.length}</Chip>} />
      <p className="mb-3 font-body text-[12.5px] text-texto-2">
        Organize as movimentações do jeito que fizer sentido para você. As categorias são suas; excluir uma não mexe nas movimentações antigas.
      </p>
      <GerenciarCategorias {...props} />
    </Cartao>
  );
}

/** A janela "gerenciar categorias" (aberta da movimentação ou dos filtros). */
export function CategoriasDialog({ open, onOpenChange, ...props }: Props & { open: boolean; onOpenChange: (a: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "max-h-[88vh] overflow-y-auto sm:max-w-lg")} data-modal-categorias>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>Categorias</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            Organize as movimentações do jeito que fizer sentido para você. Excluir uma categoria não mexe nas movimentações antigas.
          </DialogDescription>
        </DialogHeader>
        <GerenciarCategorias {...props} aberto={open} />
        <div className="flex justify-end">
          <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-categorias>Fechar</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
