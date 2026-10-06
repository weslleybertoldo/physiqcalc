import { useNavigate } from "react-router-dom";
import { Sparkles, Wallet } from "lucide-react";
import { faixaDoAluno } from "@/financeiro/regras";
import { useResumoFinanceiro } from "@/financeiro/useResumoFinanceiro";
import { ehLoja } from "@/lib/distribuicao";
import { useSessao } from "@/nucleo/sessao";
import { ehProfissional } from "@/nucleo/situacao";

/**
 * Faixa do topo da aba de abertura (tela 1; spec 4.3 e A13 — o popup diário "Parcela pendente" do Calc virou esta faixa):
 * "Sua mensalidade vence em 3 dias · R$ 249,00 · Pix ou cartão · Pagar", de 7 dias antes até pagar; vencida fica vermelha.
 * Vale também para a cobrança avulsa do Nutri. Aguardando a confirmação do profissional, some. Profissional não vê.
 * W7b: o aluno sem profissional vê a faixa violeta nos dias grátis ("Seus dias grátis vão até 06/10 · Depois, R$ 29,90/mês ·
 * Assinar"); acabou o teste sem pagar, a vermelha (e a trava do inadimplente — a conta do app bloqueia).
 * W1 da loja: na versão da Google Play a conta do app não entra na faixa (sem preço nem "Assinar" até o Play Billing da W6); a
 * mensalidade e as cobranças do PROFISSIONAL continuam iguais.
 */
export default function FaixaMensalidade() {
  const navigate = useNavigate();
  const { situacao } = useSessao();
  const { resumo } = useResumoFinanceiro();
  if (situacao && ehProfissional(situacao)) return null;
  const f = faixaDoAluno(ehLoja ? resumo?.filter((r) => !r.app) : resumo);
  if (!f) return null;
  const vermelha = f.tom === "r";
  const teste = f.tom === "t";
  const destino = f.alvo.tipo === "avulsa" ? `/perfil/pagamentos?pagar=${f.alvo.id}` : "/perfil/pagamentos?pagar=mensalidade";
  const Icone = teste ? Sparkles : Wallet;
  return (
    <div
      role="status"
      data-faixa-mensalidade={vermelha ? "vencida" : teste ? "teste" : "vencendo"}
      className="flex items-center gap-[11px] rounded-2xl border py-2.5 pl-3 pr-2.5"
      style={
        vermelha
          ? { background: "linear-gradient(90deg, rgba(244,63,94,.16), rgba(244,63,94,.04))", borderColor: "var(--p-chip-r-borda)" }
          : teste
            ? { background: "linear-gradient(90deg, rgba(139,92,246,.18), rgba(139,92,246,.04))", borderColor: "rgba(139,92,246,.32)" }
            : { background: "linear-gradient(90deg, rgba(245,158,11,.16), rgba(245,158,11,.04))", borderColor: "rgba(245,158,11,.26)" }
      }
    >
      <Icone aria-hidden className="h-5 w-5 flex-none" strokeWidth={1.75} style={{ color: vermelha ? "var(--p-rosa-3)" : teste ? "var(--p-violeta-3)" : "var(--p-ambar-3)" }} />
      <div className="min-w-0 flex-1 text-[13px] font-semibold text-texto">
        <div className="truncate" data-faixa-titulo>{f.titulo}</div>
        <div className="mt-px truncate text-[12px] font-medium text-texto-2" data-faixa-subtitulo>{f.subtitulo}</div>
      </div>
      <button type="button" onClick={() => navigate(destino)} className="pq-botao pq-botao-g pq-botao-sm flex-none" data-faixa-pagar>
        {f.podePagar ? f.acao ?? "Pagar" : "Ver"}
      </button>
    </div>
  );
}
