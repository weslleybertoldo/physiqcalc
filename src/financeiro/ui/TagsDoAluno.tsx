import { useEffect, useState, type FormEvent } from "react";
import { Plus, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { principal } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";

interface TagTreino {
  id: string;
  nome: string;
  cor: string | null;
}

/**
 * Tags do aluno (C47 — estavam no popup "Cobrança" do Calc). A matrícula no banco principal guarda os nomes (a fonte da
 * verdade desde a W3); para o aluno do Calc, o catálogo e a marcação continuam também no Banco do Treino (a lista antiga de
 * alunos filtra por lá até a W13) — as 2 pontas são gravadas juntas.
 */
export function TagsDoAluno({ pacienteId, treinoUserId, tags, podeEditar, aoMudou }: {
  pacienteId: string;
  treinoUserId: string | null;
  tags: string[];
  podeEditar: boolean;
  aoMudou: () => void;
}) {
  const { user } = useAuth();
  const comTreino = !!treinoUserId && !!user;
  const [catalogo, setCatalogo] = useState<TagTreino[] | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>(tags);
  const [nova, setNova] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setMarcadas(tags), [tags]);
  useEffect(() => {
    if (!comTreino) return;
    let vivo = true;
    supabase.functions.invoke("admin-tags", { body: { action: "getUserTagsCompleto", userId: treinoUserId } }).then(({ data, error }) => {
      if (!vivo || error || !data) return;
      const cat = (data.tags ?? []) as TagTreino[];
      setCatalogo(cat);
      const ids = (data.tagIds ?? []) as string[];
      const doTreino = cat.filter((t) => ids.includes(t.id)).map((t) => t.nome);
      if (doTreino.length && !tags.length) setMarcadas(doTreino);
    });
    return () => {
      vivo = false;
    };
  }, [comTreino, treinoUserId, tags.length]);

  const gravar = async (nomes: string[]) => {
    setSalvando(true);
    const anterior = marcadas;
    setMarcadas(nomes);
    try {
      const { error } = await principal.from("pacientes").update({ tags: nomes }).eq("id", pacienteId);
      if (error) throw error;
      if (comTreino && catalogo) {
        const ids: string[] = [];
        for (const nome of nomes) {
          let t = catalogo.find((x) => x.nome.trim().toLowerCase() === nome.trim().toLowerCase());
          if (!t) {
            const r = await supabase.functions.invoke("admin-tags", { body: { action: "create", nome, cor: "#8B5CF6" } });
            t = (r.data as { tag?: TagTreino } | null)?.tag;
            if (t) setCatalogo((c) => [...(c ?? []), t!]);
          }
          if (t) ids.push(t.id);
        }
        await supabase.functions.invoke("admin-tags", { body: { action: "setUserTags", userId: treinoUserId, tagIds: ids } });
      }
      aoMudou();
    } catch (e) {
      console.error("[TagsDoAluno]", e);
      setMarcadas(anterior);
      toast.error("Não deu para salvar as tags.");
    } finally {
      setSalvando(false);
    }
  };

  const alternar = (nome: string) => void gravar(marcadas.includes(nome) ? marcadas.filter((x) => x !== nome) : [...marcadas, nome]);
  const adicionar = (e: FormEvent) => {
    e.preventDefault();
    const n = nova.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!n || marcadas.some((x) => x.toLowerCase() === n.toLowerCase())) return setNova("");
    setNova("");
    void gravar([...marcadas, n]);
  };
  const opcoes = [...new Set([...(catalogo ?? []).map((t) => t.nome), ...marcadas])].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <Cartao className="p-5" data-tags-aluno>
      <CabecalhoCartao titulo="Tags" extra={<Chip tom="g" icone={Tag}>{marcadas.length}</Chip>} />
      <div className="flex flex-wrap gap-2">
        {opcoes.length === 0 && <p className="text-[12.5px] text-texto-3">Nenhuma tag.</p>}
        {opcoes.map((nome) => {
          const ativa = marcadas.includes(nome);
          return podeEditar ? (
            <button key={nome} type="button" disabled={salvando} onClick={() => alternar(nome)} data-tag={nome} data-tag-ativa={ativa || undefined}
              className={cn("pq-chip h-7 cursor-pointer px-3 text-[11.5px]", ativa ? "pq-chip-t" : "pq-chip-g opacity-70")}>
              {nome}
              {ativa && <X aria-hidden className="!h-3 !w-3" />}
            </button>
          ) : ativa ? <Chip key={nome} tom="t">{nome}</Chip> : null;
        })}
      </div>
      {podeEditar && (
        <form onSubmit={adicionar} className="mt-3 flex gap-2">
          <input value={nova} onChange={(e) => setNova(e.target.value)} maxLength={40} placeholder="Nova tag" data-tag-nova
            className="h-9 min-w-0 flex-1 rounded-[12px] border border-linha-2 bg-superficie px-3 text-[13px] text-texto outline-none focus:border-violeta/60" />
          <button type="submit" className="pq-botao pq-botao-g pq-botao-sm" disabled={!nova.trim() || salvando}><Plus aria-hidden /> Adicionar</button>
        </form>
      )}
    </Cartao>
  );
}
