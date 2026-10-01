// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/receitas/ReceitaNoPlanoDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChefHat, Star } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT, SELECT } from "@/nutricao/editor/ui/estilos";
import { fmtQtd } from "@/nutricao/editor/lib/alimentosUtil";
import { fmtKcal } from "@/nutricao/editor/lib/energeticoUtil";
import type { Item } from "@/nutricao/editor/lib/planos";
import { inserirItensDeReceita, listarReceitas } from "@/nutricao/editor/lib/receitas";
import { escalarIngredientes, macrosDoIngrediente, medidaInteira, numero, textoPorcoes, textoPreviaPlano, totaisReceita } from "@/nutricao/editor/lib/receitasUtil";

// Atalho 'Da receita' do editor do plano (W9 × W28): escolher a receita (favoritas primeiro) e o nº de porções → prévia
// 'N ingredientes · N kcal' com as gramas já escaladas → os INGREDIENTES entram como itens da refeição (1 insert em lote, com
// `receita_id`), e o editor mostra o chip 'receita: <nome>'. Os totais e o PDF do plano seguem os itens (nada muda na conta).

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  refeicao: { id: string; nome: string; ordemProxima: number } | null;
  onInseridos: (refeicaoId: string, itens: Item[]) => void;
}

export default function ReceitaNoPlanoDialog({ open, onOpenChange, refeicao, onInseridos }: Props) {
  const receitasQ = useQuery({ queryKey: ["receitas"], queryFn: listarReceitas, enabled: open });
  const receitas = useMemo(() => receitasQ.data ?? [], [receitasQ.data]);
  const [receitaId, setReceitaId] = useState("");
  const [porcoes, setPorcoes] = useState("1");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const jaAberto = useRef(false);

  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setReceitaId("");
    setPorcoes("1");
    setErro(null);
  }, [open]);

  // sem escolha explícita, a 1ª da lista (favoritas primeiro) já fica selecionada
  useEffect(() => {
    if (open && !receitaId && receitas.length) setReceitaId(receitas[0].id);
  }, [open, receitaId, receitas]);

  const receita = receitas.find((r) => r.id === receitaId) ?? null;
  const nPorcoes = numero(porcoes);
  const previa = useMemo(() => {
    if (!receita || nPorcoes === null || nPorcoes <= 0) return null;
    const escalados = escalarIngredientes(receita.ingredientes.filter((i) => !!i.alimento), nPorcoes, Number(receita.porcoes));
    return { escalados, totais: totaisReceita(escalados) };
  }, [receita, nPorcoes]);

  const inserir = async (e: FormEvent) => {
    e.preventDefault();
    if (!refeicao) return;
    if (!receita) {
      setErro("Escolha uma receita");
      return;
    }
    if (nPorcoes === null || nPorcoes <= 0) {
      setErro("Informe o número de porções (maior que zero)");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const itens = await inserirItensDeReceita(refeicao.id, receita, nPorcoes, refeicao.ordemProxima);
      toast.success("Ingredientes adicionados ao plano", { description: `${receita.nome} · ${textoPorcoes(nPorcoes)} em ${refeicao.nome}` });
      onInseridos(refeicao.id, itens);
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível adicionar a receita ao plano");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-xl max-h-[90vh] overflow-y-auto" data-modal-receita-plano data-receitas-plano-total={receitas.length}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Da receita{refeicao ? ` — ${refeicao.nome}` : ""}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            Os ingredientes da receita entram como alimentos desta refeição, já na quantidade das porções escolhidas. Depois você edita cada um como qualquer item.
          </DialogDescription>
        </DialogHeader>

        {receitasQ.isLoading ? (
          <p className="text-sm text-texto-2 font-body">Carregando receitas...</p>
        ) : receitasQ.error ? (
          <p className="text-sm text-rosa-3 font-body" role="alert">Não foi possível carregar as receitas: {(receitasQ.error as Error).message}</p>
        ) : receitas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-linha-2 p-5 text-center space-y-2" data-receitas-plano-vazio>
            <ChefHat className="mx-auto h-6 w-6 text-texto-3" />
            <p className="font-semibold text-texto">Você ainda não tem receitas</p>
            <p className="text-xs text-texto-2 font-body">
              Crie a primeira em <Link to="/receitas" className="text-verde-3 hover:underline" data-link-receitas>Receitas culinárias</Link> e volte aqui.
            </p>
          </div>
        ) : (
          <form onSubmit={inserir} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3 items-end">
              <Campo rotulo="Receita">
                <select className={SELECT} value={receitaId} onChange={(e) => setReceitaId(e.target.value)} data-campo-receita-plano>
                  {receitas.map((r) => (
                    <option key={r.id} value={r.id}>{`${r.favorita ? "★ " : ""}${r.nome} · ${textoPorcoes(Number(r.porcoes))}`}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Porções">
                <input inputMode="decimal" className={INPUT} value={porcoes} onChange={(e) => setPorcoes(e.target.value)} data-campo-porcoes-plano />
              </Campo>
            </div>

            {receita && (
              <div className="border border-verde/40 p-3 space-y-2" data-previa-receita-plano data-previa-plano-kcal={previa?.totais.energia_kcal ?? ""} data-previa-plano-ingredientes={previa?.escalados.length ?? 0}>
                <p className="text-sm text-texto font-body flex flex-wrap items-center gap-2">
                  {receita.favorita && <Star size={12} className="text-verde-3 fill-verde-3" />}
                  <span data-previa-plano-nome>{receita.nome}</span>
                  <span className="text-[10px] uppercase tracking-wider text-texto-3">receita de {textoPorcoes(Number(receita.porcoes))}</span>
                </p>
                <p className="text-sm text-texto font-body" data-previa-plano-texto>
                  {previa ? textoPreviaPlano(previa.escalados.length, previa.totais.energia_kcal) : "Informe as porções"}
                </p>
                {previa && (
                  <ul className="text-xs text-texto-2 font-body space-y-0.5" data-previa-plano-lista>
                    {previa.escalados.map((i) => (
                      <li key={i.id} data-previa-plano-item={i.alimento_id} data-previa-plano-gramas={i.quantidade_g}>
                        {i.alimento?.nome} · {fmtQtd(i.quantidade_g)} g
                        {i.medida_caseira_id && medidaInteira(i.quantidade_medida) ? ` (${fmtQtd(Number(i.quantidade_medida))} medida${Number(i.quantidade_medida) === 1 ? "" : "s"})` : ""} · {fmtKcal(macrosDoIngrediente(i).energia_kcal ?? 0)} kcal
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-receita-plano>{erro}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-receita-plano>Cancelar</button>
              <button type="submit" className={BTN_PRI} disabled={salvando || !receita} data-btn-inserir-receita-plano>
                {salvando ? "Adicionando..." : "Adicionar ingredientes"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
