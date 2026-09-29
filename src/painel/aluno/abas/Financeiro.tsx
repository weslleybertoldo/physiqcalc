import { FinanceiroDoAluno } from "@/financeiro/ui/FinanceiroDoAluno";

/**
 * Perfil do aluno › Financeiro (spec 4.5, tela 7 — W6): plano e valor, cobranças, comprovantes para confirmar ou recusar,
 * pagamento por fora, pausar, reembolsar, a cobrança automática, lançamentos, recibos e tags. O corpo mora em
 * src/financeiro/ui (o popup "Cobrança" antigo e a W19 usam o mesmo).
 */
export default function Financeiro({ alunoId }: { alunoId: string }) {
  return <FinanceiroDoAluno alunoId={alunoId} />;
}
