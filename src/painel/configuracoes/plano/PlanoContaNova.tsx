import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, CalendarClock, CreditCard, Dumbbell, FlaskConical, QrCode, Repeat, Salad, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useSessao } from "@/nucleo/sessao";
import {
  NOME_FAIXA,
  NOME_PLANO,
  NOME_PLANO_CARTAO,
  avaliarMudanca,
  dataBR,
  diasEntre,
  fimDoAcesso,
  mensagemErroCobranca,
  precoDoPlano,
  primeiraCobrancaDaAssinatura,
  reais,
  vencimentoDepoisDoPagamento,
  type Faixa,
  type PlanoConta,
} from "@/nucleo/cobranca/regras";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro } from "@/ui/premium/Estados";
import { KpiCompacto } from "@/ui/premium/Kpi";
import { TopoPagina } from "@/ui/casca/topo";
import { acaoCobranca, buscarStatusCobranca, ErroCobranca, type FaturaConta, type StatusCobranca } from "./api";
import { CartaoPagamento, type DadosCartao } from "./CartaoPagamento";
import { EscolhaPlano, type Escolha } from "./EscolhaPlano";
import { HistoricoFaturas } from "./Historico";
import { PixAberto } from "./PixAberto";

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
 * Configurações › Plano da CONTA NOVA (W4, spec 6.5): card do plano (módulos, faixa, valor, situação), escolher/mudar o plano,
 * Pagar (Pix com QR e copia-e-cola; cartão à vista no Brick do Mercado Pago; cobrança automática no cartão; anual),
 * histórico de faturas e cancelar a cobrança automática. Visual das telas 6/7.
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
    const valor = precoDoPlano(s.precos, escolha.plano, escolha.faixa, escolha.meses, c.valor_travado);
    const valorMes = precoDoPlano(s.precos, escolha.plano, escolha.faixa, 1, c.valor_travado);
    const depois = vencimentoDepoisDoPagamento(c, escolha.meses, s.hoje);
    // cobrança automática ligada (no staging, a simulada vale igual): sem Pix/cartão avulso e sem faixa de aviso
    const recorrente = s.assinatura?.status === "authorized";
    const primeira = primeiraCobrancaDaAssinatura(c, s.hoje);
    const mudanca = ativa && !mesmoPlano ? avaliarMudanca({ plano: c.plano, faixa: c.faixa }, { plano: escolha.plano, faixa: escolha.faixa }, s.alunos_ativos, s.precos) : null;
    return { c, efetiva, ativa, mesmoPlano, valor, valorMes, depois, recorrente, primeira, mudanca };
  }, [s, escolha]);

  if (q.isLoading || (!s && !q.isError)) return <EstadoCarregando linhas={3} rotulo="Carregando o plano" />;
  if (q.isError || !s || !escolha || !derivado) {
    return <EstadoErro titulo="Não deu para carregar o plano" texto={mensagem(q.error)} aoTentar={() => void q.refetch()} />;
  }
  const { c, efetiva, ativa, mesmoPlano, valor, valorMes, depois, recorrente, primeira, mudanca } = derivado;
  const podePagar = efetiva !== "isenta" && efetiva !== "suspensa" && efetiva !== "cancelada";
  const sit = ROTULO_SITUACAO[efetiva];
  const fim = fimDoAcesso(c);
  const diasFim = fim ? diasEntre(s.hoje, fim) : null;
  const email = usuario?.email ?? "";

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
    : efetiva === "ativa" ? (recorrente ? `Ativa · renova sozinha em ${dataBR(c.vence_em ?? s.assinatura?.proximo_vencimento?.slice(0, 10))}` : `Ativa até ${dataBR(c.vence_em, false)}`)
    : efetiva === "vencida" ? `Vencida em ${dataBR(fim, false)} — o painel está travado`
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
            <p className={`mt-1 text-[14px] ${efetiva === "vencida" || efetiva === "suspensa" ? "text-rosa-3" : "text-texto-2"}`} data-plano-situacao>{linhaSituacao}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:flex">
            <KpiCompacto rotulo="Mensalidade" valor={reais(s.valor_mensal)} tomDetalhe="neutro"
              detalhe={c.valor_travado !== null ? "preço especial" : `${NOME_FAIXA[c.faixa]}`} />
            <KpiCompacto rotulo="Alunos ativos" valor={`${s.alunos_ativos}${s.limite_alunos !== null ? ` de ${s.limite_alunos}` : ""}`}
              tomDetalhe={s.limite_alunos !== null && s.alunos_ativos >= s.limite_alunos ? "ambar" : "verde"}
              detalhe={s.limite_alunos === null ? "sem limite" : s.alunos_ativos >= s.limite_alunos ? "limite atingido" : `${s.limite_alunos - s.alunos_ativos} vagas`} />
            <KpiCompacto rotulo={efetiva === "teste" ? "Teste até" : efetiva === "vencida" ? "Venceu em" : "Acesso até"}
              valor={fim ? dataBR(fim) : "—"} icone={CalendarClock}
              tomDetalhe={efetiva === "vencida" ? "rosa" : diasFim !== null && diasFim <= 7 ? "ambar" : "verde"}
              detalhe={efetiva === "vencida" ? "pague para liberar" : diasFim === null ? "sem vencimento" : diasFim === 0 ? "vence hoje" : `em ${diasFim} dias`} />
          </div>
        </div>
      </Cartao>

      {pixAberto && podePagar && (
        <PixAberto fatura={pixAberto} simulacao={s.simulacao}
          aoAprovar={() => { setPixNovo(null); void atualizar(); }}
          aoGerarOutro={() => { setPixNovo(null); gerarPix(); }} />
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {podePagar && (
            <Cartao className="p-5" data-cartao-escolha>
              <CabecalhoCartao
                titulo={ativa ? "Seu plano" : "Escolha o plano"}
                extra={ativa ? undefined : <Chip tom="g">{efetiva === "teste" ? "PARA DEPOIS DO TESTE" : "PARA VOLTAR AO PAINEL"}</Chip>}
              />
              <EscolhaPlano precos={s.precos} valorTravado={c.valor_travado} escolha={escolha} aoMudar={setEscolha}
                alunosAtivos={s.alunos_ativos} atual={ativa ? { plano: c.plano, faixa: c.faixa } : null} />

              <div className="mt-5 flex flex-col gap-3 border-t border-linha pt-4">
                {ativa && !mesmoPlano ? (
                  <div className="flex flex-col gap-3" data-mudar-plano>
                    <p className="text-[13px] text-texto-2">
                      Mudar para <b className="text-texto">{NOME_PLANO[escolha.plano]} · {NOME_FAIXA[escolha.faixa]}</b> ({reais(valorMes)}/mês).
                      {mudanca?.ok && mudanca.perdeModulo ? " Os dados do módulo que sai ficam guardados e escondidos; quem só atende nele perde o acesso." : ""}
                      {" "}O valor novo vale a partir do próximo pagamento{recorrente ? " e a cobrança automática passa ao valor novo" : ""}.
                    </p>
                    {mudanca && mudanca.ok === false && <p className="text-[13px] font-medium text-rosa-3">{mensagemErroCobranca(mudanca.erro)}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Botao variante="w" icone={BadgeCheck} onClick={mudarPlano} disabled={!!ocupado || (mudanca !== null && !mudanca.ok)} data-botao-mudar-plano>
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
                    <div className="flex flex-wrap gap-2">
                      <Botao variante="w" icone={QrCode} onClick={gerarPix} disabled={!!ocupado || recorrente || valor === null} data-botao-pix>
                        {ocupado === "pix" ? "Gerando…" : "Pagar com Pix"}
                      </Botao>
                      <Botao variante="g" icone={CreditCard} onClick={() => setCartao("avista")} disabled={!!ocupado || recorrente || valor === null} data-botao-cartao>
                        Cartão à vista
                      </Botao>
                      {escolha.meses === 1 && !recorrente && (
                        <Botao variante="g" icone={Repeat} onClick={() => setCartao("assinar")} disabled={!!ocupado || valorMes === null} data-botao-assinar>
                          Cobrança automática
                        </Botao>
                      )}
                    </div>
                    <p className="text-[11.5px] leading-relaxed text-texto-3">
                      {recorrente
                        ? "A cobrança automática já paga todo mês — para pagar por Pix, cancele-a antes."
                        : `Pix vale 72 h e confirma na hora. Na cobrança automática a 1ª cobrança é ${primeira ? `em ${dataBR(primeira)} (fim do ${efetiva === "teste" ? "teste" : "mês pago"})` : "hoje"} e renova todo mês, sem aviso.`}
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
                {efetiva === "isenta" ? "Sua conta está isenta: não há nada para pagar." : "Conta suspensa. Fale com o suporte para voltar a usar o painel."}
              </div>
            </Cartao>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {s.assinatura && s.assinatura.status !== "cancelled" && (
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
          <HistoricoFaturas faturas={s.faturas} />
        </div>
      </div>

      {cartao && valor !== null && (
        <CartaoPagamento aberto aoMudar={(v) => !v && setCartao(null)} modo={cartao}
          valor={cartao === "assinar" ? (valorMes ?? 0) : valor} email={email}
          descricao={`${NOME_PLANO[escolha.plano]} · ${NOME_FAIXA[escolha.faixa]}${cartao === "assinar" ? (primeira ? ` · 1ª cobrança em ${dataBR(primeira)}` : " · 1ª cobrança hoje") : escolha.meses === 12 ? " · 12 meses" : " · 1 mês"}`}
          aoEnviar={pagarCartao} />
      )}
    </div>
  );
}
