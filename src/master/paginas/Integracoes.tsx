import { useState } from "react";
import { ArrowLeftRight, Ban, CreditCard, HandCoins, QrCode, Wallet } from "lucide-react";
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
import {
  ROTULO_RECEBIMENTO, chaveMascarada, perguntaDasAutomaticas, perguntaDeSairDoMpConta, situacaoDoMpDaConta, textoDasAutomaticas, textoErro,
  type MarcaMpDaConta, type PerguntaDoMaster,
} from "../regras";
import type { ContaLinha, PedidoRecebimentoMaster } from "../tipos";

/** W2: a cor do texto da situação do MP do personal na linha (o tom do chip da tela do dono). */
const COR_DA_SITUACAO: Record<MarcaMpDaConta, string> = {
  conectado: "text-verde-3", renove: "text-ambar-3", caiu: "text-rosa-3", desconectado: "text-texto-3",
};

/**
 * Painel master › Integrações (C60): como cada conta recebe dos alunos — Pix manual (a chave ativa), "não cobrar pelo app" ou Mercado
 * Pago. Ligar o Mercado Pago de uma conta é só do master (o dono não liga: spec 4.6 Recebimento); a conta do app usa o MP do Weslley.
 * hml-14d (B21 · D28): 20 contas por página do banco (master_integracoes com p_offset/p_limite, `?pagina=`); o KPI "Contas" é o total
 * do banco.
 * W1: a InfinitePay — o master vê a InfiniteTag e desliga; quem liga é o dono, em Configurações › Recebimento.
 * W2: o Mercado Pago do personal — o master vê (o apelido + a situação da conexão; o KPI com as caídas) e desliga com o OK; quem liga é o
 * dono (o OAuth, em Configurações › Recebimento). Sair de um Mercado Pago (o dele ou o do Physiq) com cobrança automática viva pede o OK de
 * cada passo (MENOR 7 da W1): desligar as cobranças no Mercado Pago e, sem acesso ao MP dele, forçar (decisão 11).
 */
