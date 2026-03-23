import { useState, FormEvent } from "react";
import { Eye, EyeOff, Settings, RefreshCw, Check, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/capacitorAuth";
import AdminLoginDialog from "@/components/AdminLoginDialog";

const APP_VERSION = __APP_VERSION__;
const RELEASES_URL = "https://api.github.com/repos/weslleybertoldo/physiqcalc/releases/latest";

const AuthPage = () => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<null | { hasUpdate: boolean; url?: string; version?: string }>(null);

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) setError("Erro ao conectar com Google. Tente novamente.");
    setLoading(false);
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateResult(null);
    try {
      const res = await fetch(RELEASES_URL, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const release = await res.json();
      const remoteVersion = (release.tag_name || "").replace(/^v/, "");
      const remote = remoteVersion.split(".").map(Number);
      const local = APP_VERSION.split(".").map(Number);
      const isNewer =
        remote[0] > local[0] ||
        (remote[0] === local[0] && remote[1] > local[1]) ||
        (remote[0] === local[0] && remote[1] === local[1] && remote[2] > local[2]);

      if (isNewer) {
        const apkAsset = (release.assets || []).find((a: any) => a.name.endsWith(".apk"));
        setUpdateResult({ hasUpdate: true, url: apkAsset?.browser_download_url || release.html_url, version: remoteVersion });
      } else {
        setUpdateResult({ hasUpdate: false });
      }
    } catch {
      setUpdateResult({ hasUpdate: false });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          setError(error.message);
        } else {
          setMessage("Conta criada com sucesso! Você já pode fazer login.");
          setMode("login");
          setPassword("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError("Email ou senha incorretos.");
        }
      }
    } catch {
      setError("Erro ao processar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 relative">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <h1 className="font-heading text-3xl sm:text-4xl text-foreground tracking-tight">
            PHYSIQ<span className="text-primary">CALC</span>
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-2">
            {mode === "login" ? "Entre na sua conta" : "Crie sua conta"}
          </p>
        </div>

        {/* Google button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full h-12 border border-muted-foreground/30 text-foreground font-body text-sm flex items-center justify-center gap-3 hover:bg-secondary transition-colors duration-200"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Entrar com Google
        </button>

        {/* Separator */}
        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-muted-foreground/30" />
          <span className="text-xs text-muted-foreground font-body uppercase">ou</span>
          <div className="flex-1 border-t border-muted-foreground/30" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-underline"
              placeholder="seu@email.com"
              required
            />
          </div>

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
                required
                minLength={6}
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
          {message && <p className="text-sm font-body text-primary">{message}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full h-12 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        {/* Toggle mode */}
        <p className="text-center text-sm text-muted-foreground font-body">
          {mode === "login" ? (
            <>
              Não tem conta?{" "}
              <button type="button" onClick={() => { setMode("signup"); setError(""); setMessage(""); }} className="text-primary hover:underline">
                Criar conta
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }} className="text-primary hover:underline">
                Entrar
              </button>
            </>
          )}
        </p>

        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground font-body italic">
            By Weslley Bertoldo
          </p>
          <p className="text-[10px] text-muted-foreground/50 font-body">v{APP_VERSION}</p>
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="text-[10px] text-muted-foreground/60 hover:text-primary font-body transition-colors flex items-center justify-center gap-1 mx-auto"
          >
            <RefreshCw size={10} className={checkingUpdate ? "animate-spin" : ""} />
            Verificar atualizações
          </button>
          {updateResult && (
            <div className="mt-2">
              {updateResult.hasUpdate ? (
                <a
                  href={updateResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-body transition-colors"
                >
                  <Download size={12} />
                  Baixar v{updateResult.version}
                </a>
              ) : (
                <p className="text-[10px] text-classify-green font-body flex items-center justify-center gap-1">
                  <Check size={10} />
                  Você está usando a versão mais recente
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Admin gear */}
      <button
        type="button"
        onClick={() => setAdminOpen(true)}
        title="Acesso Admin"
        className="fixed bottom-4 right-4 p-2 text-muted-foreground/30 hover:text-muted-foreground transition-colors duration-200"
      >
        <Settings size={16} />
      </button>

      <AdminLoginDialog open={adminOpen} onOpenChange={setAdminOpen} />
    </div>
  );
};

export default AuthPage;
