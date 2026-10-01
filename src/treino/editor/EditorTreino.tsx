import { useEffect, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bookmark, Dumbbell, GripVertical, Lock, LockOpen, Plus, Repeat, Timer, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarDescanso } from "@/treino/prescricao";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { FolhaBiblioteca, FolhaDescanso, FolhaEditarExercicio, FolhaModelos } from "./folhas";
import { LinhaExercicioEditor } from "./LinhaExercicioEditor";
import { descansoDoAluno, temAlternado, textoDescansoCampo } from "./regras";
import { mensagemDoErro, useAcoesEditor, useDadosEditor, type AcoesEditor } from "./useEditorTreino";
import type { ExercicioEditor, TreinoEditor } from "./tipos";

export interface EditorTreinoProps {
  /** o usuário do Banco do Treino do aluno (o id que as funções admin-* conhecem) */
  treinoUserId: string;
  /** ver sem mudar (nutricionista, dono sem papel de personal — spec 4.1) */
  somenteLeitura?: boolean;
  /** nome do aluno (avisos) */
  nomeAluno?: string | null;
  /** cada mudança gravada (a página "Editar treino e dieta" da W16 usa para o aviso "plano atualizado") */
  onMudou?: () => void;
  /** "Treino alternado" leva até a semana do aluno (a aba Treino rola até ela) */
  aoAbrirSemana?: () => void;
  /** W16: o aluno da rota, para quem só LÊ pelo principal (a nutricionista, sem sessão do Treino — função treino-leitura) */
  leituraAluno?: string | null;
  className?: string;
}

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
function AbaTreino({ t, ativa, aoAbrir }: { t: TreinoEditor; ativa: boolean; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={aoAbrir}
      data-treino-aba={t.chave}
      data-treino-rotulo={t.rotulo}
      className={cn(
        "h-[30px] flex-none whitespace-nowrap rounded-[9px] border px-2 text-[11.5px] font-semibold tracking-[-0.005em] transition-colors",
        ativa ? "border-[#FAFAFA] bg-[#FAFAFA] text-[#09090B]" : "border-linha bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto",
      )}
    >
      {t.rotulo}
    </button>
  );
}

/**
 * Editor do treino do aluno (tela 8, lado esquerdo — spec 4.5 › Treino, C37/C41/C84 e NF1/NF2): treinos A/B/C, "+", Modelos;
 * chips de exercícios, séries, duração e o cadeado "Aluno não muda as séries"; por exercício o GIF, nome, grupo · subgrupo,
 * séries, repetições, descanso e carga (vazio = como hoje), editar, tirar e arrastar; "Adicionar exercício da biblioteca";
 * observação para o aluno; descanso padrão e treino alternado. Grava no Banco do Treino a cada mudança (o aluno vê pelo
 * PowerSync). A W16 monta a página "Editar treino e dieta" com este mesmo componente.
 */
