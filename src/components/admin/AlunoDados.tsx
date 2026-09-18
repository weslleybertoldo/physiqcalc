import { useEffect, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateAdminPDF, type AdminProfile } from "@/lib/generateAdminPDF";
import { generateWorkoutPlanPDF } from "@/lib/generateWorkoutPlanPDF";
import { levels } from "@/components/TdeeTable";
import { classificarGordura } from "@/utils/composicaoCorporal";
import MedidasCorporaisDisplay from "@/components/MedidasCorporaisDisplay";

interface Profile extends AdminProfile {
  plano_nome: string | null;
}

// Aba "Dados" da engrenagem (Configurar aluno): visão de LEITURA do aluno — dados pessoais, composição corporal,
// medidas, macros e os PDFs (pagamentos ficam só em Plano & Cobrança). Até 18/09/2026 era a tela do botão "olho" (/admin/alunos/:id/ver);
// o Weslley pediu pra tudo ficar dentro da engrenagem ("retira, tudo fica na engrenagem").
const AlunoDados = ({ userId }: { userId: string }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<NonNullable<Parameters<typeof generateAdminPDF>[1]>>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTreino, setLoadingTreino] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase.functions.invoke("admin-get-user", { body: { userId } }).then(({ data }) => {
      if (data?.profile) setProfile(data.profile);
      if (data?.avaliacoes) setAvaliacoes(data.avaliacoes);
      setLoading(false);
    });
  }, [userId]);

  const handleTreinoPDF = async () => {
    setLoadingTreino(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-workout-plan", { body: { userId } });
      if (error || !data?.profile) {
        console.error("[AlunoDados] Erro ao gerar PDF de treino:", error);
        return;
      }
      generateWorkoutPlanPDF(data.profile, data.dias ?? []);
    } catch (e) {
      console.error("[AlunoDados] Falha no PDF de treino:", e);
    } finally {
      setLoadingTreino(false);
    }
  };

  if (loading) return <p className="text-muted-foreground font-body" data-aluno-dados-loading>Carregando...</p>;
  if (!profile) return <p className="text-muted-foreground font-body">Usuário não encontrado.</p>;

  // Calorias derivadas
  const baseTmb = profile.tmb_metodo === "katch" && profile.tmb_katch
    ? Number(profile.tmb_katch) : profile.tmb_mifflin ? Number(profile.tmb_mifflin) : null;
  const actFactor = Number(profile.nivel_atividade ?? 1.55);
  const baseCalories = baseTmb ? Math.round(baseTmb * actFactor) : null;
  const ajuste = profile.ajuste_calorico ?? 0;
  const totalCalories = baseCalories ? baseCalories + ajuste : null;
  const actLabel = levels.find((l) => l.factor === actFactor)?.label ?? `×${actFactor}`;

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
    <div className="space-y-10" data-aluno-dados={userId}>
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
            const sexo = profile.sexo === "male" ? "M" : "F";
            const cls = classificarGordura(Number(profile.percentual_gordura), sexo as "M" | "F", Number(profile.idade) || 25);
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
        <MedidasCorporaisDisplay data={{ ...profile }} />
      </section>

      {/* Pagamentos NÃO entram aqui: ficam só em Plano & Cobrança (decisão do Weslley 18/09/2026) */}

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

      {/* Downloads (admin) */}
      <section className="section-divider pt-8" data-aluno-downloads>
        <h2 className="font-heading text-lg text-foreground mb-4">Downloads</h2>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => generateAdminPDF(profile, avaliacoes)}
            className="w-full flex items-center justify-between result-card hover:border-primary/50 transition-colors py-3 px-4"
          >
            <span className="font-body text-sm text-foreground">Dados &amp; Evolução</span>
            <FileDown size={18} className="text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={handleTreinoPDF}
            disabled={loadingTreino}
            className="w-full flex items-center justify-between result-card hover:border-primary/50 transition-colors py-3 px-4 disabled:opacity-60"
          >
            <span className="font-body text-sm text-foreground">Treino</span>
            {loadingTreino
              ? <Loader2 size={18} className="text-muted-foreground animate-spin" />
              : <FileDown size={18} className="text-muted-foreground" />}
          </button>
        </div>
      </section>
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

export default AlunoDados;
