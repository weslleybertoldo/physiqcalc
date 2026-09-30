import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Clock, Download, FileText, QrCode, ReceiptText, RefreshCw, Repeat, Wallet } from "lucide-react";
import { toast } from "sonner";
import { acaoFinanceiro, buscarStatusAluno, ErroFinanceiro, invalidarResumo } from "@/financeiro/api";
import { baixarComprovantePdf, baixarReciboPdf, type DetalheMp } from "@/financeiro/pdf";
import {
  chipDaMensalidade,
  dataBR,
  dataHoraBR,
  estadoDaMensalidade,
  formasDePagar,
  hojeSP,
  linhaDaCobranca,
  mensagemErroFinanceiro,
  ordenarCobrancas,
  podePagarPeloApp,
  reais,
  recusaVigente,
  rotuloDaForma,
  textoDoVencimento,
} from "@/financeiro/regras";
import { formatarDataRecibo, formatarNumeroRecibo } from "@/financeiro/recibos";
import type { CobrancaVista, MatriculaPagamentos, ReciboVista } from "@/financeiro/tipos";
import { ComprovanteVisor } from "@/financeiro/ui/ComprovanteVisor";
import { LinhaCobranca } from "@/financeiro/ui/LinhaCobranca";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useOnline } from "@/ui/premium/useOnline";
import { PagarMercadoPago } from "./pagamentos/PagarMercadoPago";
import { PagarPixManual, type AlvoPagamento } from "./pagamentos/PagarPixManual";

const CHAVE = ["pagamentos-aluno"] as const;

/**
 * Perfil › Pagamentos (spec 4.3, tela 5; C23, C98–C100, N-54, R16): a mensalidade (plano, valor, situação e Pagar), as
 * cobranças em aberto (as do Nutri também — o paciente paga por Pix com comprovante quando a conta tem chave), o que está
 * aguardando a confirmação, o histórico com os comprovantes (ver o anexado e baixar o PDF) e os recibos. Tudo do banco
 * principal (pagamentos-aluno); precisa de internet (9A).
 */
