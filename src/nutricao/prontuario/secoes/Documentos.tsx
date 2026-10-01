// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Documentos.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, FileCheck, FileDown, FileText, PenLine, Pill, Plus, Stethoscope, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import DocumentoDialog from "@/nutricao/prontuario/ui/DocumentoDialog";
import ModelosDocumentoDialog from "@/nutricao/prontuario/ui/ModelosDocumentoDialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { dadosProfissionais, excluirDocumento, garantirModelosDocumento, listarDocumentosDoPaciente, nomeDaNutricionista, type Documento } from "@/nutricao/prontuario/lib/documentos";
import { baixarPDFDocumento } from "@/nutricao/prontuario/lib/documentoPdf";
import {
  FILTROS, TIPOS_DOCUMENTO, contarPorTipo, ehTipoDocumento, filtrarDocumentos, formatarDataDocumento, infoTipo, inserirDocumento, rotuloTipo, textoContagemDocumentos,
  textoDias, type DadosDocumento, type FiltroTipo, type TipoDocumento,
} from "@/nutricao/prontuario/lib/documentosUtil";
import { usePaciente } from "@/nutricao/prontuario/ui/contexto";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PRI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-verde/40 bg-[rgba(16,185,129,.1)] px-2.5 text-[11.5px] font-semibold text-verde-3 transition-colors hover:bg-[rgba(16,185,129,.16)] disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const CHIP = "pq-chip pq-chip-g";
const CHIP_ATIVO = `${CHIP} border-verde text-verde-3 bg-[rgba(16,185,129,.1)]`;
const CHIP_INATIVO = `${CHIP} border-linha-2 text-texto-2 hover:text-texto hover:border-verde/50`;

const ICONE: Record<TipoDocumento, ComponentType<{ className?: string }>> = {
  atestado: Stethoscope,
  receituario: Pill,
  declaracao: FileCheck,
};

/** `dados` é jsonb — lê com tolerância. */
const lerDados = (v: unknown): DadosDocumento => (v && typeof v === "object" && !Array.isArray(v) ? (v as DadosDocumento) : {});
const tipoDe = (d: Documento): TipoDocumento => (ehTipoDocumento(d.tipo) ? d.tipo : "declaracao");

