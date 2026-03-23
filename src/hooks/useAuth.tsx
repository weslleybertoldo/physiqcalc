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

    // 2. Escuta mudanças de auth em tempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 3. Refresca o token quando o app volta ao primeiro plano (APK + PWA)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.refreshSession().then(({ data: { session: refreshed } }) => {
          if (refreshed) {
            setSession(refreshed);
            setUser(refreshed.user);
          }
        }).catch(() => {
          // Offline — mantém sessão atual sem deslogar
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // 4. No Capacitor, o app pode ser "resumed" sem visibilitychange
    const onResume = () => {
      supabase.auth.refreshSession().then(({ data: { session: refreshed } }) => {
        if (refreshed) {
          setSession(refreshed);
          setUser(refreshed.user);
        }
      }).catch(() => {});
    };
    document.addEventListener('resume', onResume);

    return () => {
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
