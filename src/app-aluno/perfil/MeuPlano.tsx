import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dumbbell, ListChecks, Receipt, Repeat, Salad, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ErroFinanceiro } from "@/financeiro/api";
import { dataBR, mensagemErroFinanceiro } from "@/financeiro/regras";
import { ehLoja } from "@/lib/distribuicao";
import { useSessao } from "@/nucleo/sessao";
import { buscarMeuPlano, ErroApp, mudarObjetivo, trocarPlano } from "@/app-aluno/sozinho/api";
import { BotaoAssinarPlay, CartaoAssinaturaPlay, FolhaOfertaPlay } from "@/app-aluno/sozinho/pecas/AssinaturaPlay";
import { SeletorObjetivo, SeletorPlano } from "@/app-aluno/sozinho/pecas/Seletores";
import { ehCodigoPlay, modoDaTroca, playRenovando, playViva, porMes, type CodigoPlay, type ModoTroca } from "@/app-aluno/sozinho/playRegras";
import { mensagemApp, precoMensal, situacaoDoPlano, type Objetivo, type PlanoApp } from "@/app-aluno/sozinho/regras";
import { usePlayDaLoja } from "@/app-aluno/sozinho/usePlayDaLoja";
import { CLASSE_PAGINA_APP, TopoItem } from "@/app-aluno/perfil/pecas/TopoItem";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoSemInternet } from "@/ui/premium/Estados";
import { GrupoLista, ItemLista } from "@/ui/premium/Lista";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useOnline } from "@/ui/premium/useOnline";

// hml-11 (H-28, D5): o resumo dos Termos de assinatura sobre o Assinar/Pagar do plano do app (Decreto 7.962/2013, art. 4º, I) — SÓ no
// build de staging até a virada. Na produção o Rollup corta o import() (a expressão do Vite fica aqui, direto na condição, sem função
// no meio). Nunca na versão da Google Play (lá não há pagamento) nem no pagamento ao profissional (não é venda do Physiq).
const ResumoAntesDePagar = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/legal/ResumoAntesDePagar")) : null;

/**
 * Perfil › Meu plano (W7b — aluno sem profissional): o plano do app (Treino R$ 20,00 · Treino + Alimentação R$ 35,00 desde 26/10/2026 — os
 * preços da tabela do banco), a situação (grátis até, em dia, vencido), Pagar/Assinar (Perfil › Pagamentos, a cobrança da W6
 * pelo Mercado Pago do Physiq), trocar de plano (vale a partir do próximo pagamento; a cobrança automática acompanha) e o
 * objetivo (as listas de treinos e pratos prontos). Vincular a um profissional pelo código no Perfil encerra o plano do app.
 * W1 da loja: na versão da Google Play, só o plano e a situação (sem preço, sem Pagar/Assinar e sem trocar de plano — a mensalidade
 * do app vai para o Play Billing na W6); o objetivo, os treinos prontos e os Pagamentos continuam.
 * play-W6: na loja com a Play valendo (usePlayDaLoja), o preço é o da PLAY e o plano se assina pela Google Play (a folha da oferta; o
 * ?assinar=1 da faixa abre direto); com a assinatura viva, "Assinatura pela Google Play · até · renova" + Gerenciar e a troca pela Play
 * (para o completo na hora; para o Treino na renovação). Com a automática do MP ainda viva, sem oferta ("Seu plano é pago no cartão").
 * No site e no APK do site, quem tem a assinatura da Play viva vê ela + o link de gerenciar, sem Pagar, automática nem trocar.
 */
