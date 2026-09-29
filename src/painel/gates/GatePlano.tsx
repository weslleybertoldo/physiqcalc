import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useConta } from "@/nucleo/conta";
import { fimDoAcesso, hojeSP, travaDoPainel } from "@/nucleo/cobranca/regras";
import { TelaPlanoVencido } from "./pecas/TelaPlanoVencido";

/**
 * Trava de plano das CONTAS NOVAS (W4, spec 6.2 e 9): a partir do dia seguinte ao vencimento (tolerância 0) — ou ao fim do
 * teste — o painel dá lugar à tela de plano vencido; só Configurações › Plano abre, e só para o dono (os outros membros veem
 * "Fale com <dono>"). Conta suspensa/cancelada pelo master: "Fale com o suporte", sem Pagar. Os alunos seguem no app.
 * Contas legadas ficam com a GatePlanoLegado (regras de hoje até a W28); o master nunca fica travado.
 */
export default function GatePlano({ children }: { children: ReactNode }) {
  const { conta, ehDono, ehMaster } = useConta();
  const { pathname } = useLocation();
  if (!conta || ehMaster || conta.origem !== "nova" || conta.cobranca_legada) return <>{children}</>;
  const t = travaDoPainel(conta, hojeSP());
  if (!t.travado || !t.motivo) return <>{children}</>;
  if (ehDono && pathname.startsWith("/painel/configuracoes/plano")) return <>{children}</>;
  return <TelaPlanoVencido conta={conta} motivo={t.motivo} fim={fimDoAcesso(conta)} dono={ehDono} />;
}
