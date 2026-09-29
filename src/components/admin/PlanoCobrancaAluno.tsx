import { FinanceiroDoAluno } from "@/financeiro/ui/FinanceiroDoAluno";

export type ModoPlanoCobranca = "editar" | "espelho";
/** Plano/mensalidade que a lista já tem (AlunoRow). Desde a W6 o Financeiro do aluno lê o banco principal (não usa mais). */
export interface PlanoCobrancaInicial { plano_nome?: string | null; mensalidade_valor?: number | string | null }
interface Props { userId: string; modo: ModoPlanoCobranca; onSalvo?: () => void; inicial?: PlanoCobrancaInicial }

/**
 * Plano, mensalidade, tags e pagamentos de UM aluno (pedido 13/09/2026) no "Configurar aluno" antigo do Calc. W6: é o
 * Financeiro do aluno do banco principal (src/financeiro/ui/FinanceiroDoAluno.tsx) — o que o profissional pode mexer quem
 * decide é o servidor (dono da conta ou o profissional responsável); `modo` e `inicial` ficaram só pela compatibilidade.
 */
export default function PlanoCobrancaAluno({ userId }: Props) {
  return (
    <div data-plano-cobranca-aluno>
      <FinanceiroDoAluno key={userId} alunoId={userId} compacto />
    </div>
  );
}
