import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Tag {
  id: string;
  nome: string;
  cor: string;
}

interface Props {
  userId: string;
}

// Catálogo de tags + tags do usuário vêm numa chamada só (`getUserTagsCompleto`) — antes eram
// 2 invocações à edge, cada uma pagando auth + rate limit na VM Nano.
const AdminTagSelector = ({ userId }: Props) => {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const load = async () => {
      const { data, error } = await supabase.functions.invoke("admin-tags", {
        body: { action: "getUserTagsCompleto", userId },
      });
      if (cancelado) return;
      if (!error && data) {
        if (Array.isArray(data.tags)) setAllTags(data.tags);
        if (Array.isArray(data.tagIds)) setSelectedIds(data.tagIds);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelado = true;
    };
  }, [userId]);

  const toggleTag = async (tagId: string) => {
    setSaving(true);
    const newIds = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    setSelectedIds(newIds);

    await supabase.functions.invoke("admin-tags", {
      body: { action: "setUserTags", userId, tagIds: newIds },
    });
    setSaving(false);
  };

  if (loading) return <p className="text-muted-foreground font-body text-sm">Carregando tags...</p>;
  if (allTags.length === 0) return <p className="text-muted-foreground font-body text-sm">Nenhuma tag criada. Crie tags no gerenciador do painel.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {allTags.map((tag) => {
        const isSelected = selectedIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggleTag(tag.id)}
            disabled={saving}
            aria-pressed={isSelected}
            className={`inline-flex items-center px-3 py-1 text-xs font-heading uppercase tracking-wider rounded-full transition-all duration-200 border-2 ${
              isSelected
                ? "text-white border-transparent"
                : "text-muted-foreground border-muted-foreground/30 bg-transparent hover:border-muted-foreground/60"
            }`}
            style={isSelected ? { backgroundColor: tag.cor, borderColor: tag.cor } : {}}
          >
            {tag.nome}
          </button>
        );
      })}
    </div>
  );
};

export default AdminTagSelector;
