import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, CalendarClock, CreditCard, Dumbbell, FlaskConical, Hourglass, QrCode, Repeat, Salad, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmarPerigo } from "@/ferramentas/Confirmar";
import { ehLoja } from "@/lib/distribuicao";
import { useSessao } from "@/nucleo/sessao";
import { CONTATO_SUPORTE, linkDoSuporte } from "@/nucleo/suporte";
import {
  NOME_FAIXA,
  NOME_PLANO,
  NOME_PLANO_CARTAO,
  avaliarMudanca,
  dataBR,
  diasEntre,
  emTolerancia,
  fimDoAcesso,
  mensagemErroCobranca,
  precoDoPlano,
  primeiraCobrancaDaAssinatura,
  reais,
  textoSaiDoLegado,
  vencimentoDepoisDoPagamento,
  vencimentoDoPlano,
  type Faixa,
  type PlanoConta,
} from "@/nucleo/cobranca/regras";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro } from "@/ui/premium/Estados";
import { KpiCompacto } from "@/ui/premium/Kpi";
import { TopoPagina } from "@/ui/casca/topo";
import { useUltimoValor } from "@/ui/premium/useUltimoValor";
import { acaoCobranca, buscarStatusCobranca, ErroCobranca, type FaturaConta, type StatusCobranca } from "./api";
import { CartaoPagamento, type DadosCartao } from "./CartaoPagamento";
import { EscolhaPlano, type Escolha } from "./EscolhaPlano";
import { HistoricoFaturas } from "./Historico";
import { PixAberto } from "./PixAberto";

// hml-11 (H-28, D5): o resumo dos Termos de assinatura antes de pagar (Decreto 7.962/2013, art. 4º, I) — SÓ no build de staging até a
// virada (o texto espera o advogado). Na produção o Vite troca o import.meta.env.VITE_DB_SCHEMA pelo valor e o Rollup corta o import():
// o resumo nem entra no bundle. A expressão fica AQUI, direto na condição, sem função no meio (o jeito da hml-08 e da hml-10).
const ResumoAntesDePagar = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/legal/ResumoAntesDePagar")) : null;

const ROTULO_SITUACAO = {
  teste: { chip: "TESTE", tom: "c" as const },
  ativa: { chip: "ATIVA", tom: "n" as const },
  vencida: { chip: "VENCIDA", tom: "r" as const },
  isenta: { chip: "ISENTA", tom: "g" as const },
  suspensa: { chip: "SUSPENSA", tom: "r" as const },
  cancelada: { chip: "CANCELADA", tom: "r" as const },
};

function mensagem(e: unknown): string {
  if (e instanceof ErroCobranca) {
    if (e.codigo === "sem_internet") return "Sem internet. O plano aparece quando a conexão voltar.";
    if (e.codigo === "alunos_acima_do_limite" && typeof e.extra.limite === "number") {
      return `Os ${e.extra.alunos} alunos ativos não cabem nessa faixa (até ${e.extra.limite}). Escolha uma faixa maior.`;
    }
    return mensagemErroCobranca(e.codigo);
  }
  return mensagemErroCobranca("erro_interno");
}

/**
 * Configurações › Plano da conta que o NÚCLEO cobra (W4, spec 6.5): card do plano (módulos, faixa, valor, situação), escolher/mudar
 * o plano, Pagar (Pix com QR e copia-e-cola; cartão à vista no Brick do Mercado Pago; cobrança automática no cartão; anual),
 * histórico de faturas e cancelar a cobrança automática. Visual das telas 6/7.
 * W28 (virada): a conta legada com cobranca_legada = false também abre aqui. Com o preço e as regras de hoje (regras_legadas), o
 * card mostra "Preço de hoje mantido" (e a tolerância do legado Calc), os preços vêm do servidor (o travado só no plano/faixa atual)
 * e trocar de plano — no "Mudar plano" ou escolhendo outro na hora de pagar — pede confirmação: a conta sai do legado de vez.
 * W1 da loja: na versão da Google Play, só o card do plano com a situação (o profissional paga pelo site): sem preço, sem escolher
 * plano/faixa/periodicidade, sem Pix/cartão/cobrança automática, sem o Pix aberto e sem o histórico de faturas.
 */
