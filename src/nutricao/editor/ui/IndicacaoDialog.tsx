// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/suplementos/IndicacaoDialog.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PenLine, Plus, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_LINK, BTN_PRI, BTN_SEC, Campo, INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import ProdutoDialog from "@/nutricao/editor/ui/ProdutoDialog";
import { atualizarIndicacao, criarIndicacao, type Indicacao, type Produto } from "@/nutricao/editor/lib/suplementos";
import {
  CATEGORIAS, DOSE_MAX, DURACOES_RAPIDAS, HORARIOS_RAPIDOS, NOME_MAX, TEXTO_MAX, aplicarChip, chipAtivo, escolherProduto, filtrarProdutos, formDaIndicacao,
  formInicialIndicacao, hojeISO, ordenarProdutos, textoContagemProdutos, textoProduto, textoProdutoCatalogo, validarIndicacao, type FormIndicacao,
} from "@/nutricao/editor/lib/suplementosUtil";

// Modal "Indicar produto" / "Editar indicação": escolhe um produto do catálogo (busca sem acento + filtro de categoria, favoritos ★
// primeiro), cadastra um produto novo por cima (ProdutoDialog) e já seleciona, ou usa um nome livre sem cadastrar; dose (pré-preenchida
// com a dose padrão do produto), horário e duração em texto livre com chips que entram separados por vírgula, início (até hoje) e
// observação. Ao EDITAR o produto fica travado — a indicação guarda a cópia de quando foi feita. Montado só na ABERTURA (ref `jaAberto`).
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  pacienteId: string;
  /** catálogo vivo (vem MEMOIZADO do pai) */
  produtos: Produto[];
  /** indicação existente → modo editar */
  indicacao: Indicacao | null;
  /** posição da nova indicação entre as ativas */
  proximaOrdem: number;
  onSalvo: (i: Indicacao, criada: boolean) => void;
  /** produto cadastrado por aqui (o pai atualiza o catálogo) */
  onProdutoCriado: (p: Produto) => void;
}

const ROTULO = "text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1 block";
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";

