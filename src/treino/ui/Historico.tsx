import { useMemo, useState } from "react";
import { usePowerSync, useQuery } from "@powersync/react";
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Dumbbell, MapPin, Share2, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { buildTreinoResumo, type TreinoResumo } from "@/lib/treinoResumo";
import { cn } from "@/lib/utils";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { chaveData, chaveMes, gradeDoMes, ROTULO_DIA, rotuloData, rotuloMes } from "../datas";
import { formatarCronometro, formatarDuracao } from "../cronometro";
import { formatarCarga } from "../prescricao";
import { SheetCompartilhar } from "./SheetCompartilhar";
import { lerExercicios } from "../historico";

interface LinhaHistorico {
  id: string;
  nome_treino: string;
  iniciado_em: string;
  concluido_em: string;
  duracao_segundos: number;
  exercicios_concluidos: unknown;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DIAS_CAB = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/**
 * Histórico (C14/C21 — o calendário da aba Treino): mês a mês, com os dias treinados no calendário, os números do mês
 * (treinos, tempo total, média) e cada treino com o detalhe (duração, academia, volume, séries), compartilhar e excluir.
 * Lê o SQLite local (funciona sem internet); excluir também vale sem internet e sincroniza depois.
 */
export function Historico({ userId, aoVoltar }: { userId: string; aoVoltar: () => void }) {
  const db = usePowerSync();
  const agora = new Date();
  const [mes, setMes] = useState({ ano: agora.getFullYear(), mes0: agora.getMonth() });
  const [dia, setDia] = useState<string | null>(null);
  const [aberto, setAberto] = useState<LinhaHistorico | null>(null);
  const [compartilhar, setCompartilhar] = useState<TreinoResumo | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const { data } = useQuery<LinhaHistorico>("SELECT * FROM treino_historico WHERE user_id = ? ORDER BY concluido_em DESC LIMIT 500", [userId]);
  const todos = useMemo(() => data ?? [], [data]);
  const chave = `${mes.ano}-${String(mes.mes0 + 1).padStart(2, "0")}`;
  // dias marcados como concluídos sem o cronômetro também contam (a contagem "treinos no mês" de hoje = dias treinados)
  const { data: concluidos } = useQuery<{ data_treino: string }>(
    "SELECT DISTINCT data_treino FROM tb_treino_concluido WHERE user_id = ? AND data_treino >= ? AND data_treino <= ?",
    [userId, `${chave}-01`, `${chave}-31`],
  );
  const doMes = useMemo(() => todos.filter((h) => chaveMes(new Date(h.iniciado_em)) === chave), [todos, chave]);
  const diasTreinados = useMemo(() => {
    const s = new Set(doMes.map((h) => chaveData(new Date(h.iniciado_em))));
    for (const c of concluidos ?? []) s.add(c.data_treino);
    return s;
  }, [doMes, concluidos]);
  const lista = dia ? doMes.filter((h) => chaveData(new Date(h.iniciado_em)) === dia) : doMes;
  const tempoTotal = doMes.reduce((n, h) => n + (Number(h.duracao_segundos) || 0), 0);
  const media = doMes.length ? Math.round(tempoTotal / doMes.length) : 0;
  const hojeChave = chaveData(agora);

  const mudarMes = (delta: number) => {
    setDia(null);
    setMes((m) => {
      const d = new Date(m.ano, m.mes0 + delta, 1);
      return { ano: d.getFullYear(), mes0: d.getMonth() };
    });
  };

  const resumoDe = (h: LinhaHistorico) => buildTreinoResumo({ ...h, exercicios_concluidos: lerExercicios(h.exercicios_concluidos) as never });

  const excluir = async () => {
    if (!aberto) return;
    setExcluindo(true);
    try {
      await db.execute("DELETE FROM treino_historico WHERE id = ? AND user_id = ?", [aberto.id, userId]);
      toast.success("Treino excluído do histórico.");
      setAberto(null);
      setConfirmarExcluir(false);
    } catch {
      toast.error("Não deu para excluir o treino.");
    } finally {
      setExcluindo(false);
    }
  };

  const resumoAberto = aberto ? resumoDe(aberto) : null;

  return (
    <div className="flex flex-col gap-2.5" data-historico-treinos={chave}>
      <div className="mt-1 flex items-center gap-3">
        <BotaoIcone icone={ArrowLeft} rotulo="Voltar ao treino" onClick={aoVoltar} data-historico-voltar />
        <h1 className="min-w-0 flex-1 truncate font-body text-[30px] font-bold normal-case leading-tight tracking-[-0.03em] text-texto">Histórico</h1>
      </div>

      <Cartao className="px-3.5 pb-3 pt-3" data-historico-calendario>
        <div className="mb-2.5 flex items-center gap-2">
          <button type="button" aria-label="Mês anterior" onClick={() => mudarMes(-1)} className="pq-ibtn" style={{ width: 34, height: 34, borderRadius: 11 }} data-mes-anterior>
            <ChevronLeft aria-hidden />
          </button>
          <b className="flex-1 text-center text-[15px] font-semibold text-texto" data-mes-rotulo>{rotuloMes(mes.ano, mes.mes0)}</b>
          <button type="button" aria-label="Próximo mês" onClick={() => mudarMes(1)} className="pq-ibtn" style={{ width: 34, height: 34, borderRadius: 11 }} data-mes-proximo>
            <ChevronRight aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DIAS_CAB.map((d) => (
            <span key={d} className="pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-texto-3">{d}</span>
          ))}
          {gradeDoMes(mes.ano, mes.mes0).flat().map((d, i) => {
            if (!d) return <span key={`v${i}`} />;
            const k = chaveData(d);
            const treinou = diasTreinados.has(k);
            const escolhido = dia === k;
            return (
              <button key={k} type="button" disabled={!treinou} onClick={() => setDia(escolhido ? null : k)} data-cal-dia={k} data-cal-treinou={treinou ? "1" : "0"}
                aria-label={`${ROTULO_DIA[d.getDay()]} ${rotuloData(d)}${treinou ? " — treinou" : ""}`} aria-pressed={escolhido}
                className={cn(
                  "relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-xl text-[13px] font-semibold tabular-nums",
                  treinou ? "bg-violeta/15 text-violeta-3" : "text-texto-3",
                  k === hojeChave && "ring-1 ring-linha-2",
                  escolhido && "!bg-violeta !text-white",
                )}>
                {d.getDate()}
                {treinou && <i aria-hidden className={cn("absolute bottom-1 h-1 w-1 rounded-full", escolhido ? "bg-white" : "bg-violeta-2")} />}
              </button>
            );
          })}
        </div>
      </Cartao>

      <div className="grid grid-cols-3 gap-2" data-historico-numeros>
        <Caixa rotulo="Dias treinados" valor={String(diasTreinados.size)} />
        <Caixa rotulo="Tempo total" valor={formatarDuracao(tempoTotal)} />
        <Caixa rotulo="Média" valor={formatarDuracao(media)} />
      </div>

      {dia && (
        <button type="button" onClick={() => setDia(null)} className="self-start text-[12.5px] font-semibold text-violeta-3" data-historico-todos>
          Ver todos de {rotuloMes(mes.ano, mes.mes0).split(" de ")[0].toLowerCase()}
        </button>
      )}

      {lista.length === 0 ? (
        dia ? (
          <EstadoVazio icone={CalendarDays} titulo="Treino marcado como feito" texto="Neste dia o treino foi concluído sem o cronômetro — não há duração nem séries guardadas." />
        ) : (
          <EstadoVazio icone={CalendarDays} titulo="Nenhum treino neste mês" texto="Os treinos concluídos com o cronômetro aparecem aqui." />
        )
      ) : (
        <div className="flex flex-col gap-2" data-historico-lista={lista.length}>
          {lista.map((h) => {
            const r = resumoDe(h);
            const d = new Date(h.iniciado_em);
            return (
              <button key={h.id} type="button" onClick={() => setAberto(h)} data-historico-item={h.id}
                className="pq-cartao flex items-center gap-3 rounded-[18px] px-3.5 py-3 text-left">
                <span className="flex h-11 w-11 flex-none flex-col items-center justify-center rounded-[14px] border border-linha bg-superficie">
                  <span className="text-[9.5px] font-semibold uppercase text-texto-3">{ROTULO_DIA[d.getDay()]}</span>
                  <b className="text-[15px] font-bold leading-none tabular-nums text-texto">{d.getDate()}</b>
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-semibold text-texto">{h.nome_treino}</b>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-texto-2">
                    <span className="tabular-nums">{hora(h.iniciado_em)}</span>
                    <span className="inline-flex items-center gap-1"><Timer aria-hidden className="h-3 w-3" /> {formatarDuracao(Number(h.duracao_segundos) || 0)}</span>
                    <span className="inline-flex items-center gap-1"><Dumbbell aria-hidden className="h-3 w-3" /> {r.exercicios.length} ex.</span>
                    {r.academia_nome && <span className="inline-flex min-w-0 items-center gap-1 truncate"><MapPin aria-hidden className="h-3 w-3 flex-none" /> {r.academia_nome}</span>}
                  </span>
                </span>
                <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-verde/15 text-verde-2">
                  <Check aria-label="concluído" className="h-[15px] w-[15px]" strokeWidth={2.6} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <PainelDeslizante aberto={!!aberto && !compartilhar} aoMudar={(v) => !v && (setAberto(null), setConfirmarExcluir(false))}
        titulo={aberto?.nome_treino ?? "Treino"}
        descricao={aberto ? `${ROTULO_DIA[new Date(aberto.iniciado_em).getDay()]} · ${rotuloData(new Date(aberto.iniciado_em))} · ${hora(aberto.iniciado_em)} – ${hora(aberto.concluido_em)}` : undefined}
        rodape={
          confirmarExcluir ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-texto-2">Excluir este treino do histórico? Não dá para desfazer.</p>
              <div className="grid grid-cols-2 gap-2">
                <Botao variante="g" disabled={excluindo} onClick={() => setConfirmarExcluir(false)}>Cancelar</Botao>
                <Botao variante="w" disabled={excluindo} onClick={() => void excluir()} className="!bg-rosa !text-white" data-historico-excluir-confirmar>
                  {excluindo ? "Excluindo…" : "Excluir"}
                </Botao>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Botao variante="g" icone={Trash2} onClick={() => setConfirmarExcluir(true)} aria-label="Excluir do histórico" data-historico-excluir className="text-rosa-3" />
              <Botao variante="w" icone={Share2} onClick={() => resumoAberto && setCompartilhar(resumoAberto)} data-historico-compartilhar>Compartilhar</Botao>
            </div>
          )
        }>
        {aberto && resumoAberto && (
          <div className="flex flex-col gap-3 pt-1" data-historico-detalhe={aberto.id}>
            <div className="grid grid-cols-2 gap-2">
              <Caixa rotulo="Duração" valor={formatarCronometro(Number(aberto.duracao_segundos) || 0)} />
              <Caixa rotulo="Academia" valor={resumoAberto.academia_nome || "—"} />
              <Caixa rotulo="Volume total" valor={`${Math.round(resumoAberto.volumeTotal).toLocaleString("pt-BR")} kg`} />
              <Caixa rotulo="Média peso/rep" valor={resumoAberto.mediaPesoRep != null ? formatarCarga(resumoAberto.mediaPesoRep) ?? "—" : "—"} />
            </div>
            {resumoAberto.exercicios.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <div className="pq-eyebrow">Exercícios</div>
                {resumoAberto.exercicios.map((ex, i) => (
                  <div key={`${ex.exercicio_id}-${i}`} className="rounded-2xl border border-linha bg-superficie px-3.5 py-2.5" data-historico-exercicio>
                    <div className="flex items-center justify-between gap-2">
                      <b className="min-w-0 truncate text-[13.5px] font-semibold text-texto">{ex.nome}</b>
                      {ex.mediaPesoRep != null && <span className="flex-none text-[11.5px] text-violeta-3">{formatarCarga(ex.mediaPesoRep)}/rep</span>}
                    </div>
                    {ex.series.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12px] tabular-nums text-texto-2">
                        {ex.series.map((s) => (
                          <span key={s.numero_serie}>{s.numero_serie}ª <b className="font-semibold text-forte">{s.peso} kg × {s.reps}</b></span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-[12px] text-texto-3">{ex.series_concluidas} {ex.series_concluidas === 1 ? "série" : "séries"}</p>
                    )}
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </PainelDeslizante>
      <SheetCompartilhar resumo={compartilhar} aoFechar={() => setCompartilhar(null)} />
    </div>
  );
}

function Caixa({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-linha bg-superficie px-3 py-2.5">
      <span className="block truncate text-[11px] font-medium text-texto-3">{rotulo}</span>
      <b className="mt-0.5 block truncate text-[15.5px] font-bold tabular-nums tracking-[-0.01em] text-texto">{valor}</b>
    </div>
  );
}