export function PlanoContaNova({ contaId }: { contaId: string }) {
  const { recarregarSituacao, usuario } = useSessao();
  const qc = useQueryClient();
  const chave = ["cobranca-conta", contaId];
  const q = useQuery({ queryKey: chave, queryFn: () => buscarStatusCobranca(contaId), staleTime: 15_000, retry: 1 });
  const s = q.data;

  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [cartao, setCartao] = useState<null | "avista" | "assinar">(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pixNovo, setPixNovo] = useState<FaturaConta | null>(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  // W28: confirmação antes de trocar de plano numa conta com o preço e as regras de hoje
  const [confirmarTroca, setConfirmarTroca] = useState<{ quando: "mudar" | "pagar"; seguir: () => void } | null>(null);
  // hml-18a (H-40, D): a folha do cartão e a confirmação da troca ficam montadas e fecham pelo `aberto`; enquanto saem, mostram o
  // que estava aberto (antes a folha do cartão sumia seca com o pai, e o texto da troca mudava no meio da saída)
  const cartaoVisto = useUltimoValor(cartao);
  const trocaVista = useUltimoValor(confirmarTroca);

  // a escolha começa no plano da conta (teste: Treino + Nutrição 1–10)
  useEffect(() => {
    if (s && !escolha) setEscolha({ plano: s.conta.plano, faixa: s.conta.faixa, meses: s.conta.periodicidade === "anual" ? 12 : 1 });
  }, [s, escolha]);

  const atualizar = async () => {
    await qc.invalidateQueries({ queryKey: chave });
    await recarregarSituacao(); // card do plano, trava e faixa do painel
  };

  const pixAberto = pixNovo && pixNovo.status !== "approved" ? pixNovo : s?.pix_aberto ?? null;

  const derivado = useMemo(() => {
    if (!s || !escolha) return null;
    const c = s.conta;
    const efetiva = c.efetiva;
    const ativa = efetiva === "ativa";
    const mesmoPlano = escolha.plano === c.plano && escolha.faixa === c.faixa;
    // W28: com o preço e as regras de hoje (regras_legadas) os preços são os do servidor — o valor travado só no plano/faixa atual
    // e a tabela nos outros; o preço especial do master (sem regras_legadas) vale em qualquer plano, como antes
    const travado = c.regras_legadas ? null : c.valor_travado;
    const valor = precoDoPlano(s.precos, escolha.plano, escolha.faixa, escolha.meses, travado);
    const valorMes = precoDoPlano(s.precos, escolha.plano, escolha.faixa, 1, travado);
    // trocar de plano/faixa tira a conta do legado (o servidor passa o preço e as regras para os da tabela)
    const saiDoLegado = !!c.regras_legadas && !mesmoPlano;
    const depois = vencimentoDepoisDoPagamento(c, escolha.meses, s.hoje);
    // cobrança automática ligada (no staging, a simulada vale igual): sem Pix/cartão avulso e sem faixa de aviso
    const recorrente = s.assinatura?.status === "authorized";
    const primeira = primeiraCobrancaDaAssinatura(c, s.hoje);
    const mudanca = ativa && !mesmoPlano ? avaliarMudanca({ plano: c.plano, faixa: c.faixa }, { plano: escolha.plano, faixa: escolha.faixa }, s.alunos_ativos, s.precos) : null;
    return { c, efetiva, ativa, mesmoPlano, travado, valor, valorMes, depois, recorrente, primeira, mudanca, saiDoLegado };
  }, [s, escolha]);

  if (q.isLoading || (!s && !q.isError)) return <EstadoCarregando linhas={3} rotulo="Carregando o plano" />;
  if (q.isError || !s || !escolha || !derivado) {
    return <EstadoErro titulo="Não deu para carregar o plano" texto={mensagem(q.error)} aoTentar={() => void q.refetch()} />;
  }
  const { c, efetiva, ativa, mesmoPlano, travado, valor, valorMes, depois, recorrente, primeira, mudanca, saiDoLegado } = derivado;
  const podePagar = efetiva !== "isenta" && efetiva !== "suspensa" && efetiva !== "cancelada";
  const sit = ROTULO_SITUACAO[efetiva];
  const fim = fimDoAcesso(c);
  // W28: "venceu em" é o vencimento sem a tolerância (legado Calc); nas contas novas, o mesmo último dia com acesso
  const vencimento = vencimentoDoPlano(c) ?? fim;
  const tolerancia = !recorrente && emTolerancia(c, s.hoje);
  const primeiraCobranca = primeira ? `em ${dataBR(primeira)} (fim do ${efetiva === "teste" ? "teste" : "mês pago"})` : "hoje";
  const diasFim = fim ? diasEntre(s.hoje, fim) : null;
  const email = usuario?.email ?? "";
  // o preço de hoje (o valor travado do legado — o servidor manda; sem ele, o valor mensal de hoje)
  const precoDeHoje = c.valor_travado ?? s.valor_mensal;
  // no teste ou vencida, outro plano escolhido na hora de pagar: confirma antes (sai do legado já neste pagamento)
  const confirmandoTroca = (seguir: () => void) => () => {
    if (saiDoLegado) setConfirmarTroca({ quando: "pagar", seguir });
    else seguir();
  };

  const executar = async (rotulo: string, fn: () => Promise<void>) => {
    if (ocupado) return;
    setOcupado(rotulo);
    try {
      await fn();
    } catch (e) {
      toast.error(mensagem(e));
    } finally {
      setOcupado(null);
    }
  };

  const gerarPix = () => executar("pix", async () => {
    const r = await acaoCobranca<{ fatura: FaturaConta; reutilizada?: boolean; aprovada?: boolean }>("pix_criar", { conta_id: contaId, ...escolha });
    if (r.aprovada) {
      toast.success("Esse Pix já foi pago. Plano renovado.");
      await atualizar();
      return;
    }
    setPixNovo(r.fatura);
    if (r.reutilizada) toast.info("Você já tinha um Pix aberto igual — é o mesmo código.");
    await qc.invalidateQueries({ queryKey: chave });
  });

  const pagarCartao = async (d: DadosCartao) => {
    const corpo = { conta_id: contaId, ...escolha, card_token: d.token, payment_method_id: d.payment_method_id, issuer_id: d.issuer_id };
    try {
      if (cartao === "assinar") {
        const r = await acaoCobranca<{ primeira_cobranca: string | null; sandbox: boolean }>("assinar", { ...corpo, meses: 1 });
        toast.success(r.sandbox
          ? "Cobrança automática criada no ambiente de teste do Mercado Pago (o cartão de teste não é cobrado)."
          : r.primeira_cobranca ? `Cobrança automática ligada. A 1ª cobrança é em ${dataBR(r.primeira_cobranca.slice(0, 10))}.` : "Cobrança automática ligada.");
      } else {
        const r = await acaoCobranca<{ status: string; status_detail: string | null }>("cartao_pagar", corpo);
        if (r.status === "approved") toast.success("Pagamento aprovado! Plano renovado.");
        else if (r.status === "rejected") toast.error("Pagamento recusado pelo cartão. Confira os dados ou use outro cartão.");
        else toast.info("Pagamento em análise no Mercado Pago — a situação atualiza em instantes.");
      }
      setCartao(null);
      await atualizar();
    } catch (e) {
      toast.error(mensagem(e));
      throw e;
    }
  };

  const mudarPlano = () => executar("mudar", async () => {
    const r = await acaoCobranca<StatusCobranca & { assinatura_atualizada: boolean | null }>("mudar_plano", { conta_id: contaId, plano: escolha.plano, faixa: escolha.faixa });
    toast.success(`Plano mudado para ${NOME_PLANO[escolha.plano]} (${NOME_FAIXA[escolha.faixa]}). O valor novo vale a partir do próximo pagamento.`);
    if (r.assinatura_atualizada === false) toast.error("A cobrança automática não aceitou o valor novo agora — confira em instantes.");
    await atualizar();
  });

  const cancelarAssinatura = () => executar("cancelar", async () => {
    await acaoCobranca("cancelar_assinatura", { conta_id: contaId });
    setConfirmarCancelar(false);
    toast.success("Cobrança automática cancelada. O que já foi pago continua valendo até o vencimento.");
    await atualizar();
  });

  const simularRecorrente = () => executar("simular-rec", async () => {
    await acaoCobranca("simular_recorrente", { conta_id: contaId });
    toast.success("Cobrança do cartão simulada (ambiente de teste).");
    await atualizar();
  });

  // ---- textos do card do plano ----
  const linhaSituacao =
    efetiva === "teste" ? `Teste grátis até ${dataBR(c.teste_ate, false)}`
    : efetiva === "ativa" ? (recorrente ? `Ativa · renova sozinha em ${dataBR(c.vence_em ?? s.assinatura?.proximo_vencimento?.slice(0, 10))}`
      : tolerancia ? (ehLoja ? `Venceu em ${dataBR(c.vence_em, false)} · o painel fica aberto até ${dataBR(fim, false)}` : `Venceu em ${dataBR(c.vence_em, false)} · pague até ${dataBR(fim, false)} para não perder o acesso`)
      : `Ativa até ${dataBR(c.vence_em, false)}`)
    : efetiva === "vencida" ? `Vencida em ${dataBR(vencimento, false)} — o painel está travado`
    : efetiva === "isenta" ? `Isenta${c.isenta_motivo ? ` · ${c.isenta_motivo}` : ""}`
    : "Conta suspensa. Fale com o suporte.";

  return (
    <div className="flex flex-col gap-4" data-plano-conta={efetiva}>
      <TopoPagina titulo="Plano" subtitulo={`${c.nome} · ${NOME_PLANO[c.plano]} · ${NOME_FAIXA[c.faixa]}`} />

      {/* card do plano (6.5) */}
      <Cartao brilho className="p-5" data-cartao-plano-conta>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {c.plano !== "nutricao" && <Chip tom="t" icone={Dumbbell}>TREINO</Chip>}
              {c.plano !== "treino" && <Chip tom="n" icone={Salad}>NUTRIÇÃO</Chip>}
              <Chip tom={sit.tom}>{sit.chip}</Chip>
              {s.ambiente === "staging" && <Chip tom="a" icone={FlaskConical}>AMBIENTE DE TESTE</Chip>}
            </div>
            <h2 className="mt-3 font-body text-[26px] font-bold normal-case tracking-[-0.035em] text-texto" data-plano-nome>{NOME_PLANO_CARTAO[c.plano]}</h2>
            <p className={`mt-1 text-[14px] ${efetiva === "vencida" || efetiva === "suspensa" || tolerancia ? "text-rosa-3" : "text-texto-2"}`} data-plano-situacao>{linhaSituacao}</p>
            {c.regras_legadas && (!ehLoja || c.tolerancia_dias > 0) && (
              <div className="mt-2.5 flex flex-col gap-1 text-[12.5px] text-texto-2" data-regras-de-hoje>
                {!ehLoja && (
                  <span className="flex items-center gap-1.5" data-preco-de-hoje>
                    <BadgeCheck aria-hidden className="h-3.5 w-3.5 flex-none text-verde-2" />
                    Preço de hoje mantido: <b className="font-semibold text-texto">{reais(precoDeHoje)}/mês</b>
                  </span>
                )}
                {c.tolerancia_dias > 0 && (
                  <span className="flex items-center gap-1.5" data-tolerancia-de-hoje>
                    <Hourglass aria-hidden className="h-3.5 w-3.5 flex-none text-texto-3" />
                    Tolerância de {c.tolerancia_dias} dias depois do vencimento
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={`grid grid-cols-2 gap-2.5 ${ehLoja ? "" : "sm:grid-cols-3 "}lg:flex`}>
            {!ehLoja && (
              <KpiCompacto rotulo="Mensalidade" valor={reais(s.valor_mensal)} tomDetalhe="neutro"
                detalhe={c.regras_legadas ? "preço de hoje" : c.valor_travado !== null ? "preço especial" : `${NOME_FAIXA[c.faixa]}`} />
            )}
            <KpiCompacto rotulo="Alunos ativos" valor={`${s.alunos_ativos}${s.limite_alunos !== null ? ` de ${s.limite_alunos}` : ""}`}
              tomDetalhe={s.limite_alunos !== null && s.alunos_ativos >= s.limite_alunos ? "ambar" : "verde"}
              detalhe={s.limite_alunos === null ? "sem limite" : s.alunos_ativos >= s.limite_alunos ? "limite atingido" : `${s.limite_alunos - s.alunos_ativos} vagas`} />
            <KpiCompacto rotulo={efetiva === "teste" ? "Teste até" : efetiva === "vencida" ? "Venceu em" : "Acesso até"}
              valor={(efetiva === "vencida" ? vencimento : fim) ? dataBR(efetiva === "vencida" ? vencimento : fim) : "—"} icone={CalendarClock}
              tomDetalhe={efetiva === "vencida" || tolerancia ? "rosa" : diasFim !== null && diasFim <= 7 ? "ambar" : "verde"}
              detalhe={efetiva === "vencida" ? (ehLoja ? "painel travado" : "pague para liberar") : diasFim === null ? "sem vencimento" : diasFim === 0 ? (tolerancia ? "último dia" : "vence hoje") : `em ${diasFim} dias`} />
          </div>
        </div>
      </Cartao>

      {pixAberto && podePagar && !ehLoja && (
        <PixAberto fatura={pixAberto} simulacao={s.simulacao}
          aoAprovar={() => { setPixNovo(null); void atualizar(); }}
          aoGerarOutro={() => { setPixNovo(null); gerarPix(); }} />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {podePagar && !ehLoja && (
            <Cartao className="p-5" data-cartao-escolha>
              <CabecalhoCartao
                titulo={ativa ? "Seu plano" : "Escolha o plano"}
                extra={ativa ? undefined : <Chip tom="g">{efetiva === "teste" ? "PARA DEPOIS DO TESTE" : "PARA VOLTAR AO PAINEL"}</Chip>}
              />
              <EscolhaPlano precos={s.precos} valorTravado={travado} escolha={escolha} aoMudar={setEscolha}
                alunosAtivos={s.alunos_ativos} atual={ativa ? { plano: c.plano, faixa: c.faixa } : null} />

              <div className="mt-5 flex flex-col gap-3 border-t border-linha pt-4">
                {ativa && !mesmoPlano ? (
                  <div className="flex flex-col gap-3" data-mudar-plano>
                    <p className="text-[13px] text-texto-2">
                      Mudar para <b className="text-texto">{NOME_PLANO[escolha.plano]} · {NOME_FAIXA[escolha.faixa]}</b> ({reais(valorMes)}/mês).
                      {mudanca?.ok && mudanca.perdeModulo ? " Os dados do módulo que sai ficam guardados e escondidos; quem só atende nele perde o acesso." : ""}
                      {" "}O valor novo vale a partir do próximo pagamento{recorrente ? " e a cobrança automática passa ao valor novo" : ""}.
                    </p>
                    {saiDoLegado && (
                      <p className="text-[12.5px] font-medium text-ambar-3" data-aviso-sai-do-legado>
                        O preço de hoje ({reais(precoDeHoje)}/mês) e as regras de hoje deixam de valer nesta conta.
                      </p>
                    )}
                    {mudanca && mudanca.ok === false && <p className="text-[13px] font-medium text-rosa-3">{mensagemErroCobranca(mudanca.erro)}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Botao variante="w" icone={BadgeCheck} disabled={!!ocupado || (mudanca !== null && !mudanca.ok)} data-botao-mudar-plano
                        onClick={() => (saiDoLegado ? setConfirmarTroca({ quando: "mudar", seguir: mudarPlano }) : mudarPlano())}>
                        {ocupado === "mudar" ? "Mudando…" : "Mudar para este plano"}
                      </Botao>
                      <Botao variante="g" onClick={() => setEscolha({ plano: c.plano, faixa: c.faixa, meses: escolha.meses })}>Manter o atual</Botao>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] text-texto-2" data-resumo-pagar>
                        {escolha.meses === 12 ? "12 meses" : "1 mês"} de {NOME_PLANO[escolha.plano]} ({NOME_FAIXA[escolha.faixa]}) · depois de pagar, ativa até{" "}
                        <b className="text-texto">{dataBR(depois.vence, false)}</b>
                      </span>
                      <b className="text-[22px] font-bold tabular-nums tracking-[-0.03em] text-texto" data-valor-pagar>{reais(valor)}</b>
                    </div>
                    {saiDoLegado && (
                      <p className="text-[12.5px] font-medium text-ambar-3" data-aviso-sai-do-legado>
                        Outro plano: o preço de hoje ({reais(precoDeHoje)}/mês) e as regras de hoje deixam de valer nesta conta.
                      </p>
                    )}
                    {ResumoAntesDePagar && !ehLoja && (
                      <Suspense fallback={null}>
                        <ResumoAntesDePagar tela="plano-profissional" />
                      </Suspense>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Botao variante="w" icone={QrCode} onClick={confirmandoTroca(gerarPix)} disabled={!!ocupado || recorrente || valor === null} data-botao-pix>
                        {ocupado === "pix" ? "Gerando…" : "Pagar com Pix"}
                      </Botao>
                      <Botao variante="g" icone={CreditCard} onClick={confirmandoTroca(() => setCartao("avista"))} disabled={!!ocupado || recorrente || valor === null} data-botao-cartao>
                        Cartão à vista
                      </Botao>
                      {escolha.meses === 1 && !recorrente && (
                        <Botao variante="g" icone={Repeat} onClick={confirmandoTroca(() => setCartao("assinar"))} disabled={!!ocupado || valorMes === null} data-botao-assinar>
                          Cobrança automática
                        </Botao>
                      )}
                    </div>
                    <p className="text-[11.5px] leading-relaxed text-texto-3">
                      {/* hml-11 (D5): "sem aviso" conflita com os Termos de assinatura novos — a frase nova só no staging até a virada */}
                      {recorrente ? (
                        "A cobrança automática já paga todo mês — para pagar por Pix, cancele-a antes."
                      ) : import.meta.env.VITE_DB_SCHEMA === "staging" ? (
                        <span data-frase-renovacao>{`Pix vale 72 h e confirma na hora. Na cobrança automática a 1ª cobrança é ${primeiraCobranca} e renova todo mês até você cancelar.`}</span>
                      ) : (
                        `Pix vale 72 h e confirma na hora. Na cobrança automática a 1ª cobrança é ${primeiraCobranca} e renova todo mês, sem aviso.`
                      )}
                    </p>
                  </>
                )}
              </div>
            </Cartao>
          )}
          {!podePagar && (
            <Cartao className="flex items-start gap-3 p-5" data-plano-sem-pagar>
              {efetiva === "isenta" ? <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 text-verde-2" /> : <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 text-rosa-3" />}
              <div className="text-[13.5px] leading-relaxed text-texto-2">
                {efetiva === "isenta" ? "Sua conta está isenta: não há nada para pagar." : (
                  <>Conta suspensa. Fale com o suporte para voltar a usar o painel:{" "}
                    <a href={linkDoSuporte(`Conta suspensa · ${c.nome}`)} className="font-semibold text-violeta-3 underline-offset-2 hover:underline" data-plano-suporte={CONTATO_SUPORTE}>{CONTATO_SUPORTE}</a>.</>
                )}
              </div>
            </Cartao>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {s.assinatura && s.assinatura.status !== "cancelled" && !ehLoja && (
            <Cartao className="p-5" data-assinatura={s.assinatura.status}>
              <CabecalhoCartao titulo="Cobrança automática"
                extra={<Chip tom={s.assinatura.status === "authorized" ? "n" : s.assinatura.status === "paused" ? "a" : "g"}>
                  {s.assinatura.status === "authorized" ? "ATIVA" : s.assinatura.status === "paused" ? "PAUSADA" : "PENDENTE"}
                </Chip>} />
              <p className="text-[13px] leading-relaxed text-texto-2">
                {reais(s.assinatura.valor)}/mês no cartão{s.assinatura.plano ? ` · ${NOME_PLANO[s.assinatura.plano as PlanoConta]}` : ""}
                {s.assinatura.faixa ? ` (${NOME_FAIXA[s.assinatura.faixa as Faixa]})` : ""}.
                {s.assinatura.proximo_vencimento ? ` Próxima cobrança em ${dataBR(s.assinatura.proximo_vencimento.slice(0, 10))}.` : ""}
              </p>
              {s.assinatura.sandbox && (
                <p className="mt-2 text-[12px] leading-relaxed text-ambar-3" data-assinatura-sandbox>
                  Criada no ambiente de teste do Mercado Pago: o cartão de teste não é cobrado (a cobrança de verdade é provada em produção).
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {confirmarCancelar ? (
                  <>
                    <Botao variante="w" icone={XCircle} onClick={cancelarAssinatura} disabled={!!ocupado} data-confirmar-cancelar>
                      {ocupado === "cancelar" ? "Cancelando…" : "Sim, cancelar"}
                    </Botao>
                    <Botao variante="g" onClick={() => setConfirmarCancelar(false)}>Voltar</Botao>
                  </>
                ) : (
                  <Botao variante="g" icone={XCircle} onClick={() => setConfirmarCancelar(true)} data-cancelar-assinatura>Cancelar cobrança automática</Botao>
                )}
                {s.simulacao && (
                  <Botao variante="g" icone={FlaskConical} onClick={simularRecorrente} disabled={!!ocupado} data-simular-recorrente>
                    {ocupado === "simular-rec" ? "Simulando…" : "Simular cobrança (teste)"}
                  </Botao>
                )}
              </div>
            </Cartao>
          )}
          {!ehLoja && <HistoricoFaturas faturas={s.faturas} />}
        </div>
      </div>

      <ConfirmarPerigo aberto={Boolean(confirmarTroca)} aoMudar={(a) => !a && setConfirmarTroca(null)} titulo="Trocar de plano?"
        texto={textoSaiDoLegado(precoDeHoje, valorMes, trocaVista?.quando ?? "mudar")} rotulo="Trocar de plano"
        aoConfirmar={() => {
          const seguir = confirmarTroca?.seguir;
          setConfirmarTroca(null);
          seguir?.();
        }} data-confirmar-sai-do-legado />

      {cartaoVisto && valor !== null && !ehLoja && (
        <CartaoPagamento aberto={cartao !== null} aoMudar={(v) => !v && setCartao(null)} modo={cartaoVisto}
          valor={cartaoVisto === "assinar" ? (valorMes ?? 0) : valor} email={email}
          descricao={`${NOME_PLANO[escolha.plano]} · ${NOME_FAIXA[escolha.faixa]}${cartaoVisto === "assinar" ? (primeira ? ` · 1ª cobrança em ${dataBR(primeira)}` : " · 1ª cobrança hoje") : escolha.meses === 12 ? " · 12 meses" : " · 1 mês"}`}
          aoEnviar={pagarCartao} />
      )}
    </div>
  );
}
