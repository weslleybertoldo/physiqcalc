import { useState, useEffect, useMemo } from "react";
import { formatarDataCurta } from "@/utils/formatDate";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot,
} from "recharts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MEDIDA_FIELDS, MEDIDA_LOWER_BETTER, MEDIDA_GROUPS, type MedidaKey } from "@/lib/medidas";

interface Avaliacao {
  id: string;
  data_avaliacao: string;
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
  observacao: string | null;
  created_by: string | null;
  [key: string]: any; // for medida_ fields
}

interface Props {
  userId: string;
  isAdmin?: boolean;
}

type MetricKey = "percentual_gordura" | "peso" | "massa_magra" | "massa_gorda" | "tmb_mifflin" | MedidaKey;

const BASE_METRIC_LABELS: Record<string, string> = {
  percentual_gordura: "% Gordura",
  peso: "Peso (kg)",
  massa_magra: "M. Magra (kg)",
  massa_gorda: "M. Gorda (kg)",
  tmb_mifflin: "TMB (kcal)",
};

// Build full labels map including medidas
const METRIC_LABELS: Record<string, string> = { ...BASE_METRIC_LABELS };
MEDIDA_FIELDS.forEach(f => { METRIC_LABELS[f.key] = `${f.label} (cm)`; });

const BASE_LOWER_BETTER = ["percentual_gordura", "massa_gorda"];
const ALL_LOWER_BETTER = [...BASE_LOWER_BETTER, ...MEDIDA_LOWER_BETTER];

// Metrics where increase is good (muscle measurements)
const INCREASE_IS_GOOD: string[] = MEDIDA_FIELDS
  .filter(f => !MEDIDA_LOWER_BETTER.includes(f.key))
  .map(f => f.key);

function formatDate(d: string) {
  return formatarDataCurta(d);
}

function VariationBadge({ current, previous, metric }: { current: number | null; previous: number | null; metric: string }) {
  if (current === null || previous === null) return <span className="text-muted-foreground">—</span>;
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) return <span className="text-muted-foreground flex items-center gap-1"><Minus size={12} /> —</span>;

  const lowerBetter = ALL_LOWER_BETTER.includes(metric);
  const isGood = lowerBetter ? diff < 0 : diff > 0;
  const color = isGood ? "text-classify-green" : "text-destructive";
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  const sign = diff > 0 ? "+" : "";
  const isMedida = metric.startsWith("medida_");
  const unit = metric === "percentual_gordura" ? "%" : metric === "tmb_mifflin" ? " kcal" : isMedida ? " cm" : " kg";

  return (
    <span className={`flex items-center gap-1 text-xs font-heading ${color}`}>
      <Icon size={12} /> {sign}{diff.toFixed(1)}{unit}
    </span>
  );
}

const BASE_METRICS = ["percentual_gordura", "peso", "massa_magra", "massa_gorda", "tmb_mifflin"];
const CHART_MEDIDA_KEYS = [
  "medida_cintura", "medida_abdomen", "medida_quadril",
  "medida_braco_d", "medida_braco_e",
  "medida_coxa_d", "medida_coxa_e",
  "medida_panturrilha_d", "medida_panturrilha_e",
];