export default function Pagamentos() {
  const navigate = useNavigate();
  const online = useOnline();
  const qc = useQueryClient();
  const consulta = useQuery({ queryKey: CHAVE, queryFn: buscarStatusAluno, staleTime: 15_000, retry: 1, networkMode: "online" });
  const [pagar, setPagar] = useState<{ m: MatriculaPagamentos; alvo: AlvoPagamento } | null>(null);
  const [detalhe, setDetalhe] = useState<{ m: MatriculaPagamentos; c: CobrancaVista } | null>(null);
  const [recibo, setRecibo] = useState<{ m: MatriculaPagamentos; r: ReciboVista } | null>(null);
  const [comprovante, setComprovante] = useState<string | null>(null);

  // ?pagar=mensalidade | <cobranca_id> (a faixa do topo e a trava mandam direto para o Pagar)
  const [params, setParams] = useSearchParams();
  const pedido = params.get("pagar");
  useEffect(() => {
    const d = consulta.data;
    if (!pedido || !d) return;
    for (const m of d.matriculas) {
      if (!podePagarPeloApp(m.conta.modo, !!m.chave)) continue;
      const c = m.cobrancas.find((x) => x.id === pedido && x.status === "aberta");
      if (c) {
        setPagar({ m, alvo: { tipo: "avulsa", cobranca: c } });
        break;
      }
      const e = m.mensalidade ? estadoDaMensalidade({ ...m.mensalidade, valor: m.mensalidade.valor }) : null;
      if (pedido === "mensalidade" && e && ["vencida", "pendente", "vence_em_breve", "teste"].includes(e.situacao)
        && !m.cobrancas.some((x) => x.tipo === "mensalidade" && x.status === "aguardando_confirmacao" && x.forma === "pix_manual")) {
        setPagar({ m, alvo: { tipo: "mensalidade" } });
        break;
      }
    }
    setParams((a) => {
      const q = new URLSearchParams(a);
      q.delete("pagar");
      return q;
    }, { replace: true });
  }, [pedido, consulta.data, setParams]);

  const recarregar = async () => {
    invalidarResumo();
    await qc.invalidateQueries({ queryKey: CHAVE });
  };
  const voltar = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));
  const dados = consulta.data;

  return (
    <div data-pagina-pagamentos className="mx-auto flex w-full max-w-[560px] flex-col gap-3 px-[18px] pb-8 pt-[max(14px,env(safe-area-inset-top,0px))]">
      <div className="mt-1 flex items-center gap-3">
        <BotaoIcone icone={ArrowLeft} rotulo="Voltar" onClick={voltar} data-pagamentos-voltar />
        <h1 className="flex-1 font-body text-[30px] font-bold normal-case tracking-[-0.03em] text-texto">Pagamentos</h1>
        <BotaoIcone icone={RefreshCw} rotulo="Atualizar" onClick={() => void recarregar()} className={consulta.isFetching ? "[&>svg]:animate-spin" : undefined} />
      </div>

      {!online && !dados ? (
        <EstadoSemInternet texto="Os pagamentos aparecem quando a internet voltar." />
      ) : consulta.isLoading ? (
        <EstadoCarregando linhas={3} rotulo="Carregando os pagamentos" />
      ) : consulta.isError ? (
        <EstadoErro texto={mensagemErroFinanceiro(consulta.error instanceof ErroFinanceiro ? consulta.error.codigo : null, "Confira a internet e tente de novo.")} aoTentar={() => void consulta.refetch()} />
      ) : !dados?.matriculas.length ? (
        <EstadoVazio icone={Wallet} titulo="Nenhum pagamento por aqui" texto="Quando o seu profissional definir a mensalidade ou lançar uma cobrança, ela aparece aqui." />
      ) : (
        dados.matriculas.map((m) => (
          <SecaoMatricula key={m.paciente_id} m={m} hoje={dados.hoje} varias={dados.matriculas.length > 1}
            aoPagar={(alvo) => setPagar({ m, alvo })} aoAbrir={(c) => setDetalhe({ m, c })} aoAbrirRecibo={(r) => setRecibo({ m, r })}
            aoVerComprovante={setComprovante} aoMudou={() => void recarregar()} />
        ))
      )}

      {pagar && (pagar.m.conta.modo === "mercadopago" ? (
        <PagarMercadoPago matricula={pagar.m} alvo={pagar.alvo} simulacao={!!dados?.simulacao} aoFechar={() => setPagar(null)}
          aoPago={() => { setPagar(null); void recarregar(); }} />
      ) : (
        <PagarPixManual matricula={pagar.m} alvo={pagar.alvo} aoFechar={() => setPagar(null)}
          aoEnviado={() => { setPagar(null); void recarregar(); }} />
      ))}
      <DetalheCobranca item={detalhe} aoFechar={() => setDetalhe(null)} aoVerComprovante={setComprovante} />
      <DetalheRecibo item={recibo} aoFechar={() => setRecibo(null)} />
      <ComprovanteVisor cobrancaId={comprovante} quem="aluno" aoFechar={() => setComprovante(null)} />
    </div>
  );
}

