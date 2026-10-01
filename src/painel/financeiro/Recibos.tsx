// Physiq W19 — Painel › Financeiro › Recibos (N-59, N-62): os recibos da conta ativa (o dono vê os da equipe; cada profissional, os
// dele), com o PDF de hoje (marca Physiq), o texto gravado, excluir (soft; o número não volta), os modelos ★ e o recibo avulso.
// Emitir A PARTIR DE UMA ENTRADA fica em Lançamentos (e na aba Financeiro do aluno), como no site antigo.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileDown, Plus, ReceiptText, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, DESCRICAO_JANELA, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { formatarNumeroRecibo } from "@/financeiro/recibos";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { excluirRecibo, listarRecibos, type Recibo } from "./dados";
import { fmtBRL, formatarData, palavrasBusca } from "./financeiroUtil";
import ModelosReciboDialog from "./ModelosReciboDialog";
import ReciboDialog from "./ReciboDialog";
import { textoContagemRecibos } from "./recibosUtil";
import { pdfDoRecibo } from "./pdfRecibo";
import { CHAVES, type FinanceiroConta } from "./useFinanceiro";

const PAGINA = 20;
const ICONE = "inline-flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border border-linha bg-superficie text-texto-2 transition-colors hover:text-texto";

export default function Recibos({ f }: { f: FinanceiroConta }) {
  const q = useQuery({ queryKey: CHAVES.recibos(f.contaId), queryFn: () => listarRecibos(f.contaId, f.uid), enabled: f.pronto });
  const [busca, setBusca] = useState("");
  const [mostrando, setMostrando] = useState(PAGINA);
  const [novo, setNovo] = useState(false);
  const [modelosAberto, setModelosAberto] = useState(false);
  const [vendo, setVendo] = useState<Recibo | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Recibo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const lista = useMemo(() => q.data ?? [], [q.data]);
  const filtrados = useMemo(() => {
    const ps = palavrasBusca(busca);
    if (!ps.length) return lista;
    return lista.filter((r) => {
      const alvo = palavrasBusca([r.paciente?.nome, r.descricao, formatarNumeroRecibo(r.numero), r.transacao?.descricao].filter(Boolean).join(" ")).join(" ");
      return ps.every((p) => alvo.includes(p));
    });
  }, [lista, busca]);
  const total = useMemo(() => filtrados.reduce((s, r) => s + Number(r.valor || 0), 0), [filtrados]);

  const baixar = async (r: Recibo) => {
    try {
      await pdfDoRecibo(f, r, r.paciente?.nome ?? "Aluno");
    } catch {
      toast.error("Não deu para gerar o PDF agora.");
    }
  };
  const excluir = async () => {
    if (!paraExcluir) return;
    setOcupado(true);
    try {
      await excluirRecibo(paraExcluir.id);
      toast.success(`Recibo nº ${formatarNumeroRecibo(paraExcluir.numero)} foi para a lixeira`);
      setParaExcluir(null);
      await f.recarregar("recibos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para excluir.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5" data-aba-financeiro-conteudo="recibos">
      <Cartao className="px-[18px] pb-2 pt-4" data-cartao-recibos-conta>
        <CabecalhoCartao
          titulo="Recibos"
          extra={<Chip tom="g" data-recibos-total={filtrados.length}>{filtrados.length}</Chip>}
          acao={
            <span className="flex gap-2">
              <Botao tamanho="sm" icone={Star} onClick={() => setModelosAberto(true)} data-btn-modelos-recibo>Modelos</Botao>
              <Botao tamanho="sm" variante="w" icone={Plus} onClick={() => setNovo(true)} data-btn-novo-recibo>Novo recibo</Botao>
            </span>
          }
        />
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <label className="relative flex min-w-[220px] flex-1 items-center">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 h-4 w-4 text-texto-3" />
            <input type="search" value={busca} onChange={(e) => { setBusca(e.target.value); setMostrando(PAGINA); }} placeholder="Buscar por aluno, descrição ou número"
              className="h-10 w-full rounded-[14px] border border-linha-2 bg-superficie pl-10 pr-3 text-[13.5px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60" data-busca-recibos />
          </label>
          <span className="text-[12.5px] text-texto-3" data-recibos-soma={total.toFixed(2)}>{textoContagemRecibos(filtrados.length)} · {fmtBRL(total)}</span>
        </div>
        {q.isLoading ? (
          <div className="flex flex-col gap-2 pb-3"><Esqueleto className="h-12 w-full rounded-2xl" /><Esqueleto className="h-12 w-full rounded-2xl" /></div>
        ) : q.isError ? (
          <EstadoErro titulo="Não deu para carregar os recibos" texto="Confira a internet e tente de novo." aoTentar={() => void q.refetch()} />
        ) : filtrados.length === 0 ? (
          <EstadoVazio icone={ReceiptText} className="my-5" titulo={lista.length ? "Nenhum recibo com essa busca" : "Nenhum recibo ainda"}
            texto={lista.length ? "Mude a busca." : "Emita a partir de uma entrada em Lançamentos ou faça um recibo avulso; o número é sequencial e o PDF sai na hora."}
            acao={lista.length ? undefined : <Botao variante="w" icone={Plus} onClick={() => setNovo(true)}>Novo recibo</Botao>} />
        ) : (
          <div data-lista-recibos-conta>
            {filtrados.slice(0, mostrando).map((r) => {
              const deOutro = r.nutricionista_id !== f.uid;
              return (
                <div key={r.id} className="flex min-h-[56px] items-center gap-3 border-t border-linha-3 py-2 first:border-t-0" data-recibo={r.numero} data-recibo-id={r.id}>
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-superficie text-violeta-3"><ReceiptText aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-texto">
                      <b className="font-semibold">Nº {formatarNumeroRecibo(r.numero)}</b> · <b className="font-semibold tabular-nums">{fmtBRL(Number(r.valor))}</b>
                      <span className="text-texto-2"> · {r.paciente?.nome ?? "Aluno"}</span>
                    </span>
                    <span className="block truncate text-[11.5px] text-texto-3">
                      {formatarData(r.data)} · {r.descricao}{r.transacao ? " · de uma entrada" : ""}{deOutro ? ` · por ${f.assinaturaDe(r.nutricionista_id).nome ?? "outro profissional"}` : ""}
                    </span>
                  </span>
                  <span className="flex flex-none items-center gap-1">
                    <button type="button" className={ICONE} aria-label="Ver o recibo" title="Ver o recibo" onClick={() => setVendo(r)} data-btn-ver-recibo><Eye aria-hidden className="h-4 w-4" /></button>
                    <button type="button" className={ICONE} aria-label="Baixar o PDF" title="Baixar o PDF" onClick={() => void baixar(r)} data-btn-pdf-recibo><FileDown aria-hidden className="h-4 w-4" /></button>
                    {(!deOutro || f.dono) && (
                      <button type="button" className={cn(ICONE, "hover:text-rosa-3")} aria-label="Excluir o recibo" title="Excluir o recibo" onClick={() => setParaExcluir(r)} data-btn-excluir-recibo>
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
            {filtrados.length > mostrando && (
              <div className="flex items-center justify-center gap-3 border-t border-linha-3 py-3">
                <span className="text-[12.5px] text-texto-3">Mostrando {mostrando} de {filtrados.length}</span>
                <Botao tamanho="sm" onClick={() => setMostrando((m) => m + PAGINA)} data-ver-mais-recibos>Ver mais</Botao>
              </div>
            )}
          </div>
        )}
      </Cartao>

      <ReciboDialog open={novo} onOpenChange={setNovo} aluno={null} alunos={f.alunos.data ?? []} transacao={null} modelos={f.modelos.data ?? []}
        proximoNumero={(f.ultimo.data ?? 0) + 1} nomeProfissional={f.nomeProfissional} padrao={f.padrao} uid={f.uid} contaId={f.contaId || null}
        onSalvo={() => void f.recarregar("recibos")} onGerenciarModelos={() => setModelosAberto(true)} />
      <ModelosReciboDialog open={modelosAberto} onOpenChange={setModelosAberto} uid={f.uid} contaId={f.contaId || null} modelos={f.modelos.data ?? []}
        nomeProfissional={f.nomeProfissional} onMudou={() => f.recarregar("modelos")} />

      <Dialog open={!!vendo} onOpenChange={(a) => { if (!a) setVendo(null); }}>
        <DialogContent className={cn(JANELA, "max-h-[88vh] overflow-y-auto sm:max-w-xl")} data-modal-ver-recibo={vendo?.numero}>
          <DialogHeader>
            <DialogTitle className={TITULO_JANELA}>Recibo nº {vendo ? formatarNumeroRecibo(vendo.numero) : ""}</DialogTitle>
            <DialogDescription className={DESCRICAO_JANELA}>
              {vendo ? `${fmtBRL(Number(vendo.valor))} · ${formatarData(vendo.data)} · ${vendo.descricao} · ${vendo.paciente?.nome ?? "Aluno"}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap rounded-2xl border border-linha-2 bg-[rgba(255,255,255,.03)] p-4 font-body text-[13px] leading-relaxed text-texto" data-texto-recibo>
            {vendo?.texto}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SEC} onClick={() => setVendo(null)}>Fechar</button>
            {vendo && <button type="button" className={BTN_PRI} onClick={() => void baixar(vendo)} data-btn-pdf-ver-recibo><FileDown size={13} aria-hidden="true" /> Baixar PDF</button>}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!paraExcluir} onOpenChange={(a) => { if (!a) setParaExcluir(null); }}>
        <AlertDialogContent className={JANELA}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>Excluir o recibo nº {paraExcluir ? formatarNumeroRecibo(paraExcluir.numero) : ""}?</AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA}>
              Ele vai para a lixeira e o número não é reaproveitado. Se nasceu de uma entrada, ela volta a ficar sem recibo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={ocupado} data-btn-confirmar-excluir-recibo>
              {ocupado ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