const EvolutionSection = ({ userId, isAdmin = false }: Props) => {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<string>("percentual_gordura");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [formData, setFormData] = useState<Record<string, string>>({
    data_avaliacao: (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`; })(),
    peso: "", altura: "", dobra_1: "", dobra_2: "", dobra_3: "", observacao: "",
    ...Object.fromEntries(MEDIDA_FIELDS.map(f => [f.key, ""])),
  });

  const loadAvaliacoes = async () => {
    try {
      if (isAdmin) {
        const { data, error } = await supabase.functions.invoke("admin-avaliacoes", {
          body: { action: "list", userId },
        });
        if (error) console.error("[EvolutionSection] Erro admin:", error);
        if (data?.avaliacoes) setAvaliacoes(data.avaliacoes);
      } else {
        const { data, error } = await supabase
          .from("physiq_avaliacoes")
          .select("*")
          .eq("user_id", userId)
          .order("data_avaliacao", { ascending: true })
          .limit(200);
        if (error) console.error("[EvolutionSection] Erro:", error);
        if (data) setAvaliacoes(data as unknown as Avaliacao[]);
      }
    } catch (err) {
      console.error("[EvolutionSection] Erro inesperado:", err);
    }
    setLoading(false);
  };

  useEffect(() => { loadAvaliacoes(); }, [userId]);

  const handleCreateManual = async () => {
    const avaliacao: Record<string, any> = {
      data_avaliacao: formData.data_avaliacao,
      peso: parseFloat(formData.peso) || null,
      altura: parseFloat(formData.altura) || null,
      dobra_1: parseFloat(formData.dobra_1) || null,
      dobra_2: parseFloat(formData.dobra_2) || null,
      dobra_3: parseFloat(formData.dobra_3) || null,
      observacao: formData.observacao || null,
    };
    MEDIDA_FIELDS.forEach(f => { avaliacao[f.key] = parseFloat(formData[f.key]) || null; });

    await supabase.functions.invoke("admin-avaliacoes", {
      body: { action: "create", userId, avaliacao },
    });
    setDialogOpen(false);
    setFormData({
      data_avaliacao: (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`; })(),
      peso: "", altura: "", dobra_1: "", dobra_2: "", dobra_3: "", observacao: "",
      ...Object.fromEntries(MEDIDA_FIELDS.map(f => [f.key, ""])),
    });
    loadAvaliacoes();
  };

  const handleDelete = async (id: string) => {
    await supabase.functions.invoke("admin-avaliacoes", { body: { action: "delete", avaliacaoId: id } });
    loadAvaliacoes();
  };

  const chartData = useMemo(() => {
    return avaliacoes.map((a) => ({
      date: formatDate(a.data_avaliacao),
      value: a[selectedMetric] != null ? Number(a[selectedMetric]) : null,
    })).filter((d) => d.value !== null);
  }, [avaliacoes, selectedMetric]);

  const comparison = useMemo(() => {
    if (avaliacoes.length < 2) return null;
    const first = avaliacoes[0];
    const last = avaliacoes[avaliacoes.length - 1];
    const metrics = ["peso", "percentual_gordura", "massa_magra", "massa_gorda", ...MEDIDA_FIELDS.map(f => f.key)];
    return metrics.map((m) => ({
      metric: m,
      label: METRIC_LABELS[m] || m,
      first: first[m] != null ? Number(first[m]) : null,
      last: last[m] != null ? Number(last[m]) : null,
    })).filter(r => r.first !== null || r.last !== null);
  }, [avaliacoes]);

  const reversed = useMemo(() => [...avaliacoes].reverse(), [avaliacoes]);

  // Check which medidas have any data in avaliacoes
  const activeMedidas = useMemo(() => {
    return MEDIDA_FIELDS.filter(f =>
      avaliacoes.some(a => a[f.key] != null)
    );
  }, [avaliacoes]);

  if (loading) return <p className="text-muted-foreground font-body py-8">Carregando evolução...</p>;

  return (
    <div className="space-y-10">
      {isAdmin && (
        <button
          onClick={() => setDialogOpen(true)}
          className="w-full result-card border-primary/50 flex items-center gap-4 hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <Plus size={24} className="text-primary shrink-0" />
          <div className="text-left">
            <p className="font-heading text-lg text-foreground">Registrar Avaliação</p>
            <p className="text-xs text-muted-foreground font-body">Adicionar avaliação manual com data retroativa</p>
          </div>
        </button>
      )}

      {avaliacoes.length === 0 ? (
        <div className="result-card border-muted-foreground/30">
          <p className="text-sm text-muted-foreground font-body">Nenhuma avaliação registrada ainda.</p>
        </div>
      ) : (
        <>
          {/* Timeline */}
          <section>
            <h2 className="font-heading text-lg text-foreground mb-6">Linha do Tempo</h2>
            <div className="space-y-0">
              {reversed.map((a, idx) => {
                const prevIdx = avaliacoes.length - 1 - idx - 1;
                const prev = prevIdx >= 0 ? avaliacoes[prevIdx] : null;
                return (
                  <div key={a.id} className="py-4 border-b border-muted-foreground/30">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-heading text-sm text-primary">{formatDate(a.data_avaliacao)}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mt-2">
                          <TimelineField label="Peso" value={a.peso} unit="kg" prev={prev?.peso} metric="peso" />
                          <TimelineField label="% Gordura" value={a.percentual_gordura} unit="%" prev={prev?.percentual_gordura} metric="percentual_gordura" />
                          <TimelineField label="M. Gorda" value={a.massa_gorda} unit="kg" prev={prev?.massa_gorda} metric="massa_gorda" />
                          <TimelineField label="M. Magra" value={a.massa_magra} unit="kg" prev={prev?.massa_magra} metric="massa_magra" />
                        </div>
                        {/* Medidas in timeline */}
                        {activeMedidas.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mt-2">
                            {activeMedidas.map(f => (
                              a[f.key] != null ? (
                                <TimelineField key={f.key} label={f.label} value={a[f.key]} unit="cm" prev={prev?.[f.key]} metric={f.key} />
                              ) : null
                            ))}
                          </div>
                        )}
                        {a.observacao && (
                          <p className="text-xs text-muted-foreground font-body mt-2 italic">"{a.observacao}"</p>
                        )}
                      </div>
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button title="Excluir" className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                              <Trash2 size={14} />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-background border-muted-foreground/30">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-heading text-foreground">Excluir avaliação?</AlertDialogTitle>
                              <AlertDialogDescription className="font-body">
                                Avaliação de {formatDate(a.data_avaliacao)} será removida permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-muted-foreground/30 text-foreground">Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Charts */}
          {chartData.length >= 2 && (
            <section>
              <h2 className="font-heading text-lg text-foreground mb-4">Gráficos de Evolução</h2>
              <div className="flex flex-wrap gap-2 mb-6">
                {[...BASE_METRICS, ...CHART_MEDIDA_KEYS].map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedMetric(key)}
                    className={`px-3 py-1.5 text-xs font-heading uppercase tracking-wider transition-colors duration-200 ${
                      selectedMetric === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {METRIC_LABELS[key]}
                  </button>
                ))}
              </div>
              <div className="result-card" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.15)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--muted-foreground) / 0.3)",
                        fontSize: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--primary))" }} name={METRIC_LABELS[selectedMetric]} />
                    {chartData.length > 0 && (
                      <ReferenceDot
                        x={chartData[chartData.length - 1].date}
                        y={chartData[chartData.length - 1].value!}
                        r={7}
                        fill="hsl(var(--primary))"
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Comparison */}
          {comparison && (
            <section>
              <h2 className="font-heading text-lg text-foreground mb-4">Resumo Comparativo</h2>
              <p className="text-xs text-muted-foreground font-body mb-4">
                {formatDate(avaliacoes[0].data_avaliacao)} → {formatDate(avaliacoes[avaliacoes.length - 1].data_avaliacao)}
              </p>
              <div className="space-y-0">
                <div className="flex items-center py-3 border-b border-muted-foreground/30">
                  <span className="flex-1 text-xs uppercase tracking-wider text-muted-foreground font-heading">Métrica</span>
                  <span className="w-24 text-right text-xs uppercase tracking-wider text-muted-foreground font-heading">Primeira</span>
                  <span className="w-24 text-right text-xs uppercase tracking-wider text-muted-foreground font-heading">Última</span>
                  <span className="w-28 text-right text-xs uppercase tracking-wider text-muted-foreground font-heading">Variação</span>
                </div>
                {comparison.map((row) => (
                  <div key={row.metric} className="flex items-center py-3 border-b border-muted-foreground/30">
                    <span className="flex-1 text-sm text-foreground font-body">{row.label}</span>
                    <span className="w-24 text-right font-heading text-foreground text-sm">
                      {row.first !== null ? row.first.toFixed(1) : "—"}
                    </span>
                    <span className="w-24 text-right font-heading text-foreground text-sm">
                      {row.last !== null ? row.last.toFixed(1) : "—"}
                    </span>
                    <span className="w-28 flex justify-end">
                      <VariationBadge current={row.last} previous={row.first} metric={row.metric} />
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Manual avaliacao dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-background border-muted-foreground/30 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Registrar Avaliação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Data</label>
              <input type="date" value={formData.data_avaliacao} onChange={(e) => setFormData(f => ({ ...f, data_avaliacao: e.target.value }))} className="input-underline" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Peso (kg)" field="peso" formData={formData} setFormData={setFormData} />
              <FormField label="Altura (cm)" field="altura" formData={formData} setFormData={setFormData} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Dobra 1" field="dobra_1" formData={formData} setFormData={setFormData} />
              <FormField label="Dobra 2" field="dobra_2" formData={formData} setFormData={setFormData} />
              <FormField label="Dobra 3" field="dobra_3" formData={formData} setFormData={setFormData} />
            </div>

            {/* Medidas */}
            {MEDIDA_GROUPS.map(group => (
              <div key={group.key}>
                <p className="text-sm text-muted-foreground font-body uppercase tracking-wider mb-2 mt-4">{group.label} (cm)</p>
                <div className="grid grid-cols-2 gap-4">
                  {MEDIDA_FIELDS.filter(f => f.group === group.key).map(f => (
                    <FormField key={f.key} label={f.label} field={f.key} formData={formData} setFormData={setFormData} />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Observação</label>
              <input type="text" value={formData.observacao} onChange={(e) => setFormData(f => ({ ...f, observacao: e.target.value }))} className="input-underline" placeholder="Ex: Início do protocolo" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setDialogOpen(false)} className="px-4 py-2 text-sm font-heading uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={handleCreateManual} className="px-6 py-2 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors">Registrar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function TimelineField({ label, value, unit, prev, metric }: { label: string; value: any; unit: string; prev: any; metric: string }) {
  const v = value != null ? Number(value) : null;
  const p = prev != null ? Number(prev) : null;
  return (
    <div>
      <span className="text-xs text-muted-foreground font-body">{label}</span>
      <p className="font-heading text-sm text-foreground">
        {v !== null ? `${v.toFixed(1)} ${unit}` : "—"}
      </p>
      {p !== null && v !== null && <VariationBadge current={v} previous={p} metric={metric} />}
    </div>
  );
}

function FormField({ label, field, formData, setFormData }: { label: string; field: string; formData: Record<string, string>; setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>> }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">{label}</label>
      <input type="number" value={formData[field] || ""} onChange={(e) => setFormData(f => ({ ...f, [field]: e.target.value }))} className="input-underline" />
    </div>
  );
}

export default EvolutionSection;
