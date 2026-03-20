import { useState, useEffect } from "react";
import { ArrowLeft, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateAdminPDF, type AdminProfile } from "@/lib/generateAdminPDF";
import { levels } from "./TdeeTable";
import EvolutionSection from "./EvolutionSection";
import { classificarGordura } from "@/utils/composicaoCorporal";
import MedidasCorporaisDisplay from "@/components/MedidasCorporaisDisplay";

interface Profile extends AdminProfile {
  plano_nome: string | null;
  plano_expiracao: string | null;
}

interface Props {
  userId: string;
  onBack: () => void;
}

const AdminUserView = ({ userId, onBack }: Props) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dados" | "evolucao">("dados");

  useEffect(() => {
    supabase.functions.invoke("admin-get-user", { body: { userId } }).then(({ data }) => {
      if (data?.profile) setProfile(data.profile);
      if (data?.avaliacoes) setAvaliacoes(data.avaliacoes);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Usuário não encontrado.</p>
      </div>
    );
  }

  // Derived calorie values
  const baseTmb = profile.tmb_metodo === "katch" && profile.tmb_katch
    ? Number(profile.tmb_katch) : profile.tmb_mifflin ? Number(profile.tmb_mifflin) : null;
  const actFactor = Number(profile.nivel_atividade ?? 1.55);
  const baseCalories = baseTmb ? Math.round(baseTmb * actFactor) : null;
  const ajuste = profile.ajuste_calorico ?? 0;
  const totalCalories = baseCalories ? baseCalories + ajuste : null;
  const actLabel = levels.find(l => l.factor === actFactor)?.label ?? `×${actFactor}`;

  // Macros
  const peso = Number(profile.peso ?? 0);
  const pm = Number(profile.macro_proteina_multiplicador ?? 2.2);
  const fp = Number(profile.macro_gordura_percentual ?? 15);
  let macros: { proteinG: number; proteinKcal: number; fatG: number; fatKcal: number; carbG: number; carbKcal: number; proteinPct: number; fatPct: number; carbPct: number } | null = null;

  if (totalCalories && peso > 0) {
    const proteinG = pm * peso, proteinKcal = proteinG * 4;
    const fatKcal = totalCalories * (fp / 100), fatG = fatKcal / 9;
    const carbKcal = totalCalories - proteinKcal - fatKcal, carbG = carbKcal / 4;
    const total = proteinKcal + fatKcal + carbKcal;
    macros = {
      proteinG, proteinKcal, fatG, fatKcal, carbG, carbKcal,
      proteinPct: (proteinKcal / total) * 100,
      fatPct: (fatKcal / total) * 100,
      carbPct: (carbKcal / total) * 100,
    };
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <header className="pt-12 sm:pt-20 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="font-heading text-2xl text-foreground">{profile.nome || "Sem nome"}</h1>
              {profile.user_code && <p className="text-xs text-muted-foreground font-body">ID: {profile.user_code}</p>}
            </div>
          </div>
          <button onClick={() => generateAdminPDF(profile, avaliacoes)} title="Gerar PDF" className="p-2 text-muted-foreground hover:text-primary transition-colors">
            <FileDown size={18} />
          </button>
        </header>

        {/* Tabs */}
        <div className="flex border-b border-muted-foreground/30 mb-2">
          <button
            type="button"
            onClick={() => setActiveTab("dados")}
            className={`py-3 px-1 mr-8 font-heading text-sm uppercase tracking-widest transition-colors duration-200 border-b-2 ${
              activeTab === "dados" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Dados
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

        {activeTab === "evolucao" ? (
          <section className="py-10 pb-20">
            <EvolutionSection userId={userId} isAdmin />
          </section>
        ) : (
          <div className="space-y-10 pb-20">
            {/* Dados Pessoais */}
            <section>
              <h2 className="font-heading text-lg text-foreground mb-4">Dados Pessoais</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field label="Nome" value={profile.nome} />
                <Field label="Sexo" value={profile.sexo === "male" ? "Masculino" : "Feminino"} />
                <Field label="Idade" value={profile.idade ? `${profile.idade} anos` : null} />
                <Field label="Peso" value={profile.peso ? `${profile.peso} kg` : null} />
                <Field label="Altura" value={profile.altura ? `${profile.altura} cm` : null} />
              </div>
            </section>

            {/* Composição Corporal */}
            {profile.percentual_gordura && (
              <section className="section-divider pt-10">
                <h2 className="font-heading text-lg text-foreground mb-4">Composição Corporal</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="% Gordura" value={`${Number(profile.percentual_gordura).toFixed(1)}%`} highlight />
                  <Field label="Massa Gorda" value={profile.massa_gorda ? `${Number(profile.massa_gorda).toFixed(1)} kg` : null} />
                  <Field label="Massa Magra" value={profile.massa_magra ? `${Number(profile.massa_magra).toFixed(1)} kg` : null} />
                  <Field label="TMB Mifflin" value={profile.tmb_mifflin ? `${Math.round(Number(profile.tmb_mifflin))} kcal` : null} />
                  <Field label="TMB Katch" value={profile.tmb_katch ? `${Math.round(Number(profile.tmb_katch))} kcal` : null} />
                </div>

                {/* Classificação */}
                {(() => {
                  const sexo = profile.sexo === 'male' ? 'M' : 'F';
                  const cls = classificarGordura(Number(profile.percentual_gordura), sexo as 'M' | 'F', Number(profile.idade) || 25);
                  return (
                    <div className="result-card mt-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: cls.cor }} />
                        <span className="text-[9px] font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                          Classificação % Gordura
                        </span>
                      </div>
                      <p className="font-heading text-xl" style={{ color: cls.cor }}>{cls.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{cls.descricao}</p>
                      <p className="text-[8px] text-muted-foreground/60 italic mt-2 leading-relaxed">
                        Gallagher et al. (2000) - ACE - Lohman (1993) - ACSM
                        {cls.ajuste > 0 && ` - Ajuste etario aplicado: +${cls.ajuste}%`}
                      </p>
                    </div>
                  );
                })()}
              </section>
            )}

            {/* Medidas Corporais */}
            <section className="section-divider pt-10">
              <MedidasCorporaisDisplay data={profile as any} />
            </section>

            {/* Macros */}
            {totalCalories && (
              <section className="section-divider pt-10">
                <h2 className="font-heading text-lg text-foreground mb-4">Macronutrientes</h2>

                <div className="result-card border-primary/50 mb-6">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-1">Meta calórica</p>
                  <p className="font-heading text-4xl text-primary">
                    {totalCalories}
                    <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
                  </p>
                  {ajuste !== 0 && (
                    <p className="text-sm text-muted-foreground font-body mt-2">
                      {baseCalories} (base) {ajuste >= 0 ? "+" : "−"} {Math.abs(ajuste)} (ajuste) = {totalCalories} kcal/dia
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground font-body mt-1">
                    {profile.tmb_metodo === "katch" ? "Katch-McArdle" : "Mifflin-St Jeor"} × {actLabel}
                  </p>
                </div>

                {macros && (
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
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function Field({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <div className="result-card">
      <p className="text-xs uppercase text-muted-foreground font-body mb-1">{label}</p>
      <p className={`font-heading text-lg ${highlight ? "text-primary" : "text-foreground"}`}>{value || "—"}</p>
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

export default AdminUserView;