// Seção "Atestados e receituários" do paciente (referência: documentos com tags *|NOME_PACIENTE|*, *|CPF_PACIENTE|*, *|DATA_HOJE|*,
// *|CARIMBO|*). Botões "Novo atestado" / "Novo receituário" / "Nova declaração" + "Modelos"; chips de filtro por tipo; lista
// "ícone · TIPO · título · dd/MM/yyyy" com PDF / Ver (texto final) / Editar texto / Excluir (soft). O documento guarda o
// texto FINAL — o PDF reproduz o que está gravado.
export default function Documentos() {
  const { paciente: p, recarregar } = usePaciente();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const [nomeNutri, setNomeNutri] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void nomeDaNutricionista(user.id).then(setNomeNutri);
  }, [user]);

  const chave = useMemo(() => ["documentos-paciente", p.id], [p.id]);
  const documentosQ = useQuery({ queryKey: chave, queryFn: () => listarDocumentosDoPaciente(p.id) });
  const modelosQ = useQuery({ queryKey: ["modelos-documento", uid], queryFn: () => garantirModelosDocumento(uid!), enabled: !!uid });
  const profQ = useQuery({ queryKey: ["dados-profissionais", uid], queryFn: () => dadosProfissionais(uid!), enabled: !!uid });

  const documentos = useMemo(() => documentosQ.data ?? [], [documentosQ.data]);
  const modelos = useMemo(() => modelosQ.data ?? [], [modelosQ.data]);
  const profissional = profQ.data ?? null;
  const [filtro, setFiltro] = useState<FiltroTipo>("todos");
  const visiveis = useMemo(() => filtrarDocumentos(documentos, filtro), [documentos, filtro]);
  const contagem = useMemo(() => contarPorTipo(documentos), [documentos]);
  // objeto MEMOIZADO (W13: prop nova a cada render dispararia o reset do modal e apagaria o que ela digita)
  const paciente = useMemo(() => ({ id: p.id, nome: p.nome, cpf: p.cpf }), [p.id, p.nome, p.cpf]);

  const carregando = !uid || documentosQ.isPending || modelosQ.isPending;
  const atualizando = carregando || documentosQ.isFetching || modelosQ.isFetching;
  const erro = documentosQ.error ?? modelosQ.error;

  const [modal, setModal] = useState<{ aberto: boolean; tipo: TipoDocumento; documento: Documento | null }>({ aberto: false, tipo: "atestado", documento: null });
  // "Modelos" do cabeçalho abre na 1ª aba (Atestados); "gerenciar modelos" de dentro do modal abre na aba do tipo do documento
  const [modelosAberto, setModelosAberto] = useState<{ aberto: boolean; tipo: TipoDocumento }>({ aberto: false, tipo: "atestado" });
  const [abertos, setAbertos] = useState<string[]>([]);
  const [paraExcluir, setParaExcluir] = useState<Documento | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const alternar = (id: string) => setAbertos((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const abrirNovo = (tipo: TipoDocumento) => setModal({ aberto: true, tipo, documento: null });
  const abrirEdicao = (d: Documento) => setModal({ aberto: true, tipo: tipoDe(d), documento: d });

  const onSalvo = (d: Documento) => {
    qc.setQueryData<Documento[]>(chave, (old) => inserirDocumento(old ?? [], d));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const modelosMudaram = async () => {
    await qc.invalidateQueries({ queryKey: ["modelos-documento"] });
  };

  const pdf = (d: Documento) => {
    try {
      const nome = baixarPDFDocumento({
        tipo: tipoDe(d),
        titulo: d.titulo,
        texto: d.texto,
        data: d.data,
        paciente: p.nome,
        cpf: p.cpf,
        nutricionista: nomeNutri,
        profissional,
        emitidoEm: new Date(),
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
      await excluirDocumento(alvo.id);
      qc.setQueryData<Documento[]>(chave, (old) => (old ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success(`${rotuloTipo(alvo.tipo)} "${alvo.titulo}" excluído`);
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o documento");
    } finally {
      setExcluindo(false);
    }
  };

  const detalhe = (d: Documento): string => {
    if (d.tipo === "atestado") {
      const dd = lerDados(d.dados);
      return `${textoDias(dd.dias_afastamento)} de afastamento · CID ${dd.cid || "não informado"}`;
    }
    return `emitido em ${format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}`;
  };

  return (
    <div className="space-y-4" data-secao-documentos data-atualizando={atualizando ? "1" : "0"}>
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-documentos>
          Não foi possível carregar os documentos: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="documentos">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Atestados e receituários</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem-documentos={documentos.length}>
              {carregando ? "Carregando..." : textoContagemDocumentos(documentos.length)}
              {!carregando && documentos.length > 0 && (
                <>
                  {" · último "}
                  <span className="text-texto" data-ultimo-documento={documentos[0].id}>{formatarDataDocumento(documentos[0].data)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setModelosAberto({ aberto: true, tipo: "atestado" })} className={BTN_SEC} disabled={carregando} data-btn-modelos-documento>
              <Tags className="h-3.5 w-3.5" aria-hidden="true" /> Modelos
            </button>
            {TIPOS_DOCUMENTO.map((t) => (
              <button key={t.tipo} type="button" onClick={() => abrirNovo(t.tipo)} className={BTN_PRI} disabled={carregando} data-btn-novo-documento={t.tipo}>
                <Plus size={12} aria-hidden="true" /> {t.botao}
              </button>
            ))}
          </div>
        </header>

        <div className="flex flex-wrap gap-1.5" data-filtros-tipo>
          {FILTROS.map((f) => {
            const ativo = f.filtro === filtro;
            return (
              <button
                key={f.filtro}
                type="button"
                onClick={() => setFiltro(f.filtro)}
                className={ativo ? CHIP_ATIVO : CHIP_INATIVO}
                aria-pressed={ativo}
                data-filtro-tipo={f.filtro}
                data-ativo={ativo ? "1" : "0"}
                data-filtro-total={contagem[f.filtro]}
              >
                {f.rotulo} <span className="opacity-70 tabular-nums">{contagem[f.filtro]}</span>
              </button>
            );
          })}
        </div>

        {!carregando && !erro && documentos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-documentos-vazio>
            <FileText className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhum documento emitido</p>
            <p className="text-xs text-texto-2 font-body">Atestados, receituários e declarações saem prontos com o nome e o CPF do paciente — e o PDF baixa na hora.</p>
          </div>
        )}

        {!carregando && documentos.length > 0 && visiveis.length === 0 && (
          <p className="text-sm text-texto-2 font-body rounded-2xl border border-dashed border-linha-2 p-4 text-center" data-filtro-vazio>
            Nenhum {filtro === "todos" ? "documento" : infoTipo(filtro).rotulo.toLowerCase()} deste paciente.
          </p>
        )}

        {visiveis.length > 0 && (
          <ul className="divide-y divide-linha border-t border-linha" data-lista-documentos>
            {visiveis.map((d) => {
              const aberto = abertos.includes(d.id);
              const tipo = tipoDe(d);
              const Icone = ICONE[tipo];
              return (
                <li key={d.id} className="py-3 space-y-2" data-documento={d.id} data-documento-tipo={d.tipo} data-aberto={aberto ? "1" : "0"}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <Icone className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm text-texto font-body flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="pq-chip pq-chip-n" data-documento-tipo-texto>{rotuloTipo(d.tipo)}</span>
                          <span data-documento-titulo>{d.titulo}</span>
                          <span className="text-texto-3">·</span>
                          <span className="text-texto-2" data-documento-data>{formatarDataDocumento(d.data)}</span>
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body" data-documento-detalhe>{detalhe(d)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => pdf(d)} className={BTN_MINI_PRI} data-btn-pdf-documento>
                        <FileDown size={12} aria-hidden="true" /> PDF
                      </button>
                      <button type="button" onClick={() => alternar(d.id)} className={BTN_MINI} data-btn-ver-documento>
                        {aberto ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />} {aberto ? "Ocultar" : "Ver"}
                      </button>
                      <button type="button" onClick={() => abrirEdicao(d)} className={BTN_MINI} data-btn-editar-documento>
                        <PenLine size={12} aria-hidden="true" /> Editar texto
                      </button>
                      <button type="button" onClick={() => setParaExcluir(d)} className={BTN_MINI_PERIGO} data-btn-excluir-documento>
                        <Trash2 size={12} aria-hidden="true" /> Excluir
                      </button>
                    </div>
                  </div>
                  {aberto && (
                    <div className="ml-6 border-l-2 border-verde/40 pl-3 text-sm font-body leading-relaxed whitespace-pre-wrap text-texto-2" data-documento-texto>
                      {d.texto}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DocumentoDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        tipo={modal.tipo}
        documento={modal.documento}
        paciente={paciente}
        modelos={modelos}
        nomeNutricionista={nomeNutri}
        profissional={profissional}
        onSalvo={onSalvo}
        onGerenciarModelos={() => setModelosAberto({ aberto: true, tipo: modal.tipo })}
      />
      <ModelosDocumentoDialog
        open={modelosAberto.aberto}
        onOpenChange={(aberto) => setModelosAberto((m) => ({ ...m, aberto }))}
        modelos={modelos}
        nomeNutricionista={nomeNutri}
        tipoInicial={modelosAberto.tipo}
        onMudou={modelosMudaram}
      />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este documento?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {paraExcluir ? <><span className="text-texto">{rotuloTipo(paraExcluir.tipo)} · {paraExcluir.titulo}</span> ({formatarDataDocumento(paraExcluir.data)}) vai pra lixeira. </> : ""}
              O PDF que já foi baixado continua válido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-documento>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
