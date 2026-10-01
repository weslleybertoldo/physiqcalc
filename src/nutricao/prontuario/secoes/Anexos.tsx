// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Anexos.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useCallback, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Download, Eye, File, FileImage, FileSpreadsheet, FileText, FileType, Paperclip, PenLine, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import DescricaoAnexoDialog from "@/nutricao/prontuario/ui/DescricaoAnexoDialog";
import VisualizarAnexoDialog from "@/nutricao/prontuario/ui/VisualizarAnexoDialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { enviarAnexo, excluirAnexo, listarAnexosDoPaciente, urlAssinada, type Anexo } from "@/nutricao/prontuario/lib/anexos";
import {
  ACCEPT_INPUT, TAMANHO_MAX_ROTULO, formatarDataHoraAnexo, formatarTamanho, inserirAnexo, podeVisualizar, rotuloTipo, textoContagemAnexos, tipoPorMime,
  totalBytes, validarArquivo, type TipoAnexo,
} from "@/nutricao/editor/lib/anexosUtil";
import { usePaciente } from "@/nutricao/prontuario/ui/contexto";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PRI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-verde/40 bg-[rgba(16,185,129,.1)] px-2.5 text-[11.5px] font-semibold text-verde-3 transition-colors hover:bg-[rgba(16,185,129,.16)] disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

const ICONE: Record<TipoAnexo, ComponentType<{ className?: string }>> = {
  pdf: FileText,
  imagem: FileImage,
  documento: FileType,
  planilha: FileSpreadsheet,
  texto: FileText,
  outro: File,
};

type ItemFila = { chave: string; nome: string; tamanho: number; estado: "enviando" | "ok" | "erro"; erro?: string };