function SecaoMatricula({
  m,
  hoje,
  varias,
  aoPagar,
  aoAbrir,
  aoAbrirRecibo,
  aoVerComprovante,
  aoMudou,
}: {
  m: MatriculaPagamentos;
  hoje: string;
  varias: boolean;
  aoPagar: (a: AlvoPagamento) => void;
  aoAbrir: (c: CobrancaVista) => void;
  aoAbrirRecibo: (r: ReciboVista) => void;
  aoVerComprovante: (id: string) => void;
  aoMudou: () => void;
}) {
  const cobrancas = ordenarCobrancas(m.cobrancas);
  const aguardando = cobrancas.find((c) => c.tipo === "mensalidade" && c.status === "aguardando_confirmacao" && c.forma === "pix_manual") ?? null;
  const abertas = cobrancas.filter((c) => c.tipo === "avulsa" && (c.status === "aberta" || c.status === "aguardando_confirmacao"));
  const historico = cobrancas.filter((c) => !abertas.includes(c) && c !== aguardando && !(c.forma === "mp" && c.status === "aguardando_confirmacao"));
  const recusa = recusaVigente(m.cobrancas);
  const pagarNoApp = podePagarPeloApp(m.conta.modo, !!m.chave);
  const profissional = m.conta.profissional || "seu profissional";
  const [cancelando, setCancelando] = useState(false);

  const cancelarAssinatura = async () => {
    if (!window.confirm("Cancelar a cobrança automática? Ela para na hora.")) return;
    setCancelando(true);
    try {
      await acaoFinanceiro("aluno_mp_cancelar", { paciente_id: m.paciente_id });
      toast.success("Cobrança automática cancelada.");
      aoMudou();
    } catch (e) {
      toast.error(mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null));
    } finally {
      setCancelando(false);
    }
  };

  return (
    <section className="flex flex-col gap-3" data-matricula-pagamentos={m.paciente_id}>
      {varias && <div className="pq-eyebrow mt-2">{m.conta.nome ?? "Seu profissional"}</div>}
      {m.mensalidade ? (
        <CartaoMensalidade m={m} aguardando={!!aguardando} pagarNoApp={pagarNoApp} aoPagar={aoPagar} />
      ) : !m.cobrancas.length ? (
        <Cartao className="px-4 py-3.5 text-[13px] text-texto-2" data-sem-mensalidade>
          Nenhuma cobrança com {profissional} por enquanto. Quando houver, ela aparece aqui.
        </Cartao>
      ) : null}

      {m.assinatura && ["authorized", "pending"].includes(m.assinatura.status) && (
        <Cartao className="flex items-center gap-3 px-4 py-3" data-assinatura-aluno={m.assinatura.status}>
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-superficie text-violeta-3"><Repeat aria-hidden className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1 text-[12.5px] text-texto-2">
            <b className="block text-[13.5px] font-semibold text-texto">Cobrança automática {m.assinatura.status === "authorized" ? "ligada" : "pendente"}</b>
            {reais(m.assinatura.valor)}/mês no cartão{m.assinatura.proximo_vencimento ? ` · próxima em ${dataBR(m.assinatura.proximo_vencimento)}` : ""}
          </span>
          <Botao tamanho="sm" variante="g" disabled={cancelando} onClick={() => void cancelarAssinatura()}>Cancelar</Botao>
        </Cartao>
      )}

      {aguardando && (
        <Cartao className="flex flex-col gap-2.5 px-4 py-3.5" data-pagamento-aguardando={aguardando.id}>
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-texto"><Clock aria-hidden className="h-4 w-4 text-ciano-3" /> Aguardando {profissional.split(" ")[0]} confirmar</div>
          <p className="text-[12.5px] text-texto-2">
            {reais(aguardando.valor)} · comprovante enviado em {dataHoraBR(aguardando.enviado_em)}. Mandou o arquivo errado? Troque o comprovante.
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" variante="g" icone={FileText} onClick={() => aoVerComprovante(aguardando.id)} data-ver-comprovante-aguardando>Ver comprovante</Botao>
            <Botao tamanho="sm" variante="g" onClick={() => aoPagar({ tipo: "mensalidade", adiantar: true })} data-trocar-comprovante>Trocar comprovante</Botao>
          </div>
        </Cartao>
      )}

      {recusa && !aguardando && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-[var(--p-chip-r-borda)] bg-[var(--p-chip-r-fundo)] px-3.5 py-3 text-[12.5px]" data-comprovante-recusado>
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 flex-none text-rosa-3" />
          <span className="text-texto-2">
            <b className="font-semibold text-texto">Comprovante recusado</b>
            {recusa.recusado_motivo ? <> — “{recusa.recusado_motivo}”</> : "."} Confira o pagamento e envie um novo comprovante.
          </span>
        </div>
      )}

      {abertas.length > 0 && (
        <Cartao className="px-4 py-1" data-cobrancas-abertas>
          <div className="pq-eyebrow pb-1 pt-2.5">Cobranças</div>
          {abertas.map((c) => (
            <LinhaCobranca key={c.id} cobranca={c} hoje={hoje} aoTocar={() => aoAbrir(c)}
              acoes={c.status === "aberta" && pagarNoApp ? (
                <Botao tamanho="sm" variante="w" onClick={() => aoPagar({ tipo: "avulsa", cobranca: c })} data-pagar-cobranca={c.id}>Pagar</Botao>
              ) : null} />
          ))}
          {!pagarNoApp && abertas.some((c) => c.status === "aberta") && (
            <p className="border-t border-linha-3 py-2.5 text-[12px] text-texto-3">Pague como combinado com {profissional}.</p>
          )}
        </Cartao>
      )}

      <Cartao className="px-4 py-1" data-historico-pagamentos>
        <div className="pq-eyebrow pb-1 pt-2.5">Histórico</div>
        {historico.length === 0 ? (
          <p className="py-3 text-[12.5px] text-texto-3">Nenhum pagamento ainda.</p>
        ) : (
          historico.slice(0, 24).map((c) => <LinhaCobranca key={c.id} cobranca={c} hoje={hoje} aoTocar={() => aoAbrir(c)} />)
        )}
      </Cartao>

      {m.recibos.length > 0 && (
        <Cartao className="px-4 py-1" data-recibos-aluno>
          <div className="pq-eyebrow pb-1 pt-2.5">Recibos</div>
          {m.recibos.map((r) => (
            <button key={r.id} type="button" onClick={() => aoAbrirRecibo(r)} data-recibo-aluno={r.numero}
              className="flex min-h-[48px] w-full items-center gap-3 border-t border-linha-3 py-1.5 text-left first:border-t-0">
              <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-suave"><ReceiptText aria-hidden className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-texto">Recibo nº {formatarNumeroRecibo(r.numero)} · <b className="font-semibold tabular-nums">{reais(r.valor)}</b></span>
                <span className="block truncate text-[11.5px] text-texto-3">{formatarDataRecibo(r.data)} · {r.descricao}</span>
              </span>
            </button>
          ))}
        </Cartao>
      )}
    </section>
  );
}

