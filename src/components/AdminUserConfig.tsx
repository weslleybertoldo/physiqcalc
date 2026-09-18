import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import InputField from "./InputField";
import GenderToggle from "./GenderToggle";
import { levels } from "./TdeeTable";
import AdminSemanaUsuario from "./AdminSemanaUsuario";
import AdminRegistrosFotos from "./AdminRegistrosFotos";
import EvolutionSection from "./EvolutionSection";
import AdminHistoricoMes from "./admin/AdminHistoricoMes";
import PlanoCobrancaAluno from "./admin/PlanoCobrancaAluno";
import AlunoDados from "./admin/AlunoDados";
import ConfiguracaoAluno from "./admin/ConfiguracaoAluno";
import { MEDIDA_FIELDS, MEDIDA_GROUPS } from "@/lib/medidas";
import { calcularIdade } from "@/utils/formatDate";
import { classificarGordura } from "@/utils/composicaoCorporal";

interface Props {
  userId: string;
  onBack: () => void;
}

function calcBodyFat3(gender: "male" | "female", soma: number, age: number) {
  let density: number;
  if (gender === "male") {
    density = 1.10938 - 0.0008267 * soma + 0.0000016 * soma * soma - 0.0002574 * age;
  } else {
    density = 1.0994921 - 0.0009929 * soma + 0.0000023 * soma * soma - 0.0001392 * age;
  }
  const bf = ((4.95 / density) - 4.5) * 100;
  return bf > 0 && bf < 100 ? bf : null;
}

// Abas que auto-salvam ou só leem: não mostram o botão Salvar (que grava o perfil).
// "plano" é ESPELHO desde 13/09/2026 — plano/mensalidade se editam no popup "Cobrança" da tela Cobrança.
// "dados" é a visão de leitura (antigo botão "olho"), dentro da engrenagem desde 18/09/2026.
const TABS_SEM_SALVAR: ReadonlySet<string> = new Set(["dados", "treino", "registros", "historico", "plano", "config"]);

// 6 GRUPOS com sub-abas (SaaS 12/09/2026; "Dados" entrou em 18/09/2026 no lugar do botão "olho"). As chaves antigas
// do ?ct= continuam válidas — o grupo é derivado da chave — e o conteúdo de cada aba é o mesmo de antes.
const GRUPOS = [
  { key: "dados", label: "Dados", abas: [{ key: "dados", label: "Dados" }] },
  { key: "perfil", label: "Perfil", abas: [{ key: "geral", label: "Dados Gerais" }] },
  { key: "avaliacao", label: "Avaliação", abas: [{ key: "dobras", label: "Dobras & Medidas" }, { key: "evolucao", label: "Evolução" }, { key: "registros", label: "Registros" }] },
  { key: "treino", label: "Treino", abas: [{ key: "treino", label: "Treino" }, { key: "historico", label: "Histórico" }] },
  { key: "plano", label: "Plano & Cobrança", abas: [{ key: "plano", label: "Plano" }] },
  // 18/09/2026: descanso, nº de séries (padrão × personalizada) e cadeado do aluno — cada bloco salva sozinho
  { key: "config", label: "Configuração", abas: [{ key: "config", label: "Configuração" }] },
] as const;
const TODAS_ABAS: ReadonlySet<string> = new Set(GRUPOS.flatMap((g) => g.abas.map((a) => a.key)));

