import { useState, useEffect } from "react";
import { LogOut, Dumbbell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PWAInstallButton from "@/components/PWAInstallButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import EvolutionSection from "@/components/EvolutionSection";
import { classificarGordura } from "@/utils/composicaoCorporal";
import MedidasCorporaisDisplay from "@/components/MedidasCorporaisDisplay";
import RegistrosSection from "@/components/RegistrosSection";
import { dadosBalanca, rotuloMetodo, tmbEscolhida } from "@/lib/avaliacao";

interface Profile {
  nome: string | null;
  email: string | null;
  foto_url: string | null;
  sexo: string | null;
  idade: number | null;
  peso: number | null;
  altura: number | null;
  metodo_avaliacao: string | null;
  percentual_gordura: number | null;
  massa_gorda: number | null;
  massa_magra: number | null;
  massa_muscular: number | null;
  agua_corporal: number | null;
  gordura_visceral: number | null;
  tmb_mifflin: number | null;
  tmb_katch: number | null;
  tmb_balanca: number | null;
  tmb_metodo: string | null;
  user_code: number | null;
}

const UserDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // aba Macronutrientes saiu em 25/09/2026: nutrição fica no PhysiqNutri
  const [activeTab, setActiveTab] = useState<"comp" | "evolucao" | "registros">("comp");
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("physiq_profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("[UserDashboard] Erro ao carregar perfil:", error);
        }
        if (data) setProfile(data as unknown as Profile);
        setLoading(false);
      });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  const displayName = profile?.nome || user?.user_metadata?.full_name || user?.email || "";
  const avatarUrl = profile?.foto_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
  const initial = displayName.charAt(0).toUpperCase();

  const hasData = profile?.peso && profile?.idade;

  const tmb = profile ? tmbEscolhida(profile as unknown as Record<string, unknown>) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        {/* Header */}
        <header className="pt-12 sm:pt-20 pb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {avatarUrl && !avatarError ? (
              <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" onError={() => setAvatarError(true)} referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-heading text-lg">
                {initial}
              </div>
            )}
            <div>
              <p className="font-heading text-lg text-foreground">{displayName}</p>
              {profile?.user_code && (
                <p className="text-xs text-muted-foreground font-body">ID: {profile.user_code}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate("/treinos")}
              title="Treinos"
              className="p-2 text-muted-foreground hover:text-primary transition-colors duration-200"
            >
              <Dumbbell size={18} />
            </button>
            <button
              type="button"
              onClick={signOut}
              title="Sair"
              className="p-2 text-muted-foreground hover:text-destructive transition-colors duration-200"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <h1 className="font-heading text-3xl sm:text-4xl text-foreground tracking-tight mb-2">
          PHYSIQ<span className="text-primary">CALC</span>
        </h1>

        {/* Tabs */}
        <div className="flex border-b border-muted-foreground/30 mb-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("comp")}
            className={`py-3 px-1 mr-8 font-heading text-sm uppercase tracking-widest transition-colors duration-200 border-b-2 ${
              activeTab === "comp" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Composição Corporal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("evolucao")}
            className={`py-3 px-1 mr-8 font-heading text-sm uppercase tracking-widest transition-colors duration-200 border-b-2 whitespace-nowrap ${
              activeTab === "evolucao" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Evolução
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("registros")}
            className={`py-3 px-1 font-heading text-sm uppercase tracking-widest transition-colors duration-200 border-b-2 whitespace-nowrap ${
              activeTab === "registros" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Registros
          </button>
        </div>

        {activeTab === "comp" ? (
          <section className="py-16">
            {!hasData ? (
              <div className="result-card border-muted-foreground/30">
                <p className="text-sm text-muted-foreground font-body">
                  Seus dados ainda não foram configurados. Aguarde o administrador.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                <div>
                  <h2 className="font-heading text-xl text-foreground mb-6">Dados Pessoais</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                    <DataField label="Nome" value={profile?.nome} />
                    <DataField label="Sexo" value={profile?.sexo === "male" ? "Masculino" : "Feminino"} />
                    <DataField label="Idade" value={profile?.idade ? `${profile.idade} anos` : null} />
                    <DataField label="Peso" value={profile?.peso ? `${profile.peso} kg` : null} />
                    <DataField label="Altura" value={profile?.altura ? `${profile.altura} cm` : null} />
                  </div>
                </div>
                {profile?.percentual_gordura && (
                  <div>
                    <h2 className="font-heading text-xl text-foreground mb-6">Composição Corporal</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                      <DataField label="Tipo de avaliação" value={rotuloMetodo(profile.metodo_avaliacao)} />
                      <DataField label="% Gordura" value={`${Number(profile.percentual_gordura).toFixed(1)}%`} highlight />
                      <DataField label="Massa Gorda" value={profile.massa_gorda ? `${Number(profile.massa_gorda).toFixed(1)} kg` : null} />
                      <DataField label="Massa Magra" value={profile.massa_magra ? `${Number(profile.massa_magra).toFixed(1)} kg` : null} />
                      {dadosBalanca(profile as unknown as Record<string, unknown>).map((d) => (
                        <DataField key={d.key} label={d.label} value={d.valor} />
                      ))}
                    </div>

                    {/* Classificação */}
                    {(() => {
                      const sexo = profile.sexo === 'male' ? 'M' : 'F';
                      const cls = classificarGordura(Number(profile.percentual_gordura), sexo as 'M' | 'F', profile.idade || 25);
                      return (
                        <div className="result-card mt-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: cls.cor }} />
                            <span className="text-[9px] font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                              Classificação
                            </span>
                          </div>
                          <p className="font-heading text-xl" style={{ color: cls.cor }}>{cls.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{cls.descricao}</p>
                          <p className="text-[8px] text-muted-foreground/60 italic mt-2 leading-relaxed">
                            Gallagher et al. (2000) Am J Clin Nutr 72:694-701 - ACE - Lohman (1993) - ACSM
                            {cls.ajuste > 0 && ` - Ajuste etario: +${cls.ajuste}%`}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Medidas Corporais */}
                <MedidasCorporaisDisplay data={profile as any} />

                {/* só a TMB que o professor escolheu (Mifflin, Katch ou a da balança) */}
                {tmb?.valor != null && (
                  <div>
                    <h2 className="font-heading text-xl text-foreground mb-6">Taxa Metabólica Basal</h2>
                    <div className="result-card border-primary/30 sm:max-w-sm" data-tmb-aluno={tmb.metodo}>
                      <p className="text-xs uppercase tracking-wider text-primary font-heading mb-2">TMB {tmb.label}</p>
                      <p className="font-heading text-4xl text-primary">
                        {Math.round(tmb.valor)}
                        <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : activeTab === "evolucao" ? (
          <section className="py-10">
            {user && <EvolutionSection userId={user.id} />}
          </section>
        ) : (
          <section>
            {user && <RegistrosSection userId={user.id} />}
          </section>
        )}

        {/* Install PWA */}
        <div className="section-divider pt-6 pb-2">
          <PWAInstallButton />
        </div>

        <footer className="py-12 text-center">
          <p className="text-xs text-muted-foreground font-body italic">By Weslley Bertoldo</p>
        </footer>
      </div>
    </div>
  );
};

function DataField({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-body">{label}</span>
      <span className={`font-heading text-lg ${highlight ? "text-primary" : "text-foreground"}`}>
        {value || "—"}
      </span>
    </div>
  );
}

export default UserDashboard;