export function EditorTreino({ treinoUserId, somenteLeitura = false, nomeAluno, onMudou, aoAbrirSemana, leituraAluno, className }: EditorTreinoProps) {
  const dados = useDadosEditor(leituraAluno ? null : treinoUserId, leituraAluno);
  const acoes = useAcoesEditor(leituraAluno ? null : treinoUserId, onMudou);
  const [aberta, setAberta] = useState<string | null>(null);
  const treinos = dados.treinos;
  const ler = somenteLeitura || !!leituraAluno || dados.data?.podeEditar === false;

  // aba aberta: a escolhida (pelo nome — a chave muda quando o treino vira cópia só do aluno), senão a 1ª
  const nomeAberto = useRef<string | null>(null);
  useEffect(() => {
    if (!treinos.length) return;
    if (aberta && treinos.some((t) => t.chave === aberta)) return;
    const pelo = nomeAberto.current ? treinos.find((t) => t.nome === nomeAberto.current) : null;
    setAberta((pelo ?? treinos[0]).chave);
  }, [treinos, aberta]);
  const treino = treinos.find((t) => t.chave === aberta) ?? treinos[0] ?? null;
  useEffect(() => {
    if (treino) nomeAberto.current = treino.nome;
  }, [treino]);

  if (dados.isLoading) {
    return (
      <Cartao brilho className={cn("flex flex-col gap-3 px-[18px] py-[18px]", className)} data-editor-treino="carregando">
        <Esqueleto className="h-8 w-2/3" />
        <Esqueleto className="h-6 w-1/2" />
        {[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-14 w-full" />)}
      </Cartao>
    );
  }
  if (dados.error || !dados.data) {
    return <EstadoErro titulo="Não deu para abrir o treino" texto={mensagemDoErro(dados.error)} aoTentar={() => void dados.refetch()} className={className} />;
  }
  return (
    <CorpoEditor
      treinos={treinos}
      treino={treino}
      aoAbrir={(t) => setAberta(t.chave)}
      descansoPadrao={descansoDoAluno(dados.data)}
      travado={dados.data.config?.series_travadas === true}
      alternado={temAlternado(dados.data)}
      professorDoAluno={dados.data.professorDoAluno}
      treinoUserId={treinoUserId}
      somenteLeitura={ler}
      nomeAluno={nomeAluno}
      acoes={acoes}
      aoAbrirSemana={aoAbrirSemana}
      className={className}
    />
  );
}

function CorpoEditor({
  treinos,
  treino,
  aoAbrir,
  descansoPadrao,
  travado,
  alternado,
  professorDoAluno,
  treinoUserId,
  somenteLeitura,
  nomeAluno,
  acoes,
  aoAbrirSemana,
  className,
}: {
  treinos: TreinoEditor[];
  treino: TreinoEditor | null;
  aoAbrir: (t: TreinoEditor) => void;
  descansoPadrao: number;
  travado: boolean;
  alternado: boolean;
  professorDoAluno: string | null;
  treinoUserId: string;
  somenteLeitura: boolean;
  nomeAluno?: string | null;
  acoes: AcoesEditor;
  aoAbrirSemana?: () => void;
  className?: string;
}) {
  const [folha, setFolha] = useState<null | "biblioteca" | "modelos" | "novo" | "descanso">(null);
  const [editando, setEditando] = useState<ExercicioEditor | null>(null);
  const [obs, setObs] = useState(treino?.observacao ?? "");
  const obsFocada = useRef(false);
  useEffect(() => {
    if (!obsFocada.current) setObs(treino?.observacao ?? "");
  }, [treino?.chave, treino?.observacao]);
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const listaFixa = !treino || treino.tipo === "pessoal";
  const ids = useMemo(() => (treino?.exercicios ?? []).map((e) => e.chave), [treino]);

  const soltar = (e: DragEndEvent) => {
    if (!treino || !e.over || e.active.id === e.over.id) return;
    const de = ids.indexOf(String(e.active.id));
    const para = ids.indexOf(String(e.over.id));
    if (de < 0 || para < 0) return;
    const nova = arrayMove(treino.exercicios, de, para).map((x) => x.exercicio_id!).filter(Boolean);
    void acoes.ordenar(treino, nova);
  };
  const remover = (ex: ExercicioEditor) => {
    if (!treino) return;
    const aviso = treino.listaDireta ? "" : "\n\nEste treino é compartilhado: o aluno passa a ter uma cópia só dele (os outros continuam com o de antes).";
    if (!window.confirm(`Tirar "${ex.nome}" do treino ${treino.rotulo}${nomeAluno ? ` de ${nomeAluno}` : ""}?${aviso}`)) return;
    setEditando(null);
    void acoes.remover(treino, ex);
  };

  const semTreino = treinos.length === 0;
  return (
    <Cartao brilho className={cn("px-[18px] py-[18px]", className)} data-editor-treino={treino?.chave ?? "vazio"} data-somente-leitura={somenteLeitura || undefined}>
      {/* cabeçalho: Treino · abas A/B/C · + · Modelos */}
      <div className="mb-3 flex items-start gap-2">
        <h3 className="mt-[5px] font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">Treino</h3>
        <div role="tablist" aria-label="Treinos do aluno" className="ml-1 flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-treino-abas>
          {treinos.map((t) => (
            <AbaTreino key={t.chave} t={t} ativa={t.chave === treino?.chave} aoAbrir={() => aoAbrir(t)} />
          ))}
          {!somenteLeitura && (
            <button
              type="button"
              aria-label="Novo treino"
              title="Novo treino"
              onClick={() => setFolha("novo")}
              className="flex h-[30px] w-[26px] flex-none items-center justify-center rounded-[9px] border border-linha bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto"
              data-treino-novo
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {!somenteLeitura && (
          <div className="ml-auto flex flex-none items-center">
            <Botao tamanho="sm" variante="g" icone={Bookmark} onClick={() => setFolha("modelos")} className="!px-3" data-treino-modelos>
              Modelos
            </Botao>
          </div>
        )}
      </div>

      {semTreino ? (
        <EstadoVazio
          icone={Dumbbell}
          titulo="O aluno ainda não tem treino"
          texto={somenteLeitura ? "Quando o personal montar, o treino aparece aqui." : "Crie um treino novo no + ou use um dos seus modelos."}
          acao={!somenteLeitura ? <Botao variante="w" tamanho="sm" icone={Bookmark} onClick={() => setFolha("modelos")}>Usar um modelo</Botao> : undefined}
          className="border-0 bg-transparent py-6 shadow-none"
        />
      ) : treino ? (
        <>
          {/* chips: exercícios · séries · duração · cadeado */}
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5" data-treino-chips>
            <Chip tom="t" data-chip-exercicios>{treino.exercicios.length} {treino.exercicios.length === 1 ? "EXERCÍCIO" : "EXERCÍCIOS"}</Chip>
            <Chip tom="g" data-chip-series>{treino.totalSeries} {treino.totalSeries === 1 ? "SÉRIE" : "SÉRIES"}</Chip>
            {treino.minutos !== null && <Chip tom="g" data-chip-minutos>~{treino.minutos} MIN</Chip>}
            <button
              type="button"
              disabled={somenteLeitura}
              onClick={() => void acoes.configurar({ series_travadas: !travado }, travado ? "Séries liberadas: o aluno pode pôr e tirar séries." : "Séries travadas: o aluno não muda o nº de séries.")}
              aria-pressed={travado}
              className={cn("pq-chip pq-chip-g", !somenteLeitura && "cursor-pointer hover:text-texto")}
              data-chip-cadeado={travado ? "travado" : "livre"}
            >
              {travado ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
              {travado ? "ALUNO NÃO MUDA AS SÉRIES" : "ALUNO PODE MUDAR AS SÉRIES"}
            </button>
            {!treino.listaDireta && treino.tipo === "catalogo" && !somenteLeitura && (
              <span className="text-[11px] text-texto-3" data-treino-compartilhado title="Mudar a lista de exercícios cria uma cópia só deste aluno">
                {treino.global ? "Modelo da biblioteca" : treino.alunos > 1 ? `Também de outros ${treino.alunos - 1} ${treino.alunos - 1 === 1 ? "aluno" : "alunos"}` : "Modelo"}
              </span>
            )}
            {treino.tipo === "pessoal" && <span className="text-[11px] text-texto-3" data-treino-do-aluno>Criado pelo aluno no app</span>}
          </div>

          {/* exercícios */}
          <div data-treino-exercicios>
            {treino.exercicios.length === 0 ? (
              <p className="border-t border-[rgba(255,255,255,.06)] py-4 text-[13px] text-texto-3" data-treino-sem-exercicios>
                Nenhum exercício neste treino ainda.
              </p>
            ) : somenteLeitura || listaFixa ? (
              treino.exercicios.map((ex) => (
                <LinhaExercicioEditor
                  key={ex.chave}
                  ex={ex}
                  descansoPadrao={descansoPadrao}
                  somenteLeitura={somenteLeitura}
                  listaFixa={listaFixa}
                  aoPrescrever={(p) => void acoes.prescrever(treino, ex, p)}
                  aoEditar={() => setEditando(ex)}
                  aoRemover={() => remover(ex)}
                />
              ))
            ) : (
              <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={soltar}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {treino.exercicios.map((ex) => (
                    <ItemArrastavel key={ex.chave} id={ex.chave}>
                      {(alca) => (
                        <LinhaExercicioEditor
                          ex={ex}
                          descansoPadrao={descansoPadrao}
                          somenteLeitura={false}
                          listaFixa={false}
                          alca={alca}
                          aoPrescrever={(p) => void acoes.prescrever(treino, ex, p)}
                          aoEditar={() => setEditando(ex)}
                          aoRemover={() => remover(ex)}
                        />
                      )}
                    </ItemArrastavel>
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {!somenteLeitura && !listaFixa && (
            <button
              type="button"
              onClick={() => setFolha("biblioteca")}
              className="mt-2.5 flex h-[42px] w-full items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-dashed border-[rgba(167,139,250,.4)] bg-[rgba(139,92,246,.05)] text-[13px] font-semibold text-violeta-3 transition-colors hover:bg-[rgba(139,92,246,.1)]"
              data-treino-adicionar
            >
              <Plus aria-hidden className="h-4 w-4" />
              Adicionar exercício da biblioteca (81 com GIF)
            </button>
          )}

          {/* observação para o aluno (NF2) */}
          <div className="pq-eyebrow mb-1.5 mt-4 normal-case tracking-normal text-[12.5px] font-medium text-texto-2">Observação pro aluno</div>
          {somenteLeitura ? (
            <p className="min-h-[46px] rounded-[14px] border border-linha bg-[rgba(255,255,255,.04)] px-3.5 py-3 text-[13px] leading-normal text-[#D4D4D8]" data-treino-observacao>
              {treino.observacao || <span className="text-texto-3">Sem observação.</span>}
            </p>
          ) : (
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value.slice(0, 1000))}
              onFocus={() => (obsFocada.current = true)}
              onBlur={() => {
                obsFocada.current = false;
                if ((obs.trim() || null) !== (treino.observacao || null)) void acoes.observar(treino, obs);
              }}
              rows={2}
              placeholder="Ex.: Desça a barra em 3 segundos no supino."
              className="w-full resize-y rounded-[14px] border border-linha bg-[rgba(255,255,255,.04)] px-3.5 py-3 text-[13px] leading-normal text-[#D4D4D8] outline-none placeholder:text-texto-4 focus:border-violeta-3"
              data-treino-observacao-campo
            />
          )}

          {/* descanso padrão e treino alternado */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={somenteLeitura}
              onClick={() => setFolha("descanso")}
              className={cn("pq-chip pq-chip-g", !somenteLeitura && "cursor-pointer hover:text-texto")}
              data-chip-descanso={descansoPadrao}
            >
              <Timer aria-hidden />
              DESCANSO PADRÃO {textoDescansoCampo(descansoPadrao).toUpperCase()}
            </button>
            <button type="button" onClick={aoAbrirSemana} className={cn("pq-chip pq-chip-g", aoAbrirSemana && "cursor-pointer hover:text-texto")} data-chip-alternado={alternado ? "sim" : "nao"}>
              <Repeat aria-hidden />
              TREINO ALTERNADO: {alternado ? "SIM" : "NÃO"}
            </button>
            {!somenteLeitura && treino.tipo === "catalogo" && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Tirar "${treino.nome}" do aluno? Ele sai da semana; o treino continua em Painel › Treinos.`)) void acoes.tirar(treino);
                }}
                className="ml-auto flex items-center gap-1 text-[11.5px] font-medium text-texto-3 hover:text-rosa-3"
                data-treino-tirar
              >
                <UserMinus aria-hidden className="h-3.5 w-3.5" />
                Tirar do aluno
              </button>
            )}
          </div>
        </>
      ) : null}

      {!somenteLeitura && (
        <>
          <FolhaBiblioteca
            aberto={folha === "biblioteca"}
            aoMudar={(a) => setFolha(a ? "biblioteca" : null)}
            treino={treino}
            professorDoAluno={professorDoAluno}
            aoEscolher={(ex) => {
              if (!treino) return;
              setFolha(null);
              void acoes.adicionar(treino, ex.id);
            }}
          />
          <FolhaModelos
            aberto={folha === "modelos" || folha === "novo"}
            aoMudar={(a) => setFolha(a ? (folha ?? "modelos") : null)}
            treinoUserId={treinoUserId}
            modo={folha === "novo" ? "novo" : "modelos"}
            aoUsar={(id) => acoes.usarModelo(id)}
            aoCriar={(nome) => acoes.criarTreino(nome)}
          />
          <FolhaEditarExercicio
            aberto={!!editando}
            aoMudar={(a) => !a && setEditando(null)}
            ex={editando}
            descansoPadrao={descansoPadrao}
            listaFixa={listaFixa}
            aoSalvar={(p) => (treino && editando ? acoes.prescrever(treino, editando, p) : Promise.resolve(null))}
            aoRemover={() => editando && remover(editando)}
          />
          <FolhaDescanso
            aberto={folha === "descanso"}
            aoMudar={(a) => setFolha(a ? "descanso" : null)}
            atual={descansoPadrao}
            aoSalvar={(seg) => acoes.configurar({ tempo_descanso_segundos: seg }, `Descanso padrão: ${formatarDescanso(seg)}.`)}
          />
        </>
      )}
    </Cartao>
  );
}
