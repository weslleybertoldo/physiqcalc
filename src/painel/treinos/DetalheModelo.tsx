import { useMemo, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dumbbell, FolderClosed, GripVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FolhaBiblioteca, FolhaEditarExercicio } from "@/treino/editor/folhas";
import { LinhaExercicioEditor } from "@/treino/editor/LinhaExercicioEditor";
import { DESCANSO_PADRAO } from "@/treino/editor/regras";
import type { ExercicioEditor, PrescricaoEditavel, TreinoEditor } from "@/treino/editor/tipos";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { adicionarAoModelo, ordenarModelo, prescreverModelo, tirarDoModelo } from "./api";
import { camposEditados, colunasDaPrescricao, textoAlunos } from "./regras";
import type { LinhaModelo, ModeloTela, QuemMexe } from "./tipos";
import { linhaNoCache, mensagemDoErro, mudarLinhaNoCache, useRecarregar } from "./useTreinos";

function ItemArrastavel({ id, children }: { id: string; children: (alca: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1, zIndex: isDragging ? 5 : undefined, position: "relative" }}>
      {children(
        <button type="button" aria-label="Arrastar para mudar a ordem" className="cursor-grab touch-none rounded p-0.5 hover:text-texto-2 active:cursor-grabbing" {...attributes} {...listeners} data-exercicio-arrastar>
          <GripVertical aria-hidden className="h-4 w-4" />
        </button>,
      )}
    </div>
  );
}

/** A aba de um treino (`.dt7` da tela 8): branca quando aberta. */
function AbaModelo({ m, ativa, aoAbrir }: { m: ModeloTela; ativa: boolean; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={aoAbrir}
      data-modelo-aba={m.id}
      title={m.nome}
      className={cn(
        "h-[30px] max-w-[220px] flex-none truncate whitespace-nowrap rounded-[9px] border px-2.5 text-[11.5px] font-semibold tracking-[-0.005em] transition-colors",
        ativa ? "border-[#FAFAFA] bg-[#FAFAFA] text-[#09090B]" : "border-linha bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto",
      )}
    >
      {m.nome}
    </button>
  );
}

/**
 * O treino-modelo no padrão da tela 8 (lado esquerdo): as abas dos treinos da pasta aberta (A/B/C…), "+", os chips (exercícios,
 * séries, duração, quantos alunos recebem), cada exercício com o GIF, nome, grupo · subgrupo, SÉRIES · REPS · DESCANSO · CARGA DO
 * MODELO (opcionais — vão para quem passar a receber), editar, tirar e arrastar; "Adicionar exercício da biblioteca". O global do
 * master aparece só para ler (o profissional usa e dá aos alunos, mas não muda).
 */
