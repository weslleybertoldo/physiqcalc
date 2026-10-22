import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Repeat, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { MensagemForm } from "@/entrada/pecas/Campo";
import { ouvirComprasDaPlay, pluginDaPlayPresente, urlGerenciarNaPlay } from "@/lib/playBilling";
import { cn } from "@/lib/utils";
import { useSessao } from "@/nucleo/sessao";
import { ESTADO_ABERTA_PELO_APP } from "@/publico/privacidade/textos";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { assinarPelaPlay, gerenciarAssinatura, recuperarComprasDaPlay } from "../play";
import {
  linhasDaOferta, mensagemPlay, porMes, textoDaAssinatura, textoDaTroca, type CodigoPlay, type ModoTroca, type OfertaMensal, type VistaPlay,
} from "../playRegras";
import { usePlayDaLoja } from "../usePlayDaLoja";

// o resumo dos Termos de assinatura antes de pagar: SÓ no build de staging até a virada (hml-11; a expressão do Vite direto na condição — o
// Rollup corta o import() na produção). Na folha da oferta da Play ele entra só com os Termos novos (o contrato da play-W6, §2.6).
const ResumoAntesDePagar = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/legal/ResumoAntesDePagar")) : null;

const CLASSE_LINK = "font-semibold text-violeta-3 underline-offset-2 hover:underline";
/** O "Assinar pela Google Play · R$ X/mês" é longo: o pq-botao é nowrap com 44 px fixos e, a 390, passava da borda do cartão da trava
 *  (o E2E de tela da play-W6, 16/10 — o molde do BOTAO_LONGO do Recebimento). A linha quebra dentro do botão e o toque mínimo de 44 px fica. */
const BOTAO_LONGO = "h-auto min-h-[44px] whitespace-normal py-2 text-center leading-snug";

/**
 * play-W6 — a folha da oferta da Google Play: o nome do plano, o preço QUE A PLAY DEVOLVE por mês, "renova todo mês até você cancelar",
 * "cancele quando quiser na Google Play", os dias que a pessoa já tem (o servidor adia a 1ª renovação por eles), os Termos e a Privacidade
 * — tudo antes do botão (a política da Play). Assinar = o plugin abre a folha da Play → o servidor confere no Google, grava e reconhece.
 * Na troca de plano, o modo vem junto (decisão 6: para o completo na hora; para o Treino na renovação).
 */
