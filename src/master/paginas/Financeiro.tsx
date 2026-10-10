import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CircleDollarSign, FlaskConical, Wallet } from "lucide-react";
import { TopoPagina } from "@/ui/casca/topo";
import { Avatar } from "@/ui/premium/Avatar";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import { Paginacao } from "@/ui/premium/Paginacao";
import { Tabela, TabelaCabeca, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/ui/premium/Tabela";
import { ErroMaster, financeiro } from "../api";
import { DetalheConta } from "../contas/DetalheConta";
import { usePaginaDoMaster } from "../pecas/lista";
import { ChipSituacao, Filtros } from "../pecas/ui";
import { ROTULO_PLANO, dataCurta, linhaVencimento, moeda, textoErro } from "../regras";

type Filtro = "todas" | "vencidas" | "tolerancia" | "teste" | "isentas" | "em_dia";

const STATUS_FATURA: Record<string, { rotulo: string; tom: "n" | "a" | "r" | "g" }> = {
  approved: { rotulo: "Paga", tom: "n" }, pending: { rotulo: "Aberta", tom: "a" }, in_process: { rotulo: "Em análise", tom: "a" },
  rejected: { rotulo: "Recusada", tom: "r" }, cancelled: { rotulo: "Cancelada", tom: "g" }, expired: { rotulo: "Vencida", tom: "g" },
  refunded: { rotulo: "Estornada", tom: "r" }, charged_back: { rotulo: "Contestada", tom: "r" },
};

/**
 * Painel master › Financeiro (C58, N-74/R18): as faturas e a situação de cobrança de cada conta, com os filtros do Calc (vencidas, na
 * tolerância, em teste, isentas, em dia). W28: o filtro "Legadas" saiu (as legadas são cobradas pelo núcleo). A linha abre a conta:
 * registrar pagamento feito por fora, ajustar o vencimento, mudar plano, liberar, isentar com motivo ("Pausar cobrança" virou
 * isenção), reenviar aviso, bloquear os alunos, cancelar a assinatura.
 * hml-14d (B21 · D28): as contas em páginas de 20 do banco (master_financeiro com p_offset/p_limite; `?pagina=` convive com
 * `?conta=`); "Faturas recentes" continua o cartão das 10 mais novas, e o chip mostra o total de faturas do banco (P6).
 */
export default function Financeiro() {
  const [sp, setSp] = useSearchParams();
  const filtro = (sp.get("filtro") as Filtro) || "todas";
  const aberta = sp.get("conta");
  const { q, pagina, irPara, total } = usePaginaDoMaster({
    filtro: { filtro },
    queryKey: ["master", "financeiro", filtro],
    buscar: (n) => financeiro(filtro, n),
  });
  const r = q.data?.resumo ?? {};
  const contas = q.data?.contas ?? [];
  const mudar = (chave: string, valor: string | null) => {
    const n = new URLSearchParams(sp);
    if (valor) n.set(chave, valor); else n.delete(chave);
    setSp(n, { replace: true });
  };

  return (
    <div className="flex flex-col gap-3.5" data-pagina-master="financeiro" data-filtro={filtro}>
      <TopoPagina titulo="Financeiro" subtitulo="Planos das contas: faturas, vencimentos e isenções" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpis-financeiro-master>
        <Kpi icone={Wallet} titulo="Recebido no mês" valor={moeda(r.recebido_mes ?? 0)} tom="verde" detalhe="faturas pagas das contas" />
        <Kpi icone={CircleDollarSign} titulo="Em aberto" valor={moeda(r.em_aberto ?? 0)} tom="ambar" detalhe="Pix e cartão esperando" />
        <Kpi icone={AlertTriangle} titulo="Vencidas" valor={r.vencidas ?? "…"} tom="violeta" detalhe="painel travado no dia seguinte" />
        <Kpi icone={FlaskConical} titulo="Em teste" valor={r.teste ?? "…"} tom="ciano" detalhe={`${r.isentas ?? 0} isenta(s)`} />
      </div>
      <Filtros rotulo="Situação de cobrança" valor={filtro} aoMudar={(v) => mudar("filtro", v === "todas" ? null : v)} opcoes={[
        { valor: "todas", rotulo: "Todas", numero: r.todas },
        { valor: "vencidas", rotulo: "Vencidas", numero: r.vencidas },
        { valor: "tolerancia", rotulo: "Na tolerância", numero: r.tolerancia },
        { valor: "teste", rotulo: "Em teste", numero: r.teste },
        { valor: "isentas", rotulo: "Isentas", numero: r.isentas },
        { valor: "em_dia", rotulo: "Em dia", numero: r.em_dia },
      ]} />

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Cartao className="px-4 pb-2 pt-3">
          {q.isLoading ? <EstadoCarregando linhas={6} />
            : q.isError ? <EstadoErro texto={textoErro(q.error instanceof ErroMaster ? q.error.codigo : "erro_interno")} aoTentar={() => void q.refetch()} />
              : contas.length === 0 ? <EstadoVazio icone={Wallet} titulo="Nenhuma conta neste filtro" />
                : (
                  <>
                    <Tabela data-tabela-financeiro-master data-lista="master-financeiro">
                      <TabelaCabeca>
                        <tr><TabelaTitulo>Conta</TabelaTitulo><TabelaTitulo>Situação</TabelaTitulo><TabelaTitulo>Vencimento</TabelaTitulo><TabelaTitulo className="text-right">Mensal</TabelaTitulo></tr>
                      </TabelaCabeca>
                      <TabelaCorpo>
                        {contas.map((c) => (
                          <TabelaLinha key={c.id} className="cursor-pointer" onClick={() => mudar("conta", c.id)} data-linha-financeiro={c.nome} data-item>
                            <TabelaCelula>
                              <span className="flex min-w-[180px] max-w-[290px] items-center gap-2.5"><Avatar nome={c.nome} tamanho={30} />
                                <span className="min-w-0"><b className="block truncate text-[13.5px]">{c.nome}</b>
                                  <span className="block truncate text-[12px] text-texto-3">
                                    {ROTULO_PLANO[c.plano]} · {c.assinatura?.status === "authorized" ? "cartão automático" : c.ultima_fatura ? `última ${moeda(c.ultima_fatura.valor)} em ${dataCurta(c.ultima_fatura.pago_em ?? c.ultima_fatura.criado_em)}` : "sem faturas"}
                                  </span>
                                </span>
                              </span>
                            </TabelaCelula>
                            <TabelaCelula>
                              <span className="flex flex-col items-start gap-1">
                                <ChipSituacao conta={c} />
                              </span>
                            </TabelaCelula>
                            <TabelaCelula className="text-[12.5px] text-texto-2"><span className="line-clamp-2 block max-w-[190px]" title={linhaVencimento(c)}>{linhaVencimento(c)}</span></TabelaCelula>
                            <TabelaCelula className="whitespace-nowrap text-right font-semibold">{c.situacao_efetiva === "isenta" ? "—" : moeda(c.valor_mensal)}</TabelaCelula>
                          </TabelaLinha>
                        ))}
                      </TabelaCorpo>
                    </Tabela>
                    <Paginacao nome="master-financeiro" pagina={pagina} total={total} aoMudar={irPara} carregando={q.isFetching} />
                  </>
                )}
        </Cartao>
        <Cartao className="px-[18px] pb-3 pt-4" data-cartao-faturas-master>
          <CabecalhoCartao titulo="Faturas recentes"
            extra={<Chip tom="g" data-faturas-total={q.data?.faturas_total ?? 0} title="Faturas no total">{q.data?.faturas_total ?? 0}</Chip>} />
          {(q.data?.faturas ?? []).length === 0 ? <p className="py-6 text-center text-[13px] text-texto-3">Nenhuma fatura ainda.</p> : (
            <div className="divide-y divide-linha-3">
              {(q.data?.faturas ?? []).slice(0, 10).map((f) => {
                const st = STATUS_FATURA[f.status] ?? { rotulo: f.status, tom: "g" as const };
                return (
                  <button key={f.id} type="button" onClick={() => f.conta_id && mudar("conta", f.conta_id)} className="flex w-full min-h-[48px] items-center gap-2.5 py-1 text-left" data-fatura-master={f.status}>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px] font-semibold text-texto">{f.conta_nome}</b>
                      <span className="block truncate text-[12px] text-texto-3">{dataCurta(f.pago_em ?? f.criado_em)} · {f.descricao ?? f.tipo}</span>
                    </span>
                    <b className="tabular-nums text-[13px]">{moeda(f.valor)}</b>
                    <Chip tom={st.tom} className="h-[22px] text-[10.5px]">{st.rotulo}</Chip>
                  </button>
                );
              })}
            </div>
          )}
        </Cartao>
      </div>
      <DetalheConta contaId={aberta} aoFechar={() => mudar("conta", null)} aoMudou={() => void q.refetch()} />
    </div>
  );
}
