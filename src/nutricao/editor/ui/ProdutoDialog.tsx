// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/suplementos/ProdutoDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { atualizarProduto, criarProduto, type Produto } from "@/nutricao/editor/lib/suplementos";
import {
  CATEGORIAS, LINK_MAX, NOME_MAX, TEXTO_MAX, formDoProduto, formInicialProduto, lerCategoria, validarProduto, type FormProduto, type ProdutoBase,
} from "@/nutricao/editor/lib/suplementosUtil";

// Modal "Novo produto" / "Editar produto" do catálogo da nutricionista: nome, marca, categoria, apresentação, dose padrão (pré-preenche a
// dose ao indicar), modo de uso, link opcional (http/https), observação e favorito ★. Abre por cima do IndicacaoDialog (cadastrar
// inline e já selecionar) e do CatalogoDialog. Montado só na ABERTURA (ref `jaAberto`). Editar NÃO reescreve as indicações já
// feitas — elas guardam a própria cópia.
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  /** produto existente → modo editar */
  produto: ProdutoBase | null;
  /** nome sugerido ao cadastrar (ex.: o que ela digitou na busca) */
  nomeInicial?: string;
  onSalvo: (p: Produto, criado: boolean) => void;
}

export default function ProdutoDialog({ open, onOpenChange, nutricionistaId, produto, nomeInicial, onSalvo }: Props) {
  const editar = !!produto;
  const [form, setForm] = useState<FormProduto>(() => formInicialProduto());
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
    setErro(null);
    setForm(produto ? formDoProduto(produto) : formInicialProduto(nomeInicial ?? ""));
  }, [open, produto, nomeInicial]);

  // o aviso some assim que ela resolve (corrigiu o link, preencheu o nome…)
  useEffect(() => {
    if (erro && validarProduto(form) === null) setErro(null);
  }, [erro, form]);

  const campo = <K extends keyof FormProduto>(k: K, v: FormProduto[K]) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // abre por cima de outro modal com formulário — o submit não pode subir pra ele
    const problema = validarProduto(form);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const p = produto ? await atualizarProduto(produto.id, form) : await criarProduto(nutricionistaId, form);
      toast.success(produto ? "Produto atualizado" : "Produto cadastrado");
      onSalvo(p, !produto);
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o produto");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-lg max-h-[92vh] overflow-y-auto" data-modal-produto={editar ? "editar" : "novo"} data-salvando={salvando ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editar ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {editar
              ? "Muda só o catálogo: as indicações já feitas mantêm nome, marca e apresentação de quando foram indicadas."
              : "Entra no seu catálogo ('Meus produtos') pra indicar a qualquer paciente."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4" noValidate data-form-produto>
          <Campo rotulo="Nome" dica={`${form.nome.length}/${NOME_MAX}`}>
            <input className={INPUT} value={form.nome} maxLength={NOME_MAX} onChange={(e) => campo("nome", e.target.value)} placeholder="ex.: Whey Protein" data-campo-nome-produto />
          </Campo>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo rotulo="Marca" dica="opcional">
              <input className={INPUT} value={form.marca} maxLength={TEXTO_MAX} onChange={(e) => campo("marca", e.target.value)} placeholder="ex.: Growth" data-campo-marca />
            </Campo>
            <Campo rotulo="Categoria">
              <select className={SELECT} value={form.categoria} onChange={(e) => campo("categoria", lerCategoria(e.target.value))} data-campo-categoria>
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo rotulo="Apresentação" dica="opcional · ex.: pote 1 kg, cápsula 500 mg">
              <input className={INPUT} value={form.apresentacao} maxLength={TEXTO_MAX} onChange={(e) => campo("apresentacao", e.target.value)} placeholder="ex.: pote 1 kg" data-campo-apresentacao />
            </Campo>
            <Campo rotulo="Dose padrão" dica="opcional · pré-preenche a dose ao indicar">
              <input className={INPUT} value={form.dose_padrao} maxLength={TEXTO_MAX} onChange={(e) => campo("dose_padrao", e.target.value)} placeholder="ex.: 30 g" data-campo-dose-padrao />
            </Campo>
          </div>
          <Campo rotulo="Modo de uso" dica="opcional">
            <textarea className={TEXTAREA} value={form.modo_uso} maxLength={TEXTO_MAX} rows={2} onChange={(e) => campo("modo_uso", e.target.value)} placeholder="ex.: diluir 1 dose em 200 mL de água" data-campo-modo-uso />
          </Campo>
          <Campo rotulo="Link" dica="opcional · http:// ou https://">
            <input className={INPUT} inputMode="url" value={form.link} maxLength={LINK_MAX} onChange={(e) => campo("link", e.target.value)} placeholder="https://…" data-campo-link />
          </Campo>
          <Campo rotulo="Observação" dica={`${form.observacao.length}/${TEXTO_MAX} · opcional`}>
            <textarea className={TEXTAREA} value={form.observacao} maxLength={TEXTO_MAX} rows={2} onChange={(e) => campo("observacao", e.target.value)} data-campo-observacao-produto />
          </Campo>
          <label className="inline-flex items-center gap-2 text-xs font-body text-texto">
            <input type="checkbox" className="accent-[#10B981]" checked={form.favorito} onChange={(e) => campo("favorito", e.target.checked)} data-campo-favorito-produto /> Favorito (aparece primeiro)
          </label>

          {erro && <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-produto>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} disabled={salvando} data-btn-cancelar-produto>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-produto>
              {salvando ? "Salvando..." : editar ? "Salvar" : "Cadastrar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
