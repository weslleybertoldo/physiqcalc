import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, CircleDollarSign, Lock, PauseCircle, Plus, RefreshCw, Timer, UserRound, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TopoPagina } from "@/ui/casca/topo";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip, type TomChip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import { ErroMaster, visaoGeral } from "../api";
import { NovaContaDialog } from "../contas/NovaContaDialog";
import { dataCurta, moeda, receitaDoMes, textoErro } from "../regras";
import type { ContaLinha, VisaoGeral as Dados } from "../tipos";

function dataPorExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const t = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const COR_TOM: Record<TomChip, string> = {
  c: "var(--p-ciano)", n: "var(--p-verde-2)", r: "var(--p-rosa-3)", g: "var(--p-texto-3)", a: "var(--p-ambar-2)", t: "var(--p-violeta-2)",
};

interface ItemAtencao { chave: string; nome: string; texto: string; chip: string; tom: TomChip; link: string; icone?: LucideIcon }

function itensDeAtencao(d: Dados): ItemAtencao[] {
  const conta = (c: ContaLinha, texto: string, chip: string, tom: TomChip): ItemAtencao =>
    ({ chave: `${chip}:${c.id}`, nome: c.nome, texto, chip, tom, link: `/master/contas?conta=${c.id}` });
  const itens: ItemAtencao[] = [
    ...d.atencao.vencidas.map((c) => conta(c, `Venceu em ${dataCurta(c.vence_em ?? c.teste_ate)} · ${c.alunos_ativos} aluno(s)`, "Vencida", "r")),
    ...d.atencao.teste_acabando.map((c) => conta(c, `Teste acaba em ${dataCurta(c.teste_ate)}`, "Teste", "c")),
    ...d.atencao.suspensas.map((c) => conta(c, "Painel travado pelo master", "Suspensa", "a")),
    ...d.atencao.alunos_bloqueados.map((c) => conta(c, c.alunos_bloqueados_msg ? `"${c.alunos_bloqueados_msg}"` : "App dos alunos fechado", "Alunos bloqueados", "r")),
  ];
  if (d.atencao.pagamentos_recusados > 0) {
    itens.push({ chave: "pag", nome: "Pagamentos recusados", texto: `${d.atencao.pagamentos_recusados} nos últimos 30 dias (recusado, estornado ou contestado)`, chip: "Pagamento", tom: "a", link: "/master/financeiro", icone: CircleDollarSign });
  }
  if (d.atencao.espelho_falhas > 0) {
    itens.push({ chave: "esp", nome: "Falhas no espelho do Treino", texto: `${d.atencao.espelho_falhas} mudança(s) ainda não chegaram ao Banco do Treino${d.atencao.espelho_parado ? ` (${d.atencao.espelho_parado} parada[s])` : ""}`, chip: "Integração", tom: "r", link: "/master/configuracoes", icone: AlertTriangle });
  }
  return itens;
}

