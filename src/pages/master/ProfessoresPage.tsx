import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, MoreVertical, Plus, Search, Users } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListaPaginada, usePaginado } from "@/components/ListaPaginada";
import { masterProfessores, planoComValor, type ProfessorRow } from "@/lib/saasApi";
import NovoProfessorDialog from "@/components/master/NovoProfessorDialog";
import ProfessorDetalhesSheet from "@/components/master/ProfessorDetalhesSheet";
import DefinirPlanoDialog from "@/components/master/DefinirPlanoDialog";
import {
  BTN_PRIMARIO, Carregando, Chip, ErroCarregar, Etiqueta, INPUT, INTEGRACAO_LABEL, LINHA, MENU_CONTENT, TituloPagina, Vazio,
  alunosTexto, copiar, mensagemErro, useConfirmacao, useDebounce,
} from "@/components/master/masterUi";

interface ListaProf { professores: ProfessorRow[]; total: number; semProfessor: number }
type StatusFiltro = "" | "ativo" | "suspenso";

// Professores (só master): lista paginada + convite/promoção + ações por professor.
const ProfessoresPage = () => {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const status = (["ativo", "suspenso"].includes(sp.get("status") || "") ? sp.get("status") : "") as StatusFiltro;
  const [q, setQ] = useState("");
  const qDeb = useDebounce(q.trim(), 300);

  const fetchPage = useCallback((offset: number, limit: number) =>
    masterProfessores<ListaProf>("list", { limit, offset, ...(qDeb ? { q: qDeb } : {}), ...(status ? { status } : {}) })
      .then((r) => ({ itens: r.professores, total: r.total })), [qDeb, status]);
  const lista = usePaginado<ProfessorRow>(fetchPage, [qDeb, status]);

  const [novoAberto, setNovoAberto] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [planoDe, setPlanoDe] = useState<ProfessorRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmacao();

  const setStatus = (s: StatusFiltro) => {
    const n = new URLSearchParams(sp);
    if (s) n.set("status", s); else n.delete("status");
    setSp(n, { replace: true });
  };

  const rodar = async (p: ProfessorRow, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(p.id);
    try {
      await fn();
      toast.success(ok);
      void lista.recarregar();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusyId(null);
    }
  };

  const suspender = async (p: ProfessorRow) => {
    const ok = await confirmar({
      titulo: `Suspender ${p.nome}?`,
      descricao: "Ele perde o acesso ao painel e ao app dos alunos dele até ser reativado. Os alunos continuam vinculados a ele.",
      confirmar: "Suspender", perigo: true,
    });
    if (ok) await rodar(p, () => masterProfessores("suspend", { userId: p.id }), "Professor suspenso.");
  };
  const reativar = (p: ProfessorRow) => rodar(p, () => masterProfessores("reactivate", { userId: p.id }), "Professor reativado.");
  const remover = async (p: ProfessorRow) => {
    if (p.alunos > 0) { toast.error(mensagemErro("tem_alunos")); return; }
    const ok = await confirmar({
      titulo: `Remover ${p.nome} dos professores?`,
      descricao: "A conta volta a ser de aluno comum (perde o painel, o código de convite e o plano). Só é possível com 0 alunos.",
      confirmar: "Remover", perigo: true,
    });
    if (ok) await rodar(p, () => masterProfessores("remove", { userId: p.id }), "Professor removido.");
  };

  return (
    <div data-pagina="master-professores">
      <TituloPagina
        titulo="Professores"
        sub={lista.loading ? "Carregando..." : `${lista.total} professor(es)`}
        acao={(
          <button type="button" onClick={() => setNovoAberto(true)} className={BTN_PRIMARIO} data-btn-novo-professor>
            <Plus size={12} className="inline mr-1 -mt-0.5" />Novo professor
          </button>
        )}
      />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-5">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, e-mail ou código..."
            className={`${INPUT} pl-6`}
            data-input-busca-professor
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip ativo={status === ""} onClick={() => setStatus("")} data-filtro="todos">Todos</Chip>
          <Chip ativo={status === "ativo"} onClick={() => setStatus("ativo")} data-filtro="ativo">Ativos</Chip>
          <Chip ativo={status === "suspenso"} onClick={() => setStatus("suspenso")} data-filtro="suspenso">Suspensos</Chip>
        </div>
      </div>

      {lista.erro && <ErroCarregar texto={mensagemErro(lista.erro)} onRetry={() => void lista.recarregar()} />}
      {lista.loading ? <Carregando /> : lista.itens.length === 0 ? (
        <Vazio texto={qDeb || status ? "Nenhum professor com esse filtro." : "Nenhum professor ainda. Convide o primeiro."} />
      ) : (
        <div data-lista-professores>
          {lista.itens.map((p) => (
            <div key={p.id} className={`${LINHA} flex items-start gap-2 ${busyId === p.id ? "opacity-60" : ""}`} data-professor-linha={p.id}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => setDetalheId(p.id)} className="font-heading text-sm text-foreground truncate max-w-full text-left hover:text-primary transition-colors" data-btn-detalhes>
                    {p.nome}
                  </button>
                  {p.ehMaster && <Etiqueta tom="ok" className="!text-[10px]">Master</Etiqueta>}
                  {p.status === "suspenso" ? (
                    <Etiqueta tom="ruim" className="!text-[10px]">Suspenso</Etiqueta>
                  ) : p.acessoOk ? (
                    <Etiqueta tom="ok" className="!text-[10px]">Acesso ok</Etiqueta>
                  ) : (
                    <Etiqueta tom="ruim" className="!text-[10px]">Travado</Etiqueta>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-body truncate">{p.email || "—"}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs font-body text-muted-foreground">
                  <span title="Alunos / máximo do plano" className="inline-flex items-center gap-1">
                    <Users size={11} />{alunosTexto(p.alunos, p.plano?.max_alunos)}
                  </span>
                  <span className="text-primary">{planoComValor(p.plano)}</span>
                  <span>{INTEGRACAO_LABEL[p.integracao] ?? p.integracao}</span>
                  <button
                    type="button"
                    onClick={() => void copiar(p.codigo_convite, "Código copiado!")}
                    className="inline-flex items-center gap-1 hover:text-primary transition-colors font-heading tracking-wider"
                    title="Copiar código de convite"
                    data-btn-copiar-codigo
                  >
                    <Copy size={11} />{p.codigo_convite}
                  </button>
                </div>
              </div>

              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors" aria-label="Ações" data-btn-acoes-professor>
                    <MoreVertical size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={MENU_CONTENT}>
                  <DropdownMenuItem onSelect={() => setDetalheId(p.id)}>Ver detalhes</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPlanoDe(p)}>Definir plano</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate(`/master/alunos?professorId=${p.id}`)}>Mover alunos</DropdownMenuItem>
                  {!p.ehMaster && <DropdownMenuItem onSelect={() => navigate(`/master/financeiro?professorId=${p.id}`)}>Financeiro</DropdownMenuItem>}
                  {!p.ehMaster && (
                    <>
                      <DropdownMenuSeparator className="bg-muted-foreground/30" />
                      {p.status === "ativo" ? (
                        <DropdownMenuItem onSelect={() => void suspender(p)} className="text-destructive focus:text-destructive" data-menu="suspender">Suspender</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => void reativar(p)} data-menu="reativar">Reativar</DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => void remover(p)}
                        disabled={p.alunos > 0}
                        className="text-destructive focus:text-destructive"
                        title={p.alunos > 0 ? "Só com 0 alunos — mova os alunos antes" : undefined}
                        data-menu="remover"
                      >
                        Remover{p.alunos > 0 ? " (tem alunos)" : ""}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          <ListaPaginada total={lista.total} mostrando={lista.itens.length} carregandoMais={lista.carregandoMais} onVerMais={lista.verMais} rotulo="professores" />
        </div>
      )}

      <NovoProfessorDialog open={novoAberto} onOpenChange={setNovoAberto} onCriado={() => void lista.recarregar()} />
      <ProfessorDetalhesSheet userId={detalheId} onClose={() => setDetalheId(null)} />
      <DefinirPlanoDialog professor={planoDe} onClose={() => setPlanoDe(null)} onSalvo={() => void lista.recarregar()} />
      {dialogo}
    </div>
  );
};

export default ProfessoresPage;
