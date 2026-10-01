// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Orientacoes.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FileDown, ListChecks, Pencil, Plus, ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import Blocos from "@/nutricao/editor/ui/Blocos";
import ModelosDialog from "@/nutricao/editor/ui/ModelosDialog";
import OrientacaoDialog from "@/nutricao/editor/ui/OrientacaoDialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { excluirOrientacao, garantirModelos, listarModelos, listarOrientacoes, nomeDaNutricionista, type ModeloOrientacao, type Orientacao } from "@/nutricao/editor/lib/orientacoes";
import { baixarPDFOrientacao } from "@/nutricao/editor/lib/orientacaoPdf";
import { formatarDataOrientacao, inserirOrdenada, textoContagem, textoTopicos, topicosDoTexto } from "@/nutricao/editor/lib/orientacoesUtil";
import { useAbrirPeloParametro, usePaciente } from "@/nutricao/editor/ui/contexto";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

// Seção "Orientações nutricionais" (referência: orientações escritas entregues junto do plano, com modelos favoritos
// e PDF). Lista mais recente primeiro: "<título> · dd/MM/yyyy · N tópicos" com Ver (conteúdo renderizado), Editar,
// PDF e Excluir (soft). O texto é markdown SIMPLES — a tela e o PDF renderizam os mesmos blocos.
export default function Orientacoes() {
  const { paciente: p, recarregar, podeEditar } = usePaciente();
  const { user } = useAuth();
  const [lista, setLista] = useState<Orientacao[] | null>(null);
  const [modelos, setModelos] = useState<ModeloOrientacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeNutri, setNomeNutri] = useState<string | null>(null);
  const [modal, setModal] = useState<{ aberto: boolean; orientacao: Orientacao | null }>({ aberto: false, orientacao: null });
  const [modelosAberto, setModelosAberto] = useState(false);
  const [abertas, setAbertas] = useState<string[]>([]);
  const [paraExcluir, setParaExcluir] = useState<Orientacao | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(await listarOrientacoes(p.id));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as orientações");
      setLista([]);
    }
  }, [p.id]);

  const carregarModelos = useCallback(async () => {
    try {
      setModelos(user ? await garantirModelos(user.id) : await listarModelos());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os modelos");
    }
  }, [user]);

  useEffect(() => {
    void carregar();
    void carregarModelos();
  }, [carregar, carregarModelos]);

  useEffect(() => {
    if (!user) return;
    void nomeDaNutricionista(user.id).then(setNomeNutri);
  }, [user]);

  const abrirNova = () => setModal({ aberto: true, orientacao: null });
  const abrirEdicao = (o: Orientacao) => setModal({ aberto: true, orientacao: o });
  useAbrirPeloParametro("nova", "orientacao", abrirNova, podeEditar, "orientacoes");

  const onSalvo = (o: Orientacao) => {
    setLista((l) => inserirOrdenada(l ?? [], o));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };

  const alternar = (id: string) => setAbertas((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  const pdf = (o: Orientacao) => {
    try {
      const nome = baixarPDFOrientacao({
        titulo: o.titulo,
        data: new Date(o.created_at),
        paciente: p.nome,
        nutricionista: nomeNutri,
        conteudo: o.conteudo ?? "",
      });
      toast.success(`PDF gerado: ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setExcluindo(true);
    try {
      await excluirOrientacao(alvo.id);
      setLista((l) => (l ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success("Orientação excluída");
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a orientação");
    } finally {
      setExcluindo(false);
    }
  };

  const itens = lista ?? [];

  return (
    <div className="space-y-4" data-secao-orientacoes>
      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="orientacoes">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Orientações nutricionais</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem={itens.length}>
              {lista === null ? "Carregando..." : textoContagem(itens.length)}
              {itens[0] && (
                <>
                  {" · última em "}
                  <span className="text-texto" data-ultima-orientacao={itens[0].id}>{formatarDataOrientacao(itens[0].created_at)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setModelosAberto(true)} className={BTN_SEC} data-btn-modelos>
              <ListChecks size={12} /> Modelos
            </button>
            <button type="button" onClick={abrirNova} className={BTN_PRI} data-btn-nova-orientacao>
              <Plus size={12} /> Nova orientação
            </button>
          </div>
        </header>

        {erro && <p role="alert" className="text-sm text-rosa-3 font-body">{erro}</p>}

        {lista !== null && !erro && itens.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-orientacoes-vazio>
            <ScrollText className="mx-auto h-6 w-6 text-texto-3" />
            <p className="text-sm text-texto font-body">Nenhuma orientação</p>
            <p className="text-xs text-texto-2 font-body">Escreva agora a primeira orientação do paciente — use um modelo ou comece em branco.</p>
            <button type="button" onClick={abrirNova} className={BTN_SEC} data-btn-primeira-orientacao>
              Nova orientação
            </button>
          </div>
        )}

        {itens.length > 0 && (
          <ul className="divide-y divide-linha" data-lista-orientacoes>
            {itens.map((o) => {
              const aberta = abertas.includes(o.id);
              const n = topicosDoTexto(o.conteudo);
              return (
                <li key={o.id} className="py-3 space-y-2" data-orientacao={o.id} data-aberta={aberta ? "1" : "0"} data-topicos={n}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <ScrollText className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" />
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body" data-orientacao-titulo>{o.titulo}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body" data-orientacao-meta>
                          <span data-orientacao-data>{formatarDataOrientacao(o.created_at)}</span>
                          {" · "}
                          <span data-orientacao-topicos>{textoTopicos(n)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => alternar(o.id)} className={BTN_MINI} data-btn-ver-orientacao>
                        {aberta ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {aberta ? "Ocultar" : "Ver"}
                      </button>
                      <button type="button" onClick={() => abrirEdicao(o)} className={BTN_MINI} data-btn-editar-orientacao>
                        <Pencil size={12} /> Editar
                      </button>
                      <button type="button" onClick={() => pdf(o)} className={BTN_MINI} data-btn-pdf-orientacao>
                        <FileDown size={12} /> PDF
                      </button>
                      <button type="button" onClick={() => setParaExcluir(o)} className={BTN_MINI_PERIGO} data-btn-excluir-orientacao>
                        <Trash2 size={12} /> Excluir
                      </button>
                    </div>
                  </div>
                  {aberta && (
                    <div className="ml-6 border-l-2 border-verde/40 pl-3" data-orientacao-conteudo>
                      <Blocos conteudo={o.conteudo} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <OrientacaoDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        pacienteId={p.id}
        modelos={modelos}
        orientacao={modal.orientacao}
        onSalvo={onSalvo}
        onModeloCriado={carregarModelos}
      />

      <ModelosDialog open={modelosAberto} onOpenChange={setModelosAberto} modelos={modelos} onMudou={carregarModelos} />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta orientação?</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-texto-2">
              {paraExcluir ? `${paraExcluir.titulo}. ` : ""}Ela sai do prontuário do paciente e vai pra lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-orientacao>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