function Chips({ tipo, valores, texto, onAplicar }: { tipo: "horario" | "duracao"; valores: readonly string[]; texto: string; onAplicar: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-2">
      {valores.map((v) => {
        const ativo = chipAtivo(texto, v);
        const attr = tipo === "horario" ? { "data-chip-horario": v } : { "data-chip-duracao": v };
        return (
          <button
            key={v}
            type="button"
            onClick={() => onAplicar(v)}
            aria-pressed={ativo}
            className={`border px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold transition-colors ${ativo ? "border-verde text-verde-3 bg-[rgba(16,185,129,.1)]" : "border-linha-2 text-texto-2 hover:border-verde/50 hover:text-texto"}`}
            {...attr}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

export default function IndicacaoDialog({ open, onOpenChange, nutricionistaId, pacienteId, produtos, indicacao, proximaOrdem, onSalvo, onProdutoCriado }: Props) {
  const editar = !!indicacao;
  const hoje = hojeISO();
  const [form, setForm] = useState<FormIndicacao>(() => formInicialIndicacao(hoje));
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [modoLivre, setModoLivre] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [produtoDialog, setProdutoDialog] = useState(false);
  const jaAberto = useRef(false);

  // só na ABERTURA: monta o formulário (um refetch do catálogo com o modal aberto não mexe no que ela digitou)
  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setErro(null);
    setBusca("");
    setCategoria("");
    setModoLivre(false);
    setForm(indicacao ? formDaIndicacao(indicacao) : formInicialIndicacao(hojeISO()));
  }, [open, indicacao]);

  // o aviso some assim que ela resolve (escolheu o produto, preencheu a dose…)
  useEffect(() => {
    if (erro && validarIndicacao(form, hojeISO(), editar) === null) setErro(null);
  }, [erro, form, editar]);

  const lista = useMemo(() => filtrarProdutos(ordenarProdutos(produtos), busca, categoria), [produtos, busca, categoria]);
  const campo = <K extends keyof FormIndicacao>(k: K, v: FormIndicacao[K]) => setForm((f) => ({ ...f, [k]: v }));
  const escolher = (p: Produto | null) => setForm((f) => escolherProduto(f, p));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarIndicacao(form, hojeISO(), editar);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (indicacao) {
        const i = await atualizarIndicacao(indicacao.id, form);
        onSalvo(i, false);
        toast.success("Indicação atualizada");
      } else {
        const i = await criarIndicacao(nutricionistaId, pacienteId, form, proximaOrdem);
        onSalvo(i, true);
        toast.success("Indicação criada");
      }
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a indicação");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px] sm:max-w-xl max-h-[92vh] overflow-y-auto" data-modal-indicacao={editar ? "editar" : "nova"} data-salvando={salvando ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{editar ? "Editar indicação" : "Indicar produto"}</DialogTitle>
          <DialogDescription className="font-body text-texto-2 text-xs">
            {editar
              ? "Dose, horário, duração, início e observação. O produto não muda — a indicação guarda a cópia de quando foi feita."
              : "Escolha um produto do seu catálogo, cadastre um novo ou use um nome livre; depois a posologia."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4" noValidate data-form-indicacao>
          {/* ---- produto ---- */}
          {editar && indicacao ? (
            <div className="border border-linha-2 p-3" data-produto-travado={indicacao.produto_id ?? ""}>
              <p className={ROTULO}>Produto</p>
              <p className="text-sm text-texto font-body">{textoProduto(indicacao)}</p>
              <p className="text-xs text-texto-2 font-body pt-1">Não muda ao editar — a cópia é o histórico. Pra trocar o produto, encerre esta e indique outra.</p>
            </div>
          ) : form.produto ? (
            <div className="border border-verde/40 p-3 flex flex-wrap items-start justify-between gap-2" data-produto-selecionado={form.produto.id}>
              <div className="min-w-0">
                <p className={ROTULO}>Produto</p>
                <p className="text-sm text-texto font-body" data-produto-selecionado-nome>{form.produto.nome}</p>
                <p className="text-xs text-texto-2 font-body truncate">{textoProdutoCatalogo(form.produto) || "sem detalhes"}</p>
              </div>
              <button type="button" className={BTN_MINI} onClick={() => escolher(null)} data-btn-trocar-produto>Trocar</button>
            </div>
          ) : modoLivre ? (
            <Campo rotulo="Nome do produto" dica="sem cadastrar no catálogo — a indicação guarda só o nome">
              <input className={INPUT} value={form.nomeLivre} maxLength={NOME_MAX} onChange={(e) => campo("nomeLivre", e.target.value)} placeholder="ex.: Ômega 3 (qualquer marca)" data-campo-produto-livre />
              <div className="pt-2">
                <button type="button" className={BTN_LINK} onClick={() => { setModoLivre(false); campo("nomeLivre", ""); }} data-btn-trocar-produto>Escolher do catálogo</button>
              </div>
            </Campo>
          ) : (
            <div className="space-y-2" data-escolha-produto>
              <p className={ROTULO}>Produto do catálogo</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input className={INPUT} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou marca" data-campo-busca-produto />
                <select className={`${SELECT} sm:max-w-[13rem]`} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria" data-campo-filtro-categoria>
                  <option value="">Todas as categorias</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                  ))}
                </select>
              </div>
              {lista.length === 0 ? (
                <p className="text-xs text-texto-2 font-body italic" data-catalogo-busca-vazia>Nenhum produto — cadastre abaixo</p>
              ) : (
                <>
                  <p className="text-[11px] text-texto-2 font-body" data-catalogo-contagem={lista.length}>{textoContagemProdutos(lista.length)}</p>
                  <ul className="max-h-56 overflow-y-auto divide-y divide-linha border border-linha" data-lista-opcoes-produto>
                    {lista.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => escolher(p)} className="w-full text-left py-2 px-2 flex items-center gap-2 hover:bg-[rgba(16,185,129,.06)] transition-colors" data-opcao-produto={p.id} data-favorito={p.favorito ? "1" : "0"}>
                          <Star size={12} className={p.favorito ? "fill-verde-3 text-verde-3 shrink-0" : "text-texto-4 shrink-0"} aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block text-sm text-texto font-body">{p.nome}</span>
                            <span className="block text-[11px] text-texto-2 font-body truncate">{textoProdutoCatalogo(p)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_LINK} onClick={() => setProdutoDialog(true)} data-btn-novo-produto-inline>
                  <Plus size={12} aria-hidden="true" /> Cadastrar novo produto
                </button>
                <button type="button" className={BTN_LINK} onClick={() => setModoLivre(true)} data-btn-nome-livre>
                  <PenLine size={12} aria-hidden="true" /> Usar nome livre
                </button>
              </div>
            </div>
          )}

          {/* ---- posologia ---- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo rotulo="Dose" dica={form.produto?.dose_padrao ? `dose padrão do produto: ${form.produto.dose_padrao}` : undefined}>
              <input className={INPUT} value={form.dose} maxLength={DOSE_MAX} onChange={(e) => campo("dose", e.target.value)} placeholder="ex.: 30 g" data-campo-dose />
            </Campo>
            <Campo rotulo="Início" dica="até hoje">
              <input type="date" className={INPUT} value={form.inicio} max={hoje} onChange={(e) => campo("inicio", e.target.value)} data-campo-inicio />
            </Campo>
          </div>
          <Campo rotulo="Horário" dica="texto livre · os atalhos entram separados por vírgula">
            <input className={INPUT} value={form.horario} maxLength={TEXTO_MAX} onChange={(e) => campo("horario", e.target.value)} placeholder="ex.: manhã, em jejum" data-campo-horario />
            <Chips tipo="horario" valores={HORARIOS_RAPIDOS} texto={form.horario} onAplicar={(v) => campo("horario", aplicarChip(form.horario, v))} />
          </Campo>
          <Campo rotulo="Duração" dica="texto livre">
            <input className={INPUT} value={form.duracao} maxLength={TEXTO_MAX} onChange={(e) => campo("duracao", e.target.value)} placeholder="ex.: 90 dias" data-campo-duracao />
            <Chips tipo="duracao" valores={DURACOES_RAPIDAS} texto={form.duracao} onAplicar={(v) => campo("duracao", aplicarChip(form.duracao, v))} />
          </Campo>
          <Campo rotulo="Observação" dica={`${form.observacao.length}/${TEXTO_MAX} · opcional`}>
            <textarea className={TEXTAREA} value={form.observacao} maxLength={TEXTO_MAX} rows={2} onChange={(e) => campo("observacao", e.target.value)} placeholder="ex.: tomar com uma refeição que tenha gordura" data-campo-observacao-indicacao />
          </Campo>

          {erro && <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-indicacao>{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} disabled={salvando} data-btn-cancelar-indicacao>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-indicacao>
              {salvando ? "Salvando..." : editar ? "Salvar" : "Indicar"}
            </button>
          </div>
        </form>

        <ProdutoDialog
          open={produtoDialog}
          onOpenChange={setProdutoDialog}
          nutricionistaId={nutricionistaId}
          produto={null}
          nomeInicial={busca}
          onSalvo={(p) => {
            onProdutoCriado(p);
            escolher(p);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
