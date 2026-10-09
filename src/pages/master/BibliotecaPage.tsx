import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Edit2, Globe, Image as ImageIcon, Plus, Search, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { POR_PAGINA, deslocamento } from "@/lib/paginacao";
import { invokeEdge, type ProfessorRow } from "@/lib/saasApi";
import {
  CAMPOS_EQUIVALENCIA_VAZIOS, camposDoExercicio, camposParaGravar, rotuloEquipamento, rotuloPadrao, type CamposEquivalencia,
} from "@/treino/equivalencia";
import { codigosDaBusca } from "@/treino/equivalenciaBusca";
import { FormExercicioBiblioteca } from "@/treino/ui/FormExercicioBiblioteca";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";
import { Paginacao } from "@/ui/premium/Paginacao";
import {
  BTN_MINI_PRIMARIO, BTN_NEUTRO, BTN_PRIMARIO, Campo, Carregando, DIALOG_CONTENT, ErroCarregar, Etiqueta, INPUT, LINHA, SELECT_CONTENT,
  SELECT_TRIGGER, Secao, TEXTAREA, TituloPagina, Vazio, mensagemErro, useConfirmacao, useDebounce,
} from "./bibliotecaUi";

interface Exercicio {
  id: string; nome: string; grupo_muscular: string; emoji: string | null; subgrupo: string | null; dica: string | null;
  professor_id: string | null; imagem_url?: string | null; tipo?: string | null;
  // equivalência (W9): movimento e equipamento das listas fixas (src/treino/equivalencia.ts) + variação livre
  padrao_movimento?: string | null; equipamento?: string | null; variacao?: string | null;
}
interface GrupoMuscular { id: string; nome: string; professor_id: string | null }

const EMOJIS = ["🏋️", "🏋️‍♂️", "💪", "🦵", "🍑", "🫁", "🔙", "🎯", "🧘", "🏃", "🏃‍♂️", "🔵"];
const OUTRO_GRUPO = "__outro__";

// hml-08: a função do master no Treino mora só aqui (saiu do lib/saasApi.ts) — o app não leva esta página (src/lib/plataforma.ts)
function masterProfessores<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  return invokeEdge<T>("master-professores", { action, ...payload });
}

// tipos gerados não conhecem `professor_id` → `(supabase.from as any)(...)` como o AdminTreinos (mantém o `this` do client)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = (nome: string) => (supabase.from as any)(nome);

/**
 * hml-14d (B21 · D24): uma página da Biblioteca pela RPC do Treino exercicios_da_lista (SECURITY INVOKER: a RLS do master) — o
 * escopo (os globais ou os dos professores, este só para o master no Treino), a busca sem acento no nome, grupo, subgrupo e variação
 * OU pelos rótulos de movimento/equipamento (os códigos que casaram — codigosDaBusca), a ordem, o total e os números do topo, tudo
 * no banco. Antes a página lia tb_exercicios inteira (sem range) e filtrava, contava e fatiava no navegador.
 */
interface PaginaExercicios {
  itens: Exercicio[];
  total: number;
  totalGlobal: number;
  totalProfessores: number;
  semClassificacao: number;
}
async function listarExercicios(dosProfessores: boolean, termo: string, pagina: number): Promise<PaginaExercicios> {
  const { data, error } = await supabase.rpc("exercicios_da_lista" as never, {
    p_filtros: { escopo: dosProfessores ? "professores" : "global", q: termo, codigos: codigosDaBusca(termo) },
    p_offset: deslocamento(pagina), p_limite: POR_PAGINA,
  } as never);
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true || !Array.isArray(r.itens) || !Number.isInteger(r.total)) throw new Error("A biblioteca voltou num formato inesperado.");
  const n = (k: string) => Number(r[k] ?? 0) || 0;
  return { itens: r.itens as Exercicio[], total: n("total"), totalGlobal: n("total_global"), totalProfessores: n("total_professores"), semClassificacao: n("sem_classificacao") };
}

/** Os grupos musculares globais (catálogo pequeno — 23 —, inteiro; o filtro "global" no banco). */
async function lerGruposGlobais(): Promise<GrupoMuscular[]> {
  const { data, error } = await tabela("grupos_musculares").select("id, nome, professor_id").is("professor_id", null).order("nome").order("id");
  if (error) throw error;
  return (data as GrupoMuscular[]) ?? [];
}

/** Quantos exercícios GLOBAIS usam esse nome de grupo (contado no banco, só o número — o aviso antes de excluir o grupo). */
async function contarGlobaisDoGrupo(nome: string): Promise<number> {
  const { count, error } = await tabela("tb_exercicios").select("id", { count: "exact", head: true }).is("professor_id", null).eq("grupo_muscular", nome);
  if (error) throw error;
  return count ?? 0;
}