const AdminUserConfig = ({ userId, onBack }: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // sub-aba na URL (?ct=) — F5 mantém a aba (mesmo padrão do AdminTreinos). Sem ?ct= abre em "Dados" (a antiga
  // tela do olho, 18/09/2026); chave desconhecida ("perfil", link antigo) cai em "geral".
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("ct");
  const configTab = rawTab ? (TODAS_ABAS.has(rawTab) ? rawTab : "geral") : "dados";
  const setConfigTab = (t: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("ct", t);
      return p;
    }, { replace: true });
  };
  const [nome, setNome] = useState("");
  const [sexo, setSexo] = useState<"male" | "female">("male");
  const [idade, setIdade] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [dobra1, setDobra1] = useState("");
  const [dobra2, setDobra2] = useState("");
  const [dobra3, setDobra3] = useState("");
  const [tmbMetodo, setTmbMetodo] = useState("mifflin");
  const [nivelAtividade, setNivelAtividade] = useState(1.55);
  const [ajusteCalorico, setAjusteCalorico] = useState(0);
  const [proteinMult, setProteinMult] = useState("2.2");
  const [fatPct, setFatPct] = useState("15");
  const [adminLocked, setAdminLocked] = useState(true);
  const [observacao, setObservacao] = useState("");
  const [medidas, setMedidas] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.functions.invoke("admin-get-user", { body: { userId } }).then(({ data }) => {
      if (data?.profile) {
        const p = data.profile;
        setNome(p.nome || "");
        setSexo(p.sexo || "male");
        setIdade(p.idade?.toString() || "");
        setDataNascimento(p.data_nascimento || "");
        setPeso(p.peso?.toString() || "");
        setAltura(p.altura?.toString() || "");
        setDobra1(p.dobra_1?.toString() || "");
        setDobra2(p.dobra_2?.toString() || "");
        setDobra3(p.dobra_3?.toString() || "");
        setTmbMetodo(p.tmb_metodo || "mifflin");
        setNivelAtividade(p.nivel_atividade ?? 1.55);
        setAjusteCalorico(p.ajuste_calorico ?? 0);
        setProteinMult(p.macro_proteina_multiplicador?.toString() || "2.2");
        setFatPct(p.macro_gordura_percentual?.toString() || "15");
        setAdminLocked(p.admin_locked ?? true);
        // Load medidas
        const m: Record<string, string> = {};
        MEDIDA_FIELDS.forEach(f => { m[f.key] = p[f.key]?.toString() || ""; });
        setMedidas(m);
      }
      setLoading(false);
    });
  }, [userId]);

  const maleLabels = ["Peitoral", "Abdômen", "Coxa"];
  const femaleLabels = ["Tríceps", "Supra-ilíaca", "Coxa"];
  const foldLabels = sexo === "male" ? maleLabels : femaleLabels;

  const computed = useMemo(() => {
    const a = parseFloat(idade), w = parseFloat(peso), h = parseFloat(altura);
    const d1 = parseFloat(dobra1), d2 = parseFloat(dobra2), d3 = parseFloat(dobra3);

    const tmbMifflin = a && h && w
      ? (sexo === "male" ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161)
      : null;

    let bf: number | null = null;
    let massaGorda: number | null = null;
    let massaMagra: number | null = null;
    let tmbKatch: number | null = null;

    if (d1 && d2 && d3 && a && w) {
      bf = calcBodyFat3(sexo, d1 + d2 + d3, a);
      if (bf !== null) {
        massaGorda = w * (bf / 100);
        massaMagra = w - massaGorda;
        tmbKatch = 370 + 21.6 * massaMagra;
      }
    }

    return { tmbMifflin, bf, massaGorda, massaMagra, tmbKatch };
  }, [idade, peso, altura, dobra1, dobra2, dobra3, sexo]);

  // Derived calorie calculation
  const baseTmb = tmbMetodo === "katch" && computed.tmbKatch ? computed.tmbKatch : computed.tmbMifflin;
  const baseCalories = baseTmb ? Math.round(baseTmb * nivelAtividade) : null;
  const totalCalories = baseCalories ? baseCalories + ajusteCalorico : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update profile
      const { error: profileError } = await supabase.functions.invoke("admin-update-user", {
        body: {
          userId,
          data: {
            nome,
            sexo,
            idade: dataNascimento ? calcularIdade(dataNascimento) : (parseInt(idade) || null),
            data_nascimento: dataNascimento || null,
            peso: parseFloat(peso) || null,
            altura: parseFloat(altura) || null,
            dobra_1: parseFloat(dobra1) || null,
            dobra_2: parseFloat(dobra2) || null,
            dobra_3: parseFloat(dobra3) || null,
            percentual_gordura: computed.bf,
            massa_gorda: computed.massaGorda,
            massa_magra: computed.massaMagra,
            tmb_mifflin: computed.tmbMifflin,
            tmb_katch: computed.tmbKatch,
            tmb_metodo: tmbMetodo,
            nivel_atividade: nivelAtividade,
            ajuste_calorico: ajusteCalorico,
            macro_proteina_multiplicador: parseFloat(proteinMult) || 2.2,
            macro_gordura_percentual: parseFloat(fatPct) || 15,
            // plano_nome / mensalidade_valor: só o popup "Cobrança" grava (13/09/2026)
            admin_locked: adminLocked,
            ...Object.fromEntries(MEDIDA_FIELDS.map(f => [f.key, parseFloat(medidas[f.key]) || null])),
          },
        },
      });
      if (profileError) {
        console.error("[AdminUserConfig] Erro ao salvar perfil:", profileError);
        toast.error("Erro ao salvar perfil.");
        setSaving(false);
        return;
      }

      // Registra avaliação (nova evolução) SÓ ao salvar pela aba Dobras & Medidas.
      // Salvar em Dados Gerais/Plano/Treino atualiza o perfil sem gerar evolução.
      if (configTab === "dobras") {
        const { error: avalError } = await supabase.functions.invoke("admin-avaliacoes", {
          body: {
            action: "create",
            userId,
            avaliacao: {
              data_avaliacao: (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`; })(),
              peso: parseFloat(peso) || null,
              altura: parseFloat(altura) || null,
              dobra_1: parseFloat(dobra1) || null,
              dobra_2: parseFloat(dobra2) || null,
              dobra_3: parseFloat(dobra3) || null,
              percentual_gordura: computed.bf,
              massa_gorda: computed.massaGorda,
              massa_magra: computed.massaMagra,
              tmb_mifflin: computed.tmbMifflin,
              tmb_katch: computed.tmbKatch,
              observacao: observacao || null,
              ...Object.fromEntries(MEDIDA_FIELDS.map(f => [f.key, parseFloat(medidas[f.key]) || null])),
            },
          },
        });
        if (avalError) console.warn("[AdminUserConfig] Erro ao registrar avaliação:", avalError);
      }

      toast.success("Dados salvos.");
    } catch (err) {
      console.error("[AdminUserConfig] Erro inesperado:", err);
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground font-body">Carregando...</p>;
  }

  const grupoAtual = GRUPOS.find((g) => g.abas.some((a) => a.key === configTab)) ?? GRUPOS[0];

  return (
    <div className="mx-auto max-w-5xl" data-config-aluno={userId}>
      {/* header compacto: a página já fica dentro do layout com sidebar */}
      <header className="pb-4 flex items-center gap-3">
        <button type="button" onClick={onBack} title="Voltar pra lista" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors" data-btn-voltar>
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="font-heading text-xl text-foreground uppercase tracking-wider">Configurar aluno</h1>
          <p className="text-sm text-muted-foreground font-body truncate">{nome || "Sem nome"}</p>
        </div>
      </header>

      <div className="sm:grid sm:grid-cols-[170px_1fr] sm:gap-8">
        {/* grupos: linha rolável no mobile, coluna lateral no desktop */}
        <nav className="flex gap-2 overflow-x-auto pb-3 sm:flex-col sm:gap-1 sm:pb-0 sm:border-r sm:border-muted-foreground/20 sm:pr-4" aria-label="Grupos">
          {GRUPOS.map((g) => {
            const ativo = g.key === grupoAtual.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setConfigTab(g.abas[0].key)}
                data-config-grupo={g.key}
                data-ativo={ativo || undefined}
                className={`shrink-0 px-3 py-2 text-left font-heading text-xs uppercase tracking-wider whitespace-nowrap transition-colors rounded-full border sm:rounded-none sm:border-0 sm:border-l-2 sm:w-full ${
                  ativo ? "border-primary text-primary bg-primary/10" : "border-muted-foreground/30 text-muted-foreground hover:text-foreground sm:border-transparent"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
        {/* sub-abas do grupo como chips (só quando o grupo tem mais de uma) */}
        {grupoAtual.abas.length > 1 && (
          <div className="flex flex-wrap gap-2 pt-2 sm:pt-0" data-config-subabas>
            {grupoAtual.abas.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setConfigTab(t.key)}
                data-config-aba={t.key}
                className={`px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider rounded-full border transition-colors ${
                  configTab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-10 pb-10 pt-6">
          {/* Dados = visão de leitura do aluno (era o botão "olho"; dentro da engrenagem desde 18/09/2026) */}
          {configTab === "dados" && <AlunoDados userId={userId} />}

          {configTab === "geral" && (
          <section>
            <h2 className="font-heading text-lg text-foreground mb-6">Dados Pessoais</h2>
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Nome</label>
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="input-underline" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground font-body uppercase tracking-wider mb-2 block">Sexo</label>
                <GenderToggle value={sexo} onChange={setSexo} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Data de Nascimento</label>
                  <input
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => {
                      setDataNascimento(e.target.value);
                      if (e.target.value) {
                        setIdade(String(calcularIdade(e.target.value)));
                      }
                    }}
                    className="input-underline"
                  />
                  {dataNascimento && (
                    <p className="text-xs text-muted-foreground font-body mt-1">
                      {calcularIdade(dataNascimento)} anos
                    </p>
                  )}
                </div>
                {!dataNascimento && (
                  <InputField label="Idade (fallback)" unit="anos" value={idade} onChange={setIdade} />
                )}
                <InputField label="Altura" unit="cm" value={altura} onChange={setAltura} />
                <InputField label="Peso" unit="kg" value={peso} onChange={setPeso} />
              </div>
            </div>
          </section>
          )}

          {configTab === "dobras" && (<>
          <section>
            <h2 className="font-heading text-lg text-foreground mb-6">Dobras Cutâneas (3 dobras J&P)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              <InputField label={foldLabels[0]} unit="mm" value={dobra1} onChange={setDobra1} />
              <InputField label={foldLabels[1]} unit="mm" value={dobra2} onChange={setDobra2} />
              <InputField label={foldLabels[2]} unit="mm" value={dobra3} onChange={setDobra3} />
            </div>

            {computed.bf !== null && (
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="result-card">
                  <p className="text-xs uppercase text-muted-foreground font-body mb-1">% Gordura</p>
                  <p className="font-heading text-xl text-primary">{computed.bf.toFixed(1)}%</p>
                </div>
                <div className="result-card">
                  <p className="text-xs uppercase text-muted-foreground font-body mb-1">M. Gorda</p>
                  <p className="font-heading text-xl text-foreground">{computed.massaGorda?.toFixed(1)} kg</p>
                </div>
                <div className="result-card">
                  <p className="text-xs uppercase text-muted-foreground font-body mb-1">M. Magra</p>
                  <p className="font-heading text-xl text-foreground">{computed.massaMagra?.toFixed(1)} kg</p>
                </div>
                <div className="result-card">
                  <p className="text-xs uppercase text-muted-foreground font-body mb-1">TMB Mifflin</p>
                  <p className="font-heading text-xl text-foreground">{computed.tmbMifflin ? Math.round(computed.tmbMifflin) : "—"}</p>
                </div>
                <div className="result-card">
                  <p className="text-xs uppercase text-muted-foreground font-body mb-1">TMB Katch</p>
                  <p className="font-heading text-xl text-foreground">{computed.tmbKatch ? Math.round(computed.tmbKatch) : "—"}</p>
                </div>
              </div>
            )}

            {computed.bf !== null && (() => {
              const cls = classificarGordura(computed.bf, sexo === "male" ? "M" : "F", parseFloat(idade) || 25);
              return (
                <div className="result-card mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: cls.cor }} />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-heading">
                      Classificação
                    </span>
                  </div>
                  <p className="font-heading text-xl" style={{ color: cls.cor }}>{cls.label}</p>
                  <p className="text-xs text-muted-foreground font-body mt-1">{cls.descricao}</p>
                  <p className="text-[8px] text-muted-foreground/60 font-body italic mt-2 leading-relaxed">
                    📚 Gallagher et al. (2000) Am J Clin Nutr 72:694–701 · ACE · Lohman (1993) · ACSM
                    {cls.ajuste > 0 && ` · Ajuste etário: +${cls.ajuste}%`}
                  </p>
                </div>
              );
            })()}
          </section>

          {/* Medidas Corporais */}
          <section className="section-divider pt-10">
            <h2 className="font-heading text-lg text-foreground mb-6">Medidas Corporais (cm)</h2>
            {MEDIDA_GROUPS.map((group) => (
              <div key={group.key} className="mb-6">
                <p className="text-sm text-muted-foreground font-body uppercase tracking-wider mb-3">{group.label}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
                  {MEDIDA_FIELDS.filter(f => f.group === group.key).map((field) => (
                    <InputField
                      key={field.key}
                      label={field.label}
                      unit="cm"
                      value={medidas[field.key] || ""}
                      onChange={(v) => setMedidas(prev => ({ ...prev, [field.key]: v }))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* Macros config */}
          <section className="section-divider pt-10">
            <h2 className="font-heading text-lg text-foreground mb-6">Configuração de Macros</h2>

            {/* TMB selector */}
            <div className="mb-6">
              <label className="text-sm text-muted-foreground font-body uppercase tracking-wider mb-2 block">TMB Utilizada</label>
              <div className="flex gap-0">
                <button
                  type="button"
                  onClick={() => setTmbMetodo("mifflin")}
                  className={`flex-1 py-3 px-4 font-heading text-sm uppercase tracking-widest transition-colors duration-200 ${
                    tmbMetodo === "mifflin" ? "toggle-active" : "toggle-inactive"
                  }`}
                >
                  Mifflin-St Jeor
                  {computed.tmbMifflin && <span className="block text-xs font-body normal-case tracking-normal mt-1 opacity-70">{Math.round(computed.tmbMifflin)} kcal</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setTmbMetodo("katch")}
                  disabled={!computed.tmbKatch}
                  className={`flex-1 py-3 px-4 font-heading text-sm uppercase tracking-widest transition-colors duration-200 ${
                    tmbMetodo === "katch" ? "toggle-active" : "toggle-inactive"
                  } ${!computed.tmbKatch ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  Katch-McArdle
                  {computed.tmbKatch ? (
                    <span className="block text-xs font-body normal-case tracking-normal mt-1 opacity-70">{Math.round(computed.tmbKatch)} kcal</span>
                  ) : (
                    <span className="block text-xs font-body normal-case tracking-normal mt-1 opacity-50">Preencha as dobras</span>
                  )}
                </button>
              </div>
            </div>

            {/* Activity level selector */}
            <div className="mb-6">
              <label className="text-sm text-muted-foreground font-body uppercase tracking-wider mb-2 block">Nível de Atividade</label>
              <div className="space-y-0">
                {levels.map((l) => {
                  const isSelected = nivelAtividade === l.factor;
                  return (
                    <div
                      key={l.factor}
                      onClick={() => setNivelAtividade(l.factor)}
                      className={`flex items-center justify-between py-3 px-2 border-b border-muted-foreground/30 cursor-pointer transition-colors duration-200 hover:bg-muted/20 ${
                        isSelected ? "bg-primary/10 border-primary/50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-200 ${
                          isSelected ? "bg-primary" : "bg-muted-foreground/30"
                        }`} />
                        <span className="font-body text-sm text-foreground/80">{l.label}</span>
                        <span className="text-xs text-muted-foreground">×{l.factor}</span>
                      </div>
                      {baseTmb && (
                        <div className="flex items-baseline gap-2">
                          <span className={`font-heading text-lg ${isSelected ? "text-primary" : "text-foreground"}`}>
                            {Math.round(baseTmb * l.factor)}
                          </span>
                          <span className="text-xs text-muted-foreground">kcal</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Calorie target with adjustment */}
            {baseCalories && (
              <div className="result-card border-primary/50 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-1">Meta calórica</p>
                    <p className="font-heading text-4xl sm:text-5xl text-primary">
                      {totalCalories}
                      <span className="text-lg text-muted-foreground ml-2">kcal/dia</span>
                    </p>
                    {ajusteCalorico !== 0 && (
                      <p className="text-sm text-muted-foreground font-body mt-2">
                        {baseCalories} <span className="text-muted-foreground/60">(base)</span>
                        {" "}{ajusteCalorico >= 0 ? "+" : "−"} {Math.abs(ajusteCalorico)} <span className="text-muted-foreground/60">(ajuste)</span>
                        {" "}= <span className="text-foreground font-heading">{totalCalories}</span> kcal/dia
                      </p>
                    )}
                  </div>
                  <div className="sm:w-48 shrink-0">
                    <label className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-2 block">
                      Ajuste (kcal)
                    </label>
                    <div className="flex items-center gap-0">
                      <button
                        type="button"
                        onClick={() => setAjusteCalorico(v => v - 50)}
                        className="h-10 w-10 flex items-center justify-center bg-secondary text-foreground font-heading text-lg hover:bg-muted transition-colors duration-200 shrink-0"
                      >−</button>
                      <input
                        type="number"
                        value={ajusteCalorico}
                        onChange={(e) => setAjusteCalorico(parseInt(e.target.value) || 0)}
                        className="h-10 w-full bg-transparent border-b border-t border-muted-foreground text-center text-foreground font-heading text-lg outline-none focus:border-primary transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setAjusteCalorico(v => v + 50)}
                        className="h-10 w-10 flex items-center justify-center bg-secondary text-foreground font-heading text-lg hover:bg-muted transition-colors duration-200 shrink-0"
                      >+</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Protein & fat config */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <InputField label="Multiplicador Proteína" unit="g/kg" value={proteinMult} onChange={setProteinMult} placeholder="2.2" />
              <InputField label="% Gordura" unit="%" value={fatPct} onChange={setFatPct} placeholder="15" />
            </div>
          </section>
          </>)}

          {/* Plano & Cobrança = ESPELHO só-leitura (edita-se no popup "Cobrança" da tela Cobrança, 13/09/2026) */}
          {configTab === "plano" && <PlanoCobrancaAluno userId={userId} modo="espelho" />}

          {/* Configuração do aluno (18/09/2026): descanso, nº de séries e cadeado — "Personalizada" leva pra aba Treino */}
          {configTab === "config" && <ConfiguracaoAluno userId={userId} onIrParaTreino={() => setConfigTab("treino")} />}

          {configTab === "dobras" && (<>
          {/* Toggle edição manual */}
          <section className="section-divider pt-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg text-foreground">Permitir edição manual</h2>
                <p className="text-xs text-muted-foreground font-body mt-1">Liberar ajuste calórico pelo usuário</p>
              </div>
              <button
                onClick={() => setAdminLocked(!adminLocked)}
                className={`w-12 h-6 rounded-full transition-colors duration-200 ${adminLocked ? "bg-muted" : "bg-primary"}`}
              >
                <div className={`w-5 h-5 rounded-full bg-foreground transition-transform duration-200 ${adminLocked ? "translate-x-0.5" : "translate-x-6"}`} />
              </button>
            </div>
          </section>

          {/* Observação da avaliação */}
          <section className="section-divider pt-10">
            <h2 className="font-heading text-lg text-foreground mb-6">Observação da Avaliação</h2>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Nota (opcional)</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="input-underline"
                placeholder="Ex: Início do protocolo, Reavaliação 30 dias..."
              />
              <p className="text-xs text-muted-foreground font-body mt-1">Será registrada junto com a avaliação ao salvar</p>
            </div>
          </section>
          </>)}

          {/* Evolução do aluno (mesma visão do app do aluno; excluir reflete pra ele) */}
          {configTab === "evolucao" && (
            <section>
              <EvolutionSection userId={userId} isAdmin />
            </section>
          )}

          {/* Registros fotográficos mensais (auto-salva; reflete no app do aluno) */}
          {configTab === "registros" && <AdminRegistrosFotos userId={userId} />}

          {/* Treino Diário (auto-salva) */}
          {configTab === "treino" && <AdminSemanaUsuario userId={userId} />}

          {/* Histórico de treinos do aluno: mesma lista da aba "Histórico de Treinos" do painel, presa neste aluno (filtro mês/ano) */}
          {configTab === "historico" && <AdminHistoricoMes userId={userId} />}

          {/* Save button */}
          {!TABS_SEM_SALVAR.has(configTab) && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default AdminUserConfig;
