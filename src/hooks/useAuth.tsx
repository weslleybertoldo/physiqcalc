import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearOfflineData } from "@/lib/offlineSync";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const intentionalLogoutRef = useRef(false);

  useEffect(() => {
    // 1. Recupera sessão do localStorage primeiro (funciona offline)
    const initSession = async () => {
      try {
        const { data: { session: localSession } } = await supabase.auth.getSession();

        if (localSession) {
          setSession(localSession);
          setUser(localSession.user);
          setLoading(false);

          // Se online, tenta refresh em background (sem deslogar se falhar)
          if (navigator.onLine) {
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
        // Erro total — mantém estado sem sessão
        setSession(null);
        setUser(null);
        setLoading(false);
      }
    };

    initSession();

    // Segurança: se initSession travar, libera o loading após 5 segundos
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    // 2. Escuta mudanças de auth (ÚNICO listener — sem duplicatas)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        if (intentionalLogoutRef.current) {
          intentionalLogoutRef.current = false;
          setSession(null);
          setUser(null);
          setLoading(false);
        }
        // Se não foi intencional, ignora (foi falha de refresh de rede)
        return;
      }
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (newSession) {
          setSession(newSession);
          setUser(newSession.user);
        }
      }
      setLoading(false);
    });

    // 3. Refresca token quando o app volta ao primeiro plano (único listener)
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
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
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const signOut = async () => {
    intentionalLogoutRef.current = true;
    clearOfflineData();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
