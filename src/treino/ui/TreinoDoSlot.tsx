import { useEffect, useMemo, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Share2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { usePowerSync } from "@powersync/react";
import { chaveTreino } from "@/lib/seriesPadrao";
import { Botao } from "@/ui/premium/Botao";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { carregarAnotacao } from "../anotacoes";
import { fotoDoSlot } from "../foto";
import { cargaDaLinha, formatarCarga, linhaDoExercicio, observacaoDoTreino, prescricaoDoExercicio, type Prescricao, type PrescricaoTreino } from "../prescricao";
import { proximaSerie } from "../proxima";
import { restaurarExercicio } from "../remocao";
import type { Academia, DiaSlot, Exercicio, GrupoExercicio, InfoSubstituicao, ItemRemovidoDia, SerieComMemoria } from "../tipos";
import { useAcoesSeries, useOrdemExercicios } from "../useAcoesSeries";
import { CartaoTreino } from "./CartaoTreino";
import { AlcaArrastar, LinhaExercicio, type EstadoLinha } from "./LinhaExercicio";
import { SeriesDoExercicio } from "./SeriesDoExercicio";
import { SheetAnotacoes } from "./SheetAnotacoes";
import { SheetFicha } from "./SheetFicha";
import { SheetHistoricoExercicio } from "./SheetHistoricoExercicio";
import { SheetOpcoesTreino } from "./SheetOpcoesTreino";
import { SheetRemoverExercicio } from "./SheetRemoverExercicio";
import { TrocarExercicio } from "./TrocarExercicio";

export interface PropsSlot {
  userId: string;
  dateKey: string;
  dateLabel: string;
  slot: DiaSlot;
  /** "TREINO A" / "MEU TREINO" / "TREINO EXTRA" */
  chip: string;
  series: SerieComMemoria[];
  atualizar: (acao: SerieComMemoria[] | ((antes: SerieComMemoria[]) => SerieComMemoria[])) => void;
  seriesTravadas: boolean;
  concluido: boolean;
  academia: Academia | null;
  descansoPadrao: number;
  mapaPresc: Map<string, Prescricao & PrescricaoTreino>;
  podeComecar: boolean;
  aoComecar: () => void;
  /** OK numa série: nome, nº, exercício, se foi a última do treino, a próxima série e o descanso prescrito (NF1) */
  aoConcluirSerie: (a: { nome: string; numero: number; exercicioId: string; ultima: boolean; depois: string | null; descanso: number | null }) => void;
  aoMudarConcluido: (concluido: boolean) => void;
  aoTrocarTreino: () => void;
  aoAdicionarTreino: () => void;
  aoTirarDoDia: () => void;
  aoAcademia: () => void;
  aoCompartilharConcluido?: () => void;
}

export function TreinoDoSlot(p: PropsSlot) {
  const db = usePowerSync();
  const confirmar = useConfirmar();
  const { slot, userId } = p;
  const grupo = slot.grupo!;
  const grupoKey = chaveTreino(slot.grupoPessoal ? null : grupo.id, slot.grupoPessoal ? grupo.id : null);
  const { itens, salvarOrdem, voltarOrdemPadrao } = useOrdemExercicios(userId, grupo.id, slot.exercicios);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [reordenar, setReordenar] = useState(false);
  const [opcoes, setOpcoes] = useState(false);
  const [ficha, setFicha] = useState<Exercicio | null>(null);
  const [historico, setHistorico] = useState<{ id: string; nome: string } | null>(null);
  const [anotacoes, setAnotacoes] = useState<{ id: string; nome: string } | null>(null);
  const [comAnotacao, setComAnotacao] = useState<Set<string>>(new Set());
  const [trocar, setTrocar] = useState<{ ex: Exercicio; origemId: string; pessoal: boolean; substituindo: InfoSubstituicao | null } | null>(null);
  const [remover, setRemover] = useState<{ ex: Exercicio; origemId: string } | null>(null);

  const seriesDe = (exId: string) => p.series.filter((s) => s.exercicio_id === exId || s.exercicio_usuario_id === exId).sort((a, b) => a.numero_serie - b.numero_serie);

  const acoes = useAcoesSeries({
    userId,
    dateKey: p.dateKey,
    slotIdx: slot.slot_idx,
    grupoId: grupo.id,
    grupoPessoal: !!slot.grupoPessoal,
    seriesTravadas: p.seriesTravadas,
    exercicios: slot.exercicios,
    series: p.series,
    concluido: p.concluido,
    academia: p.academia,
    atualizar: p.atualizar,
    aoConcluirSerie: (nome, numero, exercicioId, ultima) => {
      const ge = itens.find((g) => g.tb_exercicios.id === exercicioId);
      const presc = ge ? prescricaoDoExercicio(p.mapaPresc, grupoKey, ge.exercicio_usuario_id ? null : ge.exercicio_id, ge.exercicio_usuario_id ?? null) : null;
      p.aoConcluirSerie({ nome, numero, exercicioId, ultima, depois: ultima ? null : proximaSerie(itens, p.series, exercicioId, numero), descanso: presc?.descanso ?? null });
    },
    aoMudarConcluido: p.aoMudarConcluido,
  });

  // quem tem anotação (o pontinho em "Anotações")
  const idsChave = itens.map((g) => g.tb_exercicios.id).join("|");
  useEffect(() => {
    let vivo = true;
    (async () => {
      const com = new Set<string>();
      for (const id of idsChave.split("|").filter(Boolean)) {
        try {
          if ((await carregarAnotacao(db, userId, id)).trim()) com.add(id);
        } catch {
          /* noop */
        }
      }
      if (vivo) setComAnotacao(com);
    })();
    return () => {
      vivo = false;
    };
  }, [idsChave, userId, db]);

  // estado de cada exercício e o "atual" (1º com série por fazer)
  const estados = useMemo(() => {
    const m = new Map<string, { feitas: number; total: number; estado: EstadoLinha }>();
    let atualMarcado = p.concluido; // treino concluído: ninguém fica "atual"
    for (const ge of itens) {
      const ss = seriesDe(ge.tb_exercicios.id);
      const feitas = ss.filter((s) => s.concluida).length;
      const feito = ss.length > 0 && feitas === ss.length;
      let estado: EstadoLinha = feito ? "feito" : "pendente";
      if (!feito && !atualMarcado) {
        estado = "atual";
        atualMarcado = true;
      }
      m.set(ge.tb_exercicios.id, { feitas, total: ss.length, estado });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seriesDe depende de p.series
  }, [itens, p.series, p.concluido]);

  const feitos = itens.filter((g) => estados.get(g.tb_exercicios.id)?.estado === "feito").length;
  const totalSeries = itens.reduce((n, g) => n + (estados.get(g.tb_exercicios.id)?.total ?? 0), 0);
  // selo "trocado" só no dia em que a troca foi feita (como hoje)
  const nomeTrocado = (ge: GrupoExercicio) => (ge.substituindo && ge.substituindo.trocadoEm === p.dateKey ? ge.substituindo.nome : null);

  const abrirRemover = (ge: GrupoExercicio) => {
    if (p.concluido) return toast.error("Treino já concluído — desmarque antes de remover exercícios.");
    if (seriesDe(ge.tb_exercicios.id).some((s) => s.concluida)) return toast.error("Este exercício já tem série concluída hoje — desfaça as séries antes de remover.");
    setRemover({ ex: ge.tb_exercicios, origemId: ge.substituindo?.id ?? ge.tb_exercicios.id });
  };

  const restaurar = async (r: ItemRemovidoDia) => {
    const pergunta = r.escopo === "dia" ? `Restaurar "${r.nome}" em ${p.dateLabel}?` : `Restaurar "${r.nome}" nos próximos treinos de ${grupo.nome}?`;
    if (!(await confirmar({ titulo: pergunta, rotuloConfirmar: "Restaurar" }))) return;
    try {
      await restaurarExercicio(db, { userId, origemId: r.exercicio_id, grupoId: grupo.id, slotIdx: slot.slot_idx, dateKey: p.dateKey }, r.escopo);
      toast.success(`Restaurado: ${r.nome}`);
    } catch (e) {
      console.error("[Treino] restaurar exercício:", e);
      toast.error("Não deu para restaurar o exercício. Tente de novo.");
    }
  };

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const aoSoltar = (e: DragEndEvent) => {
    const de = itens.findIndex((g) => g.exercicio_id === e.active.id);
    const para = itens.findIndex((g) => g.exercicio_id === e.over?.id);
    if (de < 0 || para < 0 || de === para) return;
    void salvarOrdem(arrayMove(itens, de, para));
    if (navigator.vibrate) navigator.vibrate(15);
  };

  const linhaDe = (ge: GrupoExercicio, alca?: React.ReactNode) => {
    const ex = ge.tb_exercicios;
    const ss = seriesDe(ex.id);
    const presc = prescricaoDoExercicio(p.mapaPresc, grupoKey, ge.exercicio_usuario_id ? null : ge.exercicio_id, ge.exercicio_usuario_id ?? null);
    const corrida = ex.tipo === "corrida";
    const info = estados.get(ex.id) ?? { feitas: 0, total: ss.length, estado: "pendente" as EstadoLinha };
    return (
      <LinhaExercicio
        key={ex.id}
        exercicioId={ex.id}
        nome={ex.nome}
        imagemUrl={ex.imagem_url}
        linha={linhaDoExercicio({ prescricao: presc, series: ss, descansoPadrao: p.descansoPadrao, corrida })}
        carga={corrida ? null : formatarCarga(cargaDaLinha(presc, ss))}
        estado={info.estado}
        feitas={info.feitas}
        total={info.total}
        trocado={nomeTrocado(ge)}
        aberto={abertoId === ex.id}
        temAnotacao={comAnotacao.has(ex.id)}
        aoAbrir={() => setAbertoId((a) => (a === ex.id ? null : ex.id))}
        aoFicha={() => setFicha(ex)}
        aoHistorico={() => setHistorico({ id: ex.id, nome: ex.nome })}
        aoAnotacoes={() => setAnotacoes({ id: ex.id, nome: ex.nome })}
        aoTrocar={() => setTrocar({ ex, origemId: ge.substituindo?.id ?? ex.id, pessoal: !!ge.exercicio_usuario_id, substituindo: ge.substituindo ?? null })}
        aoRemover={() => abrirRemover(ge)}
        alca={alca}
      >
        <SeriesDoExercicio
          exercicioId={ex.id}
          nome={ex.nome}
          series={ss}
          corrida={corrida}
          podeEditar={!p.seriesTravadas}
          aoSalvar={(num, peso, reps, t, d) => void acoes.salvarSerie(ex.id, num, peso, reps, t, d)}
          aoConcluir={(num, peso, reps, t, d) => void acoes.concluirSerie(ex.id, ex.nome, num, peso, reps, t, d)}
          aoDesfazer={(num) => void acoes.desfazerSerie(ex.id, num)}
          aoRemover={(num, salva) => void acoes.removerSerie(ex.id, num, salva)}
          aoAdicionar={() => void acoes.adicionarSerie(ex.id)}
        />
      </LinhaExercicio>
    );
  };

  return (
    <div className="flex flex-col gap-2" data-slot={slot.slot_idx} data-slot-grupo={grupo.nome}>
      <CartaoTreino
        nome={grupo.nome}
        chip={p.chip}
        exercicios={itens.length}
        series={totalSeries}
        feitos={feitos}
        academia={p.academia?.nome ?? null}
        foto={fotoDoSlot(slot)}
        concluido={p.concluido}
        podeComecar={p.podeComecar && !p.concluido && itens.length > 0}
        aoComecar={p.aoComecar}
        aoAcademia={p.aoAcademia}
        aoOpcoes={() => setOpcoes(true)}
        observacao={observacaoDoTreino(p.mapaPresc, grupoKey)}
        rodape={p.concluido && p.aoCompartilharConcluido ? (
          <Botao variante="g" tamanho="sm" icone={Share2} onClick={p.aoCompartilharConcluido} data-treino-compartilhar>Compartilhar</Botao>
        ) : undefined}
      />

      {reordenar && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-violeta/35 bg-violeta/10 px-3.5 py-2.5" data-reordenando>
          <span className="text-[12.5px] font-medium text-violeta-3">Arraste pela alça para mudar a ordem</span>
          <Botao variante="w" tamanho="sm" onClick={() => setReordenar(false)} data-reordenar-pronto>Pronto</Botao>
        </div>
      )}

      {itens.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-texto-2">Nenhum exercício neste treino.</p>
      ) : reordenar ? (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
          <SortableContext items={itens.map((g) => g.exercicio_id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2" data-lista-exercicios>
              {itens.map((ge) => (
                <ItemArrastavel key={ge.exercicio_id} id={ge.exercicio_id}>
                  {(alca) => linhaDe(ge, alca)}
                </ItemArrastavel>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex flex-col gap-2" data-lista-exercicios>
          {itens.map((ge) => linhaDe(ge))}
        </div>
      )}

      {(slot.removidos?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-linha-2 px-3.5 py-2.5" data-removidos>
          <span className="pq-eyebrow">Removidos</span>
          {slot.removidos!.map((r) => (
            <div key={r.exercicio_id} className="flex items-center gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate text-texto-3 line-through">{r.nome}</span>
              <span className="pq-chip pq-chip-g h-5 px-2 text-[9.5px]">{r.escopo === "dia" ? "SÓ HOJE" : "DE VEZ"}</span>
              <button type="button" onClick={() => void restaurar(r)} data-restaurar={r.exercicio_id} className="flex items-center gap-1 font-semibold text-violeta-3">
                <Undo2 aria-hidden className="h-3.5 w-3.5" /> Restaurar
              </button>
            </div>
          ))}
        </div>
      )}

      <SheetOpcoesTreino
        aberto={opcoes}
        aoMudar={setOpcoes}
        nome={grupo.nome}
        concluido={p.concluido}
        aoTrocar={p.aoTrocarTreino}
        aoAdicionar={p.aoAdicionarTreino}
        aoAlternarConcluido={() => void acoes.alternarConcluido()}
        aoReordenar={() => {
          setAbertoId(null);
          setReordenar(true);
        }}
        aoOrdemPadrao={() => void voltarOrdemPadrao()}
        aoAcademia={p.aoAcademia}
        aoTirarDoDia={p.aoTirarDoDia}
      />
      <SheetFicha exercicio={ficha} aoFechar={() => setFicha(null)} />
      <SheetHistoricoExercicio userId={userId} exercicio={historico} aoFechar={() => setHistorico(null)} />
      <SheetAnotacoes
        userId={userId}
        exercicio={anotacoes}
        aoFechar={(mudou) => {
          const alvo = anotacoes;
          setAnotacoes(null);
          if (mudou && alvo) {
            void carregarAnotacao(db, userId, alvo.id).then((t) =>
              setComAnotacao((antes) => {
                const prox = new Set(antes);
                if (t.trim()) prox.add(alvo.id);
                else prox.delete(alvo.id);
                return prox;
              }),
            );
          }
        }}
      />
      <SheetRemoverExercicio
        alvo={remover ? { userId, exercicio: { id: remover.ex.id, nome: remover.ex.nome }, origemId: remover.origemId, grupoId: grupo.id, grupoNome: grupo.nome,
          grupoPessoal: !!slot.grupoPessoal, slotIdx: slot.slot_idx, dateKey: p.dateKey, dateLabel: p.dateLabel } : null}
        aoFechar={() => setRemover(null)}
      />
      <TrocarExercicio
        alvo={trocar ? {
          userId,
          exercicio: trocar.ex,
          pessoal: trocar.pessoal,
          origemId: trocar.origemId,
          substituindo: trocar.substituindo,
          idsNoTreino: itens.map((g) => g.exercicio_id),
          grupoId: grupo.id,
          grupoNome: grupo.nome,
          grupoPessoal: !!slot.grupoPessoal,
          slotIdx: slot.slot_idx,
          dateKey: p.dateKey,
          dateLabel: p.dateLabel,
          academia: p.academia,
        } : null}
        aoFechar={() => setTrocar(null)}
        aoEquipamentos={() => {
          setTrocar(null);
          p.aoAcademia();
        }}
      />
    </div>
  );
}

function ItemArrastavel({ id, children }: { id: string; children: (alca: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 5 : undefined }} data-arrastavel={id}>
      {children(<AlcaArrastar {...attributes} {...listeners} />)}
    </div>
  );
}
