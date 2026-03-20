import { useState, useEffect } from "react";
import { LogOut, Dumbbell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PWAInstallButton from "@/components/PWAInstallButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { levels } from "@/components/TdeeTable";
import EvolutionSection from "@/components/EvolutionSection";
import { classificarGordura } from "@/utils/composicaoCorporal";
import MedidasCorporaisDisplay from "@/components/MedidasCorporaisDisplay";

interface Profile {
  nome: string | null;
  email: string | null;
  foto_url: string | null;
  sexo: string | null;
  idade: number | null;
  peso: number | null;
  altura: number | null;
  dobra_1: number | null;
  dobra_2: number | null;
  dobra_3: number | null;
  percentual_gordura: number | null;
  massa_gorda: number | null;
  massa_magra: number | null;
  tmb_mifflin: number | null;
  tmb_katch: number | null;
  tmb_metodo: string | null;
  nivel_atividade: number | null;
  ajuste_calorico: number | null;
  macro_proteina_multiplicador: number | null;
  macro_gordura_percentual: number | null;
  user_code: number | null;
  admin_locked: boolean | null;
}

const UserDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"comp" | "macros" | "evolucao">("comp");
  const [ajusteLocal, setAjusteLocal] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("physiq_profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data as unknown as Profile);
          setAjusteLocal(data.ajuste_calorico ?? 0);
        }
        setLoading(false);
      });
  }, [user]);

  // Save user's ajuste_calorico when changed (if not admin_locked)
  useEffect(() => {
    if (!user || !profile || profile.admin_locked) return;
    const timeout = setTimeout(() => {
      supabase
        .from("physiq_profiles")
        .update({ ajuste_calorico: ajusteLocal })
        .eq("id", user.id);
    }, 500);
    return () => clearTimeout(timeout);
  }, [ajusteLocal, user, profile]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  const displayName = profile?.nome || user?.user_metadata?.full_name || user?.email || "";
  const avatarUrl = profile?.foto_url || user?.user_metadata?.avatar_url || "";
  const initial = displayName.charAt(0).toUpperCase();

  const hasData = profile?.peso && profile?.idade;

  // Macros computation
  const baseTmb = profile?.tmb_metodo === "katch" && profile?.tmb_katch
    ? profile.tmb_katch
    : profile?.tmb_mifflin;
  const activityFactor = profile?.nivel_atividade ?? 1.55;
  const baseCalories = baseTmb ? Math.round(baseTmb * activityFactor) : null;
  const totalCalories = baseCalories ? baseCalories + ajusteLocal : null;

  const proteinMult = profile?.macro_proteina_multiplicador ?? 2.2;
  const fatPct = profile?.macro_gordura_percentual ?? 15;
  const peso = profile?.peso ?? 0;

  let macros: { proteinG: number; proteinKcal: number; fatG: number; fatKcal: number; carbG: number; carbKcal: number; proteinPct: number; fatPct: number; carbPct: number } | null = null;

  if (totalCalories && peso > 0) {
    const proteinG = proteinMult * peso;
    const proteinKcal = proteinG * 4;
    const fatKcal = totalCalories * (fatPct / 100);
    const fatG = fatKcal / 9;
    const carbKcal = totalCalories - proteinKcal - fatKcal;
    const carbG = carbKcal / 4;
    const total = proteinKcal + fatKcal + carbKcal;
    macros = {
      proteinG, proteinKcal,
      fatG, fatKcal,
      carbG, carbKcal,
      proteinPct: (proteinKcal / total) * 100,
      fatPct: (fatKcal / total) * 100,
      carbPct: (carbKcal / total) * 100,
    };
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        {/* Header */}
        <header className="pt-12 sm:pt-20 pb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
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
        <div className="flex border-b border-muted-foreground/30 mb-2">
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
            onClick={() => setActiveTab("macros")}
            className={`py-3 px-1 mr-8 font-heading text-sm uppercase tracking-widest transition-colors duration-200 border-b-2 ${
              activeTab === "macros" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Macronutrientes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("evolucao")}
            className={`py-3 px-1 font-heading text-sm uppercase tracking-widest transition-colors duration-200 border-b-2 ${
              activeTab === "evolucao" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Evolução
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
                      <DataField label="% Gordura" value={`${Number(profile.percentual_gordura).toFixed(1)}%`} highlight />
                      <DataField label="Massa Gorda" value={profile.massa_gorda ? `${Number(profile.massa_gorda).toFixed(1)} kg` : null} />
                      <DataField label="Massa Magra" value={profile.massa_magra ? `${Number(profile.massa_magra).toFixed(1)} kg` : null} />
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

                <div>
                  <h2 className="font-heading text-xl text-foreground mb-6">Taxa Metabólica Basal</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {profile?.tmb_mifflin && (
                      <div className="result-card">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-heading mb-2">TMB Mifflin-St Jeor</p>
                        <p className="font-heading text-4xl text-primary">
                          {Math.round(Number(profile.tmb_mifflin))}
                          <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
                        </p>
                      </div>
                    )}
                    {profile?.tmb_katch && (
                      <div className="result-card border-primary/30">
                        <p className="text-xs uppercase tracking-wider text-primary font-heading mb-2">TMB Katch-McArdle</p>
                        <p className="font-heading text-4xl text-primary">
                          {Math.round(Number(profile.tmb_katch))}
                          <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : activeTab === "macros" ? (
          <section className="py-16">
            {!baseCalories ? (
              <div className="result-card border-muted-foreground/30">
                <p className="text-sm text-muted-foreground font-body">
                  Seus dados ainda não foram configurados. Aguarde o administrador.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                <div className="result-card border-primary/50">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                    <div className="flex-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-1">Meta calórica</p>
                      <p className="font-heading text-4xl sm:text-5xl text-primary">
                        {totalCalories}
                        <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
                      </p>
                      {ajusteLocal !== 0 && (
                        <p className="text-sm text-muted-foreground font-body mt-2">
                          {baseCalories} <span className="text-muted-foreground/60">(base)</span>
                          {" "}{ajusteLocal >= 0 ? "+" : "−"} {Math.abs(ajusteLocal)} <span className="text-muted-foreground/60">(ajuste)</span>
                          {" "}= <span className="text-foreground font-heading">{totalCalories}</span> kcal/dia
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground font-body mt-1">
                        {profile?.tmb_metodo === "katch" ? "Katch-McArdle" : "Mifflin-St Jeor"} × {levels.find(l => l.factor === activityFactor)?.label ?? activityFactor}
                      </p>
                    </div>
                    {!profile?.admin_locked && (
                      <div className="sm:w-48 shrink-0">
                        <label className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2 block">Ajuste (kcal)</label>
                        <div className="flex items-center gap-0">
                          <button type="button" onClick={() => setAjusteLocal(v => v - 50)} className="h-10 w-10 flex items-center justify-center bg-secondary text-foreground font-heading text-lg hover:bg-muted transition-colors duration-200 shrink-0">−</button>
                          <input type="number" value={ajusteLocal} onChange={(e) => setAjusteLocal(parseInt(e.target.value) || 0)} className="h-10 w-full bg-transparent border-b border-t border-muted-foreground text-center text-foreground font-heading text-lg outline-none focus:border-primary transition-colors" />
                          <button type="button" onClick={() => setAjusteLocal(v => v + 50)} className="h-10 w-10 flex items-center justify-center bg-secondary text-foreground font-heading text-lg hover:bg-muted transition-colors duration-200 shrink-0">+</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {macros && (
                  <div className="space-y-6">
                    <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">Distribuição de Macros</h3>
                    <div className="space-y-0">
                      <div className="flex items-center py-3 border-b border-muted-foreground/30">
                        <span className="flex-1 text-xs uppercase tracking-wider text-muted-foreground font-heading">Macro</span>
                        <span className="w-24 text-right text-xs uppercase tracking-wider text-muted-foreground font-heading">Gramas</span>
                        <span className="w-24 text-right text-xs uppercase tracking-wider text-muted-foreground font-heading">Kcal</span>
                        <span className="w-20 text-right text-xs uppercase tracking-wider text-muted-foreground font-heading">%</span>
                      </div>
                      <MacroRow name="Proteína" g={macros.proteinG} kcal={macros.proteinKcal} pct={macros.proteinPct} />
                      <MacroRow name="Gordura" g={macros.fatG} kcal={macros.fatKcal} pct={macros.fatPct} />
                      <MacroRow name="Carboidrato" g={macros.carbG} kcal={macros.carbKcal} pct={macros.carbPct} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="py-10">
            {user && <EvolutionSection userId={user.id} />}
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

function MacroRow({ name, g, kcal, pct }: { name: string; g: number; kcal: number; pct: number }) {
  return (
    <div className="flex items-center py-3 border-b border-muted-foreground/30">
      <span className="flex-1 text-sm text-foreground font-body">{name}</span>
      <span className="w-24 text-right font-heading text-foreground">{g.toFixed(1)}g</span>
      <span className="w-24 text-right font-heading text-foreground">{Math.round(kcal)}</span>
      <span className="w-20 text-right text-sm text-muted-foreground font-body">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default UserDashboard;
