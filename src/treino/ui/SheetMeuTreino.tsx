import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import { agruparPorBloco, combinaBusca, getBloco, nomeDoBloco, type BlocoMuscular } from "@/lib/gruposMusculares";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { MiniaturaGif } from "./MiniaturaGif";

interface ExercicioLista {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  imagem_url?: string | null;
  isPessoal?: boolean;
}

const GRUPOS_MUSCULARES = ["Peitoral", "Dorsal", "Deltóide", "Bíceps", "Tríceps", "Quadríceps", "Isquiotibiais", "Panturrilha", "Abdômen", "Glúteo", "Corrida"];
// a coluna emoji é NOT NULL no banco; a interface não mostra emoji (decisão 7)
const EMOJI_PADRAO = "🏋️";

/**
 * "Montar o meu" (C19/C72): o aluno cria (ou edita) um treino próprio escolhendo da biblioteca por grupo muscular, com busca,
 * e cria/edita/apaga os próprios exercícios. Grava pelo PowerSync (`tb_grupos_treino_usuario`, `tb_grupos_exercicios_usuario`,
 * `tb_exercicios_usuario`) — funciona sem internet.
 */
export function SheetMeuTreino({
  aberto,
  userId,
  editar,
  aoFechar,
}: {
  aberto: boolean;
  userId: string;
  editar: { id: string; nome: string } | null;
  /** id do treino criado (null = fechou ou só editou) */
  aoFechar: (criadoId: string | null) => void;
}) {
  const db = usePowerSync();
  const confirmar = useConfirmar();
  const [nome, setNome] = useState("");
  const [globais, setGlobais] = useState<ExercicioLista[]>([]);
  const [pessoais, setPessoais] = useState<ExercicioLista[]>([]);
  const [escolhidos, setEscolhidos] = useState<{ id: string; pessoal: boolean }[]>([]);
  const [bloco, setBloco] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [novoEx, setNovoEx] = useState<{ nome: string; grupo: string } | null>(null);
  const [editandoEx, setEditandoEx] = useState<{ id: string; nome: string; grupo: string } | null>(null);

  const carregarExercicios = async () => {
    const [g, p] = await Promise.all([
      db.getAll<ExercicioLista>("SELECT id, nome, grupo_muscular, emoji, imagem_url FROM tb_exercicios ORDER BY nome"),
      db.getAll<ExercicioLista>("SELECT id, nome, grupo_muscular, emoji FROM tb_exercicios_usuario WHERE user_id = ? ORDER BY nome", [userId]),
    ]);
    setGlobais(g);
    setPessoais(p.map((e) => ({ ...e, isPessoal: true })));
  };

  useEffect(() => {
    if (!aberto) return;
    setBloco(null);
    setBusca("");
    setNovoEx(null);
    setEditandoEx(null);
    void carregarExercicios();
    if (editar) {
      setNome(editar.nome);
      db.getAll<{ exercicio_id: string | null; exercicio_usuario_id: string | null }>(
        "SELECT exercicio_id, exercicio_usuario_id FROM tb_grupos_exercicios_usuario WHERE grupo_usuario_id = ? AND user_id = ? ORDER BY ordem",
        [editar.id, userId],
      ).then((rows) => setEscolhidos(rows.map((r) => (r.exercicio_usuario_id ? { id: r.exercicio_usuario_id, pessoal: true } : { id: r.exercicio_id!, pessoal: false })).filter((x) => x.id)));
    } else {
      setNome("");
      setEscolhidos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao abrir
  }, [aberto, editar?.id]);

  const todos = useMemo(() => [...globais, ...pessoais].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [globais, pessoais]);
  const blocos = useMemo(() => agruparPorBloco(todos), [todos]);
  const doBloco = bloco ? blocos.find((b) => b.bloco.key === bloco)?.exercicios ?? [] : [];
  const buscando = busca.trim().length > 0;
  const resultados = buscando ? (bloco ? doBloco : todos).filter((e) => combinaBusca(e, busca)) : [];
  const blocoAtual: BlocoMuscular | null = bloco ? getBloco(bloco) : null;
  const marcado = (e: ExercicioLista) => escolhidos.some((s) => s.id === e.id && s.pessoal === !!e.isPessoal);
  const alternar = (e: ExercicioLista) =>
    setEscolhidos((antes) => (marcado(e) ? antes.filter((s) => !(s.id === e.id && s.pessoal === !!e.isPessoal)) : [...antes, { id: e.id, pessoal: !!e.isPessoal }]));
  const escolhidosLista = escolhidos.map((s) => todos.find((e) => e.id === s.id && !!e.isPessoal === s.pessoal)).filter((e): e is ExercicioLista => !!e);

  const criarExercicio = async () => {
    if (!novoEx?.nome.trim()) return;
    try {
      const agora = new Date().toISOString();
      await db.execute("INSERT INTO tb_exercicios_usuario (id, user_id, nome, grupo_muscular, emoji, created_at, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)", [
        userId, novoEx.nome.trim(), novoEx.grupo, EMOJI_PADRAO, agora, agora,
      ]);
      setNovoEx(null);
      toast.success("Exercício criado!");
      await carregarExercicios();
    } catch (e) {
      console.error("[Treino] criar exercício próprio:", e);
      toast.error("Não deu para criar o exercício. Tente de novo.");
    }
  };

  const salvarExercicio = async () => {
    if (!editandoEx?.nome.trim()) return;
    try {
      await db.execute("UPDATE tb_exercicios_usuario SET nome = ?, grupo_muscular = ?, updated_at = ? WHERE id = ? AND user_id = ?", [
        editandoEx.nome.trim(), editandoEx.grupo, new Date().toISOString(), editandoEx.id, userId,
      ]);
      setEditandoEx(null);
      toast.success("Exercício atualizado!");
      await carregarExercicios();
    } catch {
      toast.error("Não deu para salvar o exercício.");
    }
  };

  const apagarExercicio = async (id: string) => {
    if (!(await confirmar({ titulo: "Apagar este exercício seu?", rotuloConfirmar: "Apagar", perigo: true }))) return;
    try {
      await db.execute("DELETE FROM tb_exercicios_usuario WHERE id = ? AND user_id = ?", [id, userId]);
      setEscolhidos((antes) => antes.filter((s) => !(s.id === id && s.pessoal)));
      toast.success("Exercício apagado.");
      await carregarExercicios();
    } catch {
      toast.error("Não deu para apagar o exercício.");
    }
  };

  const salvar = async () => {
    if (!nome.trim() || escolhidos.length === 0) {
      toast.error("Dê um nome e escolha os exercícios.");
      return;
    }
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      let id = editar?.id ?? null;
      if (editar) {
        await db.execute("UPDATE tb_grupos_treino_usuario SET nome = ? WHERE id = ? AND user_id = ?", [nome.trim(), editar.id, userId]);
        await db.execute("DELETE FROM tb_grupos_exercicios_usuario WHERE grupo_usuario_id = ? AND user_id = ?", [editar.id, userId]);
      } else {
        id = crypto.randomUUID();
        await db.execute("INSERT INTO tb_grupos_treino_usuario (id, user_id, nome, created_at) VALUES (?, ?, ?, ?)", [id, userId, nome.trim(), agora]);
      }
      for (let i = 0; i < escolhidos.length; i++) {
        const s = escolhidos[i];
        await db.execute(
          "INSERT INTO tb_grupos_exercicios_usuario (id, user_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, ordem) VALUES (uuid(), ?, ?, ?, ?, ?)",
          [userId, id, s.pessoal ? null : s.id, s.pessoal ? s.id : null, i],
        );
      }
      toast.success(editar ? "Treino atualizado!" : "Treino criado!");
      aoFechar(editar ? null : id);
    } catch (e) {
      console.error("[Treino] salvar treino próprio:", e);
      toast.error("Não deu para salvar o treino. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const linha = (e: ExercicioLista, mostrarGrupo: boolean) => {
    if (e.isPessoal && editandoEx?.id === e.id) {
      return (
        <div key={`p-${e.id}`} className="flex flex-col gap-2 rounded-2xl border border-violeta/40 bg-superficie p-3" data-editando-exercicio={e.id}>
          <input value={editandoEx.nome} onChange={(x) => setEditandoEx({ ...editandoEx, nome: x.target.value })} aria-label="Nome do exercício"
            className="h-10 rounded-xl border border-linha-2 bg-superficie px-3 text-[14px] text-texto outline-none focus:border-violeta/60" />
          <SeletorGrupo valor={editandoEx.grupo} aoMudar={(g) => setEditandoEx({ ...editandoEx, grupo: g })} />
          <div className="flex gap-2">
            <Botao variante="w" tamanho="sm" onClick={() => void salvarExercicio()}>Salvar</Botao>
            <Botao variante="g" tamanho="sm" onClick={() => setEditandoEx(null)}>Cancelar</Botao>
          </div>
        </div>
      );
    }
    const sel = marcado(e);
    return (
      <div key={`${e.isPessoal ? "p" : "g"}-${e.id}`} className="flex items-center gap-2" data-opcao-exercicio={e.id} data-opcao-escolhida={sel ? "1" : "0"}>
        <button type="button" onClick={() => alternar(e)} aria-pressed={sel}
          className={cn("flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-2xl border px-2 py-1.5 text-left transition-colors", sel ? "border-violeta/55 bg-violeta/10" : "border-linha bg-superficie hover:border-linha-2")}>
          <MiniaturaGif url={e.imagem_url} exercicioId={e.id} nome={e.nome} semPlay className="h-10 w-11 rounded-[11px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-texto">{e.nome}</span>
            <span className="block truncate text-[11.5px] text-texto-3">{e.isPessoal ? "Meu exercício" : mostrarGrupo ? nomeDoBloco(e.grupo_muscular) : e.grupo_muscular}</span>
          </span>
          <span className={cn("flex h-5 w-5 flex-none items-center justify-center rounded-md border", sel ? "border-violeta bg-violeta text-white" : "border-linha-2")}>
            {sel && <Check aria-hidden className="h-3 w-3" strokeWidth={3} />}
          </span>
        </button>
        {e.isPessoal && (
          <>
            <button type="button" aria-label={`Editar ${e.nome}`} className="pq-ibtn" onClick={() => setEditandoEx({ id: e.id, nome: e.nome, grupo: e.grupo_muscular })}>
              <Pencil aria-hidden />
            </button>
            <button type="button" aria-label={`Apagar ${e.nome}`} className="pq-ibtn text-rosa-3" onClick={() => void apagarExercicio(e.id)}>
              <Trash2 aria-hidden />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <PainelDeslizante aberto={aberto} aoMudar={(v) => !v && !salvando && aoFechar(null)} titulo={editar ? "Editar meu treino" : "Montar o meu treino"}
      rodape={
        <Botao variante="w" className="w-full" disabled={salvando || !nome.trim() || escolhidos.length === 0} onClick={() => void salvar()} data-meu-treino-salvar>
          {salvando ? "Salvando…" : `${editar ? "Salvar" : "Criar"} treino (${escolhidos.length} ${escolhidos.length === 1 ? "exercício" : "exercícios"})`}
        </Botao>
      }>
      <div className="flex flex-col gap-3 pt-1" data-meu-treino>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-texto-2">Nome do treino</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Peito e tríceps" data-meu-treino-nome
            className="h-12 rounded-[14px] border border-linha-2 bg-superficie px-4 text-[15px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60" />
        </label>

        {escolhidosLista.length > 0 && (
          <div>
            <div className="pq-eyebrow mb-1.5">Escolhidos ({escolhidosLista.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {escolhidosLista.map((e) => (
                <button key={`${e.isPessoal ? "p" : "g"}-${e.id}`} type="button" onClick={() => alternar(e)} className="pq-chip pq-chip-t h-7" data-escolhido={e.id}>
                  {e.nome} <X aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex h-11 items-center gap-2 rounded-[14px] border border-linha-2 bg-superficie px-3 focus-within:border-violeta/60">
          <Search aria-hidden className="h-4 w-4 flex-none text-texto-3" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={blocoAtual ? `Buscar em ${blocoAtual.nome}…` : "Buscar exercício…"}
            aria-label="Buscar exercício" data-meu-treino-busca className="min-w-0 flex-1 bg-transparent text-[14px] text-texto outline-none placeholder:text-texto-4" />
          {buscando && (
            <button type="button" aria-label="Limpar a busca" onClick={() => setBusca("")} className="text-texto-3 hover:text-texto">
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>

        {buscando ? (
          <div className="flex flex-col gap-1.5">
            {resultados.length === 0 ? <p className="px-1 text-[12.5px] text-texto-3">Nenhum exercício encontrado.</p> : resultados.map((e) => linha(e, !bloco))}
          </div>
        ) : blocoAtual ? (
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => setBloco(null)} className="flex items-center gap-1 self-start text-[12.5px] font-semibold text-texto-2 hover:text-texto" data-voltar-grupos>
              <ChevronLeft aria-hidden className="h-4 w-4" /> Grupos musculares
            </button>
            <div className="px-1 text-[14px] font-semibold text-texto">{blocoAtual.nome}</div>
            {doBloco.map((e) => linha(e, false))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {blocos.map(({ bloco: b, exercicios }) => {
              const n = exercicios.filter(marcado).length;
              return (
                <button key={b.key} type="button" onClick={() => setBloco(b.key)} data-bloco={b.key}
                  className={cn("flex items-center gap-2 rounded-2xl border p-3 text-left", n ? "border-violeta/55 bg-violeta/10" : "border-linha bg-superficie hover:border-linha-2")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-texto">{b.nome}</span>
                    <span className="block text-[11.5px] text-texto-3">{exercicios.length} ex.{n ? ` · ${n} escolhido${n > 1 ? "s" : ""}` : ""}</span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 flex-none text-texto-3" />
                </button>
              );
            })}
          </div>
        )}

        {novoEx ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-violeta/40 bg-superficie p-3" data-novo-exercicio>
            <input value={novoEx.nome} onChange={(e) => setNovoEx({ ...novoEx, nome: e.target.value })} placeholder="Nome do exercício" aria-label="Nome do exercício novo"
              className="h-10 rounded-xl border border-linha-2 bg-superficie px-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60" />
            <SeletorGrupo valor={novoEx.grupo} aoMudar={(g) => setNovoEx({ ...novoEx, grupo: g })} />
            <div className="flex gap-2">
              <Botao variante="w" tamanho="sm" onClick={() => void criarExercicio()} disabled={!novoEx.nome.trim()} data-novo-exercicio-criar>Criar</Botao>
              <Botao variante="g" tamanho="sm" onClick={() => setNovoEx(null)}>Cancelar</Botao>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setNovoEx({ nome: "", grupo: blocoAtual?.grupoPadrao ?? GRUPOS_MUSCULARES[0] })} data-novo-exercicio-abrir
            className="flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-violeta-3 hover:text-violeta-2">
            <Plus aria-hidden className="h-4 w-4" /> {blocoAtual ? `Criar exercício em ${blocoAtual.nome}` : "Criar um exercício meu"}
          </button>
        )}
      </div>
    </PainelDeslizante>
  );
}

function SeletorGrupo({ valor, aoMudar }: { valor: string; aoMudar: (g: string) => void }) {
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label="Grupo muscular"
      className="h-10 rounded-xl border border-linha-2 bg-tela px-3 text-[13.5px] text-texto outline-none focus:border-violeta/60">
      {GRUPOS_MUSCULARES.map((g) => (
        <option key={g} value={g} className="bg-tela text-texto">{g}</option>
      ))}
    </select>
  );
}
