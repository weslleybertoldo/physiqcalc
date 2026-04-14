import { useState, useEffect } from "react";
import { LogOut, Search, Eye, Settings, Calculator, FileDown, Ban, Trash2, Tags, Dumbbell } from "lucide-react";
import { formatarDataCurta } from "@/utils/formatDate";
import { adminLogout, isAdminAuthenticated, isAdminAuthenticatedAsync } from "@/components/AdminLoginDialog";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import AdminUserConfig from "@/components/AdminUserConfig";
import AdminUserView from "@/components/AdminUserView";
import AdminTagManager from "@/components/AdminTagManager";
import AdminTreinos from "@/components/admin/AdminTreinos";
import Index from "./Index";
import { generateAdminPDF, type AdminProfile } from "@/lib/generateAdminPDF";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface UserProfile {
  id: string;
  nome: string | null;
  email: string | null;
  user_code: number | null;
  status: string | null;
  plano_nome: string | null;
  plano_expiracao: string | null;
  created_at: string | null;
}

const AdminPanel = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [tagFiltro, setTagFiltro] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "config" | "view" | "calculator" | "tags" | "treinos">("list");
  const [allTags, setAllTags] = useState<{ id: string; nome: string; cor: string }[]>([]);
  const [userTagsMap, setUserTagsMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    // Verificação síncrona rápida + async com HMAC
    if (!isAdminAuthenticated()) {
      navigate("/");
      return;
    }
    isAdminAuthenticatedAsync().then((valid) => {
      if (!valid) {
        adminLogout();
        navigate("/");
        return;
      }
      loadUsers();
    });
  }, [navigate]);

  const loadUsers = async () => {
    setLoading(true);
    const [usersRes, tagsRes, userTagsRes] = await Promise.all([
      supabase.functions.invoke("admin-list-users"),
      supabase.functions.invoke("admin-tags", { body: { action: "list" } }),
      supabase.functions.invoke("admin-tags", { body: { action: "getAllUserTags" } }),
    ]);
    if (!usersRes.error && usersRes.data?.users) setUsers(usersRes.data.users);
    if (!tagsRes.error && tagsRes.data?.tags) setAllTags(tagsRes.data.tags);
    if (!userTagsRes.error && userTagsRes.data?.userTags) {
      const map: Record<string, string[]> = {};
      (userTagsRes.data.userTags as { user_id: string; tag_id: string }[]).forEach((ut) => {
        if (!map[ut.user_id]) map[ut.user_id] = [];
        map[ut.user_id].push(ut.tag_id);
      });
      setUserTagsMap(map);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    adminLogout();
    navigate("/");
  };

  const handleGeneratePDF = async (userId: string) => {
    const { data, error } = await supabase.functions.invoke("admin-get-user", { body: { userId } });
    console.log('=== DEBUG PDF ===', { data, error, avaliacoes: data?.avaliacoes });
    if (data?.profile) {
      const avaliacoes = data.avaliacoes ?? [];
      console.log('Gerando PDF com', avaliacoes.length, 'avaliações');
      generateAdminPDF(data.profile as AdminProfile, avaliacoes);
    }
  };

  const handleBlockUser = async (userId: string, currentStatus: string | null) => {
    const newStatus = currentStatus === "bloqueado" ? "ativo" : "bloqueado";
    await supabase.functions.invoke("admin-update-user", {
      body: { userId, data: { status: newStatus } },
    });
    loadUsers();
  };

  const handleDeleteUser = async (userId: string) => {
    await supabase.functions.invoke("admin-delete-user", {
      body: { userId },
    });
    loadUsers();
  };

  const todasAsTags = (() => {
    const set = new Set<string>();
    Object.values(userTagsMap).forEach(tagIds => {
      tagIds.forEach(tid => {
        const tag = allTags.find(t => t.id === tid);
        if (tag) set.add(tag.id);
      });
    });
    return allTags.filter(t => set.has(t.id)).sort((a, b) => a.nome.localeCompare(b.nome));
  })();

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    const matchBusca = !q ||
      (u.nome?.toLowerCase().includes(q)) ||
      (u.email?.toLowerCase().includes(q)) ||
      (u.user_code?.toString().includes(q));
    const matchTag = !tagFiltro || (userTagsMap[u.id] || []).includes(tagFiltro);
    return matchBusca && matchTag;
  });

  const getStatusColor = (status: string | null, planoExp: string | null) => {
    if (status === "bloqueado") return "text-destructive";
    if (planoExp && new Date(planoExp) < new Date()) return "text-classify-yellow";
    return "text-classify-green";
  };

  const getStatusLabel = (status: string | null, planoExp: string | null) => {
    if (status === "bloqueado") return "bloqueado";
    if (planoExp && new Date(planoExp) < new Date()) return "expirado";
    return "ativo";
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return formatarDataCurta(dateStr, { weekday: false });
  };

  if (viewMode === "config" && selectedUser) {
    return <AdminUserConfig userId={selectedUser} onBack={() => { setViewMode("list"); loadUsers(); }} />;
  }

  if (viewMode === "view" && selectedUser) {
    return <AdminUserView userId={selectedUser} onBack={() => setViewMode("list")} />;
  }

  if (viewMode === "calculator") {
    return <Index onBack={() => setViewMode("list")} />;
  }

  if (viewMode === "tags") {
    return <AdminTagManager onBack={() => { setViewMode("list"); loadUsers(); }} />;
  }

  if (viewMode === "treinos") {
    return <AdminTreinos onBack={() => setViewMode("list")} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-5 sm:px-8">
        <header className="pt-12 sm:pt-20 pb-4 flex items-start justify-between">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl text-foreground tracking-tight">
              PHYSIQ<span className="text-primary">CALC</span>
            </h1>
            <p className="text-sm text-muted-foreground font-body mt-2">Painel Administrativo</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sair"
            className="p-2 text-muted-foreground hover:text-destructive transition-colors duration-200"
          >
            <LogOut size={18} />
          </button>
        </header>

        {/* Manual Calculator */}
        <button
          type="button"
          onClick={() => setViewMode("calculator")}
          className="w-full mb-8 result-card border-primary/50 flex items-center gap-4 hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <Calculator size={24} className="text-primary shrink-0" />
          <div className="text-left">
            <p className="font-heading text-lg text-foreground">Cálculo Manual</p>
            <p className="text-xs text-muted-foreground font-body">Calculadora completa para uso avulso</p>
          </div>
        </button>

        {/* Tag Manager */}
        <button
          type="button"
          onClick={() => setViewMode("tags")}
          className="w-full mb-4 result-card border-muted-foreground/30 flex items-center gap-4 hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <Tags size={24} className="text-primary shrink-0" />
          <div className="text-left">
            <p className="font-heading text-lg text-foreground">Gerenciar Tags</p>
            <p className="text-xs text-muted-foreground font-body">Criar e editar tags personalizadas</p>
          </div>
        </button>

        {/* Treinos Manager */}
        <button
          type="button"
          onClick={() => setViewMode("treinos")}
          className="w-full mb-8 result-card border-muted-foreground/30 flex items-center gap-4 hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <Dumbbell size={24} className="text-primary shrink-0" />
          <div className="text-left">
            <p className="font-heading text-lg text-foreground">Gerenciar Treinos</p>
            <p className="text-xs text-muted-foreground font-body">Exercícios, grupos e programação semanal</p>
          </div>
        </button>

        {/* Search + Tag filter */}
        <div className="flex gap-3 items-center mb-8">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, email ou ID..."
              className="input-underline pl-6"
            />
          </div>
          <select
            value={tagFiltro}
            onChange={(e) => setTagFiltro(e.target.value)}
            className="bg-transparent border-b border-muted-foreground text-foreground font-body text-[11px] py-2 outline-none focus:border-primary min-w-[160px]"
          >
            <option value="">Todas as tags</option>
            {todasAsTags.map(tag => (
              <option key={tag.id} value={tag.id}>{tag.nome}</option>
            ))}
          </select>
          {(search || tagFiltro) && (
            <button
              onClick={() => { setSearch(''); setTagFiltro(''); }}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
            >
              ✕ Limpar
            </button>
          )}
        </div>

        {/* Users list */}
        {loading ? (
          <p className="text-muted-foreground font-body">Carregando...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-muted-foreground font-body">Nenhum usuário encontrado.</p>
        ) : (
          <div className="space-y-0">
            {filteredUsers.map((u) => {
              const statusLabel = getStatusLabel(u.status, u.plano_expiracao);
              const statusColor = getStatusColor(u.status, u.plano_expiracao);

              return (
                <div key={u.id} className="flex items-center justify-between py-4 border-b border-muted-foreground/30">
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-sm text-foreground truncate">{u.nome || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground font-body truncate">{u.email}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {u.user_code && <span className="text-xs text-muted-foreground font-body">ID: {u.user_code}</span>}
                      {u.plano_nome && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 font-body">
                          {u.plano_nome}
                          {u.plano_expiracao && ` · até ${formatDate(u.plano_expiracao)}`}
                        </span>
                      )}
                      <span className={`text-xs font-heading uppercase ${statusColor}`}>{statusLabel}</span>
                    </div>
                    {/* Tags */}
                    {(() => {
                      const tagIds = userTagsMap[u.id] || [];
                      if (tagIds.length === 0) return null;
                      const visibleTags = tagIds.slice(0, 3).map((tid) => allTags.find((t) => t.id === tid)).filter(Boolean);
                      const remaining = tagIds.length - 3;
                      return (
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {visibleTags.map((tag) => (
                            <span
                              key={tag!.id}
                              className="inline-flex items-center px-2 py-0.5 text-[10px] font-heading uppercase tracking-wider text-white rounded-full"
                              style={{ backgroundColor: tag!.cor }}
                            >
                              {tag!.nome}
                            </span>
                          ))}
                          {remaining > 0 && (
                            <span className="text-[10px] text-muted-foreground font-body">+{remaining}</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => { setSelectedUser(u.id); setViewMode("view"); }}
                      title="Visualizar"
                      className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => handleGeneratePDF(u.id)}
                      title="Gerar PDF"
                      className="p-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <FileDown size={16} />
                    </button>
                    <button
                      onClick={() => { setSelectedUser(u.id); setViewMode("config"); }}
                      title="Configurar"
                      className="p-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Settings size={16} />
                    </button>
                    <button
                      onClick={() => handleBlockUser(u.id, u.status)}
                      title={u.status === "bloqueado" ? "Desbloquear" : "Bloquear"}
                      className="p-2 text-muted-foreground hover:text-classify-yellow transition-colors"
                    >
                      <Ban size={16} />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          title="Excluir"
                          className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-background border-muted-foreground/30">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-heading text-foreground">
                            Excluir usuário?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="font-body">
                            Tem certeza? O perfil de {u.nome || u.email} será removido permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-muted-foreground/30 text-foreground">Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteUser(u.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="section-divider py-12 text-center">
          <p className="text-xs text-muted-foreground font-body italic">By Weslley Bertoldo</p>
        </footer>
      </div>
    </div>
  );
};

export default AdminPanel;
