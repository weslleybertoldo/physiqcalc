import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Edit2, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminRelatorio from "./AdminRelatorio";

interface Exercicio {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
}

interface GrupoTreino {
  id: string;
  nome: string;
}

interface GrupoExercicio {
  exercicio_id: string;
  ordem: number;
}

interface SemanaConfig {
  dia_semana: string;
  grupo_id: string | null;
}

interface Props {
  onBack: () => void;
}

const DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];
const DIAS_LABEL: Record<string, string> = {
  SEG: "Segunda", TER: "Terça", QUA: "Quarta", QUI: "Quinta", SEX: "Sexta", SAB: "Sábado", DOM: "Domingo",
};

interface GrupoMuscular {
  id: string;
  nome: string;
}

const AdminTreinos = ({ onBack }: Props) => {
  const [tab, setTab] = useState<"semana" | "grupos" | "biblioteca" | "relatorio">("semana");
  const [exercicios, setExercicios] = useState<Exercicio[]>([]);
  const [grupos, setGrupos] = useState<GrupoTreino[]>([]);
  const [semanaConfig, setSemanaConfig] = useState<SemanaConfig[]>([]);
  const [gruposExercicios, setGruposExercicios] = useState<Record<string, string[]>>({});
  const [gruposMusculares, setGruposMusculares] = useState<GrupoMuscular[]>([]);
  const [loading, setLoading] = useState(true);

  const [novoExNome, setNovoExNome] = useState("");
  const [novoExGrupo, setNovoExGrupo] = useState("");
  const [novoExEmoji, setNovoExEmoji] = useState("🏋️");
  const [novoExTipo, setNovoExTipo] = useState<"musculacao" | "corrida">("musculacao");
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const [editingGrupo, setEditingGrupo] = useState<string | null>(null);
  const [adicionandoMusculo, setAdicionandoMusculo] = useState(false);
  const [novoMusculo, setNovoMusculo] = useState("");
  const [editingExId, setEditingExId] = useState<string | null>(null);
  const [editExNome, setEditExNome] = useState("");
  const [editExGrupo, setEditExGrupo] = useState("");
  const [editExEmoji, setEditExEmoji] = useState("");
  const [users, setUsers] = useState<{ id: string; nome: string; email: string }[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [exRes, grRes, smRes, geRes, gmRes] = await Promise.all([
        supabase.from("tb_exercicios").select("*").order("nome"),
        supabase.from("tb_grupos_treino").select("*").order("nome"),
        supabase.from("tb_semana_treinos").select("dia_semana, grupo_id"),
        supabase.from("tb_grupos_exercicios").select("grupo_id, exercicio_id, ordem").order("ordem"),
        supabase.from("grupos_musculares").select("*").order("nome"),
      ]);

      if (exRes.error) throw exRes.error;
      if (grRes.error) throw grRes.error;

      setExercicios((exRes.data as Exercicio[]) || []);
      setGrupos((grRes.data as GrupoTreino[]) || []);
      setSemanaConfig((smRes.data as SemanaConfig[]) || []);
      setGruposMusculares((gmRes.data as GrupoMuscular[]) || []);

      if (gmRes.data && gmRes.data.length > 0 && !novoExGrupo) {
        setNovoExGrupo((gmRes.data[0] as GrupoMuscular).nome);
      }

      const map: Record<string, string[]> = {};
      ((geRes.data as any[]) || []).forEach((ge) => {
        if (!map[ge.grupo_id]) map[ge.grupo_id] = [];
        map[ge.grupo_id].push(ge.exercicio_id);
      });
      setGruposExercicios(map);
    } catch (err: any) {
      toast.error("Erro ao carregar dados: " + (err?.message || "tente novamente"));
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data } = await supabase.functions.invoke("admin-list-users");
      if (data?.users) setUsers(data.users.map((u: any) => ({ id: u.id, nome: u.nome || u.email, email: u.email })));
    } catch {
      toast.error("Erro ao carregar usuários.");
    }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (tab === "relatorio") loadUsers(); }, [tab]);

  // === Semana ===
  const handleSemanaChange = async (dia: string, grupoId: string | null) => {
    try {
      const { error } = await supabase.from("tb_semana_treinos").upsert(
        { dia_semana: dia, grupo_id: grupoId || null, updated_at: new Date().toISOString() },
        { onConflict: "dia_semana" }
      );
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      toast.error("Erro ao salvar semana: " + (err?.message || "tente novamente"));
    }
  };

  // === Biblioteca ===
  const handleAddExercicio = async () => {
    if (!novoExNome.trim()) return;
    try {
      const { error } = await supabase.from("tb_exercicios").insert({ nome: novoExNome.trim(), grupo_muscular: novoExGrupo, emoji: novoExEmoji, tipo: novoExTipo } as any);
      if (error) throw error;
      setNovoExNome("");
      toast.success("Exercício criado!");
      await loadData();
    } catch (err: any) {
      toast.error("Erro ao criar exercício: " + (err?.message || "tente novamente"));
    }
  };

  const handleDeleteExercicio = async (id: string) => {
    try {
      const { error } = await supabase.from("tb_exercicios").delete().eq("id", id);
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      toast.error("Erro ao excluir exercício: " + (err?.message || "tente novamente"));
    }
  };

  const handleEditExercicio = async () => {
    if (!editingExId || !editExNome.trim()) return;
    try {
      const { error } = await supabase.from("tb_exercicios").update({
        nome: editExNome.trim(), grupo_muscular: editExGrupo, emoji: editExEmoji,
      }).eq("id", editingExId);
      if (error) throw error;
      setEditingExId(null);
      toast.success("Exercício atualizado!");
      await loadData();
    } catch (err: any) {
      toast.error("Erro ao atualizar exercício: " + (err?.message || "tente novamente"));
    }
  };

  // === Grupos Musculares ===
  const handleExcluirGrupoMuscular = async (grupoId: string, grupoNome: string) => {
    if (!window.confirm(`Excluir o grupo "${grupoNome}"?\nExercícios vinculados não serão afetados.`)) return;
    try {
      const { error } = await supabase.from("grupos_musculares").delete().eq("id", grupoId);
      if (error) throw error;
      setGruposMusculares(prev => prev.filter(g => g.id !== grupoId));
      toast.success("Grupo muscular excluído.");
    } catch (err: any) {
      toast.error("Erro ao excluir grupo: " + (err?.message || "tente novamente"));
    }
  };

  const salvarNovoMusculo = async () => {
    const nome = novoMusculo.trim();
    if (!nome) return;
    try {
      const { data, error } = await supabase.from("grupos_musculares").insert({ nome }).select().single();
      if (error) {
        if (error.code === "23505") toast.error("Esse músculo já existe na lista.");
        else throw error;
        return;
      }
      setGruposMusculares(prev => [...prev, data as GrupoMuscular].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoExGrupo(nome);
      setNovoMusculo("");
      setAdicionandoMusculo(false);
      toast.success(`"${nome}" adicionado com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao salvar músculo: " + (err?.message || "tente novamente"));
    }
  };

  // === Grupos de Treino ===
  const handleAddGrupo = async () => {
    if (!novoGrupoNome.trim()) return;
    try {
      const { error } = await supabase.from("tb_grupos_treino").insert({ nome: novoGrupoNome.trim() });
      if (error) throw error;
      setNovoGrupoNome("");
      toast.success("Grupo criado!");
      await loadData();
    } catch (err: any) {
      toast.error("Erro ao criar grupo: " + (err?.message || "tente novamente"));
    }
  };

  const handleDeleteGrupo = async (id: string) => {
    try {
      const { error } = await supabase.from("tb_grupos_treino").delete().eq("id", id);
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      toast.error("Erro ao excluir grupo: " + (err?.message || "tente novamente"));
    }
  };

  const handleToggleExercicioInGrupo = async (grupoId: string, exercicioId: string) => {
    const current = gruposExercicios[grupoId] || [];
    try {
      if (current.includes(exercicioId)) {
        const { error } = await supabase.from("tb_grupos_exercicios").delete().eq("grupo_id", grupoId).eq("exercicio_id", exercicioId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tb_grupos_exercicios").insert({ grupo_id: grupoId, exercicio_id: exercicioId, ordem: current.length });
        if (error) throw error;
      }
      await loadData();
    } catch (err: any) {
      toast.error("Erro ao atualizar grupo: " + (err?.message || "tente novamente"));
    }
  };

  const tabs = [
    { key: "semana" as const, label: "📅 Semana" },
    { key: "grupos" as const, label: "🗂️ Grupos" },
    { key: "biblioteca" as const, label: "📚 Biblioteca" },
    { key: "relatorio" as const, label: "📊 Relatório" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-5 sm:px-8">
        <header className="pt-12 sm:pt-20 pb-4 flex items-center gap-4">
          <button type="button" onClick={onBack} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-heading text-2xl text-foreground">Gerenciar Treinos</h1>
            <p className="text-xs text-muted-foreground font-body">Configuração de exercícios, grupos e semana</p>
          </div>
        </header>

        <div className="flex border-b border-muted-foreground/30 mb-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`py-3 px-3 mr-2 font-heading text-xs uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${
                tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-muted-foreground font-body">Carregando...</p>
        ) : tab === "semana" ? (
          <div className="space-y-3">
            {DIAS.map((dia) => {
              const config = semanaConfig.find((s) => s.dia_semana === dia);
              return (
                <div key={dia} className="flex items-center gap-4 py-3 border-b border-muted-foreground/20">
                  <span className="font-heading text-sm text-foreground w-20">{DIAS_LABEL[dia]}</span>
                  <select
                    value={config?.grupo_id || ""}
                    onChange={(e) => handleSemanaChange(dia, e.target.value || null)}
                    className="flex-1 bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-2 outline-none focus:border-primary transition-colors"
                  >
                    <option value="">— Descanso —</option>
                    {grupos.map((g) => (
                      <option key={g.id} value={g.id}>{g.nome}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        ) : tab === "grupos" ? (
          <div className="space-y-6">
            <div className="flex gap-2">
              <input type="text" value={novoGrupoNome} onChange={(e) => setNovoGrupoNome(e.target.value)} placeholder="Nome do novo grupo..." className="input-underline flex-1" />
              <button type="button" onClick={handleAddGrupo} className="px-4 py-2 bg-primary text-primary-foreground font-heading text-xs uppercase">
                <Plus size={14} className="inline mr-1" /> Criar
              </button>
            </div>
            {grupos.map((g) => {
              const isEditing = editingGrupo === g.id;
              const exIds = gruposExercicios[g.id] || [];
              return (
                <div key={g.id} className="result-card border-muted-foreground/20">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-heading text-foreground">{g.nome}</p>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setEditingGrupo(isEditing ? null : g.id)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors">
                        {isEditing ? <X size={14} /> : <Edit2 size={14} />}
                      </button>
                      <button type="button" onClick={() => handleDeleteGrupo(g.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {isEditing ? (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {exercicios.map((ex) => (
                        <label key={ex.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input type="checkbox" checked={exIds.includes(ex.id)} onChange={() => handleToggleExercicioInGrupo(g.id, ex.id)} className="accent-primary" />
                          <span className="text-sm font-body text-foreground">{ex.emoji} {ex.nome}</span>
                          <span className="text-[10px] text-muted-foreground font-body ml-auto">{ex.grupo_muscular}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {exIds.length === 0 ? (
                        <span className="text-xs text-muted-foreground font-body">Nenhum exercício</span>
                      ) : (
                        exIds.map((eid) => {
                          const ex = exercicios.find((e) => e.id === eid);
                          return ex ? (
                            <span key={eid} className="text-xs bg-secondary text-foreground px-2 py-1 font-body">{ex.emoji} {ex.nome}</span>
                          ) : null;
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : tab === "biblioteca" ? (
          <div className="space-y-6">
            <div className="result-card border-primary/30 space-y-3">
              <p className="font-heading text-sm text-foreground">Novo Exercício</p>
              <input type="text" value={novoExNome} onChange={(e) => setNovoExNome(e.target.value)} placeholder="Nome do exercício..." className="input-underline" />
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <select value={novoExGrupo} onChange={(e) => setNovoExGrupo(e.target.value)} className="w-full bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-2 outline-none focus:border-primary">
                    <option value="">Selecionar...</option>
                    {gruposMusculares.map((g) => (<option key={g.id} value={g.nome}>{g.nome}</option>))}
                  </select>
                </div>
                {!adicionandoMusculo ? (
                  <button type="button" onClick={() => setAdicionandoMusculo(true)} className="px-3 py-2 border border-muted-foreground/20 rounded text-[10px] font-bold uppercase tracking-wider text-primary hover:border-primary transition-colors whitespace-nowrap">
                    + Músculo
                  </button>
                ) : (
                  <div className="flex gap-2 items-end flex-1">
                    <input autoFocus value={novoMusculo} onChange={e => setNovoMusculo(e.target.value)} onKeyDown={e => e.key === "Enter" && salvarNovoMusculo()} placeholder="ex: Trapézio Médio" className="flex-1 bg-transparent border-b border-primary py-2 text-foreground text-sm outline-none" />
                    <button type="button" onClick={salvarNovoMusculo} disabled={!novoMusculo.trim()} className="px-3 py-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded disabled:opacity-40">Salvar</button>
                    <button type="button" onClick={() => { setAdicionandoMusculo(false); setNovoMusculo(""); }} className="px-3 py-2 border border-muted-foreground/20 text-muted-foreground text-[10px] font-bold uppercase rounded">✕</button>
                  </div>
                )}
                <input type="text" value={novoExEmoji} onChange={(e) => setNovoExEmoji(e.target.value)} className="w-16 bg-transparent border-b border-muted-foreground text-center text-foreground font-body text-lg py-1 outline-none focus:border-primary" />
              <select value={novoExTipo} onChange={(e) => setNovoExTipo(e.target.value as "musculacao" | "corrida")} className="bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-1 outline-none focus:border-primary">
                <option value="musculacao">💪 Musculação</option>
                <option value="corrida">🏃 Corrida</option>
              </select>
              </div>
              <button type="button" onClick={handleAddExercicio} className="px-4 py-2 bg-primary text-primary-foreground font-heading text-xs uppercase">
                <Plus size={14} className="inline mr-1" /> Criar Exercício
              </button>
            </div>

            {gruposMusculares.length > 0 && (
              <div className="result-card border-muted-foreground/20 space-y-1">
                <p className="font-heading text-sm text-foreground mb-2">Grupos Musculares</p>
                {gruposMusculares.map((g) => (
                  <div key={g.id} className="flex items-center justify-between py-1.5 border-b border-muted-foreground/10 last:border-0">
                    <span className="text-sm font-body text-foreground">{g.nome}</span>
                    <button type="button" onClick={() => handleExcluirGrupoMuscular(g.id, g.nome)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Excluir grupo muscular">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-0">
              {exercicios.map((ex) => (
                <div key={ex.id} className="py-3 border-b border-muted-foreground/20">
                  {editingExId === ex.id ? (
                    <div className="space-y-2">
                      <input type="text" value={editExNome} onChange={(e) => setEditExNome(e.target.value)} className="input-underline text-sm" placeholder="Nome" />
                      <div className="flex gap-2">
                        <select value={editExGrupo} onChange={(e) => setEditExGrupo(e.target.value)} className="flex-1 bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-1 outline-none focus:border-primary">
                          {gruposMusculares.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}
                        </select>
                        <select value={editExEmoji} onChange={(e) => setEditExEmoji(e.target.value)} className="w-16 bg-transparent border-b border-muted-foreground text-center text-lg py-1 outline-none focus:border-primary">
                          {["🏋️", "💪", "🦵", "🧘", "🔵"].map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={handleEditExercicio} className="px-3 py-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase"><Save size={12} className="inline mr-1" />Salvar</button>
                        <button type="button" onClick={() => setEditingExId(null)} className="px-3 py-1.5 text-muted-foreground font-heading text-xs uppercase"><X size={12} className="inline mr-1" />Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-lg">{ex.emoji}</span>
                        <div className="min-w-0">
                          <p className="font-heading text-sm text-foreground truncate">{ex.nome}</p>
                          <p className="text-[10px] text-muted-foreground font-body">{ex.grupo_muscular}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => { setEditingExId(ex.id); setEditExNome(ex.nome); setEditExGrupo(ex.grupo_muscular); setEditExEmoji(ex.emoji); }} className="p-1.5 text-muted-foreground hover:text-primary transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" onClick={() => handleDeleteExercicio(ex.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AdminRelatorio users={users} />
        )}

        <footer className="py-12 text-center">
          <p className="text-xs text-muted-foreground font-body italic">By Weslley Bertoldo</p>
        </footer>
      </div>
    </div>
  );
};

export default AdminTreinos;
