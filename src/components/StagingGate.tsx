import { ReactNode, useEffect, useState } from "react";
import { supabase, DB_SCHEMA } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// O staging é ambiente de TESTE: só entram contas com perfil em staging.*
// (migradas pra teste ou criadas pelo próprio staging). Conta real cai nesta tela
// e não consegue operar nada — garante que o staging nunca mexe com produção.
const StagingGate = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const [permitido, setPermitido] = useState<boolean | null>(DB_SCHEMA === "staging" ? null : true);

  useEffect(() => {
    if (DB_SCHEMA !== "staging" || !user) { setPermitido(true); return; }
    let cancelled = false;
    supabase.from("physiq_profiles").select("id").eq("id", user.id).maybeSingle()
      .then(({ data, error }) => { if (!cancelled) setPermitido(error ? true : !!data); })
      .then(undefined, () => { if (!cancelled) setPermitido(true); });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (DB_SCHEMA !== "staging" || !user || permitido === true) return <>{children}</>;

  if (permitido === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="font-heading text-xl text-foreground uppercase tracking-wider">Ambiente de teste</h1>
        <p className="text-sm text-muted-foreground font-body">
          Esta conta é de produção e não tem acesso ao ambiente de teste.
          Use uma conta de teste (crie uma nova por aqui) ou acesse o app oficial.
        </p>
        <button type="button" onClick={() => signOut()}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/90 transition-colors">
          Sair
        </button>
      </div>
    </div>
  );
};

export default StagingGate;
