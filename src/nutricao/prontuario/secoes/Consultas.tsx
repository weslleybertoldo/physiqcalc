// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Consultas.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import ConsultaDialog from "@/nutricao/prontuario/ui/ConsultaDialog";
import { excluirConsulta, listarConsultas, type Consulta } from "@/nutricao/prontuario/lib/consultas";
import {
  ORIGENS, ehFutura, ehOrigem, formatarDataHoraConsulta, inserirOrdenada, resumoObservacao, rotuloConsulta, textoContagem, ultimaConsulta,
} from "@/nutricao/prontuario/lib/consultasUtil";
import { useAbrirPeloParametro, usePaciente, useProntuario } from "@/nutricao/prontuario/ui/contexto";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

// Seção "Histórico de consultas" (referência: botão "novo registro de consulta" e a lista
// "Consulta registrada em <data> · Ver observação | Excluir", mais recente primeiro).
export default function Consultas() {
  const { paciente: p, recarregar } = usePaciente();
  const { acesso } = useProntuario();
  const [lista, setLista] = useState<Consulta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState<{ aberto: boolean; consulta: Consulta | null }>({ aberto: false, consulta: null });
  const [abertas, setAbertas] = useState<string[]>([]);
  const [paraExcluir, setParaExcluir] = useState<Consulta | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(await listarConsultas(p.id));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as consultas");
      setLista([]);
    }
  }, [p.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirNova = () => setModal({ aberto: true, consulta: null });
  // o atalho "Registrar consulta" do Fluxo de consulta (W14) chega com ?nova=consulta
  useAbrirPeloParametro("nova", "consulta", abrirNova, acesso.editarClinico, "consultas");
  const abrirEdicao = (c: Consulta) => setModal({ aberto: true, consulta: c });

  const onSalvo = (c: Consulta) => {
    setLista((l) => inserirOrdenada(l ?? [], c));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger) — o cabeçalho/Perfil acompanham
  };

  const alternar = (id: string) => setAbertas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setExcluindo(true);
    try {
      await excluirConsulta(alvo.id);
      setLista((l) => (l ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success("Consulta excluída");
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a consulta");
    } finally {
      setExcluindo(false);
    }
  };

  const itens = lista ?? [];
  const ultima = ultimaConsulta(itens);

  return (
    <div className="space-y-4" data-secao-consultas>
      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="consultas">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Histórico de consultas</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem={itens.length}>
              {lista === null ? "Carregando..." : textoContagem(itens.length)}
              {ultima && (
                <>
                  {" · última em "}
                  <span className="text-texto" data-ultima-consulta={ultima.id}>{formatarDataHoraConsulta(ultima.data)}</span>
                </>
              )}
            </p>
          </div>
          <button type="button" onClick={abrirNova} className={BTN_PRI} data-btn-registrar-consulta>
            <Plus size={12} /> Registrar consulta
          </button>
        </header>

        {erro && <p role="alert" className="text-sm text-rosa-3 font-body">{erro}</p>}

        {lista !== null && !erro && itens.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-consultas-vazio>
            <Stethoscope className="mx-auto h-6 w-6 text-texto-3" />
            <p className="text-sm text-texto font-body">Nenhuma consulta registrada</p>
            <p className="text-xs text-texto-2 font-body">Cada atendimento registrado aqui fica no histórico do paciente, com data, hora e observação.</p>
            <button type="button" onClick={abrirNova} className={BTN_SEC} data-btn-registrar-primeira>
              Registrar a primeira consulta
            </button>
          </div>
        )}

        {itens.length > 0 && (
          <ul className="divide-y divide-linha" data-lista-consultas>
            {itens.map((c) => {
              const aberta = abertas.includes(c.id);
              const temObs = !!c.observacao?.trim();
              return (
                <li key={c.id} className="py-3 space-y-2" data-consulta={c.id} data-origem={c.origem} data-observacao-aberta={aberta ? "1" : "0"}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <Stethoscope className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" />
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body" data-consulta-data>{rotuloConsulta(c.data)}</p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body">
                          {ehOrigem(c.origem) ? ORIGENS[c.origem] : c.origem}
                          {ehFutura(c.data) && <span className="ml-2 text-verde-3" data-consulta-futura>data à frente</span>}
                        </p>
                        {!aberta && temObs && (
                          <p className="text-xs text-texto-2 font-body truncate max-w-md" data-resumo-observacao>{resumoObservacao(c.observacao)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => alternar(c.id)}
                        disabled={!temObs}
                        className={BTN_MINI}
                        title={temObs ? undefined : "Esta consulta não tem observação"}
                        data-btn-observacao
                        data-tem-observacao={temObs ? "1" : "0"}
                      >
                        {aberta ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {temObs ? (aberta ? "Ocultar observação" : "Ver observação") : "Sem observação"}
                      </button>
                      <button type="button" onClick={() => abrirEdicao(c)} className={BTN_MINI} data-btn-editar-consulta>
                        <Pencil size={12} /> Editar
                      </button>
                      <button type="button" onClick={() => setParaExcluir(c)} className={BTN_MINI_PERIGO} data-btn-excluir-consulta>
                        <Trash2 size={12} /> Excluir
                      </button>
                    </div>
                  </div>
                  {aberta && temObs && (
                    <p className="text-sm text-texto-2 font-body whitespace-pre-wrap border-l-2 border-verde/40 pl-3 ml-6" data-observacao-consulta>
                      {c.observacao}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConsultaDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        pacienteId={p.id}
        consulta={modal.consulta}
        onSalvo={onSalvo}
      />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir esta consulta?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {paraExcluir ? `${rotuloConsulta(paraExcluir.data)}. ` : ""}Ela sai do histórico do paciente e vai pra lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-consulta>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
