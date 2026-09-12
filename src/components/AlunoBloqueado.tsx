import { Ban, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Tela do ALUNO quando o master bloqueou os alunos do professor dele (manual, decisão 9).
const AlunoBloqueado = ({ mensagem }: { mensagem?: string | null }) => {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6" data-aluno-bloqueado>
      <div className="max-w-sm text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center">
          <Ban size={24} className="text-destructive" />
        </div>
        <h1 className="font-heading text-xl text-foreground uppercase tracking-wider">Acesso pausado</h1>
        <p className="text-sm text-muted-foreground font-body">
          {mensagem || "O acesso dos alunos do seu professor está pausado no momento. Fale com seu professor para regularizar."}
        </p>
        <button type="button" onClick={() => signOut()}
          className="inline-flex items-center gap-2 px-6 py-2.5 border border-border text-muted-foreground rounded-lg text-xs font-heading uppercase tracking-wider hover:text-foreground transition-colors">
          <LogOut size={14} /> Sair
        </button>
      </div>
    </div>
  );
};

export default AlunoBloqueado;
