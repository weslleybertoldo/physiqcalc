import { useIsMobile } from "@/hooks/use-mobile";
import { FinanceiroDoAluno } from "@/financeiro/ui/FinanceiroDoAluno";
import { PainelDeslizante } from "@/ui/premium/Sheet";

interface AlunoMin { id: string; nome: string | null; email: string | null }
interface Props { aluno: AlunoMin | null; onFechar: () => void; onSalvo?: () => void }

/**
 * Painel lateral "Cobrança" de um aluno na aba Mensalidades (W19 — veio do popup "Cobrança" das listas antigas do Calc, pedido de
 * 13/09/2026): é o Financeiro do aluno (W6) — plano e valor, Pix, pagamento por fora, pausar, cobranças, lançamentos e recibos.
 * `aluno.id` = id do Treino (aluno do Calc) ou o da matrícula. Ao fechar, a lista recarrega.
 */
export default function PainelCobranca({ aluno, onFechar, onSalvo }: Props) {
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