/** Painel master › Visão geral (C55, spec 4.7, tela 6): números das contas, profissionais, alunos, receita da plataforma e atenção. */
export default function VisaoGeral() {
  const navigate = useNavigate();
  const [nova, setNova] = useState(false);
  const q = useQuery({ queryKey: ["master", "visao-geral"], queryFn: visaoGeral, staleTime: 30_000 });
  const d = q.data;
  const atencao = d ? itensDeAtencao(d) : [];
  // W28: o mês contra o MESMO período do mês anterior (a regra única do painel); servidor antigo, o mês anterior inteiro
  const receita = d ? receitaDoMes(d.receita, d.hoje) : null;
  const variacao = receita?.variacao ?? null;
  const origens = d ? [
    { rotulo: "Contas novas", n: d.contas.novas, cor: "var(--p-ciano)" },
    { rotulo: "Legado PhysiqCalc", n: d.contas.legado_calc, cor: "var(--p-violeta-2)" },
    { rotulo: "Legado PhysiqNutri", n: d.contas.legado_nutri, cor: "var(--p-verde-2)" },
  ] : [];
  const situacoes = d ? [
    { rotulo: "Em teste", n: d.contas.teste, tom: "c" as TomChip, filtro: "teste" },
    { rotulo: "Em dia", n: d.contas.ativas, tom: "n" as TomChip, filtro: "ativa" },
    { rotulo: "Vencidas", n: d.contas.vencidas, tom: "r" as TomChip, filtro: "vencida" },
    { rotulo: "Isentas", n: d.contas.isentas, tom: "g" as TomChip, filtro: "isenta" },
    { rotulo: "Suspensas", n: d.contas.suspensas, tom: "a" as TomChip, filtro: "suspensas" },
  ] : [];

  return (
    <div className="flex flex-col gap-3.5" data-pagina-master="visao-geral">
      <TopoPagina titulo="Visão geral" subtitulo={d ? dataPorExtenso(d.hoje) : "Contas, alunos e receita da plataforma"}
        acoes={(
          <>
            <Botao icone={RefreshCw} onClick={() => void q.refetch()} disabled={q.isFetching} data-master-atualizar>Atualizar</Botao>
            <Botao variante="w" icone={Plus} onClick={() => setNova(true)} data-master-nova-conta>Nova conta</Botao>
          </>
        )} />
      {q.isError && <EstadoErro texto={textoErro(q.error instanceof ErroMaster ? q.error.codigo : "erro_interno")} aoTentar={() => void q.refetch()} />}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpis-master>
        {d ? (
          <>
            <Kpi icone={Building2} titulo="Contas" valor={d.contas.total} tom="violeta" detalhe={<span data-kpi-contas><b className="text-verde-2">{d.contas.teste}</b> em teste · {d.contas.vencidas} vencidas</span>} />
            <Kpi icone={UserRound} titulo="Profissionais" valor={d.profissionais} tom="ciano" detalhe={`${d.contas.isentas} conta(s) isenta(s)`} />
            <Kpi icone={Users} titulo="Alunos ativos" valor={d.alunos.ativos} tom="verde" detalhe={<span>+{d.alunos.app} no app sem profissional</span>} />
            <Kpi icone={Wallet} titulo="Receita do mês" valor={moeda(receita?.valor ?? d.receita.mes)} tom="ambar"
              detalhe={receita?.rotulo ? (
                <span data-kpi-receita data-comparacao-mes={receita.rotulo} title={`De 1º até hoje, comparado com ${receita.rotuloLongo} (o mesmo período do mês anterior)`}>
                  {variacao === null ? <>nada em {receita.rotulo}</> : <><b className={variacao >= 0 ? "text-verde-2" : "text-rosa-3"}>{variacao >= 0 ? "+" : ""}{variacao}%</b> sobre {receita.rotulo}</>}
                </span>
              ) : (
                <span data-kpi-receita>{variacao === null ? "planos das contas" : <><b className={variacao >= 0 ? "text-verde-2" : "text-rosa-3"}>{variacao >= 0 ? "+" : ""}{variacao}%</b> sobre o mês anterior</>}</span>
              )} />
          </>
        ) : [0, 1, 2, 3].map((i) => <Cartao key={i} className="h-[132px] p-4"><Esqueleto className="h-full w-full" /></Cartao>)}
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Cartao className="flex flex-col px-[18px] pb-3 pt-4" data-cartao-atencao-master data-atencao-total={atencao.length}>
          <CabecalhoCartao titulo="Precisam de atenção" acao={atencao.length ? <Chip tom="r" data-atencao-contador>{atencao.length}</Chip> : undefined} />
          {!d ? <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-[46px] w-full" />)}</div>
            : atencao.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-texto-3" data-atencao-vazio>Tudo em dia: nenhuma conta vencida, teste acabando, suspensa ou com os alunos bloqueados.</p>
            ) : (
              <div className="divide-y divide-linha-3">
                {atencao.slice(0, 8).map((i) => {
                  const Icone = i.icone;
                  return (
                    <Link key={i.chave} to={i.link} className="flex min-h-[50px] items-center gap-[11px] py-1" data-atencao-item={i.chip}>
                      {Icone ? (
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-linha bg-superficie text-texto-2"><Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} /></span>
                      ) : <Avatar nome={i.nome} tamanho={32} />}
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13.5px] font-semibold text-texto">{i.nome}</b>
                        <span className="block truncate text-[12px] text-texto-3">{i.texto}</span>
                      </span>
                      <Chip tom={i.tom} className="h-[22px] flex-none text-[10.5px]">{i.chip}</Chip>
                    </Link>
                  );
                })}
              </div>
            )}
        </Cartao>

        <div className="grid grid-cols-1 gap-3.5">
          <Cartao className="px-[18px] pb-4 pt-4" data-cartao-situacoes>
            <CabecalhoCartao titulo="Contas por situação" acao={<Link to="/master/contas" className="text-[12.5px] font-semibold text-violeta-3">Ver contas</Link>} />
            <div className="flex flex-col divide-y divide-linha-3" data-lista-situacoes>
              {situacoes.map((s) => (
                <button key={s.rotulo} type="button" onClick={() => navigate(`/master/contas?situacao=${s.filtro}`)} data-situacao-contas={s.filtro}
                  className="flex items-center gap-2.5 py-2 text-left text-[13px] text-texto-2 transition-colors hover:text-texto">
                  <i aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: COR_TOM[s.tom] }} />
                  <span className="min-w-0 flex-1 truncate">{s.rotulo}</span>
                  <b className="text-[15px] font-bold tabular-nums text-texto">{s.n}</b>
                </button>
              ))}
            </div>
          </Cartao>
          <Cartao className="px-[18px] pb-4 pt-4" data-cartao-origens>
            <CabecalhoCartao titulo="Origem das contas" extra={d ? <Chip tom="g">{d.contas.total}</Chip> : undefined} />
            {d && (
              <>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-superficie-3">
                  {origens.map((o) => <span key={o.rotulo} style={{ width: `${d.contas.total ? (o.n / d.contas.total) * 100 : 0}%`, background: o.cor }} />)}
                </div>
                <div className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
                  {origens.map((o) => (
                    <span key={o.rotulo} className="flex items-center gap-2 text-texto-2">
                      <i aria-hidden className="h-2 w-2 rounded-full" style={{ background: o.cor }} />{o.rotulo} <b className="ml-auto tabular-nums text-texto">{o.n}</b>
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-linha-3 pt-3 text-[12px] text-texto-3">
                  <span className="flex items-center gap-1.5" data-receita-app><Wallet aria-hidden className="h-3.5 w-3.5" />Mensalidades do app no mês: {moeda(d.receita.app_mes)}</span>
                  <span className="flex items-center gap-1.5"><Timer aria-hidden className="h-3.5 w-3.5" />{d.alunos.em_2_contas} aluno(s) em 2 contas (caso da migração)</span>
                  <span className="flex items-center gap-1.5"><Lock aria-hidden className="h-3.5 w-3.5" />{d.alunos.bloqueados} bloqueado(s) por profissional</span>
                  <span className="flex items-center gap-1.5"><PauseCircle aria-hidden className="h-3.5 w-3.5" />{d.contas.suspensas} suspensa(s)</span>
                </div>
              </>
            )}
          </Cartao>
        </div>
      </div>
      <NovaContaDialog aberta={nova} aoMudar={setNova} aoCriada={(id) => navigate(`/master/contas?conta=${id}`)} />
    </div>
  );
}