export default function MeuPlano() {
  const navigate = useNavigate();
  const online = useOnline();
  const qc = useQueryClient();
  const { recarregarSituacao } = useSessao();
  const consulta = useQuery({ queryKey: ["plano-app"], queryFn: buscarMeuPlano, staleTime: 15_000, retry: 1, networkMode: "online" });
  const play = usePlayDaLoja();
  const [params, setParams] = useSearchParams();
  const [troca, setTroca] = useState<PlanoApp | null>(null);
  const [trocaPlay, setTrocaPlay] = useState<{ produto: CodigoPlay; nome: string; modo: ModoTroca; antigo: CodigoPlay } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const d = consulta.data;
  const m = d?.matricula?.ativo ? d.matricula : null;
  const situacao = situacaoDoPlano(m);
  const planoAtual = d?.planos.find((p) => p.codigo === m?.plano) ?? null;
  const temAlimentacao = !!m?.modulos.includes("nutricao");
  const automatica = m?.assinatura?.status === "authorized";
  // play-W6
  const comPlay = ehLoja && play.ativa;
  const vistaPlay = playViva(m?.play) ? m!.play! : null;
  const ofertaAtual = m?.plano && ehCodigoPlay(m.plano) ? play.ofertas[m.plano] ?? null : null;
  const precosPlay = useMemo(
    () => (comPlay ? Object.fromEntries(Object.values(play.ofertas).flatMap((o) => (o ? [[o.produto, porMes(o.preco)]] : []))) : undefined),
    [comPlay, play.ofertas],
  );
  const planosDaLoja = (d?.planos ?? []).filter((p) => !comPlay || (ehCodigoPlay(p.codigo) && !!play.ofertas[p.codigo]));
  const pedeAssinar = params.get("assinar") === "1";
  useEffect(() => {
    if (!pedeAssinar) return;
    setParams((a) => {
      const q = new URLSearchParams(a);
      q.delete("assinar");
      return q;
    }, { replace: true });
  }, [pedeAssinar, setParams]);
  const [abrirOferta] = useState(pedeAssinar);

  const recarregar = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["plano-app"] }), qc.invalidateQueries({ queryKey: ["pagamentos-aluno"] })]);
    await recarregarSituacao();
  };

  const confirmarTroca = async () => {
    if (!troca || !m) return;
    setSalvando(true);
    try {
      const r = await trocarPlano(m.paciente_id, troca.codigo);
      setTroca(null);
      toast.success(r.mudou ? `Plano trocado para ${troca.nome}. Vale a partir do próximo pagamento.` : "Esse já é o seu plano.");
      if (r.assinatura === "falhou") toast.error("A cobrança automática não mudou de valor agora — tente de novo em Pagamentos.");
      await recarregar();
    } catch (e) {
      toast.error(e instanceof ErroFinanceiro ? mensagemErroFinanceiro(e.codigo) : "Não deu para trocar agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const escolherObjetivo = async (o: Objetivo) => {
    try {
      await mudarObjetivo(o);
      toast.success("Objetivo atualizado.");
      await recarregar();
    } catch (e) {
      toast.error(mensagemApp(e instanceof ErroApp ? e.codigo : null));
    }
  };

  /** Trocar de plano: com a assinatura da Play renovando, pela Play (o modo da decisão 6); sem ela, a troca de sempre (sem cobrança). */
  const escolherPlano = (codigo: string) => {
    const p = d?.planos.find((x) => x.codigo === codigo);
    if (!p || !m || p.codigo === m.plano) return;
    if (comPlay && vistaPlay && playRenovando(vistaPlay) && ehCodigoPlay(p.codigo) && ehCodigoPlay(vistaPlay.produto)) {
      const modo = modoDaTroca(vistaPlay.produto, p.codigo);
      if (modo) setTrocaPlay({ produto: p.codigo, nome: p.nome, modo, antigo: vistaPlay.produto });
      return;
    }
    setTroca(p);
  };

  // na loja com a Play e sem assinatura viva: a automática do MP ainda viva (sem oferta) ou o Assinar
  const blocoDaLoja = comPlay && situacao?.tipo !== "isento" && m && !vistaPlay ? (
    automatica ? (
      <p className="text-[12.5px] leading-relaxed text-texto-2" data-meu-plano-play-cartao>
        Seu plano é pago no cartão (cobrança automática). Para passar para a Google Play, cancele a cobrança em Pagamentos — os dias pagos
        continuam e a assinatura começa depois deles.
      </p>
    ) : (
      <BotaoAssinarPlay produto={m.plano} nomePlano={planoAtual?.nome ?? m.plano_nome ?? "do app"} matriculaId={m.paciente_id}
        cobertoAte={m.pago_ate} className="w-full" abrirJa={abrirOferta} />
    )
  ) : null;

  return (
    <div data-pagina-meu-plano={m ? "app" : d?.com_profissional ? "com-profissional" : "sem-plano"} className={CLASSE_PAGINA_APP}>
      <TopoItem titulo="Meu plano" />
      {!online && !d ? (
        <EstadoSemInternet texto="O seu plano aparece quando a internet voltar." />
      ) : consulta.isLoading ? (
        <EstadoCarregando linhas={3} rotulo="Carregando o seu plano" />
      ) : consulta.isError ? (
        <EstadoErro texto={mensagemApp(consulta.error instanceof ErroApp ? consulta.error.codigo : null)} aoTentar={() => void consulta.refetch()} />
      ) : !m ? (
        <Cartao className="flex flex-col gap-2 px-4 py-4 text-[13px] leading-relaxed text-texto-2" data-meu-plano-vazio>
          <b className="text-[15px] font-semibold text-texto">{d?.com_profissional ? "Você está com um profissional" : "Você não está no plano do app"}</b>
          {d?.com_profissional
            ? `A sua mensalidade é a do seu profissional (Perfil › Pagamentos).${d.matricula?.encerrada_em ? ` O plano do app parou em ${dataBR(d.matricula.encerrada_em)}.` : ""}`
            : ehLoja
              ? "Para treinar com um profissional, coloque o código dele no Perfil."
              : "Quem treina sem profissional escolhe o plano nas Boas-vindas."}
        </Cartao>
      ) : (
        <>
          <Cartao brilho className="flex flex-col gap-3 px-4 py-4" data-meu-plano={m.plano ?? ""}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-violeta-3">
                {temAlimentacao ? <Salad aria-hidden className="h-5 w-5" strokeWidth={1.8} /> : <Dumbbell aria-hidden className="h-5 w-5" strokeWidth={1.8} />}
              </span>
              <div className="min-w-[150px] flex-1">
                {ehLoja ? (
                  <>
                    <div className="truncate text-[12px] font-medium text-texto-2">Plano do app</div>
                    <b className="block truncate text-[24px] font-bold tracking-[-0.03em] text-texto" data-meu-plano-nome>{planoAtual?.nome ?? m.plano_nome ?? "Treino"}</b>
                    {comPlay && ofertaAtual && (
                      <div className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-texto-2" data-meu-plano-preco-play>{porMes(ofertaAtual.preco)} pela Google Play</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="truncate text-[12px] font-medium text-texto-2">Plano do app · {planoAtual?.nome ?? m.plano_nome ?? "Treino"}</div>
                    <b className="block whitespace-nowrap text-[24px] font-bold tabular-nums tracking-[-0.03em] text-texto" data-meu-plano-valor>{precoMensal(m.valor)}</b>
                  </>
                )}
              </div>
              {situacao && <Chip tom={situacao.tom} className="ml-auto flex-none" data-meu-plano-situacao={situacao.tipo}>{situacao.texto}</Chip>}
            </div>
            {(!ehLoja || situacao?.tipo === "isento") && !vistaPlay && (
              <p className="text-[12.5px] leading-relaxed text-texto-2" data-meu-plano-linha>
                {situacao?.tipo === "teste"
                  ? `Depois dos dias grátis, ${precoMensal(m.valor)} por Pix ou cartão. Sem pagar, o app fecha até você pagar.`
                  : situacao?.tipo === "isento"
                    ? "Sem cobrança."
                    : automatica
                      ? `Cobrança automática no cartão ligada${m.assinatura?.proximo_vencimento ? ` · próxima em ${dataBR(m.assinatura.proximo_vencimento)}` : ""}.`
                      : "Pague por Pix ou cartão, ou ligue a cobrança automática no cartão."}
              </p>
            )}
            {/* play-W6: a assinatura da Play viva (no site e no APK do site, sem Pagar, automática nem trocar; na loja, + a troca pela Play) */}
            {vistaPlay && <CartaoAssinaturaPlay play={vistaPlay} nomePlano={planoAtual?.nome ?? m.plano_nome} />}
            {ResumoAntesDePagar && !ehLoja && situacao?.tipo !== "isento" && !automatica && !vistaPlay && (
              <Suspense fallback={null}>
                <ResumoAntesDePagar tela="meu-plano" />
              </Suspense>
            )}
            {!ehLoja && situacao?.tipo !== "isento" && !automatica && !vistaPlay && (
              <Botao variante="w" icone={Wallet} className="w-full" onClick={() => navigate("/perfil/pagamentos?pagar=mensalidade")} data-meu-plano-pagar>
                {situacao?.tipo === "teste" ? `Assinar por ${precoMensal(m.valor)}` : `Pagar ${precoMensal(m.valor)}`}
              </Botao>
            )}
            {blocoDaLoja}
          </Cartao>

          {!ehLoja && !vistaPlay && (
            <Cartao className="flex flex-col gap-3 px-4 py-4" data-meu-plano-trocar>
              <SeletorPlano rotulo="Trocar de plano" planos={d?.planos ?? []} valor={m.plano} aoMudar={(c) => {
                const p = d?.planos.find((x) => x.codigo === c);
                if (p && p.codigo !== m.plano) setTroca(p);
              }} />
            </Cartao>
          )}
          {/* play-W6: na loja com a Play, a troca com o preço da Play (pela Play com a assinatura renovando; sem ela, a de sempre) */}
          {comPlay && situacao?.tipo !== "isento" && (!vistaPlay || playRenovando(vistaPlay)) && planosDaLoja.length > 1 && (
            <Cartao className="flex flex-col gap-3 px-4 py-4" data-meu-plano-trocar-play>
              <SeletorPlano rotulo="Trocar de plano" planos={planosDaLoja} valor={m.plano} aoMudar={escolherPlano} precos={precosPlay} />
            </Cartao>
          )}

          <Cartao className="flex flex-col gap-3 px-4 py-4" data-meu-plano-objetivo>
            <SeletorObjetivo valor={m.objetivo} aoMudar={(o) => { if (o !== m.objetivo) void escolherObjetivo(o); }} />
          </Cartao>

          <GrupoLista>
            <ItemLista icone={ListChecks} rotulo="Treinos prontos" para="/perfil/treinos-prontos" />
            {temAlimentacao && <ItemLista icone={Salad} rotulo="Alimentação" para="/dieta" />}
            <ItemLista icone={Receipt} rotulo="Pagamentos" para="/perfil/pagamentos" />
          </GrupoLista>
          <p className="px-1 text-[11.5px] leading-relaxed text-texto-3">
            <Repeat aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            {ehLoja
              ? `Tem um profissional? Coloque o código dele no Perfil para treinar com ele.${vistaPlay ? " A assinatura da Google Play é cancelada e vale até o fim do mês pago." : ""}`
              : vistaPlay
                ? "Tem um profissional? Coloque o código dele no Perfil: a assinatura da Google Play é cancelada (vale até o fim do mês pago) e você passa a pagar como combinar com ele."
                : "Tem um profissional? Coloque o código dele no Perfil: a mensalidade do app para (a cobrança automática é cancelada) e você passa a pagar como combinar com ele."}
          </p>
        </>
      )}

      <PainelDeslizante aberto={!!troca} aoMudar={(v) => !v && !salvando && setTroca(null)} titulo="Trocar de plano?"
        descricao={troca ? `${troca.nome} · ${comPlay ? precosPlay?.[troca.codigo] ?? "" : precoMensal(troca.valor)}` : undefined} lado="baixo"
        rodape={
          <div className="flex gap-2">
            <Botao className="flex-1" disabled={salvando} onClick={() => setTroca(null)} data-troca-cancelar>Cancelar</Botao>
            <Botao variante="w" className="flex-1" disabled={salvando} onClick={() => void confirmarTroca()} data-troca-confirmar>
              {salvando ? "Trocando…" : "Trocar"}
            </Botao>
          </div>
        }>
        <p className="text-[13.5px] leading-relaxed text-texto" data-troca-texto>
          {troca?.modulos.includes("nutricao")
            ? "Você ganha os pratos prontos pelo seu objetivo, com calorias e macros."
            : "Os pratos prontos saem do seu app (o treino continua igual)."}{" "}
          {comPlay
            ? "Quando você assinar pela Google Play, é este o plano."
            : <>O valor novo vale a partir do próximo pagamento{automatica ? " e a cobrança automática no cartão passa para ele" : ""}.</>}
        </p>
      </PainelDeslizante>
      {trocaPlay && m && (
        <FolhaOfertaPlay aberto={!!trocaPlay} aoFechar={() => setTrocaPlay(null)} oferta={play.ofertas[trocaPlay.produto] ?? null}
          nomePlano={trocaPlay.nome} matriculaId={m.paciente_id} cobertoAte={null} troca={{ produtoAntigo: trocaPlay.antigo, modo: trocaPlay.modo }} />
      )}
    </div>
  );
}
