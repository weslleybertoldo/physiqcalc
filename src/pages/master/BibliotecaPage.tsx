import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Edit2, Globe, Image as ImageIcon, Plus, Search, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ITENS_PAGINA, ListaPaginada } from "@/components/ListaPaginada";
import { supabase } from "@/integrations/supabase/client";
import { masterProfessores, type ProfessorRow } from "@/lib/saasApi";
import {
  BTN_MINI_PRIMARIO, BTN_NEUTRO, BTN_PRIMARIO, Campo, Carregando, DIALOG_CONTENT, ErroCarregar, Etiqueta, INPUT, LINHA, SELECT_CONTENT,
  SELECT_TRIGGER, Secao, TEXTAREA, TituloPagina, Vazio, mensagemErro, useConfirmacao, useDebounce,
} from "@/components/master/masterUi";

interface Exercicio {
  id: string; nome: string; grupo_muscular: string; emoji: string | null; subgrupo: string | null; dica: string | null;
  professor_id: string | null; imagem_url?: string | null; tipo?: string | null;
}
interface GrupoMuscular { id: string; nome: string; professor_id: string | null }

const EMOJIS = ["🏋️", "🏋️‍♂️", "💪", "🦵", "🍑", "🫁", "🔙", "🎯", "🧘", "🏃", "🏃‍♂️", "🔵"];
const OUTRO_GRUPO = "__outro__";

// tipos gerados não conhecem `professor_id` → `(supabase.from as any)(...)` como o AdminTreinos (mantém o `this` do client)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = (nome: string) => (supabase.from as any)(nome);

function erroBanco(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string };
  if (err.code === "23505") return "Já existe um registro com esse nome.";
  if (err.code === "23503") return "Esse item está em uso (treinos de alunos) — remova dos treinos antes.";
  if (err.code === "42501") return "Sem permissão (RLS).";
  return err.message ? `Erro: ${err.message}` : mensagemErro(e);
}

