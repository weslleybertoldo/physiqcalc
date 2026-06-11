import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props { userId: string }

interface GrupoDisp { id: string; nome: string; tipo: "catalogo" | "pessoal" }
interface SemanaRow { dia_semana: string; slot_idx: number | null; grupo_id: string | null; grupo_usuario_id: string | null }

// chave única por grupo (catálogo usa grupo_id, pessoal usa grupo_usuario_id)
const keyOf = (g: { id: string; tipo: string }) => `${g.tipo}:${g.id}`;
const keyOfRow = (r: SemanaRow) => r.grupo_usuario_id ? `pessoal:${r.grupo_usuario_id}` : `catalogo:${r.grupo_id}`;

const DIAS: { code: string; label: string }[] = [
  { code: "SEG", label: "Segunda" }, { code: "TER", label: "Terça" },
  { code: "QUA", label: "Quarta" }, { code: "QUI", label: "Quinta" },
  { code: "SEX", label: "Sexta" }, { code: "SAB", label: "Sábado" },
  { code: "DOM", label: "Domingo" },
];

export default function AdminSemanaUsuario({ userId }: Props) {
  const [grupos, setGrupos] = useState<GrupoDisp[]>([]);
  const [marcados, setMarcados] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [savingDia, setSavingDia] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-semana-treinos", { body: { action: "get", userId } });
      if (error) throw error;
      setGrupos((data?.gruposDisponiveis as GrupoDisp[]) || []);
      const map: Record<string, Set<string>> = {};
      ((data?.semana as SemanaRow[]) || []).forEach((r) => {
        (map[r.dia_semana] ||= new Set()).add(keyOfRow(r));
      });
      setMarcados(map);
    } catch {
      toast.error("Erro ao carregar a semana do usuário.");
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (dia: string, grupo: GrupoDisp) => {
    const k = keyOf(grupo);
    const atual = new Set(marcados[dia] || []);
    if (atual.has(k)) atual.delete(k); else atual.add(k);
    setMarcados((prev) => ({ ...prev, [dia]: atual }));
    setSavingDia(dia);
    try {
      const payload = grupos.filter((g) => atual.has(keyOf(g))).map((g) =>
        g.tipo === "pessoal" ? { grupo_usuario_id: g.id } : { grupo_id: g.id });
      const { error } = await supabase.functions.invoke("admin-semana-treinos", {
        body: { action: "setDia", userId, dia_semana: dia, grupos: payload },
      });
      if (error) throw error;
    } catch {
      toast.error("Erro ao salvar — recarregando.");
      await load();
    } finally { setSavingDia(null); }
  };

  return (
    <section className="section-divider pt-10">
      <h2 className="font-heading text-lg text-foreground mb-2">Treino Diário</h2>
      <p className="text-xs text-muted-foreground font-body mb-6">
        Marque os treinos que aparecem em cada dia. Repetem toda semana. Salva automaticamente.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground font-body">Carregando…</p>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body">
          Nenhum treino atribuído a este usuário. Atribua grupos em Gerenciar Treinos › Grupos.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {DIAS.map((d) => {
            const sel = grupos.filter((g) => marcados[d.code]?.has(keyOf(g)));
            const isOpen = aberto === d.code;
            return (
              <div key={d.code} className="border border-border rounded-md p-3">
                <button
                  type="button"
                  onClick={() => setAberto(isOpen ? null : d.code)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="text-sm font-heading uppercase tracking-wider text-foreground">{d.label}</span>
                  <span className="flex items-center gap-2">
                    {savingDia === d.code && <span className="text-xs text-muted-foreground">salvando…</span>}
                    <span className="text-xs text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
                  </span>
                </button>

                {sel.length > 0 ? (
                  <div className="flex flex-col gap-0.5 pl-1 mt-1">
                    {sel.map((g) => (
                      <span key={g.id} className="text-sm font-body text-foreground">
                        {g.nome}{g.tipo === "pessoal" ? " (pessoal)" : ""}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="block text-xs text-muted-foreground font-body pl-1 mt-1">Descanso</span>
                )}

                {isOpen && (
                  <div className="flex flex-col gap-1 pl-1 mt-2 border-t border-border pt-2">
                    {grupos.map((g) => {
                      const checked = marcados[d.code]?.has(keyOf(g)) ?? false;
                      return (
                        <label key={g.id} className="flex items-center gap-2 text-sm font-body cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={() => toggle(d.code, g)} className="accent-primary" />
                          <span>{g.nome}{g.tipo === "pessoal" ? " (pessoal)" : ""}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
