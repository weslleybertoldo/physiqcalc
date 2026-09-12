import { useState, FormEvent } from "react";
import { Eye, EyeOff, RefreshCw, Check, Download, Link2 } from "lucide-react";
import { supabase, DB_SCHEMA } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/capacitorAuth";
import { lerProfPendente } from "@/lib/profPendente";

const APP_VERSION = __APP_VERSION__;
const RELEASES_URL = "https://api.github.com/repos/weslleybertoldo/physiqcalc/releases/latest";
// Login SÓ com Google (decisão do Weslley, 12/09/2026). O formulário e-mail/senha existe SÓ no staging,
// para as contas de teste (o OAuth não marca ambiente=staging e criaria perfil na produção).
const SO_GOOGLE = DB_SCHEMA !== "staging";

const AuthPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<null | { hasUpdate: boolean; url?: string; version?: string }>(null);
  const profPendente = lerProfPendente();

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

  // staging: contas de teste entram com e-mail/senha (sem cadastro pela tela)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("Email ou senha incorretos.");
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
          <p className="text-sm text-muted-foreground font-body mt-2">Entre na sua conta</p>
        </div>

        {/* Veio pelo link de um professor */}
        {profPendente && (
          <div className="border border-primary/40 bg-primary/10 p-3 text-xs font-body text-foreground flex items-start gap-2" data-prof-pendente>
            <Link2 size={14} className="text-primary shrink-0 mt-0.5" />
            <span>
              Você chegou pelo link de um professor (<span className="text-primary font-heading tracking-wider">{profPendente}</span>).
              Ao entrar, sua conta fica vinculada a ele.
            </span>
          </div>
        )}

        {SO_GOOGLE ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full h-12 border border-muted-foreground/30 text-foreground font-body text-sm flex items-center justify-center gap-3 hover:bg-secondary transition-colors duration-200 disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              {loading ? "Conectando..." : "Entrar com Google"}
            </button>
            {error && <p className="text-sm font-body text-destructive text-center">{error}</p>}
            <p className="text-center text-[11px] text-muted-foreground font-body leading-relaxed">
              Sem e-mail e senha: a conta é a do seu Google. Ao continuar você aceita a{" "}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Política de Privacidade</a>{" "}
              e os <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">termos de uso</a>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" data-form-staging>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-heading text-center">Ambiente de teste — conta de teste</p>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2 block">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-underline" placeholder="seu@email.com" required />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2 block">Senha</label>
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
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm font-body text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-12 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processando..." : "Entrar"}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground font-body italic">By Weslley Bertoldo</p>
          <p className="text-[10px] text-muted-foreground/50 font-body">v{APP_VERSION}</p>
          {SO_GOOGLE && (<>
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
                <a href={updateResult.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-body transition-colors">
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
          </>)}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
