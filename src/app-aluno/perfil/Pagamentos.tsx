import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Clock, Download, FileText, QrCode, ReceiptText, RefreshCw, Repeat, Wallet } from "lucide-react";
import { toast } from "sonner";
import { acaoFinanceiro, buscarHistoricoDoAluno, buscarStatusAluno, ErroFinanceiro, invalidarResumo } from "@/financeiro/api";
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
import { ehLoja } from "@/lib/distribuicao";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { Paginacao } from "@/ui/premium/Paginacao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useOnline } from "@/ui/premium/useOnline";
import { PagarMercadoPago } from "./pagamentos/PagarMercadoPago";
import { PagarPixManual, type AlvoPagamento } from "./pagamentos/PagarPixManual";

const CHAVE = ["pagamentos-aluno"] as const;
/** hml-14d (B21 · P7): o que a folha "Ver todos" mostra — as cobranças ou os recibos de uma matrícula. */
type Todos = { m: MatriculaPagamentos; tipo: "cobrancas" | "recibos" } | null;

/**
 * Perfil › Pagamentos (spec 4.3, tela 5; C23, C98–C100, N-54, R16): a mensalidade (plano, valor, situação e Pagar), as
 * cobranças em aberto (as do Nutri também — o paciente paga por Pix com comprovante quando a conta tem chave), o que está
 * aguardando a confirmação, o histórico com os comprovantes (ver o anexado e baixar o PDF) e os recibos. Tudo do banco
 * principal (pagamentos-aluno); precisa de internet (9A).
 * W1 da loja: na versão da Google Play, a conta do app (aluno sem profissional, até o Play Billing da W6) mostra o plano, a
 * situação e o histórico, sem preço e sem Pagar/Assinar (nem pelo ?pagar=); a cobrança automática que já existe ainda dá para
 * cancelar (é o que libera o "Excluir minha conta"). O que o aluno paga ao PROFISSIONAL (Pix com comprovante e o Mercado Pago da
 * conta dele) continua igual.
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
  const [todos, setTodos] = useState<Todos>(null);

  // ?pagar=mensalidade | <cobranca_id> (a faixa do topo e a trava mandam direto para o Pagar)
  const [params, setParams] = useSearchParams();
  const pedido = params.get("pagar");
  useEffect(() => {
    const d = consulta.data;
    if (!pedido || !d) return;
    for (const m of d.matriculas) {
      if (ehLoja && m.conta.app) continue;
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
            aoVerComprovante={setComprovante} aoMudou={() => void recarregar()} aoVerTodos={(tipo) => setTodos({ m, tipo })} />
        ))
      )}

      {pagar && (pagar.m.conta.modo === "mercadopago" ? (
        <PagarMercadoPago matricula={pagar.m} alvo={pagar.alvo} simulacao={!!dados?.simulacao} aoFechar={() => setPagar(null)}
          aoPago={() => { setPagar(null); void recarregar(); }} />
      ) : (
        <PagarPixManual matricula={pagar.m} alvo={pagar.alvo} aoFechar={() => setPagar(null)}
          aoEnviado={() => { setPagar(null); void recarregar(); }} />
      ))}
      <FolhaTodos todos={todos} hoje={dados?.hoje} aoFechar={() => setTodos(null)}
        aoAbrir={(m, c) => setDetalhe({ m, c })} aoAbrirRecibo={(m, r) => setRecibo({ m, r })} />
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
  aoVerTodos,
}: {
  m: MatriculaPagamentos;
  hoje: string;
  varias: boolean;
  aoPagar: (a: AlvoPagamento) => void;
  aoAbrir: (c: CobrancaVista) => void;
  aoAbrirRecibo: (r: ReciboVista) => void;
  aoVerComprovante: (id: string) => void;
  aoMudou: () => void;
  aoVerTodos: (tipo: "cobrancas" | "recibos") => void;
}) {
  const cobrancas = ordenarCobrancas(m.cobrancas);
  const aguardando = cobrancas.find((c) => c.tipo === "mensalidade" && c.status === "aguardando_confirmacao" && c.forma === "pix_manual") ?? null;
  const abertas = cobrancas.filter((c) => c.tipo === "avulsa" && (c.status === "aberta" || c.status === "aguardando_confirmacao"));
  const historico = cobrancas.filter((c) => !abertas.includes(c) && c !== aguardando && !(c.forma === "mp" && c.status === "aguardando_confirmacao"));
  const recusa = recusaVigente(m.cobrancas);
  // W1 da loja: a conta do app na versão da Google Play (sem pagar pelo app até a W6)
  const lojaApp = ehLoja && !!m.conta.app;
  const pagarNoApp = !lojaApp && podePagarPeloApp(m.conta.modo, !!m.chave);
  const profissional = m.conta.profissional || "seu profissional";
  const [cancelando, setCancelando] = useState(false);
  // hml-14d (B21 · D31 · P7): os cartões seguem com as 24 de sempre; "Ver todos (N)" abre a lista inteira do banco em páginas de 20
  // (N = o total da matrícula; a função de antes não manda o total: fica o que veio)
  const totalCobrancas = m.total_cobrancas ?? m.cobrancas.length;
  const totalRecibos = m.total_recibos ?? m.recibos.length;

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
            {lojaApp ? "No cartão" : `${reais(m.assinatura.valor)}/mês no cartão`}{m.assinatura.proximo_vencimento ? ` · próxima em ${dataBR(m.assinatura.proximo_vencimento)}` : ""}
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
          {!pagarNoApp && !lojaApp && abertas.some((c) => c.status === "aberta") && (
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
        {totalCobrancas > 0 && (
          <button type="button" onClick={() => aoVerTodos("cobrancas")} className="block border-t border-linha-3 py-2.5 text-left text-[12.5px] font-semibold text-violeta-3"
            data-ver-todos="pagamentos">
            Ver todos ({totalCobrancas})
          </button>
        )}
      </Cartao>

      {m.recibos.length > 0 && (
        <Cartao className="px-4 py-1" data-recibos-aluno>
          <div className="pq-eyebrow pb-1 pt-2.5">Recibos</div>
          {m.recibos.map((r) => <LinhaRecibo key={r.id} r={r} aoTocar={() => aoAbrirRecibo(r)} />)}
          {totalRecibos > m.recibos.length && (
            <button type="button" onClick={() => aoVerTodos("recibos")} className="block border-t border-linha-3 py-2.5 text-left text-[12.5px] font-semibold text-violeta-3"
              data-ver-todos="recibos">
              Ver todos ({totalRecibos})
            </button>
          )}
        </Cartao>
      )}
    </section>
  );
}

function LinhaRecibo({ r, aoTocar }: { r: ReciboVista; aoTocar: () => void }) {
  return (
    <button type="button" onClick={aoTocar} data-recibo-aluno={r.numero}
      className="flex min-h-[48px] w-full items-center gap-3 border-t border-linha-3 py-1.5 text-left first:border-t-0">
      <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-suave"><ReceiptText aria-hidden className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-texto">Recibo nº {formatarNumeroRecibo(r.numero)} · <b className="font-semibold tabular-nums">{reais(r.valor)}</b></span>
        <span className="block truncate text-[11.5px] text-texto-3">{formatarDataRecibo(r.data)} · {r.descricao}</span>
      </span>
    </button>
  );
}

/**
 * hml-14d (B21 · D31 · P7): a folha "Ver todos" — todas as cobranças (de qualquer situação, a mais nova primeiro) ou todos os recibos
 * (o número mais alto primeiro) da matrícula, em páginas de 20 do banco (aluno_historico), com "1–20 de N". A página fica no estado
 * da folha: fechar volta à 1; tocar num item abre o detalhe por cima e voltar mantém a página. O erro aparece na folha.
 */
