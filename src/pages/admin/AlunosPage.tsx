import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, Eye, FileDown, MoreVertical, Receipt, Search, Settings, Share2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { listarAlunos, professorConvites, type AlunoRow } from "@/lib/saasApi";
import { invokeMp } from "@/lib/mpClient";
import { generateAdminPDF, type AdminProfile } from "@/lib/generateAdminPDF";
import { ListaPaginada, usePaginado } from "@/components/ListaPaginada";
import ConviteAlunoDialog, { compartilharLink, erroConviteMsg } from "@/components/admin/ConviteAlunoDialog";
import { BadgePagamento } from "@/components/admin/ComprovantePixCard";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Tag { id: string; nome: string; cor: string }
interface BadgeInfo { s: string; ate: string | null }
interface BadgesResp { badges?: Record<string, string>; badgesData?: Record<string, BadgeInfo>; aguardando?: Record<string, string> }

/** Código de erro ({ error }) de uma resposta não-2xx do supabase.functions.invoke. */
async function codigoErroInvoke(error: unknown): Promise<string | null> {
  try {
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.clone === "function") {
      const j = await ctx.clone().json();
      return typeof j?.error === "string" ? j.error : null;
    }
  } catch { /* corpo não-JSON */ }
  return null;
}

const BTN_SEC = "inline-flex items-center gap-1.5 border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider px-4 py-2 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50";
const BTN_PRI = "inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50";

