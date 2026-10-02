import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useConta } from "@/nucleo/conta";
import { hojeSP, travaDoPainel, vencimentoDoPlano } from "@/nucleo/cobranca/regras";
import { TelaPlanoVencido } from "./pecas/TelaPlanoVencido";

/**
 * Trava de plano das contas que o NÚCLEO cobra (W4, spec 6.2 e 9): a partir do dia seguinte ao vencimento (+ a tolerância: 0 nas
 * contas novas, 7 no legado Calc) — ou ao fim do teste — o painel dá lugar à tela de plano vencido; só Configurações › Plano abre,
 * e só para o dono (os outros membros veem "Fale com <dono>"). Conta suspensa/cancelada pelo master: "Fale com o suporte", sem
 * Pagar. Os alunos seguem no app. W28: a legada (cobranca_legada = false) trava aqui; pula a conta do app e a que ainda estivesse
 * com a cobrança antiga (cobranca_legada — nenhuma depois da virada; a trava antiga, GatePlanoLegado, saiu). O master nunca fica
 * travado.
 */
export default function GatePlano({ children }: { children: ReactNode }) {
  const { conta, ehDono, ehMaster } = useConta();
  const { pathname } = useLocation();
  if (!conta || ehMaster || conta.cobranca_legada || conta.origem === "app") return <>{children}</>;
  const t = travaDoPainel(conta, hojeSP());
  if (!t.travado || !t.motivo) return <>{children}</>;
  if (ehDono && pathname.startsWith("/painel/configuracoes/plano")) return <>{children}</>;
  // "venceu em": o vencimento sem a tolerância (nas contas novas, o mesmo último dia com acesso)
  return <TelaPlanoVencido conta={conta} motivo={t.motivo} fim={vencimentoDoPlano(conta)} dono={ehDono} />;
}
