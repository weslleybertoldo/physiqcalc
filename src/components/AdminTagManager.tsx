import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Tag {
  id: string;
  nome: string;
  cor: string;
  user_count: number;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#d946ef", "#ec4899", "#f43f5e", "#64748b",
];

interface Props {
  onBack: () => void;
}

const AdminTagManager = ({ onBack }: Props) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#6366f1");
  const [customHex, setCustomHex] = useState("");

  const loadTags = async () => {
    const { data } = await supabase.functions.invoke("admin-tags", {
      body: { action: "list" },
    });
    if (data?.tags) setTags(data.tags);
    setLoading(false);
  };

  useEffect(() => { loadTags(); }, []);

  const openCreate = () => {
    setEditingTag(null);
    setNome("");
    setCor("#6366f1");
    setCustomHex("");
    setDialogOpen(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingTag(tag);
    setNome(tag.nome);
    setCor(tag.cor);
    setCustomHex(PRESET_COLORS.includes(tag.cor) ? "" : tag.cor);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const finalCor = customHex && /^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : cor;
    if (!nome.trim()) return;

    if (editingTag) {
      await supabase.functions.invoke("admin-tags", {
        body: { action: "update", tagId: editingTag.id, tag: { nome: nome.trim(), cor: finalCor } },
      });
    } else {
      await supabase.functions.invoke("admin-tags", {
        body: { action: "create", tag: { nome: nome.trim(), cor: finalCor } },
      });
    }
    setDialogOpen(false);
    loadTags();
  };

  const handleDelete = async (tagId: string) => {
    await supabase.functions.invoke("admin-tags", {
      body: { action: "delete", tagId },
    });
    loadTags();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <header className="pt-12 sm:pt-20 pb-4 flex items-center gap-4">
          <button onClick={onBack} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-heading text-2xl text-foreground">Gerenciar Tags</h1>
            <p className="text-sm text-muted-foreground font-body">Crie e organize tags para os usuários</p>
          </div>
        </header>

        <button
          onClick={openCreate}
          className="w-full mb-8 result-card border-primary/50 flex items-center gap-4 hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <Plus size={24} className="text-primary shrink-0" />
          <div className="text-left">
            <p className="font-heading text-lg text-foreground">Nova Tag</p>
            <p className="text-xs text-muted-foreground font-body">Criar uma nova tag personalizada</p>
          </div>
        </button>

        {loading ? (
          <p className="text-muted-foreground font-body">Carregando...</p>
        ) : tags.length === 0 ? (
          <p className="text-muted-foreground font-body">Nenhuma tag criada ainda.</p>
        ) : (
          <div className="space-y-0">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center justify-between py-4 border-b border-muted-foreground/30">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 text-xs font-heading uppercase tracking-wider text-white rounded-full shrink-0"
                    style={{ backgroundColor: tag.cor }}
                  >
                    {tag.nome}
                  </span>
                  <span className="text-xs text-muted-foreground font-body">
                    {tag.user_count} {tag.user_count === 1 ? "usuário" : "usuários"}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => openEdit(tag)}
                    title="Editar"
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(tag.id)}
                    title="Excluir"
                    className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-background border-muted-foreground/30">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {editingTag ? "Editar Tag" : "Nova Tag"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Name */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Nome</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: VIP, Em avaliação..."
                className="input-underline"
              />
            </div>

            {/* Color picker */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Cor</label>
              <div className="grid grid-cols-8 gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCor(c); setCustomHex(""); }}
                    className={`w-8 h-8 rounded-full transition-all duration-200 ${
                      cor === c && !customHex ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground font-body">Hex:</span>
                <input
                  type="text"
                  value={customHex}
                  onChange={(e) => {
                    setCustomHex(e.target.value);
                    if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setCor(e.target.value);
                  }}
                  placeholder="#000000"
                  className="input-underline w-28 text-sm"
                />
                {customHex && /^#[0-9a-fA-F]{6}$/.test(customHex) && (
                  <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: customHex }} />
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Preview</label>
              <div className="py-2">
                <span
                  className="inline-flex items-center px-3 py-1 text-sm font-heading uppercase tracking-wider text-white rounded-full"
                  style={{ backgroundColor: customHex && /^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : cor }}
                >
                  {nome || "Tag"}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => setDialogOpen(false)}
              className="px-4 py-2 text-sm font-heading uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!nome.trim()}
              className="px-6 py-2 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {editingTag ? "Salvar" : "Criar Tag"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTagManager;
