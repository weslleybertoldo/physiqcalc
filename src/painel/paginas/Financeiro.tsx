import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, LayoutDashboard, Plus, ReceiptText, Tags, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { EstadoVazio } from "@/ui/premium/Estados";
import AbaCategorias, { CategoriasDialog } from "@/painel/financeiro/Categorias";
import { abaDaUrl, type IdAba } from "@/painel/financeiro/financeiroUtil";
import Lancamentos from "@/painel/financeiro/Lancamentos";
import Mensalidades from "@/painel/financeiro/Mensalidades";
import MovimentacaoDialog from "@/painel/financeiro/MovimentacaoDialog";
import Recibos from "@/painel/financeiro/Recibos";
import Resumo from "@/painel/financeiro/Resumo";
import { useFinanceiroConta, useResumoDaConta } from "@/painel/financeiro/useFinanceiro";

const ABAS: { id: IdAba; rotulo: string; icone: LucideIcon }[] = [
  { id: "resumo", rotulo: "Resumo", icone: LayoutDashboard },
  { id: "mensalidades", rotulo: "Mensalidades", icone: Users },
  { id: "lancamentos", rotulo: "Lançamentos", icone: ArrowLeftRight },
  { id: "recibos", rotulo: "Recibos", icone: ReceiptText },
  { id: "categorias", rotulo: "Categorias", icone: Tags },
];

/**
 * Painel › Financeiro (W19 — spec 4.4, telas 6 e 7; C46, N-9, N-19, N-59, N-62): comum aos 2 módulos. Resumo (recebido, previsto, em
 * aberto, vencido, "Receita" e "Cobranças do mês"), Mensalidades (o que a tela "Cobrança" do Calc fazia: comprovantes Pix para
 * confirmar ou recusar), Lançamentos (o Financeiro do Nutri: entradas e saídas por categoria e forma, período, estorno), Recibos (modelos
 * ★ e numeração) e Categorias. Quem vê o quê (4.1, P6): o dono vê e edita tudo da conta; cada profissional, o que é dele.
 */
export default function Financeiro() {
  const f = useFinanceiroConta();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const aba = abaDaUrl(sp);
  const [nova, setNova] = useState(false);
  const [categoriasAberto, setCategoriasAberto] = useState(false);
  const resumo = useResumoDaConta(f);
  const comprovantes = resumo.data?.pendentes.length ?? 0;

  const irPara = (id: IdAba, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(sp);
    q.set("aba", id);
    q.delete("ver");
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    setSp(q, { replace: false });
  };

  if (!f.conta) {
    return (
      <div data-pagina-financeiro-painel data-estado="sem-conta">
        <TopoPagina titulo="Financeiro" />
        <EstadoVazio icone={Wallet} titulo="Nenhuma conta ativa" texto="O financeiro aparece aqui quando você faz parte de uma conta de profissional." />
      </div>
    );
  }
  const subtitulo = `${f.conta.nome}${!f.dono ? " · o que é seu" : f.conta.profissionais > 1 ? " · toda a equipe" : ""}`;

  return (
    <div className="flex flex-col" data-pagina-financeiro-painel data-aba-financeiro={aba} data-dono={f.dono ? "1" : "0"}>
      <TopoPagina titulo="Financeiro" subtitulo={subtitulo}
        acoes={<Botao variante="w" icone={Plus} onClick={() => setNova(true)} data-nova-movimentacao>Nova movimentação</Botao>} />

      <nav aria-label="Abas do financeiro" data-abas-financeiro className="pq-sem-barra flex gap-1 overflow-x-auto border-b border-linha">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          const Icone = a.icone;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => irPara(a.id)}
              data-aba-financeiro-botao={a.id}
              className={cn("relative flex h-[42px] flex-none items-center gap-2 px-3.5 text-[13.5px] font-semibold transition-colors", ativa ? "text-texto" : "text-texto-3 hover:text-texto-2")}
            >
              <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
              {a.rotulo}
              {a.id === "mensalidades" && comprovantes > 0 && (
                <span className="rounded-full bg-ciano/20 px-1.5 text-[11px] font-bold text-ciano-3" data-contador-comprovantes>{comprovantes}</span>
              )}
              {ativa && (
                <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-sm"
                  style={{ background: "linear-gradient(90deg,var(--p-violeta-2),var(--p-verde-2))", boxShadow: "0 0 12px rgba(167,139,250,.9)" }} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 min-w-0">
        {aba === "resumo" && <Resumo f={f} irPara={irPara} />}
        {aba === "mensalidades" && <Mensalidades f={f} focarComprovantes={sp.get("ver") === "comprovantes"} />}
        {aba === "lancamentos" && <Lancamentos f={f} params={sp} setParams={setSp} aoNova={() => setNova(true)} />}
        {aba === "recibos" && <Recibos f={f} />}
        {aba === "categorias" && (
          <AbaCategorias uid={f.uid} contaId={f.contaId || null} categorias={f.categorias.data ?? []} onMudou={() => void f.recarregar("categorias")} />
        )}
      </div>

      <MovimentacaoDialog open={nova} onOpenChange={setNova} transacao={null} uid={f.uid} contaId={f.contaId} categorias={f.categorias.data ?? []}
        alunos={f.alunos.data ?? []} onGerenciarCategorias={() => setCategoriasAberto(true)}
        onSalvo={() => { void f.recarregar("transacoes"); void qc.invalidateQueries({ queryKey: ["financeiro-lancamentos"] }); }} />
      <CategoriasDialog open={categoriasAberto} onOpenChange={setCategoriasAberto} uid={f.uid} contaId={f.contaId || null} categorias={f.categorias.data ?? []}
        onMudou={() => void f.recarregar("categorias")} />
    </div>
  );
}
