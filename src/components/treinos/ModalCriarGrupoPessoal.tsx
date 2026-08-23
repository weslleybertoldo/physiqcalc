import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Edit2, X, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import SeletorExerciciosPorGrupo from "./SeletorExerciciosPorGrupo";
import { nomeDoBloco, type BlocoMuscular } from "@/lib/gruposMusculares";

interface Exercicio {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  isPessoal?: boolean;
}

export interface GrupoParaEditar {
  id: string;
  nome: string;
}

interface Props {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  editGrupo?: GrupoParaEditar | null;
}

const EMOJIS = ["🏋️", "💪", "🦵", "🧘", "🔵"];
const GRUPOS_MUSCULARES = [
  "Peitoral", "Dorsal", "Deltóide", "Bíceps", "Tríceps",
  "Quadríceps", "Isquiotibiais", "Panturrilha", "Abdômen", "Glúteo", "Corrida",
];

const ModalCriarGrupoPessoal = ({ userId, open, onOpenChange, onCreated, editGrupo }: Props) => {
  const db = usePowerSync();
  const isEditMode = !!editGrupo;

  const [nomeGrupo, setNomeGrupo] = useState("");
  const [exerciciosGlobais, setExerciciosGlobais] = useState<Exercicio[]>([]);
  const [exerciciosPessoais, setExerciciosPessoais] = useState<Exercicio[]>([]);
  const [selectedIds, setSelectedIds] = useState<{ id: string; isPessoal: boolean }[]>([]);
  const [saving, setSaving] = useState(false);

  // Bloco muscular aberto no seletor (só para rotular o "criar exercício em X")
  const [blocoAtual, setBlocoAtual] = useState<BlocoMuscular | null>(null);

  // Novo exercício pessoal
  const [showNovoEx, setShowNovoEx] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoGrupo, setNovoGrupo] = useState(GRUPOS_MUSCULARES[0]);
  const [novoEmoji, setNovoEmoji] = useState("🏋️");

  // Editar exercício pessoal
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editGrupoMusc, setEditGrupoMusc] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  useEffect(() => {
    if (!open) return;
    loadExercicios();
    setBlocoAtual(null);
    setShowNovoEx(false);
    setEditingId(null);

    if (editGrupo) {
      setNomeGrupo(editGrupo.nome);
      loadExerciciosDoGrupo(editGrupo.id);
    } else {
      setNomeGrupo("");
      setSelectedIds([]);
    }
  }, [open, editGrupo?.id]);

  const loadExercicios = async () => {
    const [globais, pessoais] = await Promise.all([
      db.getAll("SELECT * FROM tb_exercicios ORDER BY nome"),
      db.getAll("SELECT * FROM tb_exercicios_usuario WHERE user_id = ? ORDER BY nome", [userId]),
    ]);
    setExerciciosGlobais((globais as Exercicio[]) || []);
    setExerciciosPessoais(((pessoais as Exercicio[]) || []).map((e) => ({ ...e, isPessoal: true })));
  };

  const loadExerciciosDoGrupo = async (grupoId: string) => {
    try {
      const rows = await db.getAll(
        "SELECT exercicio_id, exercicio_usuario_id FROM tb_grupos_exercicios_usuario WHERE grupo_usuario_id = ? AND user_id = ? ORDER BY ordem",
        [grupoId, userId]
      );
      type LinkRow = { exercicio_id: string | null; exercicio_usuario_id: string | null };
      const selected = ((rows as LinkRow[]) || []).map((r) => {
        if (r.exercicio_usuario_id) {
          return { id: r.exercicio_usuario_id, isPessoal: true };
        }
        return { id: r.exercicio_id, isPessoal: false };
      }).filter((s) => s.id);
      setSelectedIds(selected);
    } catch (e) {
      console.error("[EditGrupo] Erro ao carregar exercícios do grupo:", e);
    }
  };

  // Globais + pessoais numa lista só, ordenada por nome (pessoais marcados com badge)
  const todosExercicios = useMemo(
    () => [...exerciciosGlobais, ...exerciciosPessoais].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [exerciciosGlobais, exerciciosPessoais]
  );

  const isSelected = (id: string, isPessoal: boolean) =>
    selectedIds.some((s) => s.id === id && s.isPessoal === isPessoal);

  const contarSelecionados = (exs: Exercicio[]) =>
    exs.filter((ex) => isSelected(ex.id, !!ex.isPessoal)).length;

  const exerciciosSelecionados = useMemo(
    () =>
      selectedIds
        .map((s) => todosExercicios.find((ex) => ex.id === s.id && !!ex.isPessoal === s.isPessoal))
        .filter((ex): ex is Exercicio => !!ex),
    [selectedIds, todosExercicios]
  );

  const toggleSelect = (id: string, isPessoal: boolean) => {
    setSelectedIds((prev) => {
      const exists = prev.find((s) => s.id === id && s.isPessoal === isPessoal);
      if (exists) return prev.filter((s) => !(s.id === id && s.isPessoal === isPessoal));
      return [...prev, { id, isPessoal }];
    });
  };

  /** Remoção pelo chip de "Selecionados" — pede confirmação (clique fácil de errar) */
  const removerSelecionado = (ex: Exercicio) => {
    const confirmed = window.confirm(`Realmente deseja remover "${ex.nome}" deste grupo?`);
    if (!confirmed) return;
    toggleSelect(ex.id, !!ex.isPessoal);
  };

  const handleBlocoChange = (bloco: BlocoMuscular | null) => {
    setBlocoAtual(bloco);
    setShowNovoEx(false);
    setEditingId(null);
    if (bloco) setNovoGrupo(bloco.grupoPadrao);
  };

  const handleCriarExercicio = async () => {
    if (!novoNome.trim()) return;
    try {
      const now = new Date().toISOString();
      await db.execute(
        "INSERT INTO tb_exercicios_usuario (id, user_id, nome, grupo_muscular, emoji, created_at, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)",
        [userId, novoNome.trim(), novoGrupo, novoEmoji, now, now]
      );
      setNovoNome("");
      setShowNovoEx(false);
      toast.success("Exercício criado!");
      loadExercicios();
    } catch (e) {
      console.error("[CriarGrupo] Erro ao criar exercício:", e);
      toast.error("Erro ao criar exercício. Tente novamente.");
    }
  };

  const handleEditarExercicio = async (id: string) => {
    try {
      const now = new Date().toISOString();
      await db.execute(
        "UPDATE tb_exercicios_usuario SET nome = ?, grupo_muscular = ?, emoji = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        [editNome, editGrupoMusc, editEmoji, now, id, userId]
      );
      setEditingId(null);
      toast.success("Exercício atualizado!");
      loadExercicios();
    } catch (e) {
      console.error("[CriarGrupo] Erro ao editar exercício:", e);
      toast.error("Erro ao atualizar exercício. Tente novamente.");
    }
  };

  const handleDeletarExercicio = async (id: string) => {
    try {
      await db.execute(
        "DELETE FROM tb_exercicios_usuario WHERE id = ? AND user_id = ?",
        [id, userId]
      );
      setSelectedIds((prev) => prev.filter((s) => !(s.id === id && s.isPessoal)));
      toast.success("Exercício removido");
      loadExercicios();
    } catch (e) {
      console.error("[CriarGrupo] Erro ao remover exercício:", e);
      toast.error("Erro ao remover exercício. Tente novamente.");
    }
  };

  const handleSalvar = async () => {
    if (!nomeGrupo.trim() || selectedIds.length === 0) {
      toast.error("Preencha o nome e selecione exercícios");
      return;
    }
    setSaving(true);

    try {
      const now = new Date().toISOString();

      if (isEditMode && editGrupo) {
        // === MODO EDIÇÃO ===
        // 1. Atualiza o nome do grupo
        await db.execute(
          "UPDATE tb_grupos_treino_usuario SET nome = ? WHERE id = ? AND user_id = ?",
          [nomeGrupo.trim(), editGrupo.id, userId]
        );

        // 2. Remove exercícios antigos do grupo
        await db.execute(
          "DELETE FROM tb_grupos_exercicios_usuario WHERE grupo_usuario_id = ? AND user_id = ?",
          [editGrupo.id, userId]
        );

        // 3. Insere os novos exercícios selecionados
        for (let i = 0; i < selectedIds.length; i++) {
          const s = selectedIds[i];
          await db.execute(
            "INSERT INTO tb_grupos_exercicios_usuario (id, user_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, ordem) VALUES (uuid(), ?, ?, ?, ?, ?)",
            [userId, editGrupo.id, s.isPessoal ? null : s.id, s.isPessoal ? s.id : null, i]
          );
        }

        toast.success("Grupo atualizado!");
      } else {
        // === MODO CRIAÇÃO ===
        const grupoId = crypto.randomUUID();
        await db.execute(
          "INSERT INTO tb_grupos_treino_usuario (id, user_id, nome, created_at) VALUES (?, ?, ?, ?)",
          [grupoId, userId, nomeGrupo.trim(), now]
        );

        for (let i = 0; i < selectedIds.length; i++) {
          const s = selectedIds[i];
          await db.execute(
            "INSERT INTO tb_grupos_exercicios_usuario (id, user_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, ordem) VALUES (uuid(), ?, ?, ?, ?, ?)",
            [userId, grupoId, s.isPessoal ? null : s.id, s.isPessoal ? s.id : null, i]
          );
        }

        toast.success("Grupo criado!");
      }

      setSaving(false);
      setNomeGrupo("");
      setSelectedIds([]);
      onCreated();
    } catch (e) {
      console.error("[CriarGrupo] Erro ao salvar grupo:", e);
      toast.error("Erro ao salvar grupo. Tente novamente.");
      setSaving(false);
    }
  };

  // Linha de exercício (checkbox + nome + grupo/badge + ações se pessoal)
  const renderExercicio = (ex: Exercicio, { mostrarGrupo }: { mostrarGrupo: boolean }) => {
    if (ex.isPessoal && editingId === ex.id) {
      return (
        <div key={ex.id} className="py-1.5">
          <div className="space-y-2">
            <input type="text" value={editNome} onChange={(e) => setEditNome(e.target.value)} className="input-underline text-sm" />
            <div className="flex gap-2">
              <select value={editGrupoMusc} onChange={(e) => setEditGrupoMusc(e.target.value)} className="flex-1 bg-transparent border-b border-muted-foreground text-foreground font-body text-xs py-1 outline-none focus-visible:border-primary focus-visible:border-b-2">
                {GRUPOS_MUSCULARES.map((g) => <option key={g} value={g} className="bg-background text-foreground">{g}</option>)}
              </select>
              <select value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="w-14 bg-transparent border-b border-muted-foreground text-center text-lg py-1 outline-none focus-visible:border-primary focus-visible:border-b-2">
                {EMOJIS.map((e) => <option key={e} value={e} className="bg-background text-foreground">{e}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleEditarExercicio(ex.id)} className="text-xs text-primary font-heading"><Save size={12} className="inline mr-1" />Salvar</button>
              <button type="button" onClick={() => setEditingId(null)} className="text-xs text-muted-foreground font-heading"><X size={12} className="inline mr-1" />Cancelar</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={`${ex.isPessoal ? "p" : "g"}-${ex.id}`} className="flex items-center gap-2 py-1.5">
        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelected(ex.id, !!ex.isPessoal)}
            onChange={() => toggleSelect(ex.id, !!ex.isPessoal)}
            className="accent-primary shrink-0"
          />
          <span className="text-sm font-body text-foreground truncate">{ex.emoji} {ex.nome}</span>
          {ex.isPessoal && (
            <span className="text-[9px] uppercase tracking-wider text-primary border border-primary/40 px-1 py-0.5 font-heading shrink-0">meu</span>
          )}
          {mostrarGrupo && (
            <span className="text-[10px] text-muted-foreground font-body ml-auto shrink-0">
              {nomeDoBloco(ex.grupo_muscular)}
            </span>
          )}
        </label>
        {ex.isPessoal && (
          <>
            <button type="button" onClick={() => { setEditingId(ex.id); setEditNome(ex.nome); setEditGrupoMusc(ex.grupo_muscular); setEditEmoji(ex.emoji); }} className="p-1 text-muted-foreground hover:text-primary transition-colors">
              <Edit2 size={12} />
            </button>
            <button type="button" onClick={() => handleDeletarExercicio(ex.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-muted-foreground/30 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">
            {isEditMode ? "✏️ Editar Grupo Pessoal" : "➕ Criar Grupo Pessoal"}
          </DialogTitle>
        </DialogHeader>

        <input
          type="text"
          value={nomeGrupo}
          onChange={(e) => setNomeGrupo(e.target.value)}
          placeholder="Nome do grupo..."
          className="input-underline mb-3"
        />

        {/* Selecionados — visível em qualquer nível */}
        {exerciciosSelecionados.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-1.5">
              Selecionados ({exerciciosSelecionados.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {exerciciosSelecionados.map((ex) => (
                <button
                  key={`sel-${ex.isPessoal ? "p" : "g"}-${ex.id}`}
                  type="button"
                  onClick={() => removerSelecionado(ex)}
                  title="Remover do grupo"
                  className="flex items-center gap-1 border border-primary/40 text-primary px-1.5 py-0.5 text-[11px] font-body hover:bg-primary/10 transition-colors"
                >
                  {ex.emoji} {ex.nome}
                  <X size={10} />
                </button>
              ))}
            </div>
          </div>
        )}

        <SeletorExerciciosPorGrupo
          exercicios={todosExercicios}
          renderItem={renderExercicio}
          contarSelecionados={contarSelecionados}
          onBlocoChange={handleBlocoChange}
          resetKey={`${open}-${editGrupo?.id ?? "novo"}`}
        />

        {/* Create personal exercise */}
        {showNovoEx ? (
          <div className="space-y-2 border border-primary/30 p-3 mb-4">
            <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do exercício..." className="input-underline text-sm" />
            <div className="flex gap-2">
              <select value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)} className="flex-1 bg-transparent border-b border-muted-foreground text-foreground font-body text-xs py-1 outline-none focus-visible:border-primary focus-visible:border-b-2">
                {GRUPOS_MUSCULARES.map((g) => <option key={g} value={g} className="bg-background text-foreground">{g}</option>)}
              </select>
              <select value={novoEmoji} onChange={(e) => setNovoEmoji(e.target.value)} className="w-14 bg-transparent border-b border-muted-foreground text-center text-lg py-1 outline-none focus-visible:border-primary focus-visible:border-b-2">
                {EMOJIS.map((e) => <option key={e} value={e} className="bg-background text-foreground">{e}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleCriarExercicio} className="px-3 py-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase">Criar</button>
              <button type="button" onClick={() => setShowNovoEx(false)} className="px-3 py-1.5 text-muted-foreground font-heading text-xs uppercase">Cancelar</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (blocoAtual) setNovoGrupo(blocoAtual.grupoPadrao);
              setShowNovoEx(true);
            }}
            className="text-xs text-primary hover:text-primary/80 font-heading uppercase tracking-wider mb-4 flex items-center gap-1"
          >
            <Plus size={14} /> {blocoAtual ? `Criar exercício em ${blocoAtual.nome}` : "Criar novo exercício"}
          </button>
        )}

        <button
          type="button"
          onClick={handleSalvar}
          disabled={saving || !nomeGrupo.trim() || selectedIds.length === 0}
          className="w-full py-3 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving
            ? "Salvando..."
            : isEditMode
              ? `Salvar grupo (${selectedIds.length} exercícios)`
              : `Criar grupo (${selectedIds.length} exercícios)`
          }
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default ModalCriarGrupoPessoal;
