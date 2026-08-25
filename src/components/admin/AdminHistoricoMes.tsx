import { useState, useEffect, useCallback } from "react";
import { X, Timer, Dumbbell, MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDuracao } from "@/lib/treinoResumo";
import HistoricoTreinos from "@/components/treinos/HistoricoTreinos";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface UserOption {
  id: string;
  nome: string;
  email: string;
}

interface ItemHistorico {
  chave: string;
  userId: string;
  pessoa: string;
  data: string;          // YYYY-MM-DD
  diaSemana: string;     // DOM..SAB
  nomeTreino: string;
  duracaoSegundos: number | null;
  totalExercicios: number;
  academia: string | null;
  comCronometro: boolean;
}

interface Props {
  users: UserOption[];
}

/** "2026-08-24" → "24/08" */
function diaMes(data: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

const AdminHistoricoMes = ({ users }: Props) => {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [itens, setItens] = useState<ItemHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  // Popup do histórico completo de uma pessoa
  const [popup, setPopup] = useState<{ userId: string; nome: string } | null>(null);
  // Seletor do topo ("buscar histórico completo")
  const [buscaUserId, setBuscaUserId] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(false);
    try {
      const { data, error } = await supabase.functions.invoke("admin-relatorio", {
        body: { action: "historicoMes", ano, mes },
      });
      if (error) throw error;
      setItens((data?.itens ?? []) as ItemHistorico[]);
    } catch (err) {
      console.error("[AdminHistoricoMes] Erro ao carregar:", err);
      setErro(true);
      setItens([]);
    }
    setLoading(false);
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  // ESC fecha o popup
  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPopup(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup]);

  const anos = [hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2];

  const abrirBusca = () => {
    const u = users.find((x) => x.id === buscaUserId);
    if (u) setPopup({ userId: u.id, nome: u.nome });
  };

  return (
    <div className="space-y-6">
      {/* Busca do histórico completo de um aluno */}
      <div className="border border-muted-foreground/20 rounded-lg p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">
          Histórico completo de um aluno
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={buscaUserId}
            onChange={(e) => setBuscaUserId(e.target.value)}
            className="input-underline text-sm py-1 flex-1 min-w-0"
          >
            <option value="" className="bg-background text-foreground">Selecione o aluno...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id} className="bg-background text-foreground">
                {u.nome} ({u.email})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={abrirBusca}
            disabled={!buscaUserId}
            className="px-4 py-2 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest rounded disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
          >
            <Search size={14} /> Buscar
          </button>
        </div>
      </div>

      {/* Filtro do mês da lista */}
      <div className="flex gap-2">
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="input-underline text-sm py-1 flex-1"
        >
          {MESES.map((m, i) => (
            <option key={m} value={i + 1} className="bg-background text-foreground">{m}</option>
          ))}
        </select>
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="input-underline text-sm py-1 w-28"
        >
          {anos.map((a) => (
            <option key={a} value={a} className="bg-background text-foreground">{a}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-muted-foreground font-body text-sm">Carregando...</p>
      ) : erro ? (
        <p className="text-destructive font-body text-sm text-center py-8">
          Erro ao carregar os treinos. Tente novamente.
        </p>
      ) : itens.length === 0 ? (
        <p className="text-muted-foreground font-body text-sm text-center py-8">
          Nenhum treino registrado em {MESES[mes - 1]} de {ano}.
        </p>
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">
            {itens.length} {itens.length === 1 ? "treino" : "treinos"} em {MESES[mes - 1]}
          </p>
          <div className="space-y-0">
            {itens.map((it) => (
              <button
                key={it.chave}
                type="button"
                onClick={() => setPopup({ userId: it.userId, nome: it.pessoa })}
                className="w-full text-left border-b border-muted-foreground/20 py-3 hover:bg-muted-foreground/5 transition-colors px-1"
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground font-heading tabular-nums shrink-0">
                    {diaMes(it.data)} {it.diaSemana}
                  </span>
                  <span className="font-heading text-sm text-primary">{it.pessoa}</span>
                  <span className="text-muted-foreground/50 text-xs">—</span>
                  <span className="font-heading text-sm text-foreground">{it.nomeTreino}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {it.comCronometro && it.duracaoSegundos !== null ? (
                    <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                      <Timer size={10} /> {formatDuracao(it.duracaoSegundos)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 font-body italic">sem cronômetro</span>
                  )}
                  {it.totalExercicios > 0 && (
                    <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                      <Dumbbell size={10} /> {it.totalExercicios} exercícios
                    </span>
                  )}
                  {it.academia && (
                    <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                      <MapPin size={10} /> {it.academia}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Popup com o histórico completo do aluno */}
      {popup && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-8 overflow-y-auto"
          onClick={() => setPopup(null)}
        >
          <div
            className="bg-background border border-muted-foreground/30 rounded-lg w-full max-w-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-lg text-foreground">{popup.nome}</h3>
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <HistoricoTreinos userId={popup.userId} isAdmin />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminHistoricoMes;
