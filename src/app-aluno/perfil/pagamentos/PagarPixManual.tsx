import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Copy, FileText, Loader2, Paperclip, QrCode, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import { acaoFinanceiro, ErroFinanceiro, invalidarResumo, subirComprovante } from "@/financeiro/api";
import { payloadPix, qrDoPix } from "@/financeiro/pix";
import { mensagemErroFinanceiro, reais } from "@/financeiro/regras";
import type { CobrancaVista, MatriculaPagamentos } from "@/financeiro/tipos";
import { rotuloTipoChave } from "@/lib/pixBrCode";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";

export type AlvoPagamento = { tipo: "mensalidade"; adiantar?: boolean } | { tipo: "avulsa"; cobranca: CobrancaVista };

/**
 * Pagar por Pix na chave ativa da conta (C98; R16 para pacientes do Nutri): 1 · o QR/"copia e cola" com o valor, gerado no
 * aparelho (sem Mercado Pago); 2 · o comprovante (foto, print ou PDF até 5 MB) — obrigatório; "Já paguei" avisa o profissional,
 * que confere e confirma. Trocar o comprovante de um aviso pendente usa o mesmo caminho (o servidor não empilha).
 */
export function PagarPixManual({
  matricula,
  alvo,
  aoFechar,
  aoEnviado,
}: {
  matricula: MatriculaPagamentos;
  alvo: AlvoPagamento | null;
  aoFechar: () => void;
  aoEnviado: () => void;
}) {
  const chave = matricula.chave;
  const profissional = matricula.conta.profissional || "seu profissional";
  const valor = alvo?.tipo === "avulsa" ? Number(alvo.cobranca.valor) : Number(matricula.mensalidade?.valor ?? 0);
  const payload = useMemo(() => (alvo ? payloadPix(chave, valor, profissional) : null), [alvo, chave, valor, profissional]);
  const [qr, setQr] = useState<string | null>(null);
  const [anexo, setAnexo] = useState<{ caminho: string; pdf: boolean; previa: string | null; nome: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [avisando, setAvisando] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    setQr(null);
    if (payload) void qrDoPix(payload).then((u) => vivo && setQr(u));
    return () => {
      vivo = false;
    };
  }, [payload]);

  useEffect(() => {
    if (!alvo) setAnexo(null);
  }, [alvo]);
  useEffect(() => () => { if (anexo?.previa) URL.revokeObjectURL(anexo.previa); }, [anexo]);

  const copiar = async (texto: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(ok);
    } catch {
      toast.error("Não deu para copiar. Selecione o texto e copie.");
    }
  };

  const escolher = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnviando(true);
    try {
      const r = await subirComprovante(matricula.paciente_id, f);
      setAnexo({ ...r, nome: f.name });
      toast.success("Comprovante anexado. Agora é só avisar.");
    } catch (err) {
      toast.error(mensagemErroFinanceiro(err instanceof ErroFinanceiro ? err.codigo : null, "Não deu para enviar o comprovante. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  };

  const avisar = async () => {
    if (!anexo || avisando) return;
    setAvisando(true);
    try {
      const r = await acaoFinanceiro<{ atualizado: boolean }>("aluno_avisar_pix", {
        paciente_id: matricula.paciente_id,
        comprovante_path: anexo.caminho,
        ...(alvo?.tipo === "avulsa" ? { cobranca_id: alvo.cobranca.id } : {}),
      });
      invalidarResumo();
      toast.success(r.atualizado ? "Comprovante trocado — o profissional vai conferir." : `Aviso enviado! ${profissional} vai confirmar o pagamento.`);
      aoEnviado();
    } catch (err) {
      toast.error(mensagemErroFinanceiro(err instanceof ErroFinanceiro ? err.codigo : null, "Não deu para avisar agora. Tente de novo."));
    } finally {
      setAvisando(false);
    }
  };

  const titulo = alvo?.tipo === "avulsa" ? alvo.cobranca.descricao : alvo?.tipo === "mensalidade" && alvo.adiantar ? "Adiantar a mensalidade" : "Pagar a mensalidade";

  return (
    <PainelDeslizante aberto={!!alvo} aoMudar={(a) => !a && aoFechar()} titulo={titulo} descricao={`${reais(valor)} · Pix na chave de ${profissional}`} lado="baixo">
      <div className="flex flex-col gap-4" data-pagar-pix-manual>
        <section className="flex flex-col gap-3" data-pix-passo="1">
          <div className="pq-eyebrow">1 · Pague o Pix</div>
          {chave ? (
            <>
              <div className="flex items-start gap-4">
                <div className="flex h-[150px] w-[150px] flex-none items-center justify-center overflow-hidden rounded-[18px] border border-linha bg-white p-2">
                  {qr ? <img src={qr} alt="QR Code do Pix" className="h-full w-full" data-pix-qr /> : <QrCode aria-hidden className="h-12 w-12 text-zinc-400" />}
                </div>
                <dl className="min-w-0 flex-1 text-[12.5px]">
                  <div className="border-b border-linha-3 pb-1.5"><dt className="text-texto-3">Valor</dt><dd className="text-[15px] font-bold tabular-nums text-texto">{reais(valor)}</dd></div>
                  <div className="border-b border-linha-3 py-1.5"><dt className="text-texto-3">Favorecido</dt><dd className="truncate font-semibold text-texto">{chave.favorecido || profissional}</dd></div>
                  {chave.banco && <div className="border-b border-linha-3 py-1.5"><dt className="text-texto-3">Banco</dt><dd className="truncate text-texto">{chave.banco}</dd></div>}
                  <div className="pt-1.5">
                    <dt className="text-texto-3">{rotuloTipoChave(chave.tipo)}</dt>
                    <dd className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-texto" data-pix-chave>{chave.chave}</span>
                      <button type="button" onClick={() => void copiar(chave.chave, "Chave Pix copiada.")} aria-label="Copiar a chave" className="flex-none text-texto-3 hover:text-texto" data-pix-copiar-chave>
                        <Copy aria-hidden className="h-4 w-4" />
                      </button>
                    </dd>
                  </div>
                </dl>
              </div>
              {payload && (
                <Botao variante="g" icone={Copy} className="w-full" onClick={() => void copiar(payload, "Código Pix copiado.")} data-pix-copiar-codigo>
                  Copiar o código Pix (copia e cola)
                </Botao>
              )}
              <p className="text-[11.5px] leading-relaxed text-texto-3">No app do seu banco: Pix → “Pix copia e cola” (ou leia o QR) → confira o valor e o favorecido → pague.</p>
            </>
          ) : (
            <p className="text-[13px] text-texto-2">A chave Pix de {profissional} não está disponível. Fale com ele.</p>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-linha pt-4" data-pix-passo="2">
          <div className="pq-eyebrow">2 · Anexe o comprovante</div>
          <p className="text-[12.5px] text-texto-2">Foto, print ou PDF (até 5 MB). É por ele que {profissional} confirma o pagamento.</p>
          {anexo && (
            <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3 py-2.5" data-pix-anexo>
              {anexo.previa ? <img src={anexo.previa} alt="" className="h-12 w-12 flex-none rounded-[10px] object-cover" /> : <FileText aria-hidden className="h-7 w-7 flex-none text-texto-2" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-texto">{anexo.nome}</span>
                <span className="flex items-center gap-1 text-[11.5px] text-verde-3"><Check aria-hidden className="h-3.5 w-3.5" /> Anexado</span>
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolher} data-pix-input-camera />
            <input ref={arquivo} type="file" accept="image/*,application/pdf" className="hidden" onChange={escolher} data-pix-input-arquivo />
            <Botao variante="g" icone={Camera} disabled={enviando} onClick={() => camera.current?.click()}>{anexo ? "Nova foto" : "Tirar foto"}</Botao>
            <Botao variante="g" icone={Upload} disabled={enviando} onClick={() => arquivo.current?.click()}>{anexo ? "Trocar arquivo" : "Print ou PDF"}</Botao>
          </div>
          {enviando && <p className="flex items-center gap-2 text-[12.5px] text-texto-2" role="status"><Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Enviando o comprovante…</p>}
          <Botao variante="w" icone={anexo ? Send : Paperclip} className="w-full" disabled={!anexo || enviando || avisando || !chave} onClick={() => void avisar()} data-pix-avisar>
            {avisando ? "Enviando…" : `Já paguei — enviar para ${profissional.split(" ")[0]}`}
          </Botao>
          {!anexo && <p className="text-center text-[11.5px] text-texto-3">Anexe o comprovante para liberar o botão.</p>}
        </section>
      </div>
    </PainelDeslizante>
  );
}