/**
 * hml-14d (B21): o nome do dono SÓ dos exercícios da página — a lista do master-professores de 100 em 100 até achar todos (antes:
 * os 100 primeiros, uma vez, e o dono do 101º ficava "professor").
 */
async function nomesDosDonos(ids: string[]): Promise<Map<string, string>> {
  const faltam = new Set(ids);
  const nomes = new Map<string, string>();
  for (let offset = 0; faltam.size > 0; offset += 100) {
    const r = await masterProfessores<{ professores: ProfessorRow[]; total?: number }>("list", { limit: 100, offset });
    for (const p of r.professores ?? []) if (faltam.delete(p.id)) nomes.set(p.id, p.nome);
    if ((r.professores ?? []).length < 100 || offset + 100 >= (r.total ?? 0)) break;
  }
  return nomes;
}
const SEM_NOMES = new Map<string, string>();

function erroBanco(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string };
  if (err.code === "23505") return "Já existe um registro com esse nome.";
  if (err.code === "23503") return "Esse item está em uso (treinos de alunos) — remova dos treinos antes.";
  if (err.code === "42501") return "Sem permissão (RLS).";
  return err.message ? `Erro: ${err.message}` : mensagemErro(e);
}

// Biblioteca GLOBAL (master): exercícios e grupos musculares com professor_id NULL (visíveis a todos os professores).
// Imagens/GIFs continuam em Admin › Treinos › Biblioteca.
// hml-14d (B21 · D24): 20 por página do banco (exercicios_da_lista), a página no endereço (`?pagina=`; o switch e a busca voltam
// à 1), a busca no banco 300 ms depois da digitação e os números do topo do banco; a ListaPaginada (que só fatiava) saiu.
const BibliotecaPage = () => {
  const [dosProfessores, setDosProfessores] = useState(false);
  const [q, setQ] = useState("");
  const termo = useDebounce(q.trim(), 300);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmacao();

  const [totalLido, setTotalLido] = useState<number | null>(null);
  const { pagina, irPara } = usePaginaNaUrl({ filtro: { dosProfessores, termo }, total: totalLido });
  const lista = useQuery({
    queryKey: ["master", "biblioteca", dosProfessores, termo, pagina],
    queryFn: () => listarExercicios(dosProfessores, termo, pagina),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const totalDaResposta = lista.data && !lista.isPlaceholderData ? lista.data.total : null;
  useEffect(() => {
    if (totalDaResposta !== null) setTotalLido(totalDaResposta);
  }, [totalDaResposta]);
  const gruposQ = useQuery({ queryKey: ["master", "biblioteca-grupos"], queryFn: lerGruposGlobais, staleTime: 60_000 });
  const gruposGlobais = useMemo(() => gruposQ.data ?? [], [gruposQ.data]);
  // o "dos professores" só vale para o master no Treino (para os outros a RPC devolveria os globais): sem nenhum, a lista fica vazia
  const exercicios = useMemo(() => (dosProfessores && (lista.data?.totalProfessores ?? 0) === 0 ? [] : lista.data?.itens ?? []), [lista.data, dosProfessores]);
  const total = exercicios.length ? lista.data?.total ?? 0 : 0;
  const donos = useMemo(() => [...new Set(exercicios.map((e) => e.professor_id).filter((id): id is string => !!id))].sort(), [exercicios]);
  const nomesQ = useQuery({
    queryKey: ["master", "biblioteca-donos", donos.join(",")],
    queryFn: () => nomesDosDonos(donos),
    enabled: donos.length > 0,
    staleTime: 5 * 60_000,
    retry: 1, // só pra nomear o dono; não bloqueia
  });
  const nomesProf = nomesQ.data ?? SEM_NOMES;
  const numeros = lista.data;

  // ── editor (novo / editar) ──
  const [editor, setEditor] = useState<{ ex: Exercicio | null } | null>(null);
  const [fNome, setFNome] = useState("");
  const [fGrupo, setFGrupo] = useState("");
  const [fGrupoOutro, setFGrupoOutro] = useState("");
  const [fEmoji, setFEmoji] = useState(EMOJIS[0]);
  const [fSub, setFSub] = useState("");
  const [fDica, setFDica] = useState("");
  const [fEquiv, setFEquiv] = useState<CamposEquivalencia>(CAMPOS_EQUIVALENCIA_VAZIOS);
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
    setFEquiv(camposDoExercicio(ex));
    setEditor({ ex });
  };
  const salvar = async () => {
    const grupo = (fGrupo === OUTRO_GRUPO ? fGrupoOutro : fGrupo).trim();
    if (!fNome.trim()) { toast.error("Informe o nome do exercício."); return; }
    if (!grupo) { toast.error("Informe o grupo muscular."); return; }
    setSalvando(true);
    try {
      const campos = { nome: fNome.trim(), grupo_muscular: grupo, emoji: fEmoji, subgrupo: fSub.trim() || null, dica: fDica.trim() || null, ...camposParaGravar(fEquiv) };
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
      void lista.refetch();
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
      void lista.refetch();
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
      void lista.refetch();
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
      void gruposQ.refetch();
    } catch (e) {
      toast.error(erroBanco(e));
    } finally {
      setSalvandoGrupo(false);
    }
  };
  const excluirGrupo = async (g: GrupoMuscular) => {
    let emUso: number;
    try {
      emUso = await contarGlobaisDoGrupo(g.nome);
    } catch (e) {
      toast.error(erroBanco(e));
      return;
    }
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
      void gruposQ.refetch();
    } catch (e) {
      toast.error(erroBanco(e));
    }
  };

  return (
    <div data-pagina="master-biblioteca">
      <TituloPagina
        titulo="Biblioteca global"
        sub={numeros
          ? <>{numeros.totalGlobal} exercício(s) global(is) · {numeros.totalProfessores} dos professores{numeros.semClassificacao > 0 ? ` · ${numeros.semClassificacao} global(is) sem movimento/equipamento` : " · todos os globais com movimento e equipamento"}. Foto/GIF: pela Biblioteca do seu painel de professor (Treinos › Biblioteca).</>
          : <>Foto/GIF: pela Biblioteca do seu painel de professor (Treinos › Biblioteca).</>}
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

      {lista.isError ? <ErroCarregar texto={erroBanco(lista.error)} onRetry={() => void lista.refetch()} />
        : lista.isPending ? <Carregando /> : exercicios.length === 0 ? (
          <Vazio texto={termo ? "Nenhum exercício encontrado." : dosProfessores ? "Nenhum exercício criado por professores." : "Biblioteca global vazia."} />
        ) : (
        <div data-lista-exercicios data-lista="master-biblioteca">
          {exercicios.map((ex) => (
            <div key={ex.id} className={`${LINHA} flex items-center gap-2 ${busyId === ex.id ? "opacity-60" : ""}`} data-exercicio-linha={ex.id} data-item>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-sm text-foreground truncate">{ex.nome}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground font-body">
                  <span>{ex.grupo_muscular}{ex.subgrupo ? ` · ${ex.subgrupo}` : ""}</span>
                  {ex.imagem_url && <span className="inline-flex items-center gap-0.5" title="Tem foto/GIF"><ImageIcon size={10} />mídia</span>}
                  {ex.padrao_movimento || ex.equipamento ? (
                    <span className="inline-flex items-center gap-1" data-exercicio-equivalencia>
                      {ex.padrao_movimento && <Etiqueta tom="info" className="text-[9px]!">{rotuloPadrao(ex.padrao_movimento) ?? ex.padrao_movimento}</Etiqueta>}
                      {ex.equipamento && <Etiqueta className="text-[9px]!">{rotuloEquipamento(ex.equipamento) ?? ex.equipamento}</Etiqueta>}
                    </span>
                  ) : (
                    <Etiqueta tom="aviso" className="text-[9px]!" data-exercicio-sem-equivalencia>sem movimento/equipamento</Etiqueta>
                  )}
                  {dosProfessores && ex.professor_id && (
                    <Etiqueta tom="info" className="text-[9px]!">{nomesProf.get(ex.professor_id) ?? "professor"}</Etiqueta>
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
          <Paginacao nome="master-biblioteca" pagina={pagina} total={total} aoMudar={irPara} carregando={lista.isFetching} />
        </div>
      )}

      <Secao titulo={`Grupos musculares globais (${gruposGlobais.length})`}>
        {gruposQ.isError && <ErroCarregar texto={erroBanco(gruposQ.error)} onRetry={() => void gruposQ.refetch()} />}
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
        <DialogContent className={`${DIALOG_CONTENT} max-w-xl max-h-[90vh] overflow-y-auto`} data-dialog-exercicio={editor?.ex?.id ?? "novo"}>
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
            <Campo rotulo="Subgrupo (opcional)">
              <input type="text" value={fSub} onChange={(e) => setFSub(e.target.value)} className={INPUT} placeholder="Ex.: Porção superior" data-input-ex-subgrupo />
            </Campo>
            <Campo rotulo="Dica de execução (opcional)">
              <textarea value={fDica} onChange={(e) => setFDica(e.target.value)} rows={2} className={TEXTAREA} data-input-ex-dica />
            </Campo>
            <FormExercicioBiblioteca valor={fEquiv} aoMudar={setFEquiv} grupoMuscular={fGrupo === OUTRO_GRUPO ? fGrupoOutro : fGrupo} />
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
