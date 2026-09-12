import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeftRight, Search, Settings } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListaPaginada, usePaginado } from "@/components/ListaPaginada";
import { listarAlunos, masterProfessores, type AlunoRow, type ProfessorRow } from "@/lib/saasApi";
import MoverAlunosDialog from "@/components/master/MoverAlunosDialog";
import {
  BTN_MINI_NEUTRO, BTN_MINI_PRIMARIO, Carregando, Chip, ErroCarregar, Etiqueta, INPUT, LINHA, SELECT_CONTENT, SELECT_TRIGGER,
  TituloPagina, Vazio, alunosTexto, mensagemErro, useDebounce,
} from "@/components/master/masterUi";

const CHECK_CLS = "mt-1 border-muted-foreground/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground";

// Alunos (master): TODOS os alunos, filtro Todos · Sem professor · por professor (?professorId= / ?semProfessor=1),
// seleção múltipla e "Mover" (só o master move — decisão do Weslley).
const AlunosMasterPage = () => {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const professorId = sp.get("professorId") || "";
  const semProfessor = sp.get("semProfessor") === "1";
  const [q, setQ] = useState("");
  const qDeb = useDebounce(q.trim(), 300);

  const [professores, setProfessores] = useState<ProfessorRow[]>([]);
  const carregarProfessores = useCallback(() => {
    masterProfessores<{ professores: ProfessorRow[] }>("list", { limit: 100 })
      .then((r) => setProfessores(r.professores))
      .catch((e) => toast.error(mensagemErro(e)));
  }, []);
  useEffect(() => { carregarProfessores(); }, [carregarProfessores]);
  const profPorId = useMemo(() => new Map(professores.map((p) => [p.id, p])), [professores]);

  const fetchPage = useCallback((offset: number, limit: number) =>
    listarAlunos({
      limit, offset,
      ...(qDeb ? { q: qDeb } : {}),
      ...(semProfessor ? { semProfessor: true } : professorId ? { professorId } : {}),
    }).then((r) => ({ itens: r.users, total: r.total })), [qDeb, professorId, semProfessor]);
  const lista = usePaginado<AlunoRow>(fetchPage, [qDeb, professorId, semProfessor]);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mover, setMover] = useState<AlunoRow[] | null>(null);

  const setFiltro = (f: "todos" | "sem" | { professorId: string }) => {
    const n = new URLSearchParams();
    if (f === "sem") n.set("semProfessor", "1");
    else if (typeof f === "object") n.set("professorId", f.professorId);
    setSp(n, { replace: true });
    setSel(new Set());
  };

  const ehProfessor = (a: AlunoRow) => profPorId.has(a.id);
  const selecionaveis = lista.itens.filter((a) => !ehProfessor(a));
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((a) => sel.has(a.id));
  const toggleTodos = () => {
    if (todosMarcados) setSel(new Set());
    else setSel(new Set(selecionaveis.map((a) => a.id)));
  };
  const toggle = (id: string, v: boolean) => setSel((prev) => {
    const n = new Set(prev);
    if (v) n.add(id); else n.delete(id);
    return n;
  });

  const professorFiltrado = professorId ? profPorId.get(professorId) : null;
  const aposMover = () => {
    setSel(new Set());
    void lista.recarregar();
    carregarProfessores(); // contagem N/máx dos professores muda
  };

  return (
    <div data-pagina="master-alunos">
      <TituloPagina
        titulo="Alunos"
        sub={lista.loading ? "Carregando..." : (
          <>
            {lista.total} aluno(s)
            {semProfessor ? " sem professor" : professorFiltrado ? <> de <span className="text-primary">{professorFiltrado.nome}</span> ({alunosTexto(professorFiltrado.alunos, professorFiltrado.plano?.max_alunos)})</> : " no total"}
            {" · só o master move alunos"}
          </>
        )}
      />

      <div className="flex flex-col gap-3 mb-5">
        <div className="relative">
          <Search size={14} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, e-mail ou ID..."
            className={`${INPUT} pl-6`}
            data-input-busca-aluno
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip ativo={!semProfessor && !professorId} onClick={() => setFiltro("todos")} data-filtro="todos">Todos</Chip>
          <Chip ativo={semProfessor} onClick={() => setFiltro("sem")} data-filtro="sem-professor">Sem professor</Chip>
          <Select value={professorId} onValueChange={(v) => setFiltro(v === "__todos__" ? "todos" : { professorId: v })}>
            <SelectTrigger className={`${SELECT_TRIGGER} w-auto min-w-[180px] max-w-full h-8 rounded-full text-[11px] ${professorId ? "border-primary text-primary" : ""}`} data-select-professor>
              <SelectValue placeholder="Por professor…" />
            </SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>
              <SelectItem value="__todos__">Todos os professores</SelectItem>
              {professores.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}{p.ehMaster ? " (master)" : ""} · {alunosTexto(p.alunos, p.plano?.max_alunos)}{p.status === "suspenso" ? " · suspenso" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {sel.size > 0 && (
        <div className="sticky top-0 z-10 bg-background border border-primary/40 p-2 mb-3 flex flex-wrap items-center gap-2 text-xs font-body" data-barra-selecao>
          <span className="text-foreground">{sel.size} selecionado(s)</span>
          <button
            type="button"
            onClick={() => setMover(lista.itens.filter((a) => sel.has(a.id)))}
            className={BTN_MINI_PRIMARIO}
            data-btn-mover-selecionados
          >
            <ArrowLeftRight size={10} className="inline mr-1" />Mover selecionados
          </button>
          <button type="button" onClick={() => setSel(new Set())} className={BTN_MINI_NEUTRO}>Limpar</button>
        </div>
      )}

      {lista.erro && <ErroCarregar texto={mensagemErro(lista.erro)} onRetry={() => void lista.recarregar()} />}
      {lista.loading ? <Carregando /> : lista.itens.length === 0 ? (
        <Vazio texto={semProfessor ? "Nenhum aluno na fila 'Sem professor'." : qDeb ? "Nenhum aluno encontrado." : "Nenhum aluno."} />
      ) : (
        <div data-lista-alunos>
          <div className="flex items-center gap-2 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-body">
            <Checkbox checked={todosMarcados} onCheckedChange={toggleTodos} className={`${CHECK_CLS} !mt-0`} aria-label="Selecionar todos visíveis" data-check-todos />
            <span>Selecionar visíveis ({selecionaveis.length})</span>
          </div>
          {lista.itens.map((a) => {
            const prof = a.professor_id ? profPorId.get(a.professor_id) : null;
            const ehProf = ehProfessor(a);
            return (
              <div key={a.id} className={`${LINHA} flex items-start gap-2`} data-aluno-linha={a.id}>
                <Checkbox
                  checked={sel.has(a.id)}
                  onCheckedChange={(v) => toggle(a.id, v === true)}
                  disabled={ehProf}
                  className={CHECK_CLS}
                  aria-label={`Selecionar ${a.nome || a.email}`}
                  data-check-aluno
                />
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-sm text-foreground truncate">{a.nome || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground font-body truncate">{a.email}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs font-body">
                    {a.user_code && <span className="text-muted-foreground">ID {a.user_code}</span>}
                    {ehProf ? (
                      <Etiqueta tom="info" className="!text-[10px]">Professor (conta própria)</Etiqueta>
                    ) : a.professor_id ? (
                      <span className="text-muted-foreground">Prof.: <span className="text-foreground">{prof?.nome ?? "…"}</span></span>
                    ) : (
                      <Etiqueta tom="aviso" className="!text-[10px]" data-sem-professor>— sem professor —</Etiqueta>
                    )}
                    <span className={`font-heading uppercase ${a.status === "bloqueado" ? "text-destructive" : "text-classify-green"}`}>
                      {a.status === "bloqueado" ? "bloqueado" : "ativo"}
                    </span>
                    {a.plano_nome && <span className="bg-primary/10 text-primary px-2 py-0.5">{a.plano_nome}</span>}
                  </div>
                </div>
                <div className="flex items-center shrink-0 -mr-2">
                  <button type="button" onClick={() => navigate(`/admin/alunos/${a.id}`)} title="Configurar (Admin)" className="p-2 text-muted-foreground hover:text-primary transition-colors" data-btn-configurar>
                    <Settings size={16} />
                  </button>
                  {!ehProf && (
                    <button type="button" onClick={() => setMover([a])} title="Mover para outro professor" className="p-2 text-muted-foreground hover:text-primary transition-colors" data-btn-mover>
                      <ArrowLeftRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <ListaPaginada total={lista.total} mostrando={lista.itens.length} carregandoMais={lista.carregandoMais} onVerMais={lista.verMais} rotulo="alunos" />
        </div>
      )}

      <MoverAlunosDialog alunos={mover} professores={professores} onClose={() => setMover(null)} onMovido={aposMover} />
    </div>
  );
};

export default AlunosMasterPage;
