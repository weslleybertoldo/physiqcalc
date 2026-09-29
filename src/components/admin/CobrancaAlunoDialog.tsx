import { useIsMobile } from "@/hooks/use-mobile";
import { FinanceiroDoAluno } from "@/financeiro/ui/FinanceiroDoAluno";
import { PainelDeslizante } from "@/ui/premium/Sheet";

interface AlunoMin { id: string; nome: string | null; email: string | null; plano_nome?: string | null; mensalidade_valor?: number | string | null }
interface Props { aluno: AlunoMin | null; onFechar: () => void; onSalvo?: () => void }

/**
 * Popup "Cobrança" de um aluno (pedido 13/09/2026) nas listas antigas do Calc (Alunos e Financeiro): W6 — é o Financeiro do
 * aluno no banco principal (plano e valor, Pix, pagamento por fora, pausar, cobranças, lançamentos e recibos), o mesmo da aba
 * Financeiro do perfil. `aluno.id` = id do Treino (lista de alunos do Calc) ou o da matrícula. Ao fechar, a lista recarrega.
 */
export default function CobrancaAlunoDialog({ aluno, onFechar, onSalvo }: Props) {
  const celular = useIsMobile();
  const fechar = () => {
    onSalvo?.();
    onFechar();
  };
  return (
    <PainelDeslizante aberto={!!aluno} aoMudar={(aberto) => { if (!aberto) fechar(); }} lado={celular ? "baixo" : "direita"}
      titulo={`Cobrança · ${aluno?.nome || aluno?.email || "Aluno"}`} className={celular ? undefined : "w-[min(620px,96vw)]"}>
      <div data-dialog-cobranca className="pt-1">
        {aluno && <FinanceiroDoAluno key={aluno.id} alunoId={aluno.id} compacto />}
      </div>
    </PainelDeslizante>
  );
}
