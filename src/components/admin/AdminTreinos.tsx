import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronRight } from "lucide-react";
import { supabase, DB_SCHEMA } from "@/integrations/supabase/client";

// staging tem bucket próprio de mídias — upload não polui as fotos de produção
const BUCKET_EXERCICIOS = DB_SCHEMA === "staging" ? "exercicios-staging" : "exercicios";
import { toast } from "sonner";
import AdminRelatorio from "./AdminRelatorio";
import AdminHistoricoMes from "./AdminHistoricoMes";
import ModalExerciciosGrupoAdmin from "./ModalExerciciosGrupoAdmin";

interface Exercicio {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  imagem_url?: string | null;
  subgrupo?: string | null;
  dica?: string | null;
}

/** Emojis oferecidos no seletor de exercício (todos os já usados no catálogo) */
const EMOJIS_EXERCICIO = ["🏋️", "🏋️‍♂️", "💪", "🦵", "🍑", "🫁", "🔙", "🎯", "🧘", "🏃", "🏃‍♂️", "🔵"];

interface GrupoTreino {
  id: string;
  nome: string;
}

interface PastaTreino {
  id: string;
  nome: string;
}

interface Props {
  onBack: () => void;
}

interface GrupoMuscular {
  id: string;
  nome: string;
}

