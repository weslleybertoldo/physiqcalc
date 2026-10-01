import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Camera, CircleCheck, ImageOff, ImagePlus, LinkIcon, LoaderCircle, Send, X } from "lucide-react";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { cn } from "@/lib/utils";
import {
  ACCEPT_DIARIO, COMENTARIO_MAX, FOTO_TAMANHO_MAX_ROTULO, REFEICOES, TEXTO_DIARIO_DESLIGADO, agoraLocal, dataHoraLocalParaIso, ordenarRegistros, refeicaoSugerida,
  rotuloRefeicao, textoErroRpc, textoItemPublico, textoReacao, tomReacao, validarArquivoDiario, validarEnvio, type Refeicao,
} from "@/nutricao/app/diarioUtil";
import { enviarPeloLink, listarPeloLink, normalizarCodigo, situacaoDoLink, type LinkDoDiario } from "@/painel/dietas/publico";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoVazio } from "@/ui/premium/Estados";

/**
 * /d/:codigo (W24 — N-7, N-56, spec 4.8 e 9): o diário alimentar PÚBLICO, sem login, no mesmo caminho de hoje (os códigos são os
 * mesmos do site antigo — nutri.physiqcalc.com.br/d/<código> continua valendo até a W28). O aluno escolhe a refeição (pela hora), a
 * data e hora (agora), a FOTO (câmera ou galeria; recusa > 10 MB e formato estranho ANTES de subir) e um comentário, e envia: a foto
 * sobe para o bucket privado "diario" e a linha é gravada pela diario_enviar — o mesmo caminho do app (W11). Embaixo, "Seus últimos 7
 * dias" em texto (a foto só a nutricionista vê) com a reação dela. Respeita os ajustes da W14: diário desligado → "O envio de fotos
 * está desligado pelo seu profissional"; envio pelo link desligado → o link não aceita (o app continua); código inexistente ou aluno
 * inativo → "Link não encontrado", sem expor dado de ninguém. Fora das App Links do APK (página pública).
 */