export function FolhaOfertaPlay({
  aberto,
  aoFechar,
  oferta,
  nomePlano,
  matriculaId,
  cobertoAte,
  troca,
}: {
  aberto: boolean;
  aoFechar: () => void;
  oferta: OfertaMensal | null;
  nomePlano: string;
  matriculaId: string | null;
  /** até quando a matrícula já está coberta (o teste grátis ou o mês pago pelo MP): a folha avisa que os dias continuam */
  cobertoAte: string | null;
  /** a troca de plano (com a assinatura viva): o produto de hoje e o modo */
  troca?: { produtoAntigo: CodigoPlay; modo: ModoTroca } | null;
}) {
  const qc = useQueryClient();
  const { recarregarSituacao } = useSessao();
  const play = usePlayDaLoja();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [codigoErro, setCodigoErro] = useState("");

  useEffect(() => {
    if (aberto) {
      setErro("");
      setCodigoErro("");
    }
  }, [aberto]);

  const concluir = async () => {
    await Promise.all([
      play.recarregar(),
      qc.invalidateQueries({ queryKey: ["plano-app"] }),
      qc.invalidateQueries({ queryKey: ["pagamentos-aluno"] }),
    ]);
    await recarregarSituacao();
  };

  const assinar = async () => {
    if (!oferta || !matriculaId) return setErro(mensagemPlay("sem_matricula_do_app"));
    setEnviando(true);
    setErro("");
    setCodigoErro("");
    const d = await assinarPelaPlay({ matriculaId, oferta, troca: troca ?? null });
    setEnviando(false);
    if (d.tipo === "cancelada") return;
    if (d.tipo === "erro") {
      setErro(mensagemPlay(d.codigo));
      setCodigoErro(d.codigo);
      // a revisão, ⚪15: o Google fora no registrar (a compra pode ter sido feita: a recuperação ao abrir e ao voltar ao app manda de novo —
      // sem o aviso do Google, a conferência de hora em hora só vê o que já está no banco) e o "já tem" — recarrega a Play e a
      // situação: o que o servidor já gravou aparece sem esperar os 10 minutos do resumo guardado
      if (d.codigo === "google_indisponivel" || d.codigo === "ja_tem") await concluir();
      return;
    }
    if (d.tipo === "pendente") toast.info(mensagemPlay("pendente"));
    else toast.success(troca ? `Plano trocado para ${nomePlano} pela Google Play.` : `Assinatura feita: ${nomePlano}. Bom treino!`);
    aoFechar();
    await concluir();
  };

  return (
    <PainelDeslizante
      aberto={aberto && !!oferta}
      aoMudar={(v) => !v && !enviando && aoFechar()}
      titulo={troca ? `Trocar para ${nomePlano}` : `Assinar ${nomePlano}`}
      descricao="Assinatura pela Google Play"
      lado="baixo"
      rodape={
        <Botao variante="w" icone={ShoppingBag} className="w-full" disabled={enviando || !oferta} onClick={() => void assinar()} data-play-assinar-confirmar>
          {enviando ? "Abrindo a Google Play…" : troca ? "Trocar pela Google Play" : "Assinar pela Google Play"}
        </Botao>
      }
    >
      {oferta && (
        <div className="flex flex-col gap-3" data-folha-oferta-play={oferta.produto}>
          <b className="text-[28px] font-bold tabular-nums tracking-[-0.03em] text-texto" data-play-preco>
            {oferta.preco}
            <span className="ml-1 text-[14px] font-medium text-texto-2">/mês</span>
          </b>
          <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-texto" data-play-linhas>
            {linhasDaOferta(oferta, troca ? null : cobertoAte).map((l) => (
              <li key={l} className="flex items-start gap-2">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-violeta-3" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
          {troca && <p className="text-[12.5px] leading-relaxed text-texto-2" data-play-troca={troca.modo}>{textoDaTroca(troca.modo)}</p>}
          {ResumoAntesDePagar && (
            <Suspense fallback={null}>
              <ResumoAntesDePagar tela="loja" />
            </Suspense>
          )}
          <p className="text-[12px] leading-relaxed text-texto-3" data-play-termos>
            Ao assinar, você concorda com os{" "}
            <Link to="/termos" state={ESTADO_ABERTA_PELO_APP} className={CLASSE_LINK}>Termos de uso</Link> e a{" "}
            <Link to="/privacidade" state={ESTADO_ABERTA_PELO_APP} className={CLASSE_LINK}>Política de privacidade</Link> do Physiq. O pagamento é
            feito na Google Play.
          </p>
          {erro && <MensagemForm data-play-erro>{erro}</MensagemForm>}
          {/* a revisão, ⚪17: o "já tem" manda abrir a Central de assinaturas — o botão vem junto */}
          {codigoErro === "ja_tem" && <BotaoGerenciarPlay produto={oferta.produto} className="self-start" />}
        </div>
      )}
    </PainelDeslizante>
  );
}

/** O botão "Assinar pela Google Play · R$ X/mês" com a folha da oferta (o produto pedido; sem oferta dele, a mais barata). */
export function BotaoAssinarPlay({
  produto,
  nomePlano,
  matriculaId,
  cobertoAte,
  rotulo,
  variante = "w",
  className,
  abrirJa = false,
}: {
  produto: string | null;
  nomePlano: string;
  matriculaId: string | null;
  cobertoAte: string | null;
  rotulo?: string;
  variante?: "w" | "g";
  className?: string;
  /** abre a folha ao montar (o ?assinar=1 da faixa) */
  abrirJa?: boolean;
}) {
  const play = usePlayDaLoja();
  const [aberto, setAberto] = useState(abrirJa);
  const ofertas = Object.values(play.ofertas).filter((o): o is OfertaMensal => !!o);
  // a revisão, ⚪17: com o plano da matrícula, SÓ a oferta dele (sem ela, nada — vender a mais barata com o nome do outro plano confunde);
  // sem plano, a mais barata
  const oferta = produto ? play.ofertas[produto as CodigoPlay] ?? null : ofertas.sort((a, b) => a.micros - b.micros)[0] ?? null;
  const matricula = matriculaId ?? play.estado?.matricula?.id ?? null;
  if (!oferta) return null;
  return (
    <>
      <Botao variante={variante} icone={ShoppingBag} className={cn(BOTAO_LONGO, className)} onClick={() => setAberto(true)} data-play-assinar={oferta.produto}>
        {rotulo ?? (
          // 1 item só no flex do botão (a linha quebra no texto, não entre itens) e o preço inteiro na mesma linha ("R$" não fica sozinho)
          <span>
            Assinar pela Google Play · <span className="whitespace-nowrap">{porMes(oferta.preco)}</span>
          </span>
        )}
      </Botao>
      <FolhaOfertaPlay aberto={aberto} aoFechar={() => setAberto(false)} oferta={oferta} nomePlano={nomePlano} matriculaId={matricula}
        cobertoAte={cobertoAte} />
    </>
  );
}

/** "Gerenciar na Google Play": na loja nativa, pelo plugin (a Central de assinaturas do produto); no site, o link (nova aba). */
export function BotaoGerenciarPlay({
  produto,
  className,
  rotulo = "Gerenciar na Google Play",
  variante = "g",
  tamanho = "sm",
}: {
  produto: string | null;
  className?: string;
  rotulo?: string;
  variante?: "w" | "g";
  tamanho?: "sm" | "md";
}) {
  if (!pluginDaPlayPresente()) {
    const classe = ["pq-botao", variante === "w" ? "pq-botao-w" : "pq-botao-g", tamanho === "sm" ? "pq-botao-sm" : "", className ?? ""].filter(Boolean).join(" ");
    return (
      <a href={urlGerenciarNaPlay(produto)} target="_blank" rel="noopener noreferrer" className={classe} data-play-gerenciar="link">
        <ExternalLink aria-hidden /> {rotulo}
      </a>
    );
  }
  return (
    <Botao tamanho={tamanho} variante={variante} icone={ExternalLink} className={className} onClick={() => void gerenciarAssinatura(produto)} data-play-gerenciar="app">
      {rotulo}
    </Botao>
  );
}

/** O cartão da assinatura viva: "Assinatura pela Google Play · até DD/MM · renova sozinha · Gerenciar" (site, APK do site e loja). */
export function CartaoAssinaturaPlay({ play, nomePlano }: { play: VistaPlay; nomePlano?: string | null }) {
  const t = textoDaAssinatura(play);
  return (
    <Cartao className="flex flex-col gap-2.5 px-4 py-3.5" data-assinatura-play={play.estado}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-superficie text-violeta-3"><Repeat aria-hidden className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1 text-[12.5px] text-texto-2">
          <b className="block text-[13.5px] font-semibold text-texto" data-assinatura-play-titulo>{t.titulo}{nomePlano ? ` · ${nomePlano}` : ""}</b>
          <span data-assinatura-play-detalhe>{t.detalhe}</span>
        </span>
        {t.tom !== "n" && <Chip tom={t.tom === "r" ? "r" : t.tom === "a" ? "a" : "n"} className="flex-none">{play.estado === "cancelada" ? "Cancelada" : "Atenção"}</Chip>}
      </div>
      <BotaoGerenciarPlay produto={play.produto} className="self-start" />
    </Cartao>
  );
}

/**
 * A compra que ficou no meio: ao abrir o app da loja (com a matrícula do app), as compras do aparelho ainda não reconhecidas voltam ao
 * servidor; e as que chegam por fora da folha (a pendente que concluiu, a reassinatura pela Play) também — e quando o app volta para a
 * frente (o appStateChange do @capacitor/app: a folha da Play por cima, o app que ficou no fundo sem o evento — a revisão, ⚪19). Não
 * desenha nada.
 */
export function PlayEmSegundoPlano() {
  const play = usePlayDaLoja();
  const { recarregarSituacao } = useSessao();
  const matricula = play.estado?.matricula?.id ?? null;
  useEffect(() => {
    if (!pluginDaPlayPresente() || !matricula) return;
    let vivo = true;
    const aoRegistrar = (n: number) => {
      if (!vivo || n <= 0) return;
      void play.recarregar();
      void recarregarSituacao();
    };
    void recuperarComprasDaPlay(matricula).then(aoRegistrar);
    let parar = () => {};
    void ouvirComprasDaPlay((compras) => void recuperarComprasDaPlay(matricula, compras).then(aoRegistrar)).then((p) => {
      if (vivo) parar = p;
      else p();
    });
    const aFrente = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (vivo && isActive) void recuperarComprasDaPlay(matricula).then(aoRegistrar);
    });
    return () => {
      vivo = false;
      parar();
      void aFrente.then((o) => o.remove()).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a matrícula muda (o recarregar é sempre o mesmo pedido)
  }, [matricula]);
  return null;
}
