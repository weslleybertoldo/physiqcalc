import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Ban, CreditCard, QrCode } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TopoPagina } from "@/ui/casca/topo";
import { Avatar } from "@/ui/premium/Avatar";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import { Tabela, TabelaCabeca, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/ui/premium/Tabela";
import { acaoConta, ErroMaster, integracoes } from "../api";
import { ChipOrigem, SELECT } from "../pecas/ui";
import { ROTULO_RECEBIMENTO, chaveMascarada, textoErro } from "../regras";

/**
 * Painel master › Integrações (C60): como cada conta recebe dos alunos — Pix manual (a chave ativa), "não cobrar pelo app" ou Mercado
 * Pago. Ligar o Mercado Pago de uma conta é só do master (o dono não liga: spec 4.6 Recebimento); a conta do app usa o MP do Weslley.
 */
export default function Integracoes() {
  const q = useQuery({ queryKey: ["master", "integracoes"], queryFn: integracoes, staleTime: 15_000 });
  const [salvando, setSalvando] = useState<string | null>(null);
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
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icone={QrCode} titulo="Pix manual" valor={r.pix_manual ?? "…"} tom="verde" detalhe={`${r.com_chave ?? 0} com chave ativa`} />
        <Kpi icone={CreditCard} titulo="Mercado Pago" valor={r.mercadopago ?? "…"} tom="violeta" detalhe="ligado pelo master" />
        <Kpi icone={Ban} titulo="Não cobra pelo app" valor={r.nenhum ?? "…"} tom="ambar" detalhe="cobrança por fora" />
        <Kpi icone={ArrowLeftRight} titulo="Contas" valor={q.data?.contas.length ?? "…"} tom="ciano" detalhe="todas as origens" />
      </div>
      <Cartao className="px-4 pb-2 pt-3">
        {q.isLoading ? <EstadoCarregando linhas={6} /> : q.isError ? <EstadoErro aoTentar={() => void q.refetch()} />
          : (q.data?.contas ?? []).length === 0 ? <EstadoVazio titulo="Nenhuma conta" /> : (
            <Tabela data-tabela-integracoes>
              <TabelaCabeca>
                <tr><TabelaTitulo>Conta</TabelaTitulo><TabelaTitulo>Origem</TabelaTitulo><TabelaTitulo>Chave Pix ativa</TabelaTitulo><TabelaTitulo>Inadimplente</TabelaTitulo><TabelaTitulo>Recebe dos alunos</TabelaTitulo></tr>
              </TabelaCabeca>
              <TabelaCorpo>
                {(q.data?.contas ?? []).map((c) => (
                  <TabelaLinha key={c.id} data-linha-integracao={c.nome}>
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
                        {Object.entries(ROTULO_RECEBIMENTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                    </TabelaCelula>
                  </TabelaLinha>
                ))}
              </TabelaCorpo>
            </Tabela>
          )}
      </Cartao>
    </div>
  );
}