// Biblioteca GLOBAL (master): exercícios e grupos musculares com professor_id NULL (visíveis a todos os professores).
// Imagens/GIFs continuam em Admin › Treinos › Biblioteca.
const BibliotecaPage = () => {
  const [exercicios, setExercicios] = useState<Exercicio[]>([]);
  const [grupos, setGrupos] = useState<GrupoMuscular[]>([]);
  const [nomesProf, setNomesProf] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dosProfessores, setDosProfessores] = useState(false);
  const [q, setQ] = useState("");
  const qDeb = useDebounce(q.trim().toLowerCase(), 300);
  const [mostrando, setMostrando] = useState(ITENS_PAGINA);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmacao();

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setErro(null);
    try {
      const [ex, gm] = await Promise.all([
        tabela("tb_exercicios").select("id, nome, grupo_muscular, emoji, subgrupo, dica, professor_id, imagem_url, tipo").order("nome"),
        tabela("grupos_musculares").select("id, nome, professor_id").order("nome"),
      ]);
      if (ex.error) throw ex.error;
      if (gm.error) throw gm.error;
      setExercicios((ex.data as Exercicio[]) ?? []);
      setGrupos((gm.data as GrupoMuscular[]) ?? []);
    } catch (e) {
      setErro(erroBanco(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    masterProfessores<{ professores: ProfessorRow[] }>("list", { limit: 100 })
      .then((r) => setNomesProf(new Map(r.professores.map((p) => [p.id, p.nome]))))
      .catch(() => { /* só pra nomear o dono; não bloqueia */ });
  }, [carregar]);
  useEffect(() => { setMostrando(ITENS_PAGINA); }, [qDeb, dosProfessores]);

  const gruposGlobais = useMemo(() => grupos.filter((g) => g.professor_id === null), [grupos]);
  const visiveis = useMemo(() => exercicios
    .filter((e) => (dosProfessores ? e.professor_id !== null : e.professor_id === null))
    .filter((e) => !qDeb || e.nome.toLowerCase().includes(qDeb) || (e.grupo_muscular || "").toLowerCase().includes(qDeb) || (e.subgrupo || "").toLowerCase().includes(qDeb)),
  [exercicios, dosProfessores, qDeb]);
  const totalGlobais = useMemo(() => exercicios.filter((e) => e.professor_id === null).length, [exercicios]);
  const totalProfs = exercicios.length - totalGlobais;

  // ── editor (novo / editar) ──
  const [editor, setEditor] = useState<{ ex: Exercicio | null } | null>(null);
  const [fNome, setFNome] = useState("");
  const [fGrupo, setFGrupo] = useState("");
  const [fGrupoOutro, setFGrupoOutro] = useState("");
  const [fEmoji, setFEmoji] = useState(EMOJIS[0]);
  const [fSub, setFSub] = useState("");
  const [fDica, setFDica] = useState("");
  const [salvando, setSalvando] = useState(false);
  const opcoesGrupo = useMemo(() => {
    const set = new Set(gruposGlobais.map((g) => g.nome));
    if (editor?.ex?.grupo_muscular) set.add(editor.ex.grupo_muscular);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [gruposGlobais, editor]);

  const abrirEditor = (ex: Exercicio | null) => {
    setFNome(ex?.nome ?? "");
    setFGrupo(ex?.grupo_muscular ?? gruposGlobais[0]?.nome ?? OUTRO_GRUPO);
    setFGrupoOutro("");
    setFEmoji(ex?.emoji || EMOJIS[0]);
    setFSub(ex?.subgrupo ?? "");
    setFDica(ex?.dica ?? "");
    setEditor({ ex });
  };
  const salvar = async () => {
    const grupo = (fGrupo === OUTRO_GRUPO ? fGrupoOutro : fGrupo).trim();
    if (!fNome.trim()) { toast.error("Informe o nome do exercício."); return; }
    if (!grupo) { toast.error("Informe o grupo muscular."); return; }
    setSalvando(true);
    try {
      const campos = { nome: fNome.trim(), grupo_muscular: grupo, emoji: fEmoji, subgrupo: fSub.trim() || null, dica: fDica.trim() || null };
      if (editor?.ex) {
        const { error } = await tabela("tb_exercicios").update(campos).eq("id", editor.ex.id);
        if (error) throw error;
        toast.success("Exercício atualizado.");
      } else {
        const { error } = await tabela("tb_exercicios").insert({ ...campos, professor_id: null, tipo: "musculacao" });
        if (error) throw error;
        toast.success("Exercício global criado. Foto/GIF: Admin › Treinos › Biblioteca.");
      }
      setEditor(null);
      await carregar(true);
    } catch (e) {
      toast.error(erroBanco(e));
    } finally {
      setSalvando(false);
    }
  };
  const excluir = async (ex: Exercicio) => {
    const ok = await confirmar({
      titulo: `Excluir "${ex.nome}"?`,
      descricao: ex.professor_id === null ? "Some da biblioteca global de TODOS os professores. Se estiver em algum treino, o banco recusa." : "Some da biblioteca desse professor.",
      confirmar: "Excluir", perigo: true,
    });
    if (!ok) return;
    setBusyId(ex.id);
    try {
      const { error } = await tabela("tb_exercicios").delete().eq("id", ex.id);
      if (error) throw error;
      toast.success("Exercício excluído.");
      await carregar(true);
    } catch (e) {
      toast.error(erroBanco(e));
    } finally {
      setBusyId(null);
    }
  };
  const promover = async (ex: Exercicio) => {
    const dono = ex.professor_id ? nomesProf.get(ex.professor_id) ?? "professor" : "";
    const ok = await confirmar({
      titulo: `Promover "${ex.nome}" para a biblioteca global?`,
      descricao: `Deixa de ser só de ${dono} e passa a aparecer pra todos os professores (professor_id = null). Os treinos que já usam continuam funcionando.`,
      confirmar: "Promover",
    });
    if (!ok) return;
    setBusyId(ex.id);
    try {
      const { error } = await tabela("tb_exercicios").update({ professor_id: null }).eq("id", ex.id);
      if (error) throw error;
      toast.success("Exercício promovido para global.");
      await carregar(true);
    } catch (e) {
      toast.error(erroBanco(e));
    } finally {
      setBusyId(null);
    }
  };

  // ── grupos musculares globais ──
  const [novoGrupo, setNovoGrupo] = useState("");
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const adicionarGrupo = async () => {
    const nome = novoGrupo.trim();
    if (!nome) return;
    setSalvandoGrupo(true);
    try {
      const { error } = await tabela("grupos_musculares").insert({ nome, professor_id: null });
      if (error) throw error;
      setNovoGrupo("");
      toast.success("Grupo muscular criado.");
      await carregar(true);
    } catch (e) {
      toast.error(erroBanco(e));
    } finally {
      setSalvandoGrupo(false);
    }
  };
  const excluirGrupo = async (g: GrupoMuscular) => {
    const emUso = exercicios.filter((e) => e.professor_id === null && e.grupo_muscular === g.nome).length;
    const ok = await confirmar({
      titulo: `Excluir o grupo "${g.nome}"?`,
      descricao: emUso > 0 ? `${emUso} exercício(s) global(is) usam esse nome — eles NÃO mudam (o campo é texto livre), só o grupo sai da lista.` : "Exercícios vinculados não são afetados.",
      confirmar: "Excluir", perigo: true,
    });
    if (!ok) return;
    try {
      const { error } = await tabela("grupos_musculares").delete().eq("id", g.id);
      if (error) throw error;
      toast.success("Grupo excluído.");
      await carregar(true);
    } catch (e) {
      toast.error(erroBanco(e));
    }
  };

  return (
    <div data-pagina="master-biblioteca">
      <TituloPagina
        titulo="Biblioteca global"
        sub={<>{totalGlobais} exercício(s) global(is) · {totalProfs} dos professores. Foto/GIF: pela Biblioteca do seu painel de professor (Treinos › Biblioteca).</>}
        acao={(
          <button type="button" onClick={() => abrirEditor(null)} className={BTN_PRIMARIO} data-btn-novo-exercicio>
            <Plus size={12} className="inline mr-1 -mt-0.5" />Novo exercício
          </button>
        )}
      />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-5">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, grupo ou subgrupo..." className={`${INPUT} pl-6`} data-input-busca-exercicio />
        </div>
        <label className="flex items-center gap-2 text-xs font-body text-muted-foreground cursor-pointer select-none">
          <Switch checked={dosProfessores} onCheckedChange={setDosProfessores} data-switch-dos-professores />
          Ver exercícios dos professores
        </label>
      </div>

      {erro && <ErroCarregar texto={erro} onRetry={() => void carregar()} />}
      {loading ? <Carregando /> : visiveis.length === 0 ? (
        <Vazio texto={dosProfessores ? "Nenhum exercício criado por professores." : qDeb ? "Nenhum exercício encontrado." : "Biblioteca global vazia."} />
      ) : (
        <div data-lista-exercicios>
          {visiveis.slice(0, mostrando).map((ex) => (
            <div key={ex.id} className={`${LINHA} flex items-center gap-2 ${busyId === ex.id ? "opacity-60" : ""}`} data-exercicio-linha={ex.id}>
              <span className="text-lg shrink-0 w-7 text-center">{ex.emoji || "🏋️"}</span>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-sm text-foreground truncate">{ex.nome}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground font-body">
                  <span>{ex.grupo_muscular}{ex.subgrupo ? ` · ${ex.subgrupo}` : ""}</span>
                  {ex.imagem_url && <span className="inline-flex items-center gap-0.5" title="Tem foto/GIF"><ImageIcon size={10} />mídia</span>}
                  {dosProfessores && ex.professor_id && (
                    <Etiqueta tom="info" className="!text-[9px]">{nomesProf.get(ex.professor_id) ?? "professor"}</Etiqueta>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                {dosProfessores && (
                  <button type="button" onClick={() => void promover(ex)} className={`${BTN_MINI_PRIMARIO} hidden sm:inline-flex items-center gap-1`} title="Promover para global" data-btn-promover-global>
                    <Globe size={10} />Global
                  </button>
                )}
                {dosProfessores && (
                  <button type="button" onClick={() => void promover(ex)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors sm:hidden" title="Promover para global" data-btn-promover-global-mobile>
                    <Globe size={14} />
                  </button>
                )}
                <button type="button" onClick={() => abrirEditor(ex)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Editar" data-btn-editar-exercicio>
                  <Edit2 size={14} />
                </button>
                <button type="button" onClick={() => void excluir(ex)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Excluir" data-btn-excluir-exercicio>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <ListaPaginada total={visiveis.length} mostrando={mostrando} onVerMais={() => setMostrando((m) => m + ITENS_PAGINA)} rotulo="exercícios" />
        </div>
      )}

      <Secao titulo={`Grupos musculares globais (${gruposGlobais.length})`}>
        <div className="flex flex-wrap gap-1.5 mb-3" data-lista-grupos>
          {gruposGlobais.length === 0 && <span className="text-xs text-muted-foreground font-body">Nenhum grupo global.</span>}
          {gruposGlobais.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1 border border-muted-foreground/40 rounded-full pl-3 pr-1 py-0.5 text-xs font-body text-foreground" data-grupo-chip={g.id}>
              {g.nome}
              <button type="button" onClick={() => void excluirGrupo(g)} className="p-0.5 text-muted-foreground hover:text-destructive transition-colors" title="Excluir grupo" data-btn-excluir-grupo>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 items-end max-w-sm">
          <input
            type="text"
            value={novoGrupo}
            onChange={(e) => setNovoGrupo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void adicionarGrupo(); }}
            placeholder="Novo grupo muscular (ex.: Trapézio)"
            className={INPUT}
            data-input-novo-grupo
          />
          <button type="button" onClick={() => void adicionarGrupo()} disabled={salvandoGrupo || !novoGrupo.trim()} className={BTN_MINI_PRIMARIO} data-btn-adicionar-grupo>Adicionar</button>
        </div>
      </Secao>

      <Dialog open={!!editor} onOpenChange={(o) => { if (!o) setEditor(null); }}>
        <DialogContent className={`${DIALOG_CONTENT} max-w-md`} data-dialog-exercicio={editor?.ex?.id ?? "novo"}>
          <DialogHeader className="text-left">
            <DialogTitle className="font-heading text-foreground uppercase tracking-wider text-base">{editor?.ex ? "Editar exercício" : "Novo exercício global"}</DialogTitle>
            <DialogDescription className="font-body text-xs">
              {editor?.ex?.professor_id ? `Exercício de ${nomesProf.get(editor.ex.professor_id) ?? "um professor"}.` : "Visível pra todos os professores."} Foto/GIF só em Admin › Treinos › Biblioteca.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Campo rotulo="Nome">
              <input type="text" value={fNome} onChange={(e) => setFNome(e.target.value)} className={INPUT} autoFocus data-input-ex-nome />
            </Campo>
            <Campo rotulo="Grupo muscular">
              <Select value={fGrupo} onValueChange={setFGrupo}>
                <SelectTrigger className={SELECT_TRIGGER} data-select-ex-grupo><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent className={SELECT_CONTENT}>
                  {opcoesGrupo.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  <SelectItem value={OUTRO_GRUPO}>Outro (digitar)...</SelectItem>
                </SelectContent>
              </Select>
              {fGrupo === OUTRO_GRUPO && (
                <input type="text" value={fGrupoOutro} onChange={(e) => setFGrupoOutro(e.target.value)} placeholder='Ex.: "Dorsal / Rombóide"' className={INPUT} data-input-ex-grupo-outro />
              )}
            </Campo>
            <Campo rotulo="Emoji">
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((em) => (
                  <button key={em} type="button" onClick={() => setFEmoji(em)} className={`w-9 h-9 text-lg rounded border transition-colors ${fEmoji === em ? "border-primary bg-primary/15" : "border-muted-foreground/30 hover:border-muted-foreground"}`} aria-pressed={fEmoji === em}>
                    {em}
                  </button>
                ))}
              </div>
            </Campo>
            <Campo rotulo="Subgrupo (opcional)">
              <input type="text" value={fSub} onChange={(e) => setFSub(e.target.value)} className={INPUT} placeholder="Ex.: Porção superior" data-input-ex-subgrupo />
            </Campo>
            <Campo rotulo="Dica de execução (opcional)">
              <textarea value={fDica} onChange={(e) => setFDica(e.target.value)} rows={2} className={TEXTAREA} data-input-ex-dica />
            </Campo>
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" onClick={() => setEditor(null)} className={BTN_NEUTRO}>Cancelar</button>
              <button type="button" onClick={() => void salvar()} disabled={salvando} className={BTN_PRIMARIO} data-btn-salvar-exercicio>
                {salvando ? "Salvando..." : editor?.ex ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {dialogo}
    </div>
  );
};

export default BibliotecaPage;
