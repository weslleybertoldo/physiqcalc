import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import { reais, soOTeste, travaDoInadimplente } from "@/financeiro/regras";
import { useResumoFinanceiro } from "@/financeiro/useResumoFinanceiro";
import { useSessao } from "@/nucleo/sessao";
import { ehProfissional } from "@/nucleo/situacao";
import { TelaTrava } from "./pecas/TelaTrava";

/**
 * "Bloquear o app do aluno com mensalidade vencida" (R15, P13 — opção da conta em Configurações › Recebimento; contas vindas do
 * Nutri: ligada; do Calc e novas: desligada). Inadimplente = a mensalidade venceu (ou nunca foi paga) ou há cobrança avulsa
 * vencida em aberto; comprovante aguardando a confirmação não conta. O app fecha e só Perfil › Pagamentos abre, com "Pagar"
 * (spec 9). Com mais de uma matrícula (P7), só fecha se todas estão travadas. Profissional nunca é travado aqui.
 * W7b: a conta do app (aluno sem profissional) tem o bloqueio LIGADO — acabaram os dias grátis (ou o mês pago) sem pagar, o app
 * fecha com "Pagar" (a mesma trava, com o texto do plano do app).
 */
export default function GatePagamentoPendente({ children }: { children: ReactNode }) {
  const { situacao } = useSessao();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { resumo } = useResumoFinanceiro();
  if (!situacao || ehProfissional(situacao) || pathname.startsWith("/perfil/pagamentos")) return <>{children}</>;
  const lista = resumo ?? [];
  const travadas = lista.filter((r) => travaDoInadimplente(r));
  if (!lista.length || travadas.length < lista.length) return <>{children}</>;
  const r = travadas[0];
  const quem = r.profissional ? ` com ${r.profissional.split(" ")[0]}` : "";
  const valor = Number(r.mensalidade_valor) > 0 ? ` de ${reais(r.mensalidade_valor)}` : "";
  const fimDoTeste = !!r.app && soOTeste({ pago_ate: r.pago_ate, teste_ate: r.teste_ate ?? null });
  return (
    <TelaTrava
      marca={r.app ? "pagamento-pendente-app" : "pagamento-pendente"}
      icone={Wallet}
      tom="var(--p-ambar-3)"
      titulo={fimDoTeste ? "Seus dias grátis acabaram" : "Pagamento pendente"}
      texto={r.app
        ? `${fimDoTeste ? "Assine" : "Pague"} o plano ${r.plano_nome ?? "do app"}${Number(r.mensalidade_valor) > 0 ? ` por ${reais(r.mensalidade_valor)}/mês` : ""} para voltar a usar o app — o que você já tinha continua guardado.`
        : `Há um pagamento${valor} vencido${quem}. Pague para voltar a usar o app — o que você já tinha continua guardado.`}
      acoes={
        <button type="button" className="pq-botao pq-botao-w w-full" onClick={() => navigate("/perfil/pagamentos")} data-trava-pagar>
          <Wallet aria-hidden /> Pagar
        </button>
      }
    />
  );
}
