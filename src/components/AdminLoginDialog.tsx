import { useState, FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SESSION_KEY = "physiqcalc-admin";

export function isAdminAuthenticated(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

export function adminLogout() {
  sessionStorage.removeItem(SESSION_KEY);
}

const AdminLoginDialog = ({ open, onOpenChange }: Props) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-password", {
        body: { password },
      });

      if (fnError) {
        setError("Erro ao verificar senha.");
        return;
      }

      if (data?.success) {
        sessionStorage.setItem(SESSION_KEY, "true");
        onOpenChange(false);
        setPassword("");
        // Navigate to admin panel
        window.location.href = "/admin";
      } else {
        setError("Senha incorreta.");
      }
    } catch {
      setError("Erro ao verificar senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-muted-foreground/30 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground text-center">
            Acesso Admin
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2 block">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-underline pr-10"
                placeholder="••••••••"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm font-body text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full h-12 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AdminLoginDialog;