export default function Diario() {
  const { codigo = "" } = useParams();
  const c = normalizarCodigo(codigo);
  const q = useQuery({ queryKey: ["diario-publico", c], queryFn: () => situacaoDoLink(c), retry: 1, staleTime: 0, networkMode: "always" });
  const link: LinkDoDiario | null = q.data ?? null;
  const ok = link?.situacao === "ok" ? link : null;
  const lista = useQuery({ queryKey: ["diario-publico-lista", c], queryFn: () => listarPeloLink(c), enabled: !!ok, retry: 1, staleTime: 0, networkMode: "always" });
  const itens = ordenarRegistros(lista.data ?? []);

  const [refeicao, setRefeicao] = useState<Refeicao>(() => refeicaoSugerida(new Date().getHours()));
  const [dataHora, setDataHora] = useState(() => agoraLocal());
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const antes = document.title;
    document.title = ok?.nome ? `Diário de ${ok.nome} · Physiq` : "Diário alimentar · Physiq";
    return () => {
      document.title = antes;
    };
  }, [ok?.nome]);

  // a prévia é um object URL: libera quando troca ou desmonta
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
    setEnviado(null);
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
    if (!ok) return;
    const dataHoraIso = dataHoraLocalParaIso(dataHora);
    const msg = validarEnvio({ refeicao, arquivo, comentario, dataHoraIso });
    if (msg) return setErro(msg);
    if (!arquivo) return;
    setErro(null);
    setEnviado(null);
    setEnviando(true);
    try {
      await enviarPeloLink(c, ok, arquivo, { refeicao, comentario, dataHoraIso });
      setEnviado(rotuloRefeicao(refeicao));
      limparFoto();
      setComentario("");
      setDataHora(agoraLocal());
      await lista.refetch();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setErro(textoErroRpc(err));
    } finally {
      setEnviando(false);
    }
  };

  const casca = (conteudo: React.ReactNode, estado: string) => (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-7 sm:py-10" data-pagina-diario-publico={c} data-estado-diario={estado} data-enviando={enviando ? "1" : "0"}>
      {conteudo}
    </div>
  );

  if (q.isPending) return casca(<EstadoCarregando linhas={3} rotulo="Abrindo o seu diário" />, "carregando");

  if (q.isError) {
    return casca(
      <div data-diario-erro-rede>
        <EstadoVazio icone={ImageOff} titulo="Não deu para abrir o diário agora" texto="Confira a internet e abra o link de novo." />
      </div>,
      "erro",
    );
  }

  if (!ok) {
    const s = link?.situacao ?? "invalido";
    const textos: Record<string, { titulo: string; texto: string; icone: typeof ImageOff }> = {
      diario_desligado: { titulo: "Envio de fotos desligado", texto: TEXTO_DIARIO_DESLIGADO, icone: ImageOff },
      link_desligado: { titulo: "Este link não aceita fotos agora", texto: "O envio de fotos pelo link está desligado. Se você usa o app Physiq, mande pela aba Dieta › Foto pro diário.", icone: LinkIcon },
      sem_nutricionista: { titulo: "O diário ainda não está liberado", texto: "Este link ainda não tem uma nutricionista para receber as fotos. Fale com o seu profissional.", icone: ImageOff },
      invalido: { titulo: "Link não encontrado", texto: "Confira o link ou peça um novo para a sua nutricionista.", icone: ImageOff },
    };
    const t = textos[s] ?? textos.invalido;
    return casca(
      <div data-diario-recusado={s} {...(s === "invalido" ? { "data-diario-nao-encontrado": "" } : {})}>
        <EstadoVazio icone={t.icone} titulo={t.titulo} texto={t.texto} />
      </div>,
      s,
    );
  }

  return casca(
    <>
      <Cartao brilho className="flex flex-col gap-1.5 px-5 py-5 sm:px-6" data-diario-saudacao={ok.nome}>
        <div className="pq-eyebrow flex items-center gap-1.5"><Camera aria-hidden className="h-3.5 w-3.5" /> Diário alimentar</div>
        <h1 className="font-body text-[24px] font-bold normal-case tracking-[-0.03em] text-texto" data-saudacao={ok.nome}>{ok.nome ? `Olá, ${ok.nome}` : "Olá"}</h1>
        <p className="text-[13.5px] leading-relaxed text-texto-2">Mande a foto da sua refeição — a sua nutricionista vê e responde por aqui.</p>
      </Cartao>

      {enviado && (
        <MensagemForm tom="ok" data-envio-ok>
          <span className="inline-flex items-center gap-1.5"><CircleCheck aria-hidden className="h-4 w-4" /> Foto enviada ({enviado}). A sua nutricionista já pode ver.</span>
        </MensagemForm>
      )}

      <form className="flex flex-col gap-4" noValidate onSubmit={(e) => void enviar(e)} data-form-diario>
        <Cartao className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-texto-2">Refeição</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Refeição" data-chips-refeicao>
              {REFEICOES.map((r) => (
                <button
                  key={r.valor}
                  type="button"
                  onClick={() => {
                    setRefeicao(r.valor);
                    if (erro) setErro(null);
                  }}
                  aria-pressed={refeicao === r.valor}
                  disabled={enviando}
                  data-refeicao={r.valor}
                  className={cn("pq-chip h-8 px-3 text-[12px] normal-case tracking-normal transition-colors", refeicao === r.valor ? "pq-chip-n" : "pq-chip-g opacity-80")}
                >
                  {r.rotulo}
                </button>
              ))}
            </div>
          </div>
          <Campo rotulo="Data e hora" type="datetime-local" value={dataHora} max={agoraLocal()} disabled={enviando}
            onChange={(e) => { setDataHora(e.target.value); if (erro) setErro(null); }} data-campo-data-hora />
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-texto-2">Foto</span>
            <input ref={inputRef} type="file" accept={ACCEPT_DIARIO} capture="environment" className="hidden" onChange={escolher} data-campo-foto />
            {previa && arquivo ? (
              <div className="flex flex-col gap-2.5 rounded-[18px] border border-linha bg-superficie p-2.5" data-previa-foto>
                <img src={previa} alt="Prévia da foto" className="max-h-72 w-full rounded-[14px] object-contain" />
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="min-w-0 truncate text-[12px] text-texto-3" data-arquivo-info>{arquivo.name}</span>
                  <div className="flex gap-1.5">
                    <Botao tamanho="sm" icone={ImagePlus} onClick={() => inputRef.current?.click()} disabled={enviando} data-btn-trocar-foto>Trocar</Botao>
                    <Botao tamanho="sm" icone={X} onClick={limparFoto} disabled={enviando} data-btn-tirar-foto>Tirar</Botao>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={enviando}
                className="flex w-full flex-col items-center gap-2 rounded-[18px] border border-dashed border-linha-2 bg-superficie px-4 py-8 text-texto-2 transition-colors hover:border-verde/60 hover:text-texto"
                data-btn-escolher-foto
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-linha bg-superficie-2 text-verde-3"><Camera aria-hidden className="h-5 w-5" /></span>
                <span className="text-[14px] font-semibold text-texto">Tirar ou escolher a foto</span>
                <span className="text-[12px] text-texto-3">JPG, PNG, WebP ou HEIC até {FOTO_TAMANHO_MAX_ROTULO}</span>
              </button>
            )}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-texto-2">Comentário (opcional)</span>
            <textarea
              value={comentario}
              onChange={(e) => { setComentario(e.target.value); if (erro) setErro(null); }}
              maxLength={COMENTARIO_MAX}
              rows={3}
              disabled={enviando}
              placeholder="Como foi essa refeição? Alguma dúvida para a sua nutricionista?"
              className="w-full resize-none rounded-[14px] border border-linha-2 bg-superficie px-4 py-3 text-[15px] text-texto outline-none placeholder:text-texto-4 focus:border-verde/60"
              data-campo-comentario
            />
          </label>
          {erro && <MensagemForm data-erro-envio>{erro}</MensagemForm>}
          <Botao type="submit" variante="w" icone={enviando ? LoaderCircle : Send} className={cn("w-full", enviando && "[&_svg]:animate-spin")} disabled={enviando} data-btn-enviar>
            {enviando ? "Enviando…" : "Enviar foto"}
          </Botao>
        </Cartao>
      </form>

      <Cartao className="flex flex-col gap-2 p-5 sm:p-6" data-lista-publica data-total-publico={itens.length}>
        <h2 className="font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">Seus últimos 7 dias</h2>
        {lista.isPending ? (
          <p className="text-[13px] text-texto-3" data-lista-carregando>Carregando…</p>
        ) : lista.isError ? (
          <MensagemForm data-erro-lista-publica>Não foi possível carregar as suas fotos.</MensagemForm>
        ) : itens.length === 0 ? (
          <p className="text-[13px] text-texto-2" data-lista-publica-vazia>Nenhuma foto nos últimos 7 dias. A primeira pode ser agora!</p>
        ) : (
          <ul className="divide-y divide-linha-3">
            {itens.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2.5" data-registro-publico={r.id} data-reacao={r.reacao_nutri ?? ""}>
                <p className="text-[13.5px] font-semibold text-texto" data-registro-publico-titulo>{textoItemPublico(r)}</p>
                {r.comentario && <p className="whitespace-pre-wrap text-[12.5px] text-texto-3" data-registro-publico-comentario>{r.comentario}</p>}
                {r.reacao_nutri ? (
                  <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-texto-2" data-reacao-texto={textoReacao(r)}>
                    <Chip tom={tomReacao(r.reacao_nutri)} className="h-[20px] px-2 text-[9.5px]">{textoReacao({ ...r, comentario_nutri: "" }).toUpperCase()}</Chip>
                    {r.comentario_nutri && <span>{r.comentario_nutri}</span>}
                  </p>
                ) : (
                  <p className="text-[12px] italic text-texto-4" data-reacao-texto="aguardando a nutricionista">aguardando a nutricionista</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <p className="px-1 text-center text-[11.5px] text-texto-4">A foto vai direto para a sua nutricionista. Só ela vê.</p>
    </>,
    "ok",
  );
}