function FolhaTodos({ todos, hoje, aoFechar, aoAbrir, aoAbrirRecibo }: {
  todos: Todos;
  hoje?: string;
  aoFechar: () => void;
  aoAbrir: (m: MatriculaPagamentos, c: CobrancaVista) => void;
  aoAbrirRecibo: (m: MatriculaPagamentos, r: ReciboVista) => void;
}) {
  const [pagina, setPagina] = useState(1);
  const cobrancas = todos?.tipo === "cobrancas";
  const q = useQuery({
    queryKey: [...CHAVE, "todos", todos?.m.paciente_id, todos?.tipo, pagina],
    queryFn: () => buscarHistoricoDoAluno(todos!.m.paciente_id, todos!.tipo, pagina),
    enabled: !!todos,
    // a página anterior segura a folha enquanto a nova chega — só da MESMA lista (cobranças × recibos têm outra forma)
    // (a chave: [pagamentos-aluno, todos, paciente_id, tipo, pagina])
    placeholderData: (anterior, consulta) =>
      consulta && consulta.queryKey[2] === todos?.m.paciente_id && consulta.queryKey[3] === todos?.tipo ? anterior : undefined,
    staleTime: 15_000,
    retry: 1,
    networkMode: "online",
  });
  const fechar = () => {
    setPagina(1);
    aoFechar();
  };
  const nome = cobrancas ? "app-pagamentos" : "app-recibos";
  return (
    <PainelDeslizante aberto={!!todos} aoMudar={(a) => !a && fechar()} titulo={cobrancas ? "Todos os pagamentos" : "Todos os recibos"}
      descricao={todos && q.data ? `${q.data.total} ${cobrancas ? (q.data.total === 1 ? "pagamento" : "pagamentos") : q.data.total === 1 ? "recibo" : "recibos"}` : undefined} lado="baixo">
      {todos && (
        <div data-folha-todos={cobrancas ? "pagamentos" : "recibos"}>
          {q.isError ? (
            <EstadoErro texto={mensagemErroFinanceiro(q.error instanceof ErroFinanceiro ? q.error.codigo : null, "Confira a internet e tente de novo.")} aoTentar={() => void q.refetch()} />
          ) : !q.data ? (
            <EstadoCarregando linhas={3} rotulo={cobrancas ? "Carregando os pagamentos" : "Carregando os recibos"} />
          ) : q.data.itens.length === 0 ? (
            <p className="py-3 text-[12.5px] text-texto-3">{cobrancas ? "Nenhum pagamento ainda." : "Nenhum recibo ainda."}</p>
          ) : (
            <div data-lista={nome}>
              {cobrancas
                ? (q.data.itens as CobrancaVista[]).map((c) => (
                    <div key={c.id} data-item className="border-t border-linha-3 first:border-t-0">
                      <LinhaCobranca cobranca={c} hoje={hoje} aoTocar={() => aoAbrir(todos.m, c)} />
                    </div>
                  ))
                : (q.data.itens as ReciboVista[]).map((r) => (
                    <div key={r.id} data-item className="border-t border-linha-3 first:border-t-0">
                      <LinhaRecibo r={r} aoTocar={() => aoAbrirRecibo(todos.m, r)} />
                    </div>
                  ))}
            </div>
          )}
          {q.data && <Paginacao nome={nome} pagina={pagina} total={q.data.total} aoMudar={setPagina} carregando={q.isFetching} />}
        </div>
      )}
    </PainelDeslizante>
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
  // W1 da loja: a conta do app na versão da Google Play — o plano e a situação, sem preço nem forma de pagar
  const lojaApp = ehLoja && doApp;
  const formas = pagarNoApp ? formasDePagar(m.conta.modo, !!m.chave) : `combine com ${m.conta.profissional ?? "seu profissional"}`;
  const quando = e.coberta ? `Pago até ${dataBR(e.vence)}` : textoDoVencimento(e).replace(/^./, (x) => x.toUpperCase());
  const linha = e.situacao === "pausada"
    ? doApp ? "Sem cobrança." : "Seu profissional parou a cobrança pelo app."
    : lojaApp
      ? e.situacao === "teste" ? `Grátis até ${dataBR(e.vence)}` : quando
      : e.situacao === "teste"
        ? `Grátis até ${dataBR(e.vence)} · depois ${reais(ms.valor)}/mês · ${formas}`
        : `${quando} · ${formas}`;
  return (
    <Cartao brilho className="flex flex-col gap-3 px-4 py-4" data-mensalidade-aluno={e.situacao}>
      {/* o chip vai para a linha de baixo quando não cabe ao lado do valor ("Aguardando confirmação") */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie" style={{ color: chip.tom === "r" ? "var(--p-rosa-3)" : chip.tom === "a" ? "var(--p-ambar-3)" : chip.tom === "c" ? "var(--p-ciano)" : "var(--p-verde-2)" }}>
          <Wallet aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-[150px] flex-1">
          {lojaApp ? (
            <>
              <div className="truncate text-[12px] font-medium text-texto-2">Plano do app</div>
              <b className="block truncate text-[24px] font-bold tracking-[-0.03em] text-texto" data-plano-app-nome>{ms.plano ?? "Physiq"}</b>
            </>
          ) : (
            <>
              <div className="truncate text-[12px] font-medium text-texto-2">{doApp ? "Plano do app" : "Mensalidade"}{ms.plano ? ` · ${ms.plano}` : ""}</div>
              <b className="block whitespace-nowrap text-[24px] font-bold tabular-nums tracking-[-0.03em] text-texto">{reais(ms.valor)}<span className="ml-1 text-[13px] font-medium text-texto-2">/mês</span></b>
            </>
          )}
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
          {lojaApp ? "Ver meu plano" : "Trocar de plano ou de objetivo"}
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
