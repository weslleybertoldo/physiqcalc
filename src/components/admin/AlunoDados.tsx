import { useEffect, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateAdminPDF, type AdminProfile } from "@/lib/generateAdminPDF";
import { generateWorkoutPlanPDF } from "@/lib/generateWorkoutPlanPDF";
import { classificarGordura } from "@/utils/composicaoCorporal";
import MedidasCorporaisDisplay from "@/components/MedidasCorporaisDisplay";
import { dadosBalanca, rotuloMetodo, tmbEscolhida } from "@/lib/avaliacao";

interface Profile extends AdminProfile {
  plano_nome: string | null;
}

// Aba "Dados" da engrenagem (Configurar aluno): visão de LEITURA do aluno — dados pessoais, composição corporal
// (tipo de avaliação + só a TMB escolhida), medidas e os PDFs (pagamentos ficam só em Plano & Cobrança). Macros
// saíram em 25/09/2026: nutrição fica no PhysiqNutri. Até 18/09/2026 era a tela do botão "olho" (/admin/alunos/:id/ver);
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

  const tmb = tmbEscolhida(profile);

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
            <Field label="Tipo de avaliação" value={rotuloMetodo(profile.metodo_avaliacao)} />
            <Field label="% Gordura" value={`${Number(profile.percentual_gordura).toFixed(1)}%`} highlight />
            <Field label="Massa Gorda" value={profile.massa_gorda ? `${Number(profile.massa_gorda).toFixed(1)} kg` : null} />
            <Field label="Massa Magra" value={profile.massa_magra ? `${Number(profile.massa_magra).toFixed(1)} kg` : null} />
            {dadosBalanca(profile).map((d) => <Field key={d.key} label={d.label} value={d.valor} />)}
            <Field label={`TMB ${tmb.label}`} value={tmb.valor !== null ? `${Math.round(tmb.valor)} kcal` : null} />
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

export default AlunoDados;
