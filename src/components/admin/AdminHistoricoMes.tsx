import { useState, useEffect, useCallback } from "react";
import { X, Timer, Dumbbell, MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDuracao } from "@/lib/treinoResumo";
import DetalheTreino, { type TreinoRow } from "@/components/treinos/DetalheTreino";
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
  /** Alunos do painel (seletor de aluno + busca do histórico completo). Dispensável no modo usuário fixo. */
  users?: UserOption[];
  /**
   * Modo "Configurar Usuário › Histórico": a lista fica presa neste aluno — sem seletor
   * de aluno nem busca do histórico completo; sobram só os filtros de mês e ano.
   */
  userId?: string;
}

/** "2026-08-24" → "24/08" */
function diaMes(data: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

/** Casca do popup: fundo, ESC, clique fora e botão de fechar. */
function Popup({ titulo, onFechar, children }: {
  titulo: string;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-8 overflow-y-auto"
      onClick={onFechar}
    >
      <div
        className="bg-background border border-muted-foreground/30 rounded-lg w-full max-w-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg text-foreground">{titulo}</h3>
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const AdminHistoricoMes = ({ users = [], userId }: Props) => {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [itens, setItens] = useState<ItemHistorico[]>([]);
  const [filtroAluno, setFiltroAluno] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  // Popup de UM treino (clique na linha da lista)
  const [treinoAberto, setTreinoAberto] = useState<ItemHistorico | null>(null);
  const [treino, setTreino] = useState<TreinoRow | null>(null);
  const [carregandoTreino, setCarregandoTreino] = useState(false);

  // Popup do histórico COMPLETO de um aluno (botão Buscar do topo)
  const [historicoAberto, setHistoricoAberto] = useState<{ userId: string; nome: string } | null>(null);
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

  const abrirTreino = async (item: ItemHistorico) => {
    setTreinoAberto(item);
    setTreino(null);
    setCarregandoTreino(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-relatorio", {
        body: { action: "historicoTreino", userId: item.userId, chave: item.chave },
      });
      if (error) throw error;
      setTreino((data?.treino ?? null) as TreinoRow | null);
    } catch (err) {
      console.error("[AdminHistoricoMes] Erro ao abrir treino:", err);
      setTreino(null);
    }
    setCarregandoTreino(false);
  };

  const abrirBusca = () => {
    const u = users.find((x) => x.id === buscaUserId);
    if (u) setHistoricoAberto({ userId: u.id, nome: u.nome });
  };

  const anos = [hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2];

  // Usuário fixo (Configurar Usuário) manda; senão vale o seletor de aluno do painel.
  const usuarioFixo = Boolean(userId);
  const alunoFiltrado = userId ?? filtroAluno;
  // Só entram no seletor os alunos que treinaram no mês exibido.
  const alunosDoMes = users.filter((u) => itens.some((i) => i.userId === u.id));
  const visiveis = alunoFiltrado ? itens.filter((i) => i.userId === alunoFiltrado) : itens;

  return (
    <div className="space-y-6">
      {/* Histórico completo de um aluno (só no painel — no usuário fixo não há aluno a escolher) */}
      {!usuarioFixo && (
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
      )}

      {/* Filtro do mês da lista */}
      <div className="flex gap-2" data-historico-filtros>
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="input-underline text-sm py-1 flex-1"
          data-historico-mes
        >
          {MESES.map((m, i) => (
            <option key={m} value={i + 1} className="bg-background text-foreground">{m}</option>
          ))}
        </select>
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="input-underline text-sm py-1 w-28"
          data-historico-ano
        >
          {anos.map((a) => (
            <option key={a} value={a} className="bg-background text-foreground">{a}</option>
          ))}
        </select>
        {!usuarioFixo && (
        <select
          value={filtroAluno}
          onChange={(e) => setFiltroAluno(e.target.value)}
          className="input-underline text-sm py-1 flex-1 min-w-0"
        >
          <option value="" className="bg-background text-foreground">Todos os alunos</option>
          {alunosDoMes.map((u) => (
            <option key={u.id} value={u.id} className="bg-background text-foreground">{u.nome}</option>
          ))}
        </select>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground font-body text-sm">Carregando...</p>
      ) : erro ? (
        <p className="text-destructive font-body text-sm text-center py-8">
          Erro ao carregar os treinos. Tente novamente.
        </p>
      ) : visiveis.length === 0 ? (
        <p className="text-muted-foreground font-body text-sm text-center py-8">
          {alunoFiltrado
            ? `Este aluno não tem treinos em ${MESES[mes - 1]} de ${ano}.`
            : `Nenhum treino registrado em ${MESES[mes - 1]} de ${ano}.`}
        </p>
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading" data-historico-contagem>
            {visiveis.length} {visiveis.length === 1 ? "treino" : "treinos"} em {MESES[mes - 1]}
          </p>
          <div className="space-y-0">
            {visiveis.map((it) => (
              <button
                key={it.chave}
                type="button"
                data-historico-linha
                onClick={() => abrirTreino(it)}
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

      {/* Popup de UM treino: só o que foi feito naquele dia */}
      {treinoAberto && (
        <Popup titulo={treinoAberto.pessoa} onFechar={() => { setTreinoAberto(null); setTreino(null); }}>
          {carregandoTreino ? (
            <p className="text-muted-foreground font-body text-sm py-6 text-center">Carregando...</p>
          ) : treino ? (
            <DetalheTreino treino={treino} />
          ) : (
            <p className="text-destructive font-body text-sm py-6 text-center">
              Não consegui carregar os detalhes deste treino.
            </p>
          )}
        </Popup>
      )}

      {/* Popup do histórico completo do aluno */}
      {historicoAberto && (
        <Popup titulo={historicoAberto.nome} onFechar={() => setHistoricoAberto(null)}>
          <HistoricoTreinos userId={historicoAberto.userId} isAdmin />
        </Popup>
      )}
    </div>
  );
};

export default AdminHistoricoMes;
