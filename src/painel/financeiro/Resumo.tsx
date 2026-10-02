// Physiq W19 — Painel › Financeiro › Resumo (spec 4.4: recebido, previsto, em aberto, vencido + "Receita por mês" e "Cobranças do mês"),
// no padrão da tela 6: os 4 cartões com o mini gráfico, a "Receita" grande com 30D · 6M · Ano, a rosca do mês, e embaixo "Precisam de
// atenção" (Pix aguardando, mensalidades e cobranças vencidas), as movimentações recentes e as entradas do mês por categoria.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, CalendarClock, CircleAlert, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { hojeSP } from "@/financeiro/regras";
import { Avatar } from "@/ui/premium/Avatar";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, Esqueleto } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import CobrancasDoMes from "./CobrancasDoMes";
import { listarCobrancasDoResumo, listarTransacoes } from "./dados";
import { fmtBRL, fmtValorComSinal, formatarData, rotuloMetodo } from "./financeiroUtil";
import GraficoReceita from "./GraficoReceita";
import {
  aReceber, cobrancasDoMes, entradasPorCategoria, kpis, nomeDoMesLongo, precisamDeAtencao, recebimentos, type BarraCategoria, type ItemAtencao,
} from "./resumo";
import { CHAVES, useResumoDaConta, type FinanceiroConta } from "./useFinanceiro";

const curto = (n: number) => fmtBRL(n).replace(/,00$/, "");