export default function Integracoes() {
  const { q, pagina, irPara, total } = usePaginaDoMaster({ filtro: null, queryKey: ["master", "integracoes"], buscar: (n) => integracoes(n) });
  const [salvando, setSalvando] = useState<string | null>(null);
  const confirmar = useConfirmar();
  const r = q.data?.resumo ?? {};

  /** A confirmação do app com a marca do passo na descrição (data-master-confirmar — o E2E sabe qual pergunta está aberta). */
  const perguntar = (passo: string, p: PerguntaDoMaster) => confirmar({ ...p, descricao: <span data-master-confirmar={passo}>{p.descricao}</span> });

  /**
   * A troca da forma de receber. W2: saindo de um Mercado Pago com cobrança automática viva, o servidor recusa sem mudar nada e cada OK
   * manda o pedido de novo com o sinal do passo (perguntaDasAutomaticas: a 2ª desliga as cobranças no Mercado Pago; a 3ª, sem acesso ao MP do
   * personal, força). O Mercado Pago recusou (502) → a frase com a contagem e "Tentar de novo", que recomeça (a 2ª volta com a contagem de
   * agora). Depois de um pedido com o OK, a lista é relida mesmo na recusa (as que o Physiq alcança já saíram; a conexão pode ter caído).
   */
  async function mudar(contaId: string, modo: string) {
    setSalvando(contaId);
    let pedido: PedidoRecebimentoMaster = { modo };
    let releer = false;
    try {
      for (;;) {
        try {
          const res = await acaoConta(contaId, "recebimento", pedido);
          const detalhe = textoDasAutomaticas(res);
          if (detalhe) toast.success(`Recebimento: ${ROTULO_RECEBIMENTO[modo]}.`, { description: detalhe });
          else toast.success(`Recebimento: ${ROTULO_RECEBIMENTO[modo]}.`);
          releer = true;
          return;
        } catch (e) {
          const erro = e instanceof ErroMaster ? e : null;
          if (pedido.cancelar_automaticas && erro?.codigo.startsWith("automaticas_")) releer = true;
          const pergunta = perguntaDasAutomaticas(erro?.codigo, erro?.extra ?? {}, pedido);
          if (!pergunta) {
            const texto = textoErro(erro ? erro.codigo : "erro_interno", erro?.extra);
            if (erro?.codigo === "automaticas_nao_canceladas") {
              toast.error(texto, { action: { label: "Tentar de novo", onClick: () => void mudar(contaId, modo) } });
            } else {
              toast.error(texto);
            }
            return;
          }
          const { passo, pedido: proximo, ...opcoes } = pergunta;
          if (!(await perguntar(passo, opcoes))) return;
          pedido = proximo;
        }
      }
    } finally {
      setSalvando(null);
      if (releer) void q.refetch();
    }
  }

  /** W2: sair do Mercado Pago do personal (o "Desligar" da linha ou outra forma no select) só com o 1º OK — a conexão dele sai junto. */
  async function sairDoMpConta(c: ContaLinha, modo: string) {
    if (await perguntar("desligar-mp-conta", perguntaDeSairDoMpConta(c.nome, modo, !!c.chave_pix))) void mudar(c.id, modo);
  }

  return (
    <div className="flex flex-col gap-3.5" data-pagina-master="integracoes">
      <TopoPagina titulo="Integrações" subtitulo="Como cada conta recebe dos alunos" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6" data-kpis-integracoes>
        <Kpi icone={QrCode} titulo="Pix manual" valor={r.pix_manual ?? "…"} tom="verde" detalhe={`${r.com_chave ?? 0} com chave ativa`} />
        <Kpi icone={CreditCard} titulo="MP do Physiq" valor={r.mercadopago ?? "…"} tom="violeta" detalhe="ligado pelo master" />
        {/* W2: sem a W2 no servidor as contagens não vêm — 0 (nenhuma conta pode estar nele), nunca o "…" de carregando */}
        <Kpi icone={HandCoins} titulo="MP do personal" valor={q.data ? (r.mercadopago_conta ?? 0) : "…"} tom="violeta"
          detalhe={`${r.mp_conta_erro ?? 0} com a conexão caída`} />
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
                        <select className={cn(SELECT, "h-9 w-[224px]")} value={c.recebimento_modo} disabled={salvando === c.id} aria-label={`Recebimento de ${c.nome}`}
                          onChange={(e) => {
                            const modo = e.target.value;
                            // W2: sair do MP do personal (a conexão dele sai junto) pede o mesmo OK do "Desligar"
                            if (c.recebimento_modo === "mercadopago_conta" && modo !== c.recebimento_modo) void sairDoMpConta(c, modo);
                            else void mudar(c.id, modo);
                          }} data-recebimento={c.nome}>
                          {/* W1/W2: o master não liga a InfinitePay nem o MP do personal (só o dono — a InfiniteTag / o OAuth; a master_conta_acao já
                              recusa): a opção só fica ativa na conta que já está nela */}
                          {Object.entries(ROTULO_RECEBIMENTO).map(([v, t]) => (
                            <option key={v} value={v} disabled={(v === "infinitepay" || v === "mercadopago_conta") && c.recebimento_modo !== v}>{t}</option>
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
                        {c.recebimento_modo === "mercadopago_conta" && (
                          <LinhaDoMpDaConta conta={c} ocupado={salvando === c.id} aoDesligar={() => void sairDoMpConta(c, c.chave_pix ? "pix_manual" : "nenhum")} />
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

/** W2: o Mercado Pago do personal na linha da conta — o apelido + a situação da conexão e o "Desligar" (volta ao Pix ou a não cobrar). */
function LinhaDoMpDaConta({ conta: c, ocupado, aoDesligar }: { conta: ContaLinha; ocupado: boolean; aoDesligar: () => void }) {
  const s = situacaoDoMpDaConta(c.mercadopago_conta);
  return (
    <span className="mt-1 flex items-center gap-2 text-[12px] text-texto-2">
      <span className={cn("min-w-0 max-w-[240px] truncate", COR_DA_SITUACAO[s.marca])} title={s.texto} data-mp-conta-da-conta={c.id} data-mp-conta-situacao={s.marca}>
        {s.texto}
      </span>
      <button type="button" className="flex-none font-semibold text-rosa-3" disabled={ocupado} data-desligar-mp-conta={c.id} onClick={aoDesligar}>
        Desligar
      </button>
    </span>
  );
}
