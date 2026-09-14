import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PlanoCobrancaAluno from "@/components/admin/PlanoCobrancaAluno";

interface AlunoMin { id: string; nome: string | null; email: string | null; plano_nome?: string | null; mensalidade_valor?: number | string | null }
interface Props { aluno: AlunoMin | null; onFechar: () => void; onSalvo?: () => void }

/** Popup "Cobrança" de um aluno (pedido 13/09/2026): plano, mensalidade, tags e pagamentos, sem sair da tela. */
export default function CobrancaAlunoDialog({ aluno, onFechar, onSalvo }: Props) {
  return (
    <Dialog open={!!aluno} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="max-w-2xl" data-dialog-cobranca>
        <DialogHeader>
          <DialogTitle className="font-heading text-sm uppercase tracking-wider">Cobrança · {aluno?.nome || aluno?.email || "Aluno"}</DialogTitle>
          <DialogDescription className="font-body text-xs">Plano, mensalidade, tags e pagamentos deste aluno.</DialogDescription>
        </DialogHeader>
        {aluno && (
          <PlanoCobrancaAluno key={aluno.id} userId={aluno.id} modo="editar" onSalvo={onSalvo}
            inicial={{ plano_nome: aluno.plano_nome, mensalidade_valor: aluno.mensalidade_valor }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
