// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/dieta/SubstitutosDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, INPUT } from "@/nutricao/editor/ui/estilos";
import BuscaAlimento, { BadgeFonte } from "@/nutricao/editor/ui/BuscaAlimento";
import type { Alimento } from "@/nutricao/editor/lib/alimentos";
import { fmtQtd, resumoMacros } from "@/nutricao/editor/lib/alimentosUtil";
import { MAX_SUBSTITUTOS, arred, descricaoQuantidade, descricaoSubstituto, gramasEquivalentes, lerSubstitutos, macrosDoItem, numero, type Substituto } from "@/nutricao/editor/lib/dietaUtil";
import { salvarSubstitutos, type Item } from "@/nutricao/editor/lib/planos";

// Lista de substituições de um item ("ou 41 g de Pão, trigo, francês"): escolher outro alimento → os gramas
// equivalentes em kcal vêm calculados (kcal do item ÷ kcal por 100 g do substituto) e podem ser ajustados antes de
// adicionar. Até 6 substitutos por item; salva o jsonb do item de uma vez.

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  item: Item | null;
  onSalvo: (item: Item) => void;
  /** Physiq W16: só ver a lista (personal responsável, dono sem papel de nutri) */
  somenteLeitura?: boolean;
}

const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

export default function SubstitutosDialog({ open, onOpenChange, item, onSalvo, somenteLeitura = false }: Props) {
  const [lista, setLista] = useState<Substituto[]>([]);
  const [escolhido, setEscolhido] = useState<Alimento | null>(null);
  const [gramas, setGramas] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLista(lerSubstitutos(item?.substitutos));
    setEscolhido(null);
    setGramas("");
    setErro(null);
  }, [open, item]);

  const kcalItem = item ? macrosDoItem(item).energia_kcal : null;

  const escolher = (a: Alimento) => {
    setEscolhido(a);
    const eq = gramasEquivalentes(kcalItem, a.energia_kcal);
    setGramas(eq === null ? "" : String(eq).replace(".", ","));
    setErro(null);
  };

  const adicionar = () => {
    if (!escolhido) return;
    const g = numero(gramas);
    if (g === null || g <= 0 || g >= 100000) {
      setErro("Informe os gramas do substituto (maior que zero)");
      return;
    }
    if (lista.length >= MAX_SUBSTITUTOS) {
      setErro(`Até ${MAX_SUBSTITUTOS} substitutos por alimento`);
      return;
    }
    setLista((l) => [...l.filter((s) => s.alimento_id !== escolhido.id), { alimento_id: escolhido.id, nome: escolhido.nome, quantidade_g: arred(g, 2) }]);
    setEscolhido(null);
    setGramas("");
    setErro(null);
  };

  const salvar = async () => {
    if (!item) return;
    setSalvando(true);
    try {
      onSalvo(await salvarSubstitutos(item.id, lista, item.alimento));
      toast.success(lista.length ? `${lista.length} substituto${lista.length > 1 ? "s" : ""} salvo${lista.length > 1 ? "s" : ""}` : "Substituições removidas");
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar os substitutos";
      setErro(msg);
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  const kcalEscolhido = escolhido && numero(gramas) !== null ? arred(((escolhido.energia_kcal ?? 0) * (numero(gramas) ?? 0)) / 100, 2) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-modal-substitutos={item?.id ?? ""}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Substituições</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {item?.alimento ? <><span className="text-texto">{item.alimento.nome}</span> — {descricaoQuantidade(item)} · {fmtQtd(kcalItem)} kcal. </> : ""}
            Os gramas do substituto vêm calculados pra dar as mesmas kcal; ajuste se quiser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div data-substitutos-lista={lista.length}>
            <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1">Substitutos ({lista.length}/{MAX_SUBSTITUTOS})</p>
            {lista.length === 0 ? (
              <p className="text-sm text-texto-3 font-body">Nenhum substituto ainda — busque um alimento abaixo.</p>
            ) : (
              <ul className="divide-y divide-linha border border-linha-2">
                {lista.map((s, i) => (
                  <li key={s.alimento_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-body" data-substituto={i} data-substituto-alimento={s.alimento_id}>
                    <span className="text-texto-2" data-substituto-texto>{descricaoSubstituto(s)}</span>
                    {!somenteLeitura && <button type="button" className={BTN_MINI_PERIGO} onClick={() => setLista((l) => l.filter((x) => x.alimento_id !== s.alimento_id))} aria-label="Remover substituto" title="Remover substituto" data-btn-remover-substituto={i}>
                      <Trash2 size={12} />
                    </button>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!somenteLeitura && lista.length < MAX_SUBSTITUTOS && (
            <div className="space-y-3" data-substituto-novo>
              <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body">Adicionar substituto</p>
              {!escolhido ? (
                <BuscaAlimento onEscolher={escolher} excluirIds={[item?.alimento_id ?? "", ...lista.map((s) => s.alimento_id)]} autoFocus={false} placeholder="Busque o alimento substituto" />
              ) : (
                <div className="border border-linha-2 p-3 space-y-3" data-substituto-escolhido={escolhido.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-texto font-body flex flex-wrap items-center gap-2">
                        <span>{escolhido.nome}</span>
                        <BadgeFonte fonte={escolhido.fonte} />
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body">{resumoMacros(escolhido)} / 100 g</p>
                    </div>
                    <button type="button" className={BTN_SEC} onClick={() => setEscolhido(null)} data-btn-trocar-substituto>Trocar</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                    <label className="block">
                      <span className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1 block">Gramas equivalentes</span>
                      <input inputMode="decimal" className={INPUT} value={gramas} onChange={(e) => setGramas(e.target.value)} data-substituto-novo-gramas />
                    </label>
                    <div className="text-sm font-body text-texto-2 pb-2">
                      <span className="text-[10px] text-texto-3 font-body block">kcal do substituto</span>
                      <span data-substituto-novo-kcal={kcalEscolhido ?? ""}>{kcalEscolhido === null ? "—" : `${fmtQtd(kcalEscolhido)} kcal`}</span>
                    </div>
                    <button type="button" className={BTN_PRI} onClick={adicionar} data-btn-add-substituto>
                      <Plus size={12} /> Adicionar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {erro && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-substitutos>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-substitutos>{somenteLeitura ? "Fechar" : "Cancelar"}</button>
            {!somenteLeitura && <button type="button" className={BTN_PRI} onClick={() => void salvar()} disabled={salvando} data-btn-salvar-substitutos>{salvando ? "Salvando..." : "Salvar substituições"}</button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