// Seção "Arquivos anexos" do paciente (referência: anexos por paciente). Upload por arrastar-e-soltar ou pelo botão (vários
// de uma vez, com fila mostrando o estado de cada um), lista "nome · tamanho · tipo · data · descrição" com Baixar (URL
// assinada), Ver (imagem/PDF), Descrição e Excluir (remove o objeto do bucket + soft delete na tabela).
export default function Anexos() {
  const { paciente: p, recarregar } = usePaciente();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const chave = useMemo(() => ["anexos-paciente", p.id], [p.id]);
  const anexosQ = useQuery({ queryKey: chave, queryFn: () => listarAnexosDoPaciente(p.id) });
  const anexos = useMemo(() => anexosQ.data ?? [], [anexosQ.data]);
  const total = useMemo(() => totalBytes(anexos), [anexos]);
  const carregando = !uid || anexosQ.isPending;
  const atualizando = carregando || anexosQ.isFetching;
  const erro = anexosQ.error;

  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [fila, setFila] = useState<ItemFila[]>([]);
  const enviando = fila.some((f) => f.estado === "enviando");
  const [paraExcluir, setParaExcluir] = useState<Anexo | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [descricaoDe, setDescricaoDe] = useState<Anexo | null>(null);
  const [visualizar, setVisualizar] = useState<Anexo | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  const enviar = useCallback(
    async (arquivos: File[]) => {
      if (!uid || !arquivos.length) return;
      const lote = arquivos.map((f, i) => ({ f, chave: `${Date.now()}-${i}-${f.name}`, erro: validarArquivo(f) }));
      setFila((old) => [
        ...old.filter((x) => x.estado === "erro"),
        ...lote.map(({ f, chave: k, erro: e }): ItemFila => ({ chave: k, nome: f.name, tamanho: f.size, estado: e ? "erro" : "enviando", erro: e ?? undefined })),
      ]);
      const validos = lote.filter((x) => !x.erro);
      const recusados = lote.length - validos.length;
      let ok = 0;
      for (const { f, chave: k } of validos) {
        try {
          const a = await enviarAnexo(uid, p.id, f);
          qc.setQueryData<Anexo[]>(chave, (old) => inserirAnexo(old ?? [], a));
          setFila((old) => old.map((x) => (x.chave === k ? { ...x, estado: "ok" } : x)));
          ok += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Falha no envio";
          setFila((old) => old.map((x) => (x.chave === k ? { ...x, estado: "erro", erro: msg } : x)));
        }
      }
      if (ok) {
        toast.success(ok === 1 ? "1 arquivo anexado" : `${ok} arquivos anexados`);
        void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
      }
      if (recusados) toast.error(recusados === 1 ? "1 arquivo recusado" : `${recusados} arquivos recusados`);
    },
    [uid, p.id, qc, chave, recarregar],
  );

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    void enviar(arquivos);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!arrastando) setArrastando(true);
  };
  const onDragLeave = () => setArrastando(false);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastando(false);
    void enviar(Array.from(e.dataTransfer?.files ?? []));
  };

  const baixar = async (a: Anexo) => {
    setBaixando(a.id);
    try {
      const url = await urlAssinada(a, 60, true);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.nome;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível baixar o arquivo");
    } finally {
      setBaixando(null);
    }
  };

  const onDescricaoSalva = (a: Anexo) => {
    qc.setQueryData<Anexo[]>(chave, (old) => (old ?? []).map((x) => (x.id === a.id ? a : x)));
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setExcluindo(true);
    try {
      await excluirAnexo(alvo);
      qc.setQueryData<Anexo[]>(chave, (old) => (old ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success(`"${alvo.nome}" excluído`);
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o arquivo");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="space-y-4" data-secao-anexos data-atualizando={atualizando ? "1" : "0"} data-enviando={enviando ? "1" : "0"}>
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-anexos>
          Não foi possível carregar os anexos: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      <section className="pq-cartao px-[18px] py-4 space-y-3" data-card="anexos">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Arquivos anexos</h2>
            <p className="text-[11px] text-texto-3 font-body" data-contagem-anexos={anexos.length} data-total-bytes={total}>
              {carregando ? "Carregando..." : textoContagemAnexos(anexos.length)}
              {!carregando && anexos.length > 0 && (
                <>
                  {" · "}
                  <span data-total-texto>{formatarTamanho(total)}</span>
                </>
              )}
            </p>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} className={BTN_PRI} disabled={carregando || enviando} data-btn-enviar-arquivos>
            <CloudUpload size={12} aria-hidden="true" /> {enviando ? "Enviando..." : "Enviar arquivos"}
          </button>
        </header>

        <input ref={inputRef} type="file" multiple accept={ACCEPT_INPUT} className="hidden" onChange={onInput} data-input-anexos />

        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded-2xl border border-dashed p-5 text-center space-y-1.5 transition-colors ${arrastando ? "border-verde bg-[rgba(16,185,129,.06)]" : "border-linha-2"}`}
          data-zona-upload
          data-arrastando={arrastando ? "1" : "0"}
        >
          <Paperclip className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
          <p className="text-sm text-texto font-body">
            Arraste arquivos aqui ou{" "}
            <button type="button" onClick={() => inputRef.current?.click()} className="text-verde-3 underline underline-offset-2 hover:opacity-80" disabled={carregando || enviando} data-btn-escolher-arquivos>
              escolha no computador
            </button>
          </p>
          <p className="text-xs text-texto-2 font-body">PDF, imagens, Word, Excel ou texto · até {TAMANHO_MAX_ROTULO} por arquivo · vários de uma vez</p>
        </div>

        {fila.length > 0 && (
          <div className="rounded-xl border border-linha p-3 space-y-1" data-fila-envio data-fila-total={fila.length}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-texto-2 font-body">Envio</p>
              <button type="button" onClick={() => setFila([])} className={BTN_MINI} disabled={enviando} data-btn-limpar-fila>
                <X size={12} aria-hidden="true" /> Limpar
              </button>
            </div>
            <ul className="divide-y divide-linha">
              {fila.map((f) => (
                <li key={f.chave} className="py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-body" data-fila-item={f.nome} data-estado={f.estado}>
                  <span className="min-w-0 break-all text-texto">
                    {f.nome} <span className="text-texto-2">· {formatarTamanho(f.tamanho)}</span>
                  </span>
                  <span className={f.estado === "erro" ? "text-rosa-3" : f.estado === "ok" ? "text-emerald-400" : "text-texto-2"} data-fila-status>
                    {f.estado === "enviando" ? "Enviando..." : f.estado === "ok" ? "Enviado" : f.erro}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!carregando && !erro && anexos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-anexos-vazio>
            <FileText className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhum arquivo anexado</p>
            <p className="text-xs text-texto-2 font-body">Exames, fotos e documentos do paciente ficam guardados aqui, só pra você.</p>
          </div>
        )}

        {anexos.length > 0 && (
          <ul className="divide-y divide-linha border-t border-linha" data-lista-anexos>
            {anexos.map((a) => {
              const tipo = tipoPorMime(a.mime);
              const Icone = ICONE[tipo];
              return (
                <li key={a.id} className="py-3 flex flex-wrap items-start justify-between gap-2" data-anexo={a.id} data-anexo-tipo={tipo} data-anexo-tamanho={a.tamanho} data-anexo-mime={a.mime}>
                  <div className="min-w-0 flex items-start gap-2">
                    <Icone className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm text-texto font-body break-all" data-anexo-nome>{a.nome}</p>
                      <p className="text-[10px] uppercase tracking-wider text-texto-3 font-body flex flex-wrap gap-x-1.5">
                        <span data-anexo-tamanho-texto>{formatarTamanho(a.tamanho)}</span>
                        <span>·</span>
                        <span data-anexo-tipo-texto>{rotuloTipo(a.mime)}</span>
                        <span>·</span>
                        <span data-anexo-data>{formatarDataHoraAnexo(a.created_at)}</span>
                      </p>
                      {a.descricao && <p className="text-xs text-texto-2 font-body mt-0.5" data-anexo-descricao>{a.descricao}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => void baixar(a)} className={BTN_MINI_PRI} disabled={baixando === a.id} data-btn-baixar-anexo>
                      <Download size={12} aria-hidden="true" /> {baixando === a.id ? "Gerando..." : "Baixar"}
                    </button>
                    {podeVisualizar(a.mime) && (
                      <button type="button" onClick={() => setVisualizar(a)} className={BTN_MINI} data-btn-ver-anexo>
                        <Eye size={12} aria-hidden="true" /> Ver
                      </button>
                    )}
                    <button type="button" onClick={() => setDescricaoDe(a)} className={BTN_MINI} data-btn-descricao-anexo>
                      <PenLine size={12} aria-hidden="true" /> Descrição
                    </button>
                    <button type="button" onClick={() => setParaExcluir(a)} className={BTN_MINI_PERIGO} data-btn-excluir-anexo>
                      <Trash2 size={12} aria-hidden="true" /> Excluir
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DescricaoAnexoDialog
        open={!!descricaoDe}
        onOpenChange={(aberto) => {
          if (!aberto) setDescricaoDe(null);
        }}
        anexo={descricaoDe}
        onSalvo={onDescricaoSalva}
      />
      <VisualizarAnexoDialog
        open={!!visualizar}
        onOpenChange={(aberto) => {
          if (!aberto) setVisualizar(null);
        }}
        anexo={visualizar}
        onBaixar={(a) => void baixar(a)}
      />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este arquivo?</AlertDialogTitle>
            <AlertDialogDescription className="font-body break-all">
              {paraExcluir ? <><span className="text-texto">{paraExcluir.nome}</span> ({formatarTamanho(paraExcluir.tamanho)}) </> : ""}
              sai do paciente e o arquivo é removido do armazenamento. O registro fica na lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-anexo>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
