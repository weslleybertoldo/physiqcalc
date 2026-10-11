import { useState } from "react";
import { ArrowLeftRight, Ban, CreditCard, QrCode, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TopoPagina } from "@/ui/casca/topo";
import { Avatar } from "@/ui/premium/Avatar";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import { Paginacao } from "@/ui/premium/Paginacao";
import { Tabela, TabelaCabeca, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/ui/premium/Tabela";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { acaoConta, ErroMaster, integracoes } from "../api";
import { usePaginaDoMaster } from "../pecas/lista";
import { ChipOrigem, SELECT } from "../pecas/ui";
import { ROTULO_RECEBIMENTO, chaveMascarada, textoErro } from "../regras";

/**
 * Painel master › Integrações (C60): como cada conta recebe dos alunos — Pix manual (a chave ativa), "não cobrar pelo app" ou Mercado
 * Pago. Ligar o Mercado Pago de uma conta é só do master (o dono não liga: spec 4.6 Recebimento); a conta do app usa o MP do Weslley.
 * hml-14d (B21 · D28): 20 contas por página do banco (master_integracoes com p_offset/p_limite, `?pagina=`); o KPI "Contas" é o total
 * do banco.
 * W1: a InfinitePay — o master vê a InfiniteTag e desliga; quem liga é o dono, em Configurações › Recebimento.
 */
export default function Integracoes() {
  const { q, pagina, irPara, total } = usePaginaDoMaster({ filtro: null, queryKey: ["master", "integracoes"], buscar: (n) => integracoes(n) });
  const [salvando, setSalvando] = useState<string | null>(null);
  const confirmar = useConfirmar();
  const r = q.data?.resumo ?? {};

  async function mudar(contaId: string, modo: string) {
    setSalvando(contaId);
    try {
      await acaoConta(contaId, "recebimento", { modo });
      toast.success(`Recebimento: ${ROTULO_RECEBIMENTO[modo]}.`);
      void q.refetch();
    } catch (e) {
      toast.error(textoErro(e instanceof ErroMaster ? e.codigo : "erro_interno"));
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="flex flex-col gap-3.5" data-pagina-master="integracoes">
      <TopoPagina titulo="Integrações" subtitulo="Como cada conta recebe dos alunos" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi icone={QrCode} titulo="Pix manual" valor={r.pix_manual ?? "…"} tom="verde" detalhe={`${r.com_chave ?? 0} com chave ativa`} />
        <Kpi icone={CreditCard} titulo="Mercado Pago" valor={r.mercadopago ?? "…"} tom="violeta" detalhe="ligado pelo master" />
        <Kpi icone={Wallet} titulo="InfinitePay" valor={r.infinitepay ?? "…"} tom="ciano" detalhe="ligada pelo dono" />
        <Kpi icone={Ban} titulo="Não cobra pelo app" valor={r.nenhum ?? "…"} tom="ambar" detalhe="cobrança por fora" />
        <Kpi icone={ArrowLeftRight} titulo="Contas" valor={q.data ? total : "…"} tom="ciano" detalhe="todas as origens" />
      </div>
      <Cartao className="px-4 pb-2 pt-3">
        {q.isLoading ? <EstadoCarregando linhas={6} /> : q.isError ? <EstadoErro aoTentar={() => void q.refetch()} />
          : (q.data?.contas ?? []).length === 0 ? <EstadoVazio titulo="Nenhuma conta" /> : (
            <>
              <Tabela data-tabela-integracoes data-lista="master-integracoes">
                <TabelaCabeca>
                  <tr><TabelaTitulo>Conta</TabelaTitulo><TabelaTitulo>Origem</TabelaTitulo><TabelaTitulo>Chave Pix ativa</TabelaTitulo><TabelaTitulo>Inadimplente</TabelaTitulo><TabelaTitulo>Recebe dos alunos</TabelaTitulo></tr>
                </TabelaCabeca>
                <TabelaCorpo>
                  {(q.data?.contas ?? []).map((c) => (
                    <TabelaLinha key={c.id} data-linha-integracao={c.nome} data-item>
                      <TabelaCelula>
                        <span className="flex min-w-[190px] items-center gap-2.5"><Avatar nome={c.nome} tamanho={30} />
                          <span className="min-w-0"><b className="block truncate text-[13.5px]">{c.nome}</b><span className="block truncate text-[12px] text-texto-3">{c.alunos_ativos} aluno(s) ativo(s)</span></span>
                        </span>
                      </TabelaCelula>
                      <TabelaCelula><ChipOrigem origem={c.origem} /></TabelaCelula>
                      <TabelaCelula className="text-[12.5px] text-texto-2">
                        {c.chave_pix ? <span data-chave-pix>{c.chave_pix.tipo} · {chaveMascarada(c.chave_pix.chave)}{c.chave_pix.favorecido ? ` · ${c.chave_pix.favorecido}` : ""}</span> : <span className="text-texto-3">Sem chave</span>}
                      </TabelaCelula>
                      <TabelaCelula>{c.bloquear_app_inadimplente ? <Chip tom="a">Bloqueia o app</Chip> : <Chip tom="g">Só avisa</Chip>}</TabelaCelula>
                      <TabelaCelula>
                        <select className={cn(SELECT, "h-9 w-[190px]")} value={c.recebimento_modo} disabled={salvando === c.id} aria-label={`Recebimento de ${c.nome}`}
                          onChange={(e) => void mudar(c.id, e.target.value)} data-recebimento={c.nome}>
                          {/* W1: o master não liga a InfinitePay (só o dono, com a InfiniteTag; a master_conta_acao já recusa) */}
                          {Object.entries(ROTULO_RECEBIMENTO).map(([v, t]) => (
                            <option key={v} value={v} disabled={v === "infinitepay" && c.recebimento_modo !== "infinitepay"}>{t}</option>
                          ))}
                        </select>
                        {c.recebimento_modo === "infinitepay" && (
                          <span className="mt-1 flex items-center gap-2 text-[12px] text-texto-2">
                            <span data-infinitetag-da-conta={c.id}>{c.infinitepay?.handle ? `$${c.infinitepay.handle}` : "sem InfiniteTag"}</span>
                            <button type="button" className="font-semibold text-rosa-3" disabled={salvando === c.id} data-desligar-infinitepay={c.id}
                              onClick={() => void confirmar({ titulo: `Desligar a InfinitePay de ${c.nome}?`, perigo: true, rotuloConfirmar: "Desligar", rotuloCancelar: "Voltar",
                                descricao: c.chave_pix ? "Os alunos voltam a pagar por Pix na chave ligada." : "Sem chave Pix ligada: a conta passa a não cobrar pelo app." })
                                .then((sim) => { if (sim) void mudar(c.id, c.chave_pix ? "pix_manual" : "nenhum"); })}>
                              Desligar
                            </button>
                          </span>
                        )}
                      </TabelaCelula>
                    </TabelaLinha>
                  ))}
                </TabelaCorpo>
              </Tabela>
              <Paginacao nome="master-integracoes" pagina={pagina} total={total} aoMudar={irPara} carregando={q.isFetching} />
            </>
          )}
      </Cartao>
    </div>
  );
}