const AdminTreinos = ({ onBack }: Props) => {
  // sub-aba derivada da URL (?v=treinos&t=...) pra o reload (F5) manter a aba
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("t") as "grupos" | "biblioteca" | "historico" | "relatorio") || "grupos";
  const setTab = (t: "grupos" | "biblioteca" | "historico" | "relatorio") =>
    setSearchParams((prev) => { prev.set("v", "treinos"); prev.set("t", t); prev.delete("pasta"); return prev; }, { replace: true });
  // pasta aberta derivada da URL (?pasta=) — push mantém o "voltar" nativo
  const pastaParam = searchParams.get("pasta");
  const setPastaAberta = (id: string | null) =>
    setSearchParams((prev) => {
      prev.set("v", "treinos"); prev.set("t", "grupos");
      if (id) prev.set("pasta", id); else prev.delete("pasta");
      return prev;
    });
  const [exercicios, setExercicios] = useState<Exercicio[]>([]);
  const [grupos, setGrupos] = useState<GrupoTreino[]>([]);
  const [gruposExercicios, setGruposExercicios] = useState<Record<string, string[]>>({});
  const [gruposPerfis, setGruposPerfis] = useState<Record<string, string[]>>({});
  const [perfilAberto, setPerfilAberto] = useState<string | null>(null);
  const [gruposMusculares, setGruposMusculares] = useState<GrupoMuscular[]>([]);
  const [loading, setLoading] = useState(true);

  const [novoExNome, setNovoExNome] = useState("");
  const [novoExGrupo, setNovoExGrupo] = useState("");
  const [novoExEmoji, setNovoExEmoji] = useState("🏋️");
  const [novoExTipo, setNovoExTipo] = useState<"musculacao" | "corrida">("musculacao");
  const [novoExSubgrupo, setNovoExSubgrupo] = useState("");
  const [novoExDica, setNovoExDica] = useState("");
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const [editingGrupo, setEditingGrupo] = useState<string | null>(null);
  // popups da Biblioteca (criar exercício / grupos musculares / lista de exercícios)
  const [modalBiblioteca, setModalBiblioteca] = useState<null | "novo" | "musculos" | "exercicios">(null);
  // popup "pedir o nome" ao criar grupo/pasta na aba Grupos
  const [modalCriar, setModalCriar] = useState<null | "grupo" | "pasta">(null);
  const [pastas, setPastas] = useState<PastaTreino[]>([]);
  // pastas de cada grupo (N:N — um treino pode estar em várias pastas)
  const [pastasDoGrupo, setPastasDoGrupo] = useState<Record<string, string[]>>({});
  const [pastaDropdown, setPastaDropdown] = useState<string | null>(null);
  const [novaPastaNome, setNovaPastaNome] = useState("");
  const [editandoPasta, setEditandoPasta] = useState(false);
  const [editPastaNome, setEditPastaNome] = useState("");
  const [adicionandoMusculo, setAdicionandoMusculo] = useState(false);
  const [novoMusculo, setNovoMusculo] = useState("");
  const [editingExId, setEditingExId] = useState<string | null>(null);
  const [editExNome, setEditExNome] = useState("");
  const [editExGrupo, setEditExGrupo] = useState("");
  const [editExEmoji, setEditExEmoji] = useState("");
  const [editExSubgrupo, setEditExSubgrupo] = useState("");
  const [editExDica, setEditExDica] = useState("");
  const [editExImagemUrl, setEditExImagemUrl] = useState<string | null>(null);
  const [editExImagemFile, setEditExImagemFile] = useState<File | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [users, setUsers] = useState<{ id: string; nome: string; email: string }[]>([]);
  // pares grupo:exercício com gravação em andamento — 2 cliques no mesmo tick disparam 1 request
  const toggleEmAndamento = useRef<Set<string>>(new Set());

  // silent=true recarrega os dados sem trocar pra "Carregando..." (mantém a lista
  // montada e o scroll/posição) — usado nas ações pós-edição.
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [exRes, grRes, geRes, gmRes, perfRes, paRes, pgRes] = await Promise.all([
        supabase.from("tb_exercicios").select("*").order("nome"),
        supabase.from("tb_grupos_treino").select("*").order("nome"),
        supabase.from("tb_grupos_exercicios").select("grupo_id, exercicio_id, ordem").order("ordem"),
        supabase.from("grupos_musculares").select("*").order("nome"),
        (supabase.from as any)("tb_grupos_treino_perfis").select("grupo_id, user_id"),
        (supabase.from as any)("tb_pastas_treino").select("id, nome").order("nome"),
        (supabase.from as any)("tb_pastas_treino_grupos").select("pasta_id, grupo_id"),
      ]);

      if (exRes.error) throw exRes.error;
      if (grRes.error) throw grRes.error;

      setExercicios((exRes.data as Exercicio[]) || []);
      setGrupos((grRes.data as GrupoTreino[]) || []);
      setPastas((paRes.data as PastaTreino[]) || []);
      const pgMap: Record<string, string[]> = {};
      ((pgRes.data as any[]) || []).forEach((v) => {
        (pgMap[v.grupo_id] ||= []).push(v.pasta_id);
      });
      setPastasDoGrupo(pgMap);
      setGruposMusculares((gmRes.data as GrupoMuscular[]) || []);

      if (gmRes.data && gmRes.data.length > 0 && !novoExGrupo) {
        setNovoExGrupo((gmRes.data[0] as GrupoMuscular).nome);
      }

      const map: Record<string, string[]> = {};
      ((geRes.data as any[]) || []).forEach((ge) => {
        if (!map[ge.grupo_id]) map[ge.grupo_id] = [];
        // linha duplicada do mesmo par grupo↔exercício aparece 1x (a remoção apaga todas)
        if (!map[ge.grupo_id].includes(ge.exercicio_id)) map[ge.grupo_id].push(ge.exercicio_id);
      });
      setGruposExercicios(map);
      const perfMap: Record<string, string[]> = {};
      ((perfRes.data as any[]) || []).forEach((p) => {
        if (!perfMap[p.grupo_id]) perfMap[p.grupo_id] = [];
        perfMap[p.grupo_id].push(p.user_id);
      });
      setGruposPerfis(perfMap);
    } catch (err: any) {
      toast.error("Erro ao carregar dados: " + (err?.message || "tente novamente"));
    } finally {
      if (!silent) setLoading(false);
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

  // ESC fecha popups (modais da Biblioteca e dropdown de pastas)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalBiblioteca(null);
        setModalCriar(null);
        setPastaDropdown(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (tab === "relatorio" || tab === "grupos" || tab === "historico") loadUsers(); }, [tab]);

  // === Biblioteca ===
  // Sobe a imagem/gif pro bucket publico 'exercicios' (escrita restrita a admin
  // pela policy). Cache de 1 ano no CDN (cacheControl) — seguro porque a URL gravada
  // leva ?v=<timestamp>: trocar a imagem muda a URL e o app busca a nova na hora.
  const uploadImagem = async (file: File, exId: string): Promise<string> => {
    if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem ou gif");
    if (file.size > 5 * 1024 * 1024) throw new Error("Imagem maior que 5MB");
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${exId}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_EXERCICIOS).upload(path, file, { upsert: true, contentType: file.type, cacheControl: "31536000" });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET_EXERCICIOS).getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  };

  const handleAddExercicio = async () => {
    if (!novoExNome.trim()) return;
    try {
      const { error } = await supabase.from("tb_exercicios").insert({
        nome: novoExNome.trim(), grupo_muscular: novoExGrupo, emoji: novoExEmoji, tipo: novoExTipo,
        subgrupo: novoExSubgrupo.trim() || null, dica: novoExDica.trim() || null,
      } as any);
      if (error) throw error;
      setNovoExNome(""); setNovoExSubgrupo(""); setNovoExDica("");
      setModalBiblioteca(null);
      toast.success("Exercício criado! Edite-o para adicionar a foto/gif.");
      await loadData(true);
    } catch (err: any) {
      toast.error("Erro ao criar exercício: " + (err?.message || "tente novamente"));
    }
  };

  const handleDeleteExercicio = async (id: string) => {
    try {
      const { error } = await supabase.from("tb_exercicios").delete().eq("id", id);
      if (error) throw error;
      toast.success("Exercício excluído.");
      await loadData(true);
    } catch (err: any) {
      toast.error("Erro ao excluir exercício: " + (err?.message || "tente novamente"));
    }
  };

  const handleEditExercicio = async () => {
    if (!editingExId || !editExNome.trim()) return;
    try {
      setUploadingImg(true);
      let imagem_url = editExImagemUrl;
      if (editExImagemFile) imagem_url = await uploadImagem(editExImagemFile, editingExId);
      const { error } = await supabase.from("tb_exercicios").update({
        nome: editExNome.trim(), grupo_muscular: editExGrupo, emoji: editExEmoji,
        subgrupo: editExSubgrupo.trim() || null, dica: editExDica.trim() || null,
        imagem_url: imagem_url || null,
      } as any).eq("id", editingExId);
      if (error) throw error;
      setEditingExId(null);
      setEditExImagemFile(null);
      toast.success("Exercício atualizado!");
      await loadData(true);
    } catch (err: any) {
      toast.error("Erro ao atualizar exercício: " + (err?.message || "tente novamente"));
    } finally {
      setUploadingImg(false);
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
      setModalCriar(null);
      toast.success("Grupo criado!");
      await loadData(true);
    } catch (err: any) {
      toast.error("Erro ao criar grupo: " + (err?.message || "tente novamente"));
    }
  };

  const handleDeleteGrupo = async (id: string) => {
    try {
      const { error } = await supabase.from("tb_grupos_treino").delete().eq("id", id);
      if (error) throw error;
      toast.success("Grupo excluído.");
      await loadData(true);
    } catch (err: any) {
      toast.error("Erro ao excluir grupo: " + (err?.message || "tente novamente"));
    }
  };

  const handleToggleExercicioInGrupo = async (grupoId: string, exercicioId: string) => {
    const chave = `${grupoId}:${exercicioId}`;
    if (toggleEmAndamento.current.has(chave)) return;
    toggleEmAndamento.current.add(chave);
    const current = gruposExercicios[grupoId] || [];
    const removendo = current.includes(exercicioId);
    // otimista: o checkbox do popup e os chips do card respondem na hora (sem recarregar tudo).
    // Idempotente: o 2º clique rápido enxerga o estado já atualizado e vira a operação inversa,
    // em vez de inserir o mesmo exercício 2x (bug do "Crucifixo Invertido" duplicado).
    setGruposExercicios((prev) => {
      const arr = (prev[grupoId] || []).filter((id) => id !== exercicioId);
      return { ...prev, [grupoId]: removendo ? arr : [...arr, exercicioId] };
    });
    try {
      if (removendo) {
        const { error } = await supabase.from("tb_grupos_exercicios").delete().eq("grupo_id", grupoId).eq("exercicio_id", exercicioId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tb_grupos_exercicios").insert({ grupo_id: grupoId, exercicio_id: exercicioId, ordem: current.length });
        if (error) throw error;
      }
      toast.success(removendo ? "Removido do treino." : "Adicionado ao treino.");
    } catch (err: any) {
      toast.error("Erro ao atualizar treino: " + (err?.message || "tente novamente"));
      await loadData(true); // reverte pro estado real do servidor
    } finally {
      toggleEmAndamento.current.delete(chave);
    }
  };

  const handleTogglePerfil = async (grupoId: string, userId: string) => {
    const isRemoving = (gruposPerfis[grupoId] || []).includes(userId);
    // atualização otimista (sem recarregar a página, mantém scroll/posição)
    setGruposPerfis((prev) => {
      const arr = prev[grupoId] || [];
      return { ...prev, [grupoId]: isRemoving ? arr.filter((id) => id !== userId) : [...arr, userId] };
    });
    try {
      if (isRemoving) {
        const { error } = await (supabase.from as any)("tb_grupos_treino_perfis")
          .delete().eq("grupo_id", grupoId).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("tb_grupos_treino_perfis")
          .insert({ grupo_id: grupoId, user_id: userId });
        if (error) throw error;
      }
      toast.success(isRemoving ? "Removido." : "Salvo.");
    } catch (err: any) {
      toast.error("Erro ao atualizar perfis: " + (err?.message || "tente novamente"));
      await loadData(); // reverte pro estado real do servidor
    }
  };

  // === Pastas de treinos ===
  const pastaAberta = pastas.find((p) => p.id === pastaParam) || null;

  const handleAddPasta = async () => {
    if (!novaPastaNome.trim()) return;
    try {
      const { error } = await (supabase.from as any)("tb_pastas_treino").insert({ nome: novaPastaNome.trim() });
      if (error) throw error;
      setNovaPastaNome("");
      setModalCriar(null);
      toast.success("Pasta criada!");
      await loadData(true);
    } catch (err: any) {
      toast.error("Erro ao criar pasta: " + (err?.message || "tente novamente"));
    }
  };

  const handleRenamePasta = async (id: string) => {
    if (!editPastaNome.trim()) return;
    try {
      const { error } = await (supabase.from as any)("tb_pastas_treino").update({ nome: editPastaNome.trim() }).eq("id", id);
      if (error) throw error;
      setEditandoPasta(false);
      toast.success("Pasta renomeada.");
      await loadData(true);
    } catch (err: any) {
      toast.error("Erro ao renomear pasta: " + (err?.message || "tente novamente"));
    }
  };

  const handleDeletePasta = async (id: string) => {
    if (!confirm("Excluir esta pasta? Os treinos dela NÃO são excluídos — voltam pra lista sem pasta.")) return;
    try {
      const { error } = await (supabase.from as any)("tb_pastas_treino").delete().eq("id", id);
      if (error) throw error;
      toast.success("Pasta excluída — treinos preservados.");
      setPastaAberta(null);
      await loadData(true);
    } catch (err: any) {
      toast.error("Erro ao excluir pasta: " + (err?.message || "tente novamente"));
    }
  };

  /** liga/desliga o vínculo grupo↔pasta (treino pode estar em várias pastas) */
  const handleTogglePastaGrupo = async (grupoId: string, pastaId: string) => {
    const atual = pastasDoGrupo[grupoId] || [];
    const removendo = atual.includes(pastaId);
    // otimista — mantém scroll/posição
    setPastasDoGrupo((prev) => ({
      ...prev,
      [grupoId]: removendo ? atual.filter((id) => id !== pastaId) : [...atual, pastaId],
    }));
    try {
      if (removendo) {
        const { error } = await (supabase.from as any)("tb_pastas_treino_grupos")
          .delete().eq("pasta_id", pastaId).eq("grupo_id", grupoId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("tb_pastas_treino_grupos")
          .insert({ pasta_id: pastaId, grupo_id: grupoId });
        if (error) throw error;
      }
      toast.success(removendo ? "Treino removido da pasta." : "Treino adicionado à pasta.");
    } catch (err: any) {
      toast.error("Erro ao atualizar pasta: " + (err?.message || "tente novamente"));
      await loadData(true);
    }
  };

  const tabs = [
    { key: "grupos" as const, label: "🗂️ Grupos" },
    { key: "biblioteca" as const, label: "📚 Biblioteca" },
    { key: "historico" as const, label: "🕒 Histórico de Treinos" },
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
            <p className="text-xs text-muted-foreground font-body">Configuração de exercícios e grupos</p>
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
        ) : tab === "grupos" ? (
          <div className="space-y-6">
            {!pastaAberta ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setModalCriar("grupo")} className="px-4 py-2 bg-primary text-primary-foreground font-heading text-xs uppercase">
                    <Plus size={14} className="inline mr-1" /> Criar grupo
                  </button>
                  <button type="button" onClick={() => setModalCriar("pasta")} className="px-4 py-2 border border-primary text-primary font-heading text-xs uppercase hover:bg-primary/10 transition-colors">
                    <Plus size={14} className="inline mr-1" /> Criar pasta
                  </button>
                </div>

                {modalCriar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setModalCriar(null)}>
                <div className="bg-background border border-border rounded-lg w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <p className="font-heading text-sm text-foreground">{modalCriar === "grupo" ? "Novo grupo de treino" : "Nova pasta"}</p>
                    <button type="button" onClick={() => setModalCriar(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={16} /></button>
                  </div>
                  {modalCriar === "grupo" ? (
                    <input autoFocus type="text" value={novoGrupoNome} onChange={(e) => setNovoGrupoNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddGrupo()} placeholder="Nome do novo grupo..." className="input-underline w-full" />
                  ) : (
                    <input autoFocus type="text" value={novaPastaNome} onChange={(e) => setNovaPastaNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddPasta()} placeholder="Nome da nova pasta... (ex: Treino mulher)" className="input-underline w-full" />
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={modalCriar === "grupo" ? handleAddGrupo : handleAddPasta} className="px-4 py-2 bg-primary text-primary-foreground font-heading text-xs uppercase">
                      <Plus size={14} className="inline mr-1" /> Criar
                    </button>
                    <button type="button" onClick={() => setModalCriar(null)} className="px-4 py-2 text-muted-foreground font-heading text-xs uppercase">Cancelar</button>
                  </div>
                </div>
                </div>
                )}
                {pastas.length > 0 && (
                  <div className="space-y-2">
                    {pastas.map((p) => {
                      const qtd = grupos.filter((g) => (pastasDoGrupo[g.id] || []).includes(p.id)).length;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPastaAberta(p.id)}
                          className="w-full flex items-center justify-between result-card border-muted-foreground/20 hover:border-primary transition-colors text-left"
                        >
                          <span className="font-heading text-foreground">📁 {p.nome}</span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground font-body">
                            {qtd} treino{qtd === 1 ? "" : "s"} <ChevronRight size={14} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {pastas.length > 0 && (
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Sem pasta</p>
                )}
              </>
            ) : (
              <>
                {/* ——— Dentro da pasta ——— */}
                <div className="result-card border-primary/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPastaAberta(null)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Voltar pras pastas">
                      <ArrowLeft size={16} />
                    </button>
                    {editandoPasta ? (
                      <>
                        <input autoFocus value={editPastaNome} onChange={(e) => setEditPastaNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRenamePasta(pastaAberta.id)} className="input-underline flex-1 font-heading" />
                        <button type="button" onClick={() => handleRenamePasta(pastaAberta.id)} className="p-1.5 text-primary" title="Salvar nome"><Save size={15} /></button>
                        <button type="button" onClick={() => setEditandoPasta(false)} className="p-1.5 text-muted-foreground" title="Cancelar"><X size={15} /></button>
                      </>
                    ) : (
                      <>
                        <p className="font-heading text-foreground flex-1">📁 {pastaAberta.nome}</p>
                        <button type="button" onClick={() => { setEditandoPasta(true); setEditPastaNome(pastaAberta.nome); }} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Renomear pasta">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" onClick={() => handleDeletePasta(pastaAberta.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Excluir pasta (treinos são preservados)">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                  <select
                    value=""
                    onChange={(e) => e.target.value && handleTogglePastaGrupo(e.target.value, pastaAberta.id)}
                    className="w-full bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-2 outline-none focus:border-primary"
                  >
                    <option value="" className="bg-background text-foreground">+ Adicionar treino a esta pasta...</option>
                    {grupos.filter((g) => !(pastasDoGrupo[g.id] || []).includes(pastaAberta.id)).map((g) => {
                      const outras = (pastasDoGrupo[g.id] || []).length;
                      return (
                        <option key={g.id} value={g.id} className="bg-background text-foreground">
                          {g.nome}{outras > 0 ? ` (em ${outras} pasta${outras > 1 ? "s" : ""})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </>
            )}
            {grupos.filter((g) => {
              const membros = pastasDoGrupo[g.id] || [];
              return pastaAberta ? membros.includes(pastaAberta.id) : membros.length === 0;
            }).map((g) => {
              const exIds = gruposExercicios[g.id] || [];
              return (
                <div key={g.id} className="result-card border-muted-foreground/20" data-admin-treino={g.id}>
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <p className="font-heading text-foreground flex-1 min-w-0 truncate">{g.nome}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {pastas.length > 0 && (() => {
                        const membros = pastasDoGrupo[g.id] || [];
                        const label =
                          membros.length === 0
                            ? "Sem pasta"
                            : membros.length === 1
                              ? pastas.find((p) => p.id === membros[0])?.nome ?? "1 pasta"
                              : `${membros.length} pastas`;
                        const abertoDp = pastaDropdown === g.id;
                        return (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setPastaDropdown(abertoDp ? null : g.id)}
                              className="max-w-[150px] flex items-center gap-1 border-b border-muted-foreground text-muted-foreground font-body text-xs py-1 hover:text-foreground transition-colors"
                              title="Pastas deste treino (pode estar em várias)"
                            >
                              <span className="truncate">📁 {label}</span>
                              <ChevronDown size={12} className="shrink-0" />
                            </button>
                            {abertoDp && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setPastaDropdown(null)} />
                                <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-background border border-border rounded-md p-2 shadow-lg space-y-1">
                                  {pastas.map((p) => (
                                    <label key={p.id} className="flex items-center gap-2 py-0.5 text-xs font-body text-foreground cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={membros.includes(p.id)}
                                        onChange={() => { handleTogglePastaGrupo(g.id, p.id); setPastaDropdown(null); }}
                                        className="accent-primary"
                                      />
                                      <span className="truncate">📁 {p.nome}</span>
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                      <button type="button" onClick={() => setEditingGrupo(g.id)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Editar exercícios do treino" data-admin-editar-treino={g.id}>
                        <Edit2 size={14} />
                      </button>
                      <button type="button" onClick={() => handleDeleteGrupo(g.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Excluir treino" data-admin-excluir-treino={g.id}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1" data-admin-chips={g.id}>
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
                  <div className="mt-4 pt-3 border-t border-muted-foreground/10">
                    <button
                      type="button"
                      onClick={() => setPerfilAberto(perfilAberto === g.id ? null : g.id)}
                      className="w-full flex items-center gap-2"
                    >
                      {perfilAberto === g.id ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">
                        Quem vê este treino
                      </span>
                      {(gruposPerfis[g.id]?.length ?? 0) === 0 ? (
                        <span className="text-[10px] text-destructive font-body ml-auto">
                          ⚠️ Sem perfil — invisível p/ todos
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-body ml-auto">
                          {gruposPerfis[g.id].length} selecionado{gruposPerfis[g.id].length > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                    {perfilAberto === g.id && (
                      users.length === 0 ? (
                        <p className="text-xs text-muted-foreground font-body mt-2">Carregando usuários...</p>
                      ) : (
                        <div className="space-y-1 max-h-40 overflow-y-auto mt-2">
                          {[...users].sort((a, b) => {
                            const sel = gruposPerfis[g.id] || [];
                            return (sel.includes(a.id) ? 0 : 1) - (sel.includes(b.id) ? 0 : 1);
                          }).map((u) => (
                            <label key={u.id} className="flex items-center gap-2 py-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(gruposPerfis[g.id] || []).includes(u.id)}
                                onChange={() => handleTogglePerfil(g.id, u.id)}
                                className="accent-primary"
                              />
                              <span className="text-sm font-body text-foreground">{u.nome}</span>
                              <span className="text-[10px] text-muted-foreground font-body ml-auto truncate max-w-[160px]">
                                {u.email}
                              </span>
                            </label>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            <ModalExerciciosGrupoAdmin
              grupo={grupos.find((g) => g.id === editingGrupo) ?? null}
              exercicios={exercicios}
              idsNoTreino={editingGrupo ? gruposExercicios[editingGrupo] || [] : []}
              onToggle={(exId) => (editingGrupo ? handleToggleExercicioInGrupo(editingGrupo, exId) : undefined)}
              onOpenChange={(aberto) => { if (!aberto) setEditingGrupo(null); }}
            />
          </div>
        ) : tab === "biblioteca" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setModalBiblioteca("novo")} className="px-4 py-2 bg-primary text-primary-foreground font-heading text-xs uppercase">
                <Plus size={14} className="inline mr-1" /> Criar Exercício
              </button>
              <button type="button" onClick={() => setModalBiblioteca("musculos")} className="px-4 py-2 border border-muted-foreground/20 rounded font-heading text-xs uppercase text-foreground hover:border-primary transition-colors">
                💪 Grupos Musculares ({gruposMusculares.length})
              </button>
              <button type="button" onClick={() => setModalBiblioteca("exercicios")} className="px-4 py-2 border border-muted-foreground/20 rounded font-heading text-xs uppercase text-foreground hover:border-primary transition-colors">
                📚 Exercícios ({exercicios.length})
              </button>
            </div>

            {modalBiblioteca === "novo" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setModalBiblioteca(null)}>
            <div className="bg-background border border-border rounded-lg w-full max-w-xl max-h-[85vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <p className="font-heading text-sm text-foreground">Novo Exercício</p>
                <button type="button" onClick={() => setModalBiblioteca(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={16} /></button>
              </div>
              <input type="text" value={novoExNome} onChange={(e) => setNovoExNome(e.target.value)} placeholder="Nome do exercício..." className="input-underline" />
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <select value={novoExGrupo} onChange={(e) => setNovoExGrupo(e.target.value)} className="w-full bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-2 outline-none focus:border-primary focus-visible:border-primary focus-visible:border-b-2">
                    <option value="" className="bg-background text-foreground">Selecionar...</option>
                    {gruposMusculares.map((g) => (<option key={g.id} value={g.nome} className="bg-background text-foreground">{g.nome}</option>))}
                  </select>
                </div>
                {!adicionandoMusculo ? (
                  <button type="button" onClick={() => setAdicionandoMusculo(true)} className="px-3 py-2 border border-muted-foreground/20 rounded text-[10px] font-bold uppercase tracking-wider text-primary hover:border-primary transition-colors whitespace-nowrap">
                    + Músculo
                  </button>
                ) : (
                  <div className="flex gap-2 items-end flex-1">
                    <input autoFocus value={novoMusculo} onChange={e => setNovoMusculo(e.target.value)} onKeyDown={e => e.key === "Enter" && salvarNovoMusculo()} placeholder="ex: Trapézio Médio" className="flex-1 bg-transparent border-b border-primary py-2 text-foreground text-sm outline-none focus-visible:border-primary focus-visible:border-b-2" />
                    <button type="button" onClick={salvarNovoMusculo} disabled={!novoMusculo.trim()} className="px-3 py-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded disabled:opacity-40">Salvar</button>
                    <button type="button" onClick={() => { setAdicionandoMusculo(false); setNovoMusculo(""); }} className="px-3 py-2 border border-muted-foreground/20 text-muted-foreground text-[10px] font-bold uppercase rounded">✕</button>
                  </div>
                )}
                <input type="text" value={novoExEmoji} onChange={(e) => setNovoExEmoji(e.target.value)} className="w-16 bg-transparent border-b border-muted-foreground text-center text-foreground font-body text-lg py-1 outline-none focus:border-primary focus-visible:border-primary focus-visible:border-b-2" />
              <select value={novoExTipo} onChange={(e) => setNovoExTipo(e.target.value as "musculacao" | "corrida")} className="bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-1 outline-none focus:border-primary focus-visible:border-primary focus-visible:border-b-2">
                <option value="musculacao" className="bg-background text-foreground">💪 Musculação</option>
                <option value="corrida" className="bg-background text-foreground">🏃 Corrida</option>
              </select>
              </div>
              <input type="text" value={novoExSubgrupo} onChange={(e) => setNovoExSubgrupo(e.target.value)} placeholder="Subgrupo (opcional, ex: Porção medial)" className="input-underline text-sm" />
              <textarea value={novoExDica} onChange={(e) => setNovoExDica(e.target.value)} placeholder="Dica de execução (opcional)" rows={2} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground font-body text-sm resize-y outline-none focus:border-primary" />
              <p className="text-[10px] text-muted-foreground font-body">A foto/gif é adicionada na edição do exercício.</p>
              <div className="flex gap-2">
                <button type="button" onClick={handleAddExercicio} className="px-4 py-2 bg-primary text-primary-foreground font-heading text-xs uppercase">
                  <Plus size={14} className="inline mr-1" /> Criar Exercício
                </button>
                <button type="button" onClick={() => setModalBiblioteca(null)} className="px-4 py-2 text-muted-foreground font-heading text-xs uppercase">
                  Cancelar
                </button>
              </div>
            </div>
            </div>
            )}

            {modalBiblioteca === "musculos" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setModalBiblioteca(null)}>
            <div className="bg-background border border-border rounded-lg w-full max-w-xl max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-heading text-sm text-foreground">Grupos Musculares ({gruposMusculares.length})</p>
                <button type="button" onClick={() => setModalBiblioteca(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={16} /></button>
              </div>
              <div className="space-y-1">
                {gruposMusculares.map((g) => (
                  <div key={g.id} className="flex items-center justify-between py-1.5 border-b border-muted-foreground/10 last:border-0">
                    <span className="text-sm font-body text-foreground">{g.nome}</span>
                    <button type="button" onClick={() => handleExcluirGrupoMuscular(g.id, g.nome)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Excluir grupo muscular">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            </div>
            )}

            {modalBiblioteca === "exercicios" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setModalBiblioteca(null)}>
            <div className="bg-background border border-border rounded-lg w-full max-w-xl max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-heading text-sm text-foreground">Exercícios ({exercicios.length})</p>
                <button type="button" onClick={() => setModalBiblioteca(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={16} /></button>
              </div>
              <div className="space-y-0">
              {exercicios.map((ex) => (
                <div key={ex.id} className="py-3 border-b border-muted-foreground/20">
                  {editingExId === ex.id ? (
                    <div className="space-y-2">
                      <input type="text" value={editExNome} onChange={(e) => setEditExNome(e.target.value)} className="input-underline text-sm" placeholder="Nome" />
                      <div className="flex gap-2">
                        <select value={editExGrupo} onChange={(e) => setEditExGrupo(e.target.value)} className="flex-1 bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-1 outline-none focus:border-primary focus-visible:border-primary focus-visible:border-b-2">
                          {gruposMusculares.map((g) => <option key={g.id} value={g.nome} className="bg-background text-foreground">{g.nome}</option>)}
                        </select>
                        <select value={editExEmoji} onChange={(e) => setEditExEmoji(e.target.value)} className="w-16 bg-transparent border-b border-muted-foreground text-center text-lg py-1 outline-none focus:border-primary focus-visible:border-primary focus-visible:border-b-2">
                          {(EMOJIS_EXERCICIO.includes(editExEmoji) ? EMOJIS_EXERCICIO : [editExEmoji, ...EMOJIS_EXERCICIO]).map((e) => <option key={e} value={e} className="bg-background text-foreground">{e}</option>)}
                        </select>
                      </div>
                      {/* Foto / gif */}
                      <div className="space-y-2">
                        {(editExImagemFile || editExImagemUrl) && (
                          <img
                            src={editExImagemFile ? URL.createObjectURL(editExImagemFile) : (editExImagemUrl as string)}
                            alt="preview"
                            className="w-full max-h-48 object-contain rounded-lg border border-muted-foreground/20 bg-card"
                          />
                        )}
                        <div className="flex items-center gap-2">
                          <label className="px-3 py-1.5 border border-muted-foreground/20 rounded text-[10px] font-bold uppercase tracking-wider text-primary hover:border-primary transition-colors cursor-pointer">
                            {editExImagemUrl || editExImagemFile ? "Trocar foto/gif" : "Adicionar foto/gif"}
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => setEditExImagemFile(e.target.files?.[0] || null)} />
                          </label>
                          {(editExImagemUrl || editExImagemFile) && (
                            <button type="button" onClick={() => { setEditExImagemFile(null); setEditExImagemUrl(null); }} className="text-[10px] text-muted-foreground hover:text-destructive uppercase font-bold">Remover</button>
                          )}
                        </div>
                      </div>
                      <input type="text" value={editExSubgrupo} onChange={(e) => setEditExSubgrupo(e.target.value)} placeholder="Subgrupo (opcional)" className="input-underline text-sm" />
                      <textarea value={editExDica} onChange={(e) => setEditExDica(e.target.value)} placeholder="Dica de execução (opcional)" rows={2} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground font-body text-sm resize-y outline-none focus:border-primary" />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleEditExercicio} disabled={uploadingImg} className="px-3 py-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase disabled:opacity-50"><Save size={12} className="inline mr-1" />{uploadingImg ? "Salvando..." : "Salvar"}</button>
                        <button type="button" onClick={() => { setEditingExId(null); setEditExImagemFile(null); }} className="px-3 py-1.5 text-muted-foreground font-heading text-xs uppercase"><X size={12} className="inline mr-1" />Cancelar</button>
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
                        <button type="button" onClick={() => { setEditingExId(ex.id); setEditExNome(ex.nome); setEditExGrupo(ex.grupo_muscular); setEditExEmoji(ex.emoji); setEditExSubgrupo(ex.subgrupo || ""); setEditExDica(ex.dica || ""); setEditExImagemUrl(ex.imagem_url || null); setEditExImagemFile(null); }} className="p-1.5 text-muted-foreground hover:text-primary transition-colors">
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
            </div>
            )}
          </div>
        ) : tab === "historico" ? (
          <AdminHistoricoMes users={users} />
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