export function DetalheModelo({
  modelo,
  abas,
  linhas,
  q,
  comGif,
  alunosProntos,
  aoAbrir,
  aoNovo,
  aoRenomear,
  aoExcluir,
  aoPastas,
}: {
  modelo: ModeloTela;
  /** os treinos que viram abas (os da pasta aberta; sem pasta, só o aberto) */
  abas: ModeloTela[];
  /** as linhas do modelo no banco (a prescrição gravada, para saber o que mudou) */
  linhas: LinhaModelo[];
  q: QuemMexe;
  /** hml-17 (H-39): null = a contagem da biblioteca não veio ("— com GIF") */
  comGif: number | null;
  /** "Quem recebe" já carregou (antes disso o chip de alunos não aparece — 0 enquanto carrega enganaria) */
  alunosProntos: boolean;
  aoAbrir: (id: string) => void;
  aoNovo?: () => void;
  aoRenomear: () => void;
  aoExcluir: () => void;
  aoPastas: () => void;
}) {
  const recarregar = useRecarregar();
  const [folha, setFolha] = useState<null | "biblioteca">(null);
  const [editando, setEditando] = useState<ExercicioEditor | null>(null);
  const [ordemLocal, setOrdemLocal] = useState<string[] | null>(null);
  const ler = !modelo.editavel;
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const exercicios = useMemo(() => {
    if (!ordemLocal) return modelo.exercicios;
    const por = new Map(modelo.exercicios.map((e) => [e.chave, e]));
    const ordenados = ordemLocal.map((c) => por.get(c)).filter(Boolean) as ExercicioEditor[];
    return ordenados.length === modelo.exercicios.length ? ordenados : modelo.exercicios;
  }, [modelo.exercicios, ordemLocal]);
  const ids = exercicios.map((e) => e.chave);

  // o "Adicionar exercício" da W15 com este modelo (a lista que ele marca como "NO TREINO")
  const comoTreino = useMemo(
    () => ({ chave: `catalogo:${modelo.id}`, id: modelo.id, rotulo: modelo.nome, exercicios: modelo.exercicios }) as unknown as TreinoEditor,
    [modelo],
  );

  const erro = (e: unknown) => toast.error(mensagemDoErro(e));

  const soltar = async (ev: DragEndEvent) => {
    if (!ev.over || ev.active.id === ev.over.id) return;
    const de = ids.indexOf(String(ev.active.id));
    const para = ids.indexOf(String(ev.over.id));
    if (de < 0 || para < 0) return;
    const nova = arrayMove(exercicios, de, para);
    setOrdemLocal(nova.map((e) => e.chave));
    try {
      await ordenarModelo(modelo.id, nova.map((e) => e.exercicio_id!).filter(Boolean));
      await recarregar.catalogo();
      toast.success("Ordem do treino salva.");
    } catch (e) {
      erro(e);
    } finally {
      setOrdemLocal(null);
    }
  };

  const qc = useQueryClient();
  /**
   * Grava a prescrição do modelo — só a(s) coluna(s) do campo editado, com a tela atualizada na hora (o próximo campo digitado já
   * parte do valor novo). true = gravou (a folha "Editar" fecha). hml-14d: o cache é o da página de Meus treinos (e o do treino
   * aberto por id), que traz as linhas só dos treinos à vista.
   */
  const prescrever = async (ex: ExercicioEditor, p: PrescricaoEditavel): Promise<boolean> => {
    const editado = camposEditados(ex, p);
    if (!Object.keys(editado).length) return true;
    const antes = linhaNoCache(qc, modelo.id, ex.exercicio_id) ?? linhas.find((l) => l.exercicio_id === ex.exercicio_id) ?? { num_series: null };
    const colunas = colunasDaPrescricao(antes, editado);
    mudarLinhaNoCache(qc, modelo.id, ex.exercicio_id, colunas);
    try {
      await prescreverModelo(modelo.id, ex.exercicio_id!, colunas);
      return true;
    } catch (e) {
      erro(e);
      await recarregar.catalogo();
      return false;
    }
  };

  const remover = async (ex: ExercicioEditor) => {
    const aviso = modelo.alunos > 0 ? `\n\n${textoAlunos(modelo.alunos)} recebe${modelo.alunos === 1 ? "" : "m"} este treino: o exercício sai do app ${modelo.alunos === 1 ? "dele" : "deles"} também.` : "";
    if (!window.confirm(`Tirar "${ex.nome}" do treino ${modelo.nome}?${aviso}`)) return;
    setEditando(null);
    try {
      await tirarDoModelo(modelo.id, ex.exercicio_id!);
      await recarregar.catalogo();
      toast.success("Exercício tirado do treino.");
    } catch (e) {
      erro(e);
    }
  };

  const adicionar = async (exercicioId: string) => {
    setFolha(null);
    try {
      const maior = Math.max(-1, ...linhas.map((l) => Number(l.ordem ?? 0)));
      await adicionarAoModelo(modelo.id, exercicioId, maior + 1);
      await recarregar.catalogo();
      toast.success("Exercício no treino.");
    } catch (e) {
      erro(e);
    }
  };

  return (
    <Cartao brilho className="px-[18px] py-[18px]" data-modelo-detalhe={modelo.id} data-modelo-nome={modelo.nome} data-somente-leitura={ler || undefined}>
      {/* cabeçalho: Treino · abas · + · pastas/renomear/excluir */}
      <div className="mb-3 flex items-start gap-2">
        <h3 className="mt-[5px] font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">Treino</h3>
        <div role="tablist" aria-label="Treinos" className="ml-1 flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-modelo-abas>
          {abas.map((m) => (
            <AbaModelo key={m.id} m={m} ativa={m.id === modelo.id} aoAbrir={() => aoAbrir(m.id)} />
          ))}
          {aoNovo && (
            <button type="button" aria-label="Novo treino" title="Novo treino" onClick={aoNovo}
              className="flex h-[30px] w-[26px] flex-none items-center justify-center rounded-[9px] border border-linha bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto" data-modelo-novo-aba>
              <Plus aria-hidden className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="ml-auto flex flex-none items-center gap-1.5">
          <Botao tamanho="sm" variante="g" icone={FolderClosed} onClick={aoPastas} className="!px-3" data-modelo-pastas={modelo.pastas.length}>
            Pastas{modelo.pastas.length ? ` (${modelo.pastas.length})` : ""}
          </Botao>
          {!ler && (
            <>
              <BotaoIcone icone={Pencil} rotulo="Renomear o treino" onClick={aoRenomear} tamanho={32} data-modelo-renomear />
              <BotaoIcone icone={Trash2} rotulo="Excluir o treino" onClick={aoExcluir} tamanho={32} data-modelo-excluir />
            </>
          )}
        </div>
      </div>

      {/* chips: exercícios · séries · duração · alunos · global */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5" data-modelo-chips>
        <Chip tom="t" data-chip-exercicios>{modelo.exercicios.length} {modelo.exercicios.length === 1 ? "EXERCÍCIO" : "EXERCÍCIOS"}</Chip>
        <Chip tom="g" data-chip-series>{modelo.totalSeries} {modelo.totalSeries === 1 ? "SÉRIE" : "SÉRIES"}</Chip>
        {modelo.minutos !== null && <Chip tom="g" data-chip-minutos>~{modelo.minutos} MIN</Chip>}
        {alunosProntos && <Chip tom="g" data-chip-alunos={modelo.alunos}>{textoAlunos(modelo.alunos).toUpperCase()}</Chip>}
        {modelo.global && (
          <Chip tom="g" icone={ler ? Lock : undefined} data-chip-global>{ler ? "GLOBAL · SÓ LEITURA" : "GLOBAL"}</Chip>
        )}
      </div>

      <div data-modelo-exercicios>
        {exercicios.length === 0 ? (
          <div className="flex items-center gap-3 border-t border-[rgba(255,255,255,.06)] py-4 text-[13px] text-texto-3" data-modelo-sem-exercicios>
            <Dumbbell aria-hidden className="h-4 w-4" strokeWidth={1.75} />
            Nenhum exercício neste treino ainda.
          </div>
        ) : ler ? (
          exercicios.map((ex) => (
            <LinhaExercicioEditor key={ex.chave} ex={ex} descansoPadrao={DESCANSO_PADRAO} somenteLeitura listaFixa aoPrescrever={() => undefined} aoEditar={() => undefined} aoRemover={() => undefined} />
          ))
        ) : (
          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={(e) => void soltar(e)}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {exercicios.map((ex) => (
                <ItemArrastavel key={ex.chave} id={ex.chave}>
                  {(alca) => (
                    <LinhaExercicioEditor
                      ex={ex}
                      descansoPadrao={DESCANSO_PADRAO}
                      somenteLeitura={false}
                      listaFixa={false}
                      alca={alca}
                      aoPrescrever={(p) => void prescrever(ex, p)}
                      aoEditar={() => setEditando(ex)}
                      aoRemover={() => void remover(ex)}
                    />
                  )}
                </ItemArrastavel>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {!ler && (
        <button
          type="button"
          onClick={() => setFolha("biblioteca")}
          className="mt-2.5 flex h-[42px] w-full items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-dashed border-[rgba(167,139,250,.4)] bg-[rgba(139,92,246,.05)] text-[13px] font-semibold text-violeta-3 transition-colors hover:bg-[rgba(139,92,246,.1)]"
          data-modelo-adicionar
          data-biblioteca-resumo-erro={comGif === null || undefined}
          title={comGif === null ? "Não deu para contar os exercícios com GIF agora" : undefined}
        >
          <Plus aria-hidden className="h-4 w-4" />
          Adicionar exercício da biblioteca ({comGif ?? "—"} com GIF)
        </button>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-texto-3" data-modelo-explica>
        {ler
          ? "Treino do catálogo global do Physiq: você usa e dá aos seus alunos, mas não muda. Para mudar, crie um treino seu."
          : "Séries, repetições, descanso e carga do modelo vão para quem passar a receber, só onde o aluno ainda não tem os dele. O ajuste de cada aluno fica no perfil dele (Alunos › aluno › Treino)."}
      </p>

      {!ler && (
        <>
          <FolhaBiblioteca
            aberto={folha === "biblioteca"}
            aoMudar={(a) => setFolha(a ? "biblioteca" : null)}
            treino={comoTreino}
            // global do master só leva exercício global (todo aluno enxerga); o do personal, os globais + os dele
            professorDoAluno={modelo.global ? null : q.meuId}
            aoEscolher={(ex) => void adicionar(ex.id)}
          />
          <FolhaEditarExercicio
            aberto={!!editando}
            aoMudar={(a) => !a && setEditando(null)}
            ex={editando}
            descansoPadrao={DESCANSO_PADRAO}
            listaFixa={false}
            aoSalvar={(p) => (editando ? prescrever(editando, p) : Promise.resolve(false))}
            aoRemover={() => editando && void remover(editando)}
          />
        </>
      )}
    </Cartao>
  );
}