// Lista de alunos do PROFESSOR (SaaS 12/09/2026) — porte do AdminPanel antigo pra dentro do layout com sidebar.
// Paginação server-side (20 + "Ver mais"), busca server-side (q) e filtro por tag client-side (página carregada).
const AlunosPage = () => {
  const { user, papel } = useAuth();
  const navigate = useNavigate();
  // No Admin o master vê SÓ os alunos dele (a visão de todos fica no Master)
  const escopo = papel === "master" ? user?.id ?? undefined : undefined;

  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const fetchPage = useCallback(async (offset: number, limit: number) => {
    const r = await listarAlunos({ limit, offset, q: q || undefined, professorId: escopo });
    return { itens: r.users, total: r.total };
  }, [q, escopo]);
  const { itens, total, loading, carregandoMais, erro, verMais, recarregar, setItens } = usePaginado<AlunoRow>(fetchPage, [q, escopo]);

  const [tagFiltro, setTagFiltro] = useState("");
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [userTagsMap, setUserTagsMap] = useState<Record<string, string[]>>({});
  const [badges, setBadges] = useState<Record<string, BadgeInfo>>({});
  const [aguardando, setAguardando] = useState<Record<string, string>>({});
  const [conviteAberto, setConviteAberto] = useState(false);
  const [alvoExcluir, setAlvoExcluir] = useState<AlunoRow | null>(null);
  const [compartilhando, setCompartilhando] = useState(false);

  const carregarTags = useCallback(async () => {
    const [tagsRes, userTagsRes] = await Promise.all([
      supabase.functions.invoke("admin-tags", { body: { action: "list" } }),
      supabase.functions.invoke("admin-tags", { body: { action: "getAllUserTags" } }),
    ]);
    if (!tagsRes.error && tagsRes.data?.tags) setAllTags(tagsRes.data.tags);
    if (!userTagsRes.error && userTagsRes.data?.userTags) {
      const map: Record<string, string[]> = {};
      (userTagsRes.data.userTags as { user_id: string; tag_id: string }[]).forEach((ut) => {
        (map[ut.user_id] ||= []).push(ut.tag_id);
      });
      setUserTagsMap(map);
    }
  }, []);

  // badge pago/pendente com data da cobertura (só quem tem mensalidade) + comprovantes Pix esperando — não bloqueia a lista
  const carregarBadges = useCallback(() => {
    invokeMp<BadgesResp>("admin-badges")
      .then((r) => { setBadges(r.badgesData || {}); setAguardando(r.aguardando || {}); })
      .catch((e) => console.error("[AlunosPage] admin-badges", e));
  }, []);

  useEffect(() => { void carregarTags(); carregarBadges(); }, [carregarTags, carregarBadges]);

  const handleCompartilhar = async () => {
    setCompartilhando(true);
    try {
      const { url } = await professorConvites<{ codigo: string; url: string }>("link");
      await compartilharLink(url);
    } catch (e) {
      toast.error(erroConviteMsg(e, "Erro ao gerar o link de convite."));
    } finally {
      setCompartilhando(false);
    }
  };

  const handleGeneratePDF = async (userId: string) => {
    const { data, error } = await supabase.functions.invoke("admin-get-user", { body: { userId } });
    if (error || !data?.profile) { toast.error("Erro ao carregar os dados do aluno."); return; }
    generateAdminPDF(data.profile as AdminProfile, data.avaliacoes ?? []);
  };

  const handleBlock = async (u: AlunoRow) => {
    const novo = u.status === "bloqueado" ? "ativo" : "bloqueado";
    const { error } = await supabase.functions.invoke("admin-update-user", { body: { userId: u.id, data: { status: novo } } });
    if (error) { toast.error("Erro ao atualizar o status."); return; }
    // atualiza a linha no lugar (mantém as páginas já carregadas)
    setItens((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: novo } : x)));
    toast.success(novo === "bloqueado" ? "Aluno bloqueado." : "Aluno desbloqueado.");
  };

  // Professor: o servidor só DESVINCULA ({ desvinculado: true }) — a conta é do aluno. Master: apaga a conta.
  const handleExcluir = async () => {
    const alvo = alvoExcluir;
    setAlvoExcluir(null);
    if (!alvo) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { userId: alvo.id } });
    if (error) {
      const cod = await codigoErroInvoke(error);
      toast.error(cod === "conta_real_protegida" ? "Em staging só dá pra excluir conta de teste."
        : cod === "cannot_delete_self" ? "Você não pode excluir a própria conta."
        : cod === "forbidden" ? "Esse aluno não está na sua lista."
        : "Erro ao remover o aluno.");
      return;
    }
    toast.success(data?.desvinculado ? `${alvo.nome || alvo.email || "Aluno"} saiu da sua lista.` : "Conta excluída.");
    void recarregar();
    carregarBadges();
  };

  // só tags em uso por algum aluno (como no painel antigo)
  const todasAsTags = useMemo(() => {
    const emUso = new Set<string>();
    Object.values(userTagsMap).forEach((ids) => ids.forEach((id) => emUso.add(id)));
    return allTags.filter((t) => emUso.has(t.id)).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [allTags, userTagsMap]);

  const visiveis = tagFiltro ? itens.filter((u) => (userTagsMap[u.id] || []).includes(tagFiltro)) : itens;
  const rotuloExcluir = papel === "master" ? "Excluir conta" : "Remover da minha lista";
  const nomeAlvo = alvoExcluir?.nome || alvoExcluir?.email || "este aluno";

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-pagina-alunos>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl text-foreground uppercase tracking-wider">Alunos</h1>
          <p className="text-xs text-muted-foreground font-body mt-1" data-total-alunos={total}>
            {loading ? "Carregando..." : `${total} aluno${total === 1 ? "" : "s"}${q ? ` para "${q}"` : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleCompartilhar} disabled={compartilhando} className={BTN_SEC} data-btn-compartilhar>
            <Share2 size={13} /> Compartilhar link
          </button>
          <button type="button" onClick={() => setConviteAberto(true)} className={BTN_PRI} data-btn-convidar>
            <UserPlus size={13} /> Convidar aluno
          </button>
        </div>
      </header>

      {/* Busca (server-side) + filtro por tag (client-side) */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, email ou ID..."
            className="input-underline pl-6 text-base"
            data-busca-alunos
          />
        </div>
        {todasAsTags.length > 0 && (
          <select
            value={tagFiltro}
            onChange={(e) => setTagFiltro(e.target.value)}
            className="bg-transparent border-b border-muted-foreground text-foreground font-body text-[11px] py-2 outline-none focus:border-primary min-w-[160px]"
            data-filtro-tag
          >
            <option value="" className="bg-background text-foreground">Todas as tags</option>
            {todasAsTags.map((tag) => (
              <option key={tag.id} value={tag.id} className="bg-background text-foreground">{tag.nome}</option>
            ))}
          </select>
        )}
        {(busca || tagFiltro) && (
          <button type="button" onClick={() => { setBusca(""); setTagFiltro(""); }}
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors whitespace-nowrap">
            ✕ Limpar
          </button>
        )}
      </div>

      {/* Lista */}
      {erro ? (
        <p className="text-sm text-destructive font-body">
          {erro === "plano_vencido" ? "Seu plano está vencido — regularize em Planos para ver seus alunos." : "Erro ao carregar os alunos. Tente novamente."}
        </p>
      ) : loading ? (
        <p className="text-muted-foreground font-body">Carregando...</p>
      ) : visiveis.length === 0 ? (
        total === 0 && !q ? (
          <div className="result-card border-primary/30 text-center space-y-3" data-alunos-vazio>
            <p className="font-heading text-foreground">Você ainda não tem alunos</p>
            <p className="text-xs text-muted-foreground font-body">Compartilhe seu link ou convide por e-mail — o aluno entra com Google e já aparece aqui.</p>
            <button type="button" onClick={() => setConviteAberto(true)} className={BTN_PRI}>
              <UserPlus size={13} /> Convidar aluno
            </button>
          </div>
        ) : (
          <p className="text-muted-foreground font-body">Nenhum aluno encontrado{tagFiltro ? " com essa tag nesta página" : ""}.</p>
        )
      ) : (
        <div className="space-y-0">
          {visiveis.map((u) => {
            const bloqueado = u.status === "bloqueado";
            const tagIds = userTagsMap[u.id] || [];
            const visibleTags = tagIds.slice(0, 3).map((tid) => allTags.find((t) => t.id === tid)).filter((t): t is Tag => !!t);
            const remaining = tagIds.length - 3;
            return (
              <div key={u.id} className="flex items-center justify-between gap-2 py-4 border-b border-muted-foreground/30" data-aluno-linha={u.id}>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-sm text-foreground truncate">{u.nome || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground font-body truncate">{u.email}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {u.user_code && <span className="text-xs text-muted-foreground font-body">ID: {u.user_code}</span>}
                    {u.plano_nome && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 font-body">{u.plano_nome}</span>
                    )}
                    <span className={`text-xs font-heading uppercase ${bloqueado ? "text-destructive" : "text-classify-green"}`}>
                      {bloqueado ? "bloqueado" : "ativo"}
                    </span>
                    {badges[u.id] && <BadgePagamento badge={badges[u.id]} />}
                    {aguardando[u.id] && (
                      <button
                        type="button"
                        onClick={() => navigate("/admin/cobranca")}
                        title="Ver o comprovante em Cobrança"
                        className="inline-flex items-center gap-1 text-xs font-heading uppercase px-2 py-0.5 rounded-full border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
                        data-badge-comprovante={u.id}
                      >
                        <Receipt size={11} /> comprovante para conferir
                      </button>
                    )}
                  </div>
                  {visibleTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {visibleTags.map((tag) => (
                        <span key={tag.id} className="inline-flex items-center px-2 py-0.5 text-[10px] font-heading uppercase tracking-wider text-white rounded-full" style={{ backgroundColor: tag.cor }}>
                          {tag.nome}
                        </span>
                      ))}
                      {remaining > 0 && <span className="text-[10px] text-muted-foreground font-body">+{remaining}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button type="button" onClick={() => navigate(`/admin/alunos/${u.id}/ver`)} title="Visualizar"
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors" data-btn-ver={u.id}>
                    <Eye size={16} />
                  </button>
                  <button type="button" onClick={() => navigate(`/admin/alunos/${u.id}`)} title="Configurar"
                    className="p-2 text-muted-foreground hover:text-primary transition-colors" data-btn-configurar={u.id}>
                    <Settings size={16} />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" title="Mais ações" className="p-2 text-muted-foreground hover:text-foreground transition-colors" data-btn-acoes={u.id}>
                        <MoreVertical size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-background border-muted-foreground/30 font-body">
                      <DropdownMenuItem onClick={() => handleGeneratePDF(u.id)} className="cursor-pointer">
                        <FileDown size={14} className="mr-2" /> Gerar PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBlock(u)} className="cursor-pointer" data-btn-bloquear={u.id}>
                        <Ban size={14} className="mr-2" /> {bloqueado ? "Desbloquear" : "Bloquear"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-muted-foreground/20" />
                      <DropdownMenuItem onClick={() => setAlvoExcluir(u)} className="cursor-pointer text-destructive focus:text-destructive" data-btn-excluir={u.id}>
                        <Trash2 size={14} className="mr-2" /> {rotuloExcluir}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !erro && (
        <ListaPaginada total={total} mostrando={itens.length} carregandoMais={carregandoMais} onVerMais={verMais} rotulo="alunos" />
      )}

      <ConviteAlunoDialog open={conviteAberto} onOpenChange={setConviteAberto} onVinculado={() => { void recarregar(); carregarBadges(); }} />

      <AlertDialog open={!!alvoExcluir} onOpenChange={(o) => { if (!o) setAlvoExcluir(null); }}>
        <AlertDialogContent className="bg-background border-muted-foreground/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-foreground">
              {papel === "master" ? "Excluir conta?" : "Remover da sua lista?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {papel === "master"
                ? <>Tem certeza? O perfil de <b>{nomeAlvo}</b> será removido permanentemente.</>
                : <><b>{nomeAlvo}</b> sai da sua lista de alunos e fica sem professor. A conta e os dados dele continuam existindo — ele pode voltar pelo seu link.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-muted-foreground/30 text-foreground">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-btn-confirmar-excluir>
              {papel === "master" ? "Excluir" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AlunosPage;
