// DEPRECATED: auth admin agora vem do claim `app_metadata.role === 'admin'` no JWT
// emitido pelo Supabase Auth. Setar via Auth Admin API (service_role).
// Este arquivo mantem APIs antigas como wrappers que checam o claim do user logado.

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function isAdminAuthenticated(): boolean {
  // Best-effort sincrono: lê a session em cache do supabase-js (localStorage).
  try {
    const raw = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!raw) return false;
    const sess = JSON.parse(localStorage.getItem(raw)!);
    return sess?.user?.app_metadata?.role === "admin";
  } catch {
    return false;
  }
}

export async function isAdminAuthenticatedAsync(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return (data?.user?.app_metadata as any)?.role === "admin";
}

export function adminLogout() {
  // No-op: o "admin mode" agora vem do JWT. Pra deixar de ser admin, deslogar do app.
}

const AdminLoginDialog = ({ open, onOpenChange }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-muted-foreground/30 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground text-center">
            Acesso Admin
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3 text-sm font-body text-muted-foreground">
          <p>
            O acesso admin agora é baseado no seu login. Faca login com a conta admin
            cadastrada — nao ha mais senha mestra.
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full h-12 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors"
          >
            Entendi
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminLoginDialog;
