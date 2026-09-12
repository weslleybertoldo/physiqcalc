import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { papelDoUser, vincularProfessor, type Papel } from "@/lib/saasApi";
import { lerProfPendente, limparProfPendente } from "@/lib/profPendente";

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

// 1 chamada de vínculo por login (ou sempre que houver código pendente); evita bater na edge a cada foco de aba
const VINCULO_KEY = "physiq_vinculo_checado";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const intentionalLogoutRef = useRef(false);
  const vinculandoRef = useRef(false);

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

  // Login só Google: logo após entrar, casa o código do link (?prof=) ou o convite por e-mail.
  // Idempotente no servidor; aqui só evita repetir sem motivo.
  const vincularSePendente = useCallback(async (sess: Session) => {
    if (vinculandoRef.current) return;
    const codigo = lerProfPendente();
    let jaChecado = false;
    try { jaChecado = sessionStorage.getItem(`${VINCULO_KEY}:${sess.user.id}`) === "1"; } catch { /* noop */ }
    if (!codigo && jaChecado) return;
    vinculandoRef.current = true;
    try {
      const r = await vincularProfessor(codigo);
      try { sessionStorage.setItem(`${VINCULO_KEY}:${sess.user.id}`, "1"); } catch { /* noop */ }
      if (r.vinculado) {
        limparProfPendente();
        toast.success(r.professor ? `Você entrou na lista de ${r.professor}.` : "Você foi vinculado ao seu professor.");
      } else if (r.papel === "professor" && r.refresh) {
        limparProfPendente();
        await refreshUser();
        toast.success("Sua conta de professor está pronta.");
      } else if (r.motivo === "ja_tem_professor" || r.motivo === "ja_professor" || r.motivo === "ja_master" || r.motivo === "proprio_codigo") {
        limparProfPendente();
      }
    } catch (e: any) {
      const msg = e?.message;
      if (msg === "codigo_invalido") { limparProfPendente(); toast.error("O link do professor é inválido. Peça um novo link."); }
      else if (msg === "professor_inativo") { limparProfPendente(); toast.error("Este professor não está mais ativo."); }
      else if (msg === "limite_plano") { toast.error("Este professor atingiu o limite de alunos do plano dele."); }
      else console.warn("[Auth] vincular-professor:", msg);
    } finally {
      vinculandoRef.current = false;
    }
  }, [refreshUser]);

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
                // código de professor pendente de uma abertura anterior (ex.: link aberto já logado)
                if (lerProfPendente()) void vincularSePendente(refreshed);
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

    let safetyTimeout: ReturnType<typeof setTimeout> | null = null;
    initSession().finally(() => {
      if (safetyTimeout) { clearTimeout(safetyTimeout); safetyTimeout = null; }
    });

    // Segurança: se initSession travar, libera o loading após 5 segundos
    safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    // 2. Escuta mudanças de auth (ÚNICO listener — sem duplicatas)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        // Desloga em: (a) logout intencional ou (b) sessão revogada server-side (ban / troca de senha em outro device)
        // Mantém estado em: refresh-fail offline (newSession null mas user ainda autenticado localmente)
        if (intentionalLogoutRef.current || navigator.onLine) {
          intentionalLogoutRef.current = false;
          setSession(null);
          setUser(null);
          setLoading(false);
        }
        return;
      }
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (newSession) {
          setSession(newSession);
          setUser(newSession.user);
          if (event === 'SIGNED_IN' && navigator.onLine) void vincularSePendente(newSession);
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
  }, [vincularSePendente]);

  const signOut = async () => {
    intentionalLogoutRef.current = true;
    try {
      localStorage.removeItem("physiq_offline_pending");
      localStorage.removeItem("physiq_offline_cache");
      localStorage.removeItem("physiq_mp_status_cache"); // status leve da mensalidade (é por usuário)
    } catch { /* storage indisponivel */ }
    // Limpa cache do Service Worker pra evitar servir dados do user anterior offline
    if ("caches" in window) {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((n) => n.includes("supabase-api-cache"))
            .map((n) => caches.delete(n))
        );
      } catch { /* fora de https/ssr */ }
    }
    await supabase.auth.signOut();
  };

  const papel = papelDoUser(user);

  return (
    <AuthContext.Provider value={{ user, session, loading, papel, isStaff: papel !== "aluno", isMaster: papel === "master", signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
