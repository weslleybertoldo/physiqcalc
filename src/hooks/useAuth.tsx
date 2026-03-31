import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
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

  useEffect(() => {
    // 1. Recupera sessão do localStorage primeiro (funciona offline)
    const initSession = async () => {
      try {
        // Sempre começa com a sessão local (funciona sem internet)
        const { data: { session: localSession } } = await supabase.auth.getSession();

        if (localSession) {
          // Mostra o usuário imediatamente com dados locais
          setSession(localSession);
          setUser(localSession.user);
          setLoading(false);

          // Se online, tenta refresh e buscar dados completos em background
          if (navigator.onLine) {
            try {
              const { data: { session: refreshed } } = await supabase.auth.refreshSession();
              if (refreshed) {
                setSession(refreshed);
                setUser(refreshed.user);
              }
              // Busca user completo (user_metadata com avatar)
              const { data: { user: fullUser } } = await supabase.auth.getUser();
              if (fullUser) {
                setUser(fullUser);
              }
            } catch {
              // Falha no refresh — mantém sessão local, não desloga
            }
          }
        } else {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
      } catch {
        // Erro total — tenta sessão local como último recurso
        try {
          const { data: { session: fallback } } = await supabase.auth.getSession();
          setSession(fallback);
          setUser(fallback?.user ?? null);
        } catch {
          setSession(null);
          setUser(null);
        }
        setLoading(false);
      }
    };

    initSession();

    // Segurança: se initSession travar, libera o loading após 5 segundos
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    // 2. Escuta mudanças de auth em tempo real
    // IMPORTANTE: ignora SIGNED_OUT se já tem sessão local (previne logout por falha de rede)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        // Só desloga se foi um signOut explícito (não por falha de refresh)
        // Verifica se ainda tem sessão válida no storage
        supabase.auth.getSession().then(({ data: { session: stored } }) => {
          if (!stored) {
            setSession(null);
            setUser(null);
            setLoading(false);
          }
        });
        return;
      }
      if (newSession) {
        setSession(newSession);
        setUser(newSession.user);
      }
      setLoading(false);
    });

    // 3. Refresca o token quando o app volta ao primeiro plano (APK + PWA)
    // Usa getSession primeiro (local), só faz refresh se necessário
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data: { session: local } } = await supabase.auth.getSession();
        if (local) {
          setSession(local);
          setUser(local.user);
          // Tenta refresh em background, sem deslogar se falhar
          if (navigator.onLine) {
            const { data: { session: refreshed } } = await supabase.auth.refreshSession();
            if (refreshed) {
              setSession(refreshed);
              setUser(refreshed.user);
            }
          }
        }
      } catch {
        // Offline — mantém sessão atual sem deslogar
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // 4. No Capacitor, o app pode ser "resumed" sem visibilitychange
    const onResume = async () => {
      try {
        const { data: { session: local } } = await supabase.auth.getSession();
        if (local) {
          setSession(local);
          setUser(local.user);
          if (navigator.onLine) {
            const { data: { session: refreshed } } = await supabase.auth.refreshSession();
            if (refreshed) {
              setSession(refreshed);
              setUser(refreshed.user);
            }
          }
        }
      } catch {}
    };
    document.addEventListener('resume', onResume);

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('resume', onResume);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