function CartaoMensalidade({ m, aguardando, pagarNoApp, aoPagar }: { m: MatriculaPagamentos; aguardando: boolean; pagarNoApp: boolean; aoPagar: (a: AlvoPagamento) => void }) {
  const navigate = useNavigate();
  const ms = m.mensalidade!;
  const e = estadoDaMensalidade({ valor: ms.valor, pausada: ms.pausada, pago_ate: ms.pago_ate, desde: ms.desde, aguardando, teste_ate: ms.teste_ate ?? null });
  const chip = chipDaMensalidade(e);
  // W7b: nos dias grátis do plano do app dá para assinar/pagar já (o mês pago começa quando o teste acaba)
  const precisaPagar = e.situacao === "vencida" || e.situacao === "pendente" || e.situacao === "vence_em_breve" || e.situacao === "teste";
  const automatica = m.assinatura?.status === "authorized";
  const doApp = !!m.conta.app;
  const formas = pagarNoApp ? formasDePagar(m.conta.modo, !!m.chave) : `combine com ${m.conta.profissional ?? "seu profissional"}`;
  const linha = e.situacao === "pausada"
    ? doApp ? "Sem cobrança." : "Seu profissional parou a cobrança pelo app."
    : e.situacao === "teste"
      ? `Grátis até ${dataBR(e.vence)} · depois ${reais(ms.valor)}/mês · ${formas}`
      : `${e.coberta ? `Pago até ${dataBR(e.vence)}` : textoDoVencimento(e).replace(/^./, (x) => x.toUpperCase())} · ${formas}`;
  return (
    <Cartao brilho className="flex flex-col gap-3 px-4 py-4" data-mensalidade-aluno={e.situacao}>
      {/* o chip vai para a linha de baixo quando não cabe ao lado do valor ("Aguardando confirmação") */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie" style={{ color: chip.tom === "r" ? "var(--p-rosa-3)" : chip.tom === "a" ? "var(--p-ambar-3)" : chip.tom === "c" ? "var(--p-ciano)" : "var(--p-verde-2)" }}>
          <Wallet aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-[150px] flex-1">
          <div className="truncate text-[12px] font-medium text-texto-2">{doApp ? "Plano do app" : "Mensalidade"}{ms.plano ? ` · ${ms.plano}` : ""}</div>
          <b className="block whitespace-nowrap text-[24px] font-bold tabular-nums tracking-[-0.03em] text-texto">{reais(ms.valor)}<span className="ml-1 text-[13px] font-medium text-texto-2">/mês</span></b>
        </div>
        <Chip tom={chip.tom} className="ml-auto flex-none" data-chip-mensalidade>{chip.texto}</Chip>
      </div>
      <p className="text-[12.5px] text-texto-2" data-linha-mensalidade>{linha}</p>
      {e.situacao !== "pausada" && pagarNoApp && !automatica && (
        <div className="flex flex-wrap gap-2">
          {precisaPagar && !aguardando && (
            <Botao variante="w" icone={QrCode} onClick={() => aoPagar({ tipo: "mensalidade" })} data-pagar-mensalidade>
              {e.situacao === "teste" ? `Assinar · ${reais(ms.valor)}/mês` : `Pagar ${reais(ms.valor)}`}
            </Botao>
          )}
          {!precisaPagar && !aguardando && m.conta.modo === "pix_manual" && (
            <Botao variante="g" onClick={() => aoPagar({ tipo: "mensalidade", adiantar: true })} data-adiantar-mensalidade>Adiantar o próximo mês</Botao>
          )}
        </div>
      )}
      {doApp && e.situacao !== "pausada" && (
        <button type="button" onClick={() => navigate("/perfil/meu-plano")} className="self-start text-[12.5px] font-semibold text-violeta-3" data-trocar-plano-app>
          Trocar de plano ou de objetivo
        </button>
      )}
    </Cartao>
  );
}

function DetalheCobranca({ item, aoFechar, aoVerComprovante }: { item: { m: MatriculaPagamentos; c: CobrancaVista } | null; aoFechar: () => void; aoVerComprovante: (id: string) => void }) {
  const [baixando, setBaixando] = useState(false);
  const c = item?.c;
  const l = c ? linhaDaCobranca(c, hojeSP()) : null;
  const baixar = async () => {
    if (!item || !c) return;
    setBaixando(true);
    try {
      const mp = c.mp && !c.mp_simulado ? (await acaoFinanceiro<{ mp: DetalheMp | null }>("detalhe_mp", { cobranca_id: c.id }).catch(() => ({ mp: null }))).mp : null;
      await baixarComprovantePdf(c, { aluno: item.m.nome, profissional: item.m.conta.profissional, mp });
    } catch {
      toast.error("Não deu para gerar o PDF agora.");
    } finally {
      setBaixando(false);
    }
  };
  return (
    <PainelDeslizante aberto={!!item} aoMudar={(a) => !a && aoFechar()} titulo={l ? `${l.titulo} · ${l.valor}` : "Pagamento"} descricao={l?.detalhe} lado="baixo">
      {c && (
        <div className="flex flex-col gap-3" data-detalhe-cobranca={c.id}>
          <dl className="text-[13px]">
            {[
              ["Referente a", c.descricao],
              ["Forma", rotuloDaForma(c) || "—"],
              c.enviado_em ? ["Comprovante enviado", dataHoraBR(c.enviado_em)] : null,
              c.pago_em ? ["Pago em", dataHoraBR(c.pago_em)] : null,
              c.cobre_ate ? ["Cobre até", dataBR(c.cobre_ate, false)] : null,
              c.status === "aberta" ? ["Vencimento", dataBR(c.vencimento, false)] : null,
              c.recusado_em ? ["Motivo da recusa", c.recusado_motivo ?? "—"] : null,
              c.reembolsado_em ? ["Estornado em", dataBR(c.reembolsado_em, false)] : null,
            ].filter(Boolean).map((x) => (
              <div key={(x as string[])[0]} className="flex items-start justify-between gap-3 border-b border-linha-3 py-2 last:border-0">
                <dt className="text-texto-3">{(x as string[])[0]}</dt>
                <dd className="text-right text-texto">{(x as string[])[1]}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2">
            {c.comprovante && <Botao variante="g" icone={FileText} className="w-full" onClick={() => aoVerComprovante(c.id)} data-detalhe-ver-comprovante>Ver comprovante anexado</Botao>}
            {c.status === "paga" && <Botao variante="w" icone={Download} className="w-full" disabled={baixando} onClick={() => void baixar()} data-baixar-comprovante>{baixando ? "Gerando…" : "Baixar comprovante (PDF)"}</Botao>}
          </div>
        </div>
      )}
    </PainelDeslizante>
  );
}

function DetalheRecibo({ item, aoFechar }: { item: { m: MatriculaPagamentos; r: ReciboVista } | null; aoFechar: () => void }) {
  const r = item?.r;
  const baixar = async () => {
    if (!item || !r) return;
    try {
      await baixarReciboPdf({ numero: r.numero, valor: Number(r.valor), data: r.data, descricao: r.descricao, texto: r.texto, aluno: item.m.nome,
        profissional: item.m.conta.profissional, emitidoEm: new Date() });
    } catch {
      toast.error("Não deu para gerar o PDF agora.");
    }
  };
  return (
    <PainelDeslizante aberto={!!item} aoMudar={(a) => !a && aoFechar()} titulo={r ? `Recibo nº ${formatarNumeroRecibo(r.numero)}` : "Recibo"}
      descricao={r ? `${formatarDataRecibo(r.data)} · ${reais(r.valor)} · ${r.descricao}` : undefined} lado="baixo">
      {r && (
        <div className="flex flex-col gap-3" data-detalhe-recibo={r.numero}>
          <p className="whitespace-pre-wrap rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] leading-relaxed text-texto">{r.texto}</p>
          <Botao variante="w" icone={Download} className="w-full" onClick={() => void baixar()}>Baixar o recibo (PDF)</Botao>
        </div>
      )}
    </PainelDeslizante>
  );
}
