// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Anamnese.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FileDown, ListChecks, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import AnamneseDialog from "@/nutricao/prontuario/ui/AnamneseDialog";
import ModelosDialog from "@/nutricao/prontuario/ui/ModelosAnamneseDialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { excluirAnamnese, garantirModelos, listarAnamneses, listarModelos, nomeDaNutricionista, type Anamnese, type ModeloAnamnese } from "@/nutricao/prontuario/lib/anamneses";
import { baixarPDFAnamnese } from "@/nutricao/prontuario/lib/anamnesePdf";
import { formatarDataHoraAnamnese, inserirOrdenada, lerConteudo, textoContagem, textoRespondidas } from "@/nutricao/prontuario/lib/anamneseUtil";
import { useAbrirPeloParametro, usePaciente, useProntuario } from "@/nutricao/prontuario/ui/contexto";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

// Seção "Anamnese geral" (referência: "Nenhuma anamnese · Crie agora a primeira anamnese", botão "nova anamnese",
// modelos favoritos, PDF). Lista mais recente primeiro: "<título> · <data> · N/M respondidas" com Ver, Editar, PDF, Excluir.
export default function Anamnese() {
  const { paciente: p, recarregar } = usePaciente();
  const { acesso } = useProntuario();
  const { user } = useAuth();
  const [lista, setLista] = useState<Anamnese[] | null>(null);
  const [modelos, setModelos] = useState<ModeloAnamnese[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeNutri, setNomeNutri] = useState<string | null>(null);
  const [modal, setModal] = useState<{ aberto: boolean; anamnese: Anamnese | null }>({ aberto: false, anamnese: null });
  const [modelosAberto, setModelosAberto] = useState(false);
  const [abertas, setAbertas] = useState<string[]>([]);
  const [paraExcluir, setParaExcluir] = useState<Anamnese | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(await listarAnamneses(p.id));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as anamneses");
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

  const abrirNova = () => setModal({ aberto: true, anamnese: null });
  // o atalho "Anamnese" do Fluxo de consulta (W14) chega com ?nova=anamnese
  useAbrirPeloParametro("nova", "anamnese", abrirNova, acesso.editarClinico, "anamnese");
  const abrirEdicao = (a: Anamnese) => setModal({ aberto: true, anamnese: a });

  const onSalvo = (a: Anamnese) => {
    setLista((l) => inserirOrdenada(l ?? [], a));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };

  const alternar = (id: string) => setAbertas((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  const pdf = (a: Anamnese) => {
    try {
      const nome = baixarPDFAnamnese({
        titulo: a.titulo,
        data: new Date(a.data),
        paciente: p.nome,
        nutricionista: nomeNutri,
        conteudo: lerConteudo(a.conteudo),
        textoLivre: a.texto_livre,
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
      await excluirAnamnese(alvo.id);
      setLista((l) => (l ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success("Anamnese excluída");
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a anamnese");
    } finally {
      setExcluindo(false);
    }
  };

  const itens = lista ?? [];

  return (
    <div className="space-y-4" data-secao-anamnese>
      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="anamnese">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Anamnese geral</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem={itens.length}>
              {lista === null ? "Carregando..." : textoContagem(itens.length)}
              {itens[0] && (
                <>
                  {" · última em "}
                  <span className="text-texto" data-ultima-anamnese={itens[0].id}>{formatarDataHoraAnamnese(itens[0].data)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setModelosAberto(true)} className={BTN_SEC} data-btn-modelos>
              <ListChecks size={12} /> Modelos
            </button>
            <button type="button" onClick={abrirNova} className={BTN_PRI} data-btn-nova-anamnese>
              <Plus size={12} /> Nova anamnese
            </button>
          </div>
        </header>

        {erro && <p role="alert" className="text-sm text-rosa-3 font-body">{erro}</p>}

        {lista !== null && !erro && itens.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-anamneses-vazio>
            <NotebookPen className="mx-auto h-6 w-6 text-texto-3" />
            <p className="text-sm text-texto font-body">Nenhuma anamnese</p>
            <p className="text-xs text-texto-2 font-body">Crie agora a primeira anamnese do paciente — escolha um modelo de perguntas ou comece em branco.</p>
            <button type="button" onClick={abrirNova} className={BTN_SEC} data-btn-primeira-anamnese>
              Nova anamnese
            </button>
          </div>
        )}

        {itens.length > 0 && (
          <ul className="divide-y divide-linha" data-lista-anamneses>
            {itens.map((a) => {
              const aberta = abertas.includes(a.id);
              const conteudo = lerConteudo(a.conteudo);
              return (
                <li key={a.id} className="py-3 space-y-2" data-anamnese={a.id} data-aberta={aberta ? "1" : "0"}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <NotebookPen className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" />
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body" data-anamnese-titulo>{a.titulo}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body" data-anamnese-meta>
                          <span data-anamnese-data>{formatarDataHoraAnamnese(a.data)}</span>
                          {" · "}
                          <span data-respondidas>{textoRespondidas(conteudo)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => alternar(a.id)} className={BTN_MINI} data-btn-ver-anamnese>
                        {aberta ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {aberta ? "Ocultar" : "Ver"}
                      </button>
                      <button type="button" onClick={() => abrirEdicao(a)} className={BTN_MINI} data-btn-editar-anamnese>
                        <Pencil size={12} /> Editar
                      </button>
                      <button type="button" onClick={() => pdf(a)} className={BTN_MINI} data-btn-pdf-anamnese>
                        <FileDown size={12} /> PDF
                      </button>
                      <button type="button" onClick={() => setParaExcluir(a)} className={BTN_MINI_PERIGO} data-btn-excluir-anamnese>
                        <Trash2 size={12} /> Excluir
                      </button>
                    </div>
                  </div>
                  {aberta && (
                    <div className="ml-6 space-y-3 border-l-2 border-verde/40 pl-3" data-anamnese-conteudo>
                      {conteudo.length > 0 && (
                        <dl className="space-y-2">
                          {conteudo.map((item, i) => (
                            <div key={`${a.id}-${i}`} data-item-anamnese={i} data-respondida={item.resposta.trim() ? "1" : "0"}>
                              <dt className="text-xs text-texto-2 font-body">{i + 1}. {item.pergunta}</dt>
                              <dd className="text-sm text-texto-2 font-body whitespace-pre-wrap">{item.resposta.trim() || <span className="text-texto-3">—</span>}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {a.texto_livre?.trim() && (
                        <div>
                          <p className="text-xs text-texto-2 font-body">{conteudo.length ? "Texto livre / observações" : "Texto livre"}</p>
                          <p className="text-sm text-texto-2 font-body whitespace-pre-wrap" data-anamnese-texto-livre>{a.texto_livre}</p>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AnamneseDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        pacienteId={p.id}
        modelos={modelos}
        anamnese={modal.anamnese}
        onSalvo={onSalvo}
      />

      <ModelosDialog open={modelosAberto} onOpenChange={setModelosAberto} modelos={modelos} onMudou={carregarModelos} />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta anamnese?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {paraExcluir ? `${paraExcluir.titulo}. ` : ""}Ela sai do prontuário do paciente e vai pra lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-anamnese>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
