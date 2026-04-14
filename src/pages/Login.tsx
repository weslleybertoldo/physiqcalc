import { useState, FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "physiqcalc-auth";
const TIMESTAMP_KEY = "physiqcalc-auth-ts";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SESSION_MS = 24 * 60 * 60 * 1000; // 24h

export function isAuthenticated(): boolean {
  const token = sessionStorage.getItem(SESSION_KEY);
  if (!token || !UUID_REGEX.test(token)) return false;
  const ts = parseInt(sessionStorage.getItem(TIMESTAMP_KEY) || "0", 10);
  if (isNaN(ts) || Date.now() - ts > MAX_SESSION_MS) {
    logout();
    return false;
  }
  return true;
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(TIMESTAMP_KEY);
}

interface Props {
  onSuccess: () => void;
}

const Login = ({ onSuccess }: Props) => {
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
        setError("Erro ao verificar senha. Tente novamente.");
        return;
      }

      if (data?.success) {
        sessionStorage.setItem(SESSION_KEY, crypto.randomUUID());
        sessionStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
        onSuccess();
      } else {
        setError("Senha incorreta. Tente novamente.");
      }
    } catch {
      setError("Erro ao verificar senha. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-10">
        <div className="text-center">
          <h1 className="font-heading text-3xl sm:text-4xl text-foreground tracking-tight">
            PHYSIQ<span className="text-primary">CALC</span>
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-2">
            Insira a senha para acessar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2 block">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 bg-transparent border-b border-muted-foreground text-foreground font-body text-lg outline-none focus:border-primary transition-colors pr-10"
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

          {error && (
            <p className="text-sm font-body text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full h-12 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground font-body italic">
          By Weslley Bertoldo
        </p>
      </div>
    </div>
  );
};

export default Login;
