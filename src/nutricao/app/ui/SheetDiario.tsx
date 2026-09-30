import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, Check, ImagePlus, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import {
  ACCEPT_DIARIO, COMENTARIO_MAX, REFEICOES, agoraLocal, dataHoraLocalParaIso, ordenarRegistros, refeicaoSugerida, rotuloRefeicao, textoErroRpc,
  textoItemPublico, textoReacao, tomReacao, validarArquivoDiario, validarEnvio, type Refeicao,
} from "../diarioUtil";
import { enviarFotoDiario } from "../pacienteApp";
import type { MatriculaNutricao, RegistroDiario } from "../tipos";

const tamanhoLegivel = (b: number): string => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * Foto pro diário (N-52): o mesmo envio do link público do Nutri (foto no bucket + a função diario_enviar com o código do próprio
 * aluno) e os últimos 7 dias com a reação da nutricionista. A foto do próprio aluno aparece aqui e na refeição do dia (P29).
 * O ajuste "diário" do aluno só passa a valer na W14 — até lá o envio fica sempre ligado para quem está ativo.
 */
export function SheetDiario({
  aberto,
  aoMudar,
  matricula,
  registros,
  fotos,
  refeicaoInicial,
  desligado,
  aoEnviar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  /** a matrícula que recebe a foto (a do plano atual); sem ela, o envio não está liberado */
  matricula: MatriculaNutricao | null;
  registros: RegistroDiario[];
  fotos: Record<string, string>;
  refeicaoInicial?: Refeicao | null;
  desligado?: boolean;
  aoEnviar: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLElement>(null);
  const [refeicao, setRefeicao] = useState<Refeicao>(() => refeicaoInicial ?? refeicaoSugerida(new Date().getHours()));
  const [dataHora, setDataHora] = useState(() => agoraLocal());
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // cada vez que abre: a refeição pedida (ou a da hora) e o "agora"
  useEffect(() => {
    if (!aberto) return;
    setRefeicao(refeicaoInicial ?? refeicaoSugerida(new Date().getHours()));
    setDataHora(agoraLocal());
    setErro(null);
  }, [aberto, refeicaoInicial]);

  useEffect(() => () => {
    if (previa) URL.revokeObjectURL(previa);
  }, [previa]);

  const limparFoto = () => {
    setArquivo(null);
    setPrevia(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setErro(null);
    if (!f) return;
    const msg = validarArquivoDiario(f);
    if (msg) {
      setErro(msg);
      limparFoto();
      return;
    }
    setArquivo(f);
    setPrevia(URL.createObjectURL(f));
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!matricula) return;
    const dataHoraIso = dataHoraLocalParaIso(dataHora);
    const msg = validarEnvio({ refeicao, arquivo, comentario, dataHoraIso });
    if (msg) {
      setErro(msg);
      return;
    }
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      await enviarFotoDiario(matricula, arquivo, { refeicao, comentario, dataHoraIso });
      toast.success("Foto enviada", { description: rotuloRefeicao(refeicao) });
      limparFoto();
      setComentario("");
      setDataHora(agoraLocal());
      aoEnviar();
      // a foto nova aparece nos últimos 7 dias: leva a pessoa até lá
      setTimeout(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
    } catch (err) {
      setErro(textoErroRpc(err));
    } finally {
      setEnviando(false);
    }
  };

  const lista = ordenarRegistros(registros);
  const liberado = !!matricula && matricula.ativo;

  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Foto pro diário" descricao="A sua nutricionista vê a foto e reage por aqui.">
      <div className="flex flex-col gap-4" data-folha-diario data-enviando={enviando ? "1" : "0"}>
        {!liberado ? (
          <p className="rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] text-texto-2" data-diario-desligado>
            O envio de fotos não está liberado agora. Fale com a sua nutricionista.
          </p>
        ) : (
          <form className="flex flex-col gap-3.5" onSubmit={(e) => void enviar(e)} data-form-diario>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-texto-2">Refeição</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Refeição" data-diario-refeicoes>
                {REFEICOES.map((r) => (
                  <button
                    key={r.valor}
                    type="button"
                    onClick={() => setRefeicao(r.valor)}
                    aria-pressed={refeicao === r.valor}
                    data-diario-refeicao={r.valor}
                    className={cn(
                      "pq-chip h-8 px-3 text-[12px] normal-case tracking-normal transition-colors",
                      refeicao === r.valor ? "pq-chip-n" : "pq-chip-g opacity-80",
                    )}
                  >
                    {r.rotulo}
                  </button>
                ))}
              </div>
            </div>
            <Campo rotulo="Quando" type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} data-diario-quando />
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-texto-2">Foto</span>
              <input ref={inputRef} type="file" accept={ACCEPT_DIARIO} capture="environment" className="hidden" onChange={escolher} data-diario-arquivo />
              {previa && arquivo ? (
                <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie p-2" data-diario-previa>
                  <img src={previa} alt="Prévia da foto" className="h-20 w-20 flex-none rounded-[14px] object-cover" />
                  <span className="min-w-0 flex-1 text-[12px] text-texto-2">
                    <span className="block truncate text-texto">{arquivo.name}</span>
                    {tamanhoLegivel(arquivo.size)}
                  </span>
                  <div className="flex flex-none flex-col gap-1.5">
                    <Botao variante="g" tamanho="sm" icone={ImagePlus} onClick={() => inputRef.current?.click()} disabled={enviando} data-diario-trocar>Trocar</Botao>
                    <Botao variante="g" tamanho="sm" icone={X} onClick={limparFoto} disabled={enviando} data-diario-tirar>Tirar</Botao>
                  </div>
                </div>
              ) : (
                <Botao variante="g" icone={Camera} className="w-full" onClick={() => inputRef.current?.click()} disabled={enviando || desligado} data-diario-escolher>
                  Tirar ou escolher a foto
                </Botao>
              )}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-texto-2">Comentário (opcional · até {COMENTARIO_MAX})</span>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={COMENTARIO_MAX}
                rows={3}
                placeholder="Como foi essa refeição?"
                data-diario-comentario
                className="w-full resize-none rounded-[14px] border border-linha-2 bg-superficie px-4 py-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-verde/60"
              />
            </label>
            {erro && <MensagemForm data-diario-erro>{erro}</MensagemForm>}
            <Botao type="submit" variante="w" icone={enviando ? LoaderCircle : Check} className={cn("w-full", enviando && "[&_svg]:animate-spin")} disabled={enviando || desligado} data-diario-enviar>
              {enviando ? "Enviando…" : "Enviar foto"}
            </Botao>
          </form>
        )}

        <section ref={listaRef} data-diario-lista={lista.length} className="scroll-mt-2">
          <div className="pq-eyebrow px-1 pb-1.5">Seus últimos 7 dias</div>
          {lista.length === 0 ? (
            <p className="rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] text-texto-2" data-diario-vazio>
              Nenhuma foto nos últimos 7 dias.
            </p>
          ) : (
            <ul className="divide-y divide-linha-3 rounded-2xl border border-linha bg-superficie">
              {lista.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-3 py-2.5" data-diario-registro={r.id} data-diario-reacao={r.reacao_nutri ?? ""}>
                  {fotos[r.id] ? (
                    <img src={fotos[r.id]} alt="" aria-hidden className="h-12 w-12 flex-none rounded-[12px] object-cover" data-diario-miniatura />
                  ) : (
                    <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[12px] bg-superficie-2 text-texto-3">
                      <Camera aria-hidden className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-texto">{textoItemPublico(r)}</span>
                    {r.comentario && <span className="mt-0.5 block whitespace-pre-wrap text-[12px] text-texto-2">{r.comentario}</span>}
                    <span className="mt-1 block">
                      {r.reacao_nutri ? (
                        <Chip tom={tomReacao(r.reacao_nutri)} className="max-w-full whitespace-normal normal-case tracking-normal" data-diario-reacao-texto>
                          {textoReacao(r)}
                        </Chip>
                      ) : (
                        <span className="text-[12px] italic text-texto-3" data-diario-reacao-texto>{textoReacao(r)}</span>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PainelDeslizante>
  );
}