export default function Resumo({ f, irPara }: { f: FinanceiroConta; irPara: (aba: "mensalidades" | "lancamentos" | "recibos", extra?: Record<string, string>) => void }) {
  const hoje = hojeSP();
  // desde 1º de janeiro do ano passado: o "Ano" compara com o mesmo pedaço do ano anterior
  const desde = `${Number(hoje.slice(0, 4)) - 1}-01-01`;
  const trans = useQuery({ queryKey: CHAVES.resumoTransacoes(f.contaId), queryFn: () => listarTransacoes(f.contaId, f.uid, desde, hoje), enabled: f.pronto, staleTime: 15_000 });
  const cobs = useQuery({ queryKey: CHAVES.cobrancas(f.contaId), queryFn: () => listarCobrancasDoResumo(f.contaId, f.uid, desde), enabled: f.pronto, staleTime: 15_000 });
  const resumo = useResumoDaConta(f);

  const calc = useMemo(() => {
    if (!trans.data || !cobs.data) return null;
    const agora = new Date();
    const alunos = resumo.data?.alunos ?? [];
    const recs = recebimentos(trans.data, cobs.data);
    const lista = aReceber(cobs.data, alunos, hoje, agora);
    return {
      recs,
      k: kpis(recs, lista, hoje),
      fatias: cobrancasDoMes(cobs.data, lista, hoje),
      atencao: precisamDeAtencao(resumo.data?.pendentes ?? [], lista),
      barras: entradasPorCategoria(trans.data, cobs.data, hoje),
    };
  }, [trans.data, cobs.data, resumo.data, hoje]);

  if (trans.isError || cobs.isError) {
    return <EstadoErro titulo="Não deu para carregar o resumo" texto="Confira a internet e tente de novo." aoTentar={() => { void trans.refetch(); void cobs.refetch(); }} />;
  }
  if (!calc) {
    return (
      <div className="flex flex-col gap-3.5" data-aba-financeiro-conteudo="resumo" data-estado="carregando">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Cartao key={i} className="h-[132px] p-4"><Esqueleto className="h-full w-full" /></Cartao>)}</div>
        <div className="grid gap-3.5 xl:grid-cols-3"><Cartao className="h-[380px] p-5 xl:col-span-2"><Esqueleto className="h-full w-full" /></Cartao><Cartao className="h-[380px] p-5"><Esqueleto className="h-full w-full" /></Cartao></div>
      </div>
    );
  }
  const { k } = calc;
  const mes = nomeDoMesLongo(hoje);
  const v = k.variacaoMes;
  const recentes = [...(trans.data ?? [])].slice(0, 6);

  return (
    <div className="flex flex-col gap-3.5" data-aba-financeiro-conteudo="resumo" data-recebido-mes={k.recebidoMes.toFixed(2)} data-previsto-mes={k.previstoMes.toFixed(2)}
      data-em-aberto={k.emAberto.valor.toFixed(2)} data-vencido={k.vencido.valor.toFixed(2)}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpis-financeiro>
        {/* W25 (herdado da W19): a variação compara com o MESMO período do mês anterior (comparacaoDoMes — a mesma regra do Dashboard) */}
        <Kpi icone={Wallet} titulo={`Recebido em ${mes}`} tom="verde" valor={curto(k.recebidoMes)} serie={k.series.recebido6m}
          detalhe={v === null ? <span title={`De 1º até hoje, comparado com ${k.comparacao.rotuloLongo}`} data-comparacao-mes={k.comparacao.rotulo}>nada em {k.comparacao.rotulo}</span> : (
            <span title={`De 1º até hoje, comparado com ${k.comparacao.rotuloLongo}`} data-comparacao-mes={k.comparacao.rotulo}>
              <b className={v >= 0 ? "font-semibold text-verde-2" : "font-semibold text-rosa-3"}>{v >= 0 ? "+" : ""}{v}%</b> sobre {k.comparacao.rotulo}
            </span>
          )} />
        <Kpi icone={TrendingUp} titulo="Previsto até o fim do mês" tom="violeta" valor={curto(k.previstoMes)} serie={k.series.previstoMes}
          detalhe={<span>{curto(k.aReceberMes)} a receber</span>} />
        <Kpi icone={CalendarClock} titulo="Em aberto" tom="ciano" valor={curto(k.emAberto.valor)} serie={k.series.aReceber30d}
          detalhe={<span>{k.emAberto.qtd} {k.emAberto.qtd === 1 ? "cobrança" : "cobranças"}{k.emAberto.aguardando ? ` · ${k.emAberto.aguardando} aguardando` : ""}</span>} />
        <Kpi icone={CircleAlert} titulo="Vencido" tom="ambar" valor={curto(k.vencido.valor)} serie={k.series.vencido6m}
          detalhe={<span>{k.vencido.qtd ? `${k.vencido.qtd} ${k.vencido.qtd === 1 ? "cobrança vencida" : "cobranças vencidas"}` : "nada vencido"}</span>} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-3">
        <GraficoReceita className="xl:col-span-2" recs={calc.recs} hoje={hoje} recebidoMes={k.recebidoMes} previstoMes={k.previstoMes} />
        <CobrancasDoMes fatias={calc.fatias} hoje={hoje} aoVer={() => irPara("mensalidades")} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-3">
        <Atencao itens={calc.atencao} aoAbrir={(i) => irPara("mensalidades", i.chip === "PIX" ? { ver: "comprovantes" } : {})} />
        <Recentes itens={recentes} aoVerTodos={() => irPara("lancamentos")} />
        <PorCategoria barras={calc.barras} mes={mes} />
      </div>
    </div>
  );
}

function Atencao({ itens, aoAbrir }: { itens: ItemAtencao[]; aoAbrir: (i: ItemAtencao) => void }) {
  return (
    <Cartao className="px-[22px] pb-3 pt-[18px]" data-cartao-atencao data-atencao-total={itens.length}>
      <CabecalhoCartao titulo="Precisam de atenção" extra={itens.length ? <Chip tom="r">{itens.length}</Chip> : undefined} />
      {itens.length === 0 ? (
        <p className="py-3 text-[12.5px] text-texto-3" data-atencao-vazio>Nada para conferir: nenhum Pix aguardando e nada vencido.</p>
      ) : (
        <div className="divide-y divide-linha-3">
          {itens.slice(0, 5).map((i) => (
            <button key={i.chave} type="button" onClick={() => aoAbrir(i)} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left" data-atencao={i.chip}>
              <Avatar nome={i.nome} tamanho={34} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-semibold text-texto">{i.nome}</b>
                <span className="line-clamp-2 block text-[12px] leading-snug text-texto-3">{i.texto}</span>
              </span>
              <Chip tom={i.chip === "PIX" ? "a" : "r"} className="h-[22px] text-[10.5px]">{i.chip}</Chip>
            </button>
          ))}
        </div>
      )}
    </Cartao>
  );
}

