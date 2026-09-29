import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { papelDoUser, type Papel } from "@/lib/saasApi";
import { SessaoProvider, useSessao } from "@/nucleo/sessao";

/**
 * Physiq W3 — login único. O login agora é no BANCO PRINCIPAL (src/nucleo/sessao.tsx, `useSessao()`); a sessão do Banco
 * do Treino vem da troca de token. Este hook ficou COMPATÍVEL com as telas antigas do Calc (spec 7.4, passo 7):
 * `user`/`session` continuam sendo os do Treino, com o papel espelhado no JWT (master · professor · aluno), e o `signOut`
 * sai dos 2 bancos. O vínculo pelo código do professor saiu daqui: vai para o `vincular-aluno` do principal.
 */
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** master (Weslley; claim admin|master) · professor · aluno */
  papel: Papel;
  isStaff: boolean;
  isMaster: boolean;
  signOut: () => Promise<void>;
  /** força novo JWT (ex.: depois de virar professor) */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  papel: "aluno",
  isStaff: false,
  isMaster: false,
  signOut: async () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/** Sessão do Treino guardada no aparelho (sem internet o getSession de um token vencido devolve null). */
function sessaoTreinoGuardada(): Session | null {
  try {
    const chave = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    const bruto = chave ? localStorage.getItem(chave) : null;
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Session;
    return s?.user?.id ? s : null;
  } catch {
    return null;
  }
}

/** Login único (principal) + a sessão do Treino por baixo, para as telas antigas. */
export const AuthProvider = ({ children }: { children: ReactNode }) => (
  <SessaoProvider>
    <AuthTreinoProvider>{children}</AuthTreinoProvider>
  </SessaoProvider>
);

function AuthTreinoProvider({ children }: { children: ReactNode }) {
  const { pronto, sair } = useSessao();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const intentionalLogoutRef = useRef(false);

  const refreshUser = useCallback(async () => {
    try {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      if (refreshed) {
        setSession(refreshed);
        setUser(refreshed.user);
      }
    } catch (err) {
      console.warn("[Auth] refreshUser falhou:", err);
    }
  }, []);

  useEffect(() => {
    // 1. Recupera sessão do localStorage primeiro (funciona offline)
    const initSession = async () => {
      try {
        const { data: { session: localSession } } = await supabase.auth.getSession();
        const guardada = localSession ?? (navigator.onLine ? null : sessaoTreinoGuardada());
        if (guardada) {
          setSession(guardada);
          setUser(guardada.user);
          setLoading(false);
          // Se online, tenta refresh em background (sem deslogar se falhar)
          if (navigator.onLine && localSession) {
            try {
              const { data: { session: refreshed }, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshed) {
                setSession(refreshed);
                setUser(refreshed.user);
              } else if (refreshError) {
                console.warn("[Auth] Token refresh falhou:", refreshError.message);
              }
            } catch (err) {
              console.warn("[Auth] Erro inesperado no refresh:", err);
            }
          }
        } else {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
      } catch {
        setSession(null);
        setUser(null);
        setLoading(false);
      }
    };

    let safetyTimeout: ReturnType<typeof setTimeout> | null = null;
    initSession().finally(() => {
      if (safetyTimeout) { clearTimeout(safetyTimeout); safetyTimeout = null; }
    });
    // Segurança: se initSession travar, libera o loading após 5 segundos
    safetyTimeout = setTimeout(() => setLoading(false), 5000);

    // 2. Escuta mudanças de auth do Treino (a troca de token grava a sessão com setSession → SIGNED_IN)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_OUT") {
        // Desloga em: (a) logout intencional ou (b) sessão revogada no servidor; offline mantém (refresh falhou)
        if (intentionalLogoutRef.current || navigator.onLine) {
          intentionalLogoutRef.current = false;
          setSession(null);
          setUser(null);
          setLoading(false);
        }
        return;
      }
      if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "USER_UPDATED") && newSession) {
        setSession(newSession);
        setUser(newSession.user);
      }
      setLoading(false);
    });

    // 3. Refresca token quando o app volta ao primeiro plano
    const onVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data: { session: local } } = await supabase.auth.getSession();
        if (local) {
          setSession(local);
          setUser(local.user);
        }
      } catch {
        // Offline — mantém sessão atual
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (safetyTimeout) clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // sair = sair dos 2 bancos (login único) + limpar os caches
  const signOut = useCallback(async () => {
    intentionalLogoutRef.current = true;
    await sair();
    setSession(null);
    setUser(null);
  }, [sair]);

  const papel = papelDoUser(user);

  return (
    <AuthContext.Provider
      value={{ user, session, loading: loading || !pronto, papel, isStaff: papel !== "aluno", isMaster: papel === "master", signOut, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}
