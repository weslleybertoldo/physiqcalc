import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, X, Save, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Exercicio {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  isPessoal?: boolean;
}

interface Props {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const EMOJIS = ["🏋️", "💪", "🦵", "🧘", "🔵"];
const GRUPOS_MUSCULARES = [
  "Peitoral", "Dorsal", "Deltóide", "Bíceps", "Tríceps",
  "Quadríceps", "Isquiotibiais", "Panturrilha", "Abdômen", "Glúteo",
];

const ModalCriarGrupoPessoal = ({ userId, open, onOpenChange, onCreated }: Props) => {
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [exerciciosGlobais, setExerciciosGlobais] = useState<Exercicio[]>([]);
  const [exerciciosPessoais, setExerciciosPessoais] = useState<Exercicio[]>([]);
  const [selectedIds, setSelectedIds] = useState<{ id: string; isPessoal: boolean }[]>([]);
  const [saving, setSaving] = useState(false);

  // Novo exercício pessoal
  const [showNovoEx, setShowNovoEx] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoGrupo, setNovoGrupo] = useState(GRUPOS_MUSCULARES[0]);
  const [novoEmoji, setNovoEmoji] = useState("🏋️");

  // Editar exercício pessoal
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editGrupo, setEditGrupo] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  useEffect(() => {
    if (!open) return;
    loadExercicios();
  }, [open]);

  const loadExercicios = async () => {
    const [globalRes, pessoalRes] = await Promise.all([
      supabase.from("tb_exercicios").select("*").order("nome"),
      supabase.from("tb_exercicios_usuario").select("*").eq("user_id", userId).order("nome"),
    ]);
    setExerciciosGlobais((globalRes.data as Exercicio[]) || []);
    setExerciciosPessoais(((pessoalRes.data as any[]) || []).map((e) => ({ ...e, isPessoal: true })));
  };

  const toggleSelect = (id: string, isPessoal: boolean) => {
    setSelectedIds((prev) => {
      const exists = prev.find((s) => s.id === id && s.isPessoal === isPessoal);
      if (exists) return prev.filter((s) => !(s.id === id && s.isPessoal === isPessoal));
      return [...prev, { id, isPessoal }];
    });
  };

  const handleCriarExercicio = async () => {
    if (!novoNome.trim()) return;
    await supabase.from("tb_exercicios_usuario").insert({
      user_id: userId, nome: novoNome.trim(), grupo_muscular: novoGrupo, emoji: novoEmoji,
    });
    setNovoNome("");
    setShowNovoEx(false);
    toast.success("Exercício criado!");
    loadExercicios();
  };

  const handleEditarExercicio = async (id: string) => {
    await supabase.from("tb_exercicios_usuario").update({
      nome: editNome, grupo_muscular: editGrupo, emoji: editEmoji,
    }).eq("id", id).eq("user_id", userId);
    setEditingId(null);
    toast.success("Exercício atualizado!");
    loadExercicios();
  };

  const handleDeletarExercicio = async (id: string) => {
    await supabase.from("tb_exercicios_usuario").delete().eq("id", id).eq("user_id", userId);
    setSelectedIds((prev) => prev.filter((s) => !(s.id === id && s.isPessoal)));
    toast.success("Exercício removido");
    loadExercicios();
  };

  const handleSalvar = async () => {
    if (!nomeGrupo.trim() || selectedIds.length === 0) {
      toast.error("Preencha o nome e selecione exercícios");
      return;
    }
    setSaving(true);

    const { data: grupo } = await supabase
      .from("tb_grupos_treino_usuario")
      .insert({ user_id: userId, nome: nomeGrupo.trim() })
      .select().single();

    if (grupo) {
      const inserts = selectedIds.map((s, i) => ({
        user_id: userId,
        grupo_usuario_id: grupo.id,
        exercicio_id: s.isPessoal ? null : s.id,
        exercicio_usuario_id: s.isPessoal ? s.id : null,
        ordem: i,
      }));
      await supabase.from("tb_grupos_exercicios_usuario").insert(inserts);
    }

    setSaving(false);
    setNomeGrupo("");
    setSelectedIds([]);
    toast.success("Grupo criado!");
    onCreated();
  };

  const isSelected = (id: string, isPessoal: boolean) =>
    selectedIds.some((s) => s.id === id && s.isPessoal === isPessoal);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-muted-foreground/30 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">➕ Criar Grupo Pessoal</DialogTitle>
        </DialogHeader>

        <input
          type="text"
          value={nomeGrupo}
          onChange={(e) => setNomeGrupo(e.target.value)}
          placeholder="Nome do grupo..."
          className="input-underline mb-4"
        />

        {/* Global exercises */}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-2">
          Exercícios Globais (biblioteca)
        </p>
        <div className="space-y-1 mb-4 max-h-40 overflow-y-auto">
          {exerciciosGlobais.map((ex) => (
            <label key={ex.id} className="flex items-center gap-2 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isSelected(ex.id, false)}
                onChange={() => toggleSelect(ex.id, false)}
                className="accent-primary"
              />
              <span className="text-sm font-body text-foreground">{ex.emoji} {ex.nome}</span>
              <span className="text-[10px] text-muted-foreground font-body ml-auto">{ex.grupo_muscular}</span>
            </label>
          ))}
        </div>

        {/* Personal exercises */}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-2">
          Meus Exercícios
        </p>
        <div className="space-y-1 mb-3">
          {exerciciosPessoais.length === 0 ? (
            <p className="text-xs text-muted-foreground font-body">Nenhum exercício pessoal criado.</p>
          ) : (
            exerciciosPessoais.map((ex) => (
              <div key={ex.id} className="flex items-center gap-2 py-1.5">
                {editingId === ex.id ? (
                  <div className="flex-1 space-y-2">
                    <input type="text" value={editNome} onChange={(e) => setEditNome(e.target.value)} className="input-underline text-sm" />
                    <div className="flex gap-2">
                      <select value={editGrupo} onChange={(e) => setEditGrupo(e.target.value)} className="flex-1 bg-transparent border-b border-muted-foreground text-foreground font-body text-xs py-1 outline-none">
                        {GRUPOS_MUSCULARES.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <select value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="w-14 bg-transparent border-b border-muted-foreground text-center text-lg py-1 outline-none">
                        {EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleEditarExercicio(ex.id)} className="text-xs text-primary font-heading"><Save size={12} className="inline mr-1" />Salvar</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs text-muted-foreground font-heading"><X size={12} className="inline mr-1" />Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <input
                      type="checkbox"
                      checked={isSelected(ex.id, true)}
                      onChange={() => toggleSelect(ex.id, true)}
                      className="accent-primary"
                    />
                    <span className="text-sm font-body text-foreground flex-1">{ex.emoji} {ex.nome}</span>
                    <button type="button" onClick={() => { setEditingId(ex.id); setEditNome(ex.nome); setEditGrupo(ex.grupo_muscular); setEditEmoji(ex.emoji); }} className="p-1 text-muted-foreground hover:text-primary transition-colors">
                      <Edit2 size={12} />
                    </button>
                    <button type="button" onClick={() => handleDeletarExercicio(ex.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Create personal exercise */}
        {showNovoEx ? (
          <div className="space-y-2 border border-primary/30 p-3 mb-4">
            <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do exercício..." className="input-underline text-sm" />
            <div className="flex gap-2">
              <select value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)} className="flex-1 bg-transparent border-b border-muted-foreground text-foreground font-body text-xs py-1 outline-none">
                {GRUPOS_MUSCULARES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={novoEmoji} onChange={(e) => setNovoEmoji(e.target.value)} className="w-14 bg-transparent border-b border-muted-foreground text-center text-lg py-1 outline-none">
                {EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleCriarExercicio} className="px-3 py-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase">Criar</button>
              <button type="button" onClick={() => setShowNovoEx(false)} className="px-3 py-1.5 text-muted-foreground font-heading text-xs uppercase">Cancelar</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowNovoEx(true)} className="text-xs text-primary hover:text-primary/80 font-heading uppercase tracking-wider mb-4 flex items-center gap-1">
            <Plus size={14} /> Criar novo exercício
          </button>
        )}

        <button
          type="button"
          onClick={handleSalvar}
          disabled={saving || !nomeGrupo.trim() || selectedIds.length === 0}
          className="w-full py-3 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Salvando..." : `Criar grupo (${selectedIds.length} exercícios)`}
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default ModalCriarGrupoPessoal;