function Recentes({ itens, aoVerTodos }: { itens: { id: string; tipo: string; descricao: string; valor: number; data: string; metodo: string; estornada: boolean; paciente: { nome: string } | null }[]; aoVerTodos: () => void }) {
  return (
    <Cartao className="px-[22px] pb-3 pt-[18px]" data-cartao-recentes>
      <CabecalhoCartao titulo="Movimentações recentes" acao={<button type="button" onClick={aoVerTodos} className="text-[12.5px] font-semibold text-violeta-3" data-ver-lancamentos>Ver todas</button>} />
      {itens.length === 0 ? (
        <p className="py-3 text-[12.5px] text-texto-3">Nenhuma movimentação ainda. Registre entradas e saídas em Lançamentos.</p>
      ) : (
        <div className="divide-y divide-linha-3">
          {itens.map((t) => {
            const entrada = t.tipo === "entrada";
            return (
              <div key={t.id} className="flex min-h-[52px] items-center gap-3 py-1.5" data-recente={t.id}>
                <span className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-superficie ${t.estornada ? "text-texto-4" : entrada ? "text-verde-2" : "text-rosa-3"}`}>
                  {entrada ? <ArrowUpCircle aria-hidden className="h-[17px] w-[17px]" /> : <ArrowDownCircle aria-hidden className="h-[17px] w-[17px]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <b className={`block truncate text-[13px] font-semibold text-texto ${t.estornada ? "line-through opacity-60" : ""}`}>{t.descricao}</b>
                  <span className="block truncate text-[11.5px] text-texto-3">{formatarData(t.data)} · {rotuloMetodo(t.metodo)}{t.paciente ? ` · ${t.paciente.nome}` : ""}</span>
                </span>
                <b className={`text-[13px] font-semibold tabular-nums ${t.estornada ? "text-texto-3 line-through" : entrada ? "text-verde-2" : "text-rosa-3"}`}>{fmtValorComSinal(t.tipo, Number(t.valor))}</b>
              </div>
            );
          })}
        </div>
      )}
    </Cartao>
  );
}

function PorCategoria({ barras, mes }: { barras: BarraCategoria[]; mes: string }) {
  const max = Math.max(1, ...barras.map((b) => b.valor));
  return (
    <Cartao className="px-[22px] pb-4 pt-[18px]" data-cartao-categorias-mes>
      <CabecalhoCartao titulo="Entradas por categoria" extra={<Chip tom="g">{mes.toUpperCase()}</Chip>} />
      {barras.length === 0 ? (
        <p className="py-3 text-[12.5px] text-texto-3">Nenhuma entrada em {mes} ainda.</p>
      ) : (
        <div className="flex flex-col gap-3 pt-1">
          {barras.slice(0, 6).map((b) => (
            <div key={b.nome} className="grid grid-cols-[minmax(0,110px)_1fr_auto] items-center gap-3 text-[13px]" data-barra-categoria={b.nome}>
              <span className="truncate text-texto-2">{b.nome}</span>
              <span className="h-2 overflow-hidden rounded-full bg-superficie-2">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (b.valor / max) * 100)}%`, background: "linear-gradient(90deg,var(--p-verde),var(--p-verde-2))" }} />
              </span>
              <b className="text-right font-semibold tabular-nums text-texto">{curto(b.valor)}</b>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 flex items-center gap-1.5 text-[11.5px] text-texto-3"><ReceiptText aria-hidden className="h-3.5 w-3.5" /> mensalidades pagas sem lançamento entram como "Mensalidades e cobranças"</p>
    </Cartao>
  );
}
