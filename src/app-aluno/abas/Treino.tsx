import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePowerSync, useStatus } from "@powersync/react";
import { CalendarDays, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { buildTreinoResumo, type TreinoResumo } from "@/lib/treinoResumo";
import { useSessao } from "@/nucleo/sessao";
import { ehProfissional, matriculaDoApp } from "@/nucleo/situacao";
import { CLASSE_PAGINA_APP, TituloApp } from "@/app-aluno/perfil/pecas/TopoItem";
import { lembrarArea } from "@/ui/casca/area";
import { BotaoIcone } from "@/ui/premium/Botao";
import { EstadoCarregando } from "@/ui/premium/Estados";
import { formatarCronometro, iniciarTreinoSeParado } from "@/treino/cronometro";
import { chaveData, rotuloDiaCurto } from "@/treino/datas";
import { chipDoSlot, letrasDaSemana } from "@/treino/letras";
import type { DiaSlot, SerieComMemoria } from "@/treino/tipos";
import { useCronometroTreino } from "@/treino/useCronometroTreino";
import { descansoGuardadoAtivo, lerDescanso } from "@/treino/useDescanso";
import { useLembreteDoTreino } from "@/treino/useLembreteDoTreino";
import { useTreinoDoDia } from "@/treino/useTreinoDoDia";
import { CartaoDescanso } from "@/treino/ui/CartaoDescanso";
import { FaixaSemana } from "@/treino/ui/FaixaSemana";
import { FolhaCronometro, FolhaFimDoTreino, FolhaTreinoConcluido } from "@/treino/ui/FolhasDoCronometro";
import { lerExercicios } from "@/treino/historico";
import { Historico } from "@/treino/ui/Historico";
import { IndicadorSync } from "@/treino/ui/IndicadorSync";
import { SemTreino } from "@/treino/ui/SemTreino";
import { SheetAcademia } from "@/treino/ui/SheetAcademia";
import { SheetAlterarTreino } from "@/treino/ui/SheetAlterarTreino";
import { SheetCompartilhar } from "@/treino/ui/SheetCompartilhar";
import { SheetMeuTreino } from "@/treino/ui/SheetMeuTreino";
import { TreinoDoSlot } from "@/treino/ui/TreinoDoSlot";

interface Descanso {
  ativo: boolean;
  exercicioNome: string;
  numeroSerie: number;
  serieId: string;
  depois: string | null;
  duracao: number | null;
}

/**
 * Aba Treino do app do aluno (W8 — spec 4.3, tela 2; paridade C14–C22, C64–C77, NF1): cronômetro do treino (pílula vermelha)
 * e o calendário (Histórico); faixa Seg–Dom; card do treino; lista dos exercícios com a miniatura do GIF; séries com OK que
 * ligam o cronômetro e o descanso; card do descanso (anel, −15 s, Pular). Tudo no Banco do Treino pelo PowerSync: funciona
 * sem internet e sincroniza depois. Entra na barra de abas pelo registro (src/app-aluno/abas) no lugar da TreinosPage.
 */
export default function Treino() {
  const { user } = useAuth();
  if (!user) {
    // a trava da sessão do Treino (GateSessaoTreino) segura a aba enquanto a troca de token não chega
    return (
      <div className={CLASSE_PAGINA_APP}>
        <EstadoCarregando linhas={4} rotulo="Abrindo seu treino" />
      </div>
    );
  }
  return <TreinoAberto userId={user.id} />;
}

function TreinoAberto({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const db = usePowerSync();
  const status = useStatus();
  const { user, isStaff } = useAuth();
  const { situacao } = useSessao();
  const t = useTreinoDoDia(userId);
  const [params, setParams] = useSearchParams();
  const verHistorico = params.get("ver") === "historico";

  const doApp = matriculaDoApp(situacao);
  const profissional = isStaff || ehProfissional(situacao);
  const podeTreinoPronto = !!doApp || !!situacao?.master;
  const semProfissional = !!doApp;

  // ── folhas ──
  const [alterar, setAlterar] = useState<{ modo: "trocar" | "adicionar"; slot_idx: number } | null>(null);
  const [montar, setMontar] = useState(false);
  const [academiaAberta, setAcademiaAberta] = useState(false);
  const [folhaCronometro, setFolhaCronometro] = useState(false);
  const [compartilhar, setCompartilhar] = useState<TreinoResumo | null>(null);

  // ── descanso (o card) ──
  const [descanso, setDescanso] = useState<Descanso>(() => {
    const s = lerDescanso();
    return {
      ativo: descansoGuardadoAtivo(),
      exercicioNome: s?.exercicioNome ?? "",
      numeroSerie: s?.numeroSerie ?? 0,
      serieId: s?.serieId ?? "",
      depois: s?.depois ?? null,
      duracao: s?.duracao ?? null,
    };
  });

  // ── lembrete com o treino de hoje (mesmas chaves do Perfil) ──
  useLembreteDoTreino(t.nomeTreinoHoje, rotuloDiaCurto(t.hoje), t.carregado);

  // foto do Google no perfil do Treino (como a TreinosPage fazia)
  const fotoGoogle = (user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "") as string;
  useEffect(() => {
    if (fotoGoogle && t.perfil && fotoGoogle !== t.perfil.foto_url) {
      db.execute("UPDATE physiq_profiles SET foto_url = ? WHERE id = ?", [fotoGoogle, userId]).catch((e) => console.warn("[Treino] foto do perfil:", e));
    }
  }, [fotoGoogle, t.perfil, userId, db]);

  const letras = useMemo(() => letrasDaSemana(t.semana, t.grupos), [t.semana, t.grupos]);
  const dateLabel = rotuloDiaCurto(t.dataSelecionada);

  // ── cronômetro: o treino do dia na tela que está rodando (ou o 1º do dia) ──
  const seriesDoSlot = useCallback((slotIdx: number) => t.series.filter((s) => (s.slot_idx ?? 0) === slotIdx), [t.series]);
  const [estadoCron, setEstadoCron] = useState<{ dateKey: string; grupoNome: string } | null>(null);
  const slotDoCronometro = useMemo(() => {
    if (t.slotsComTreino.length === 0) return null;
    if (estadoCron && estadoCron.dateKey === t.selecionada) {
      return t.slotsComTreino.find((s) => s.grupo!.nome === estadoCron.grupoNome) ?? t.slotsComTreino[0];
    }
    return t.slotsComTreino[0];
  }, [t.slotsComTreino, estadoCron, t.selecionada]);
  const alvoCron = useMemo(
    () =>
      slotDoCronometro
        ? {
            userId,
            dateKey: t.selecionada,
            grupoNome: slotDoCronometro.grupo!.nome,
            series: seriesDoSlot(slotDoCronometro.slot_idx),
            exerciciosMap: Object.fromEntries(slotDoCronometro.exercicios.map((e) => [e.exercicio_id, { nome: e.tb_exercicios.nome }])),
          }
        : null,
    [slotDoCronometro, userId, t.selecionada, seriesDoSlot],
  );
  const aoConcluirPeloCronometro = useCallback(async () => {
    if (slotDoCronometro) await t.marcarSlotConcluido(t.selecionada, slotDoCronometro.slot_idx);
  }, [slotDoCronometro, t]);
  const cron = useCronometroTreino(alvoCron, aoConcluirPeloCronometro);
  useEffect(() => {
    setEstadoCron(cron.estado ? { dateKey: cron.estado.dateKey, grupoNome: cron.estado.grupoNome } : null);
  }, [cron.estado]);

  // pílula flutuante quando a do cabeçalho sai da tela (pedido de 18/09: o tempo sempre à vista)
  const pilulaRef = useRef<HTMLButtonElement | null>(null);
  const [pilulaForaDaTela, setPilulaForaDaTela] = useState(false);
  useEffect(() => {
    const el = pilulaRef.current;
    if (!cron.estado || !el || typeof IntersectionObserver === "undefined") {
      setPilulaForaDaTela(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => setPilulaForaDaTela(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [cron.estado, verHistorico]);

  const aoConcluirSerie = useCallback(
    (slot: DiaSlot, a: { nome: string; numero: number; exercicioId: string; ultima: boolean; depois: string | null; descanso: number | null }) => {
      // OK em qualquer série inicia o treino (se nenhum estiver rodando)
      if (iniciarTreinoSeParado(t.selecionada, slot.grupo!.nome)) toast.success("Treino iniciado");
      // última série do treino: não há o que descansar — o cronômetro pergunta "Treino foi concluído?"
      if (a.ultima) return;
      setDescanso({
        ativo: true,
        exercicioNome: a.nome,
        numeroSerie: a.numero,
        serieId: `${a.exercicioId}-${a.numero}-${Date.now()}`,
        depois: a.depois,
        duracao: a.descanso,
      });
    },
    [t.selecionada],
  );

  /** Resumo do treino concluído do dia para a imagem: o do histórico (com a duração) ou montado das séries. */
  const compartilharConcluido = async (slot: DiaSlot) => {
    try {
      const rows = await db.getAll<{ nome_treino: string; iniciado_em: string; concluido_em: string; duracao_segundos: number; exercicios_concluidos: unknown }>(
        "SELECT * FROM treino_historico WHERE user_id = ? AND nome_treino = ? ORDER BY concluido_em DESC LIMIT 5",
        [userId, slot.grupo!.nome],
      );
      const doDia = rows.find((r) => chaveData(new Date(r.iniciado_em)) === t.selecionada);
      if (doDia) {
        setCompartilhar(buildTreinoResumo({ ...doDia, exercicios_concluidos: lerExercicios(doDia.exercicios_concluidos) as never }));
        return;
      }
    } catch {
      /* cai no montado das séries */
    }
    const ss = seriesDoSlot(slot.slot_idx).filter((s) => s.concluida);
    const porEx = new Map<string, { nome: string; series: SerieComMemoria[] }>();
    for (const s of ss) {
      const nome = slot.exercicios.find((e) => e.exercicio_id === s.exercicio_id)?.tb_exercicios.nome ?? "Exercício";
      const item = porEx.get(s.exercicio_id) ?? { nome, series: [] };
      item.series.push(s);
      porEx.set(s.exercicio_id, item);
    }
    const agora = new Date().toISOString();
    setCompartilhar(buildTreinoResumo({
      nome_treino: slot.grupo!.nome,
      iniciado_em: `${t.selecionada}T12:00:00`,
      concluido_em: agora,
      duracao_segundos: 0,
      exercicios_concluidos: [...porEx.entries()].map(([exercicio_id, v]) => ({
        exercicio_id, nome: v.nome, series_concluidas: v.series.length, academia_nome: v.series[0]?.academia_nome ?? null,
        series: v.series.map((s) => ({ numero_serie: s.numero_serie, peso: s.peso, reps: s.reps })),
      })),
    }));
  };

  const abrirPainel = () => {
    lembrarArea("painel");
    navigate("/painel");
  };

  const cronometroOutroDia = !!cron.estado && cron.estado.dateKey !== t.selecionada;
  const vazio = t.slotsComTreino.length === 0;
  const primeiroSync = !status.hasSynced && vazio && t.grupos.length === 0 && t.gruposPessoais.length === 0;

  if (verHistorico) {
    return (
      <div className={CLASSE_PAGINA_APP} data-aba-treino="historico">
        <Historico userId={userId} aoVoltar={() => setParams((q) => { const n = new URLSearchParams(q); n.delete("ver"); return n; }, { replace: true })} />
      </div>
    );
  }

  const pilula = cron.estado ? (
    <button ref={pilulaRef} type="button" onClick={() => setFolhaCronometro(true)} data-pilula-tempo aria-label={`Treino em andamento: ${formatarCronometro(cron.segundos)}`}
      className="pq-chip pq-chip-r h-[30px] px-3 text-[12.5px] tabular-nums">
      <i aria-hidden className="h-[7px] w-[7px] rounded-full bg-rosa" style={{ boxShadow: "0 0 8px var(--p-rosa)" }} />
      {formatarCronometro(cron.segundos)}
    </button>
  ) : null;

  return (
    <div className={CLASSE_PAGINA_APP} data-aba-treino={t.selecionada} style={descanso.ativo ? { paddingBottom: 104 } : undefined}>
      <div className="mt-1 flex items-center justify-between gap-2">
        <TituloApp>Treino</TituloApp>
        <div className="flex items-center gap-2">
          {pilula}
          {profissional && <BotaoIcone icone={LayoutDashboard} rotulo="Painel" onClick={abrirPainel} data-treino-painel />}
          <BotaoIcone icone={CalendarDays} rotulo="Histórico" onClick={() => setParams((q) => { const n = new URLSearchParams(q); n.set("ver", "historico"); return n; })} data-treino-historico />
        </div>
      </div>

      <IndicadorSync />

      <FaixaSemana
        dias={t.dias}
        selecionada={t.selecionada}
        aoEscolher={t.setSelecionada}
        deslocamento={t.deslocamento}
        aoMudarSemana={t.setDeslocamento}
        aoIrParaHoje={t.irParaHoje}
      />

      {primeiroSync ? (
        <EstadoCarregando linhas={4} rotulo="Baixando o seu treino" />
      ) : vazio ? (
        <SemTreino
          descanso={t.diaDeDescanso}
          semProfissional={semProfissional}
          temTreinosProprios={t.gruposPessoais.length > 0}
          aoAdicionar={() => setAlterar({ modo: "trocar", slot_idx: 0 })}
          aoMontar={() => setMontar(true)}
          aoTreinoPronto={podeTreinoPronto ? () => navigate("/perfil/treinos-prontos") : undefined}
        />
      ) : (
        t.slotsComTreino.map((slot) => (
          <TreinoDoSlot
            key={`${t.selecionada}-${slot.slot_idx}`}
            userId={userId}
            dateKey={t.selecionada}
            dateLabel={dateLabel}
            slot={slot}
            chip={chipDoSlot(slot, letras)}
            series={seriesDoSlot(slot.slot_idx)}
            atualizar={(acao) => t.atualizarSeries(slot.slot_idx, acao)}
            seriesTravadas={t.seriesTravadas}
            concluido={t.slotConcluido(t.selecionada, slot.slot_idx)}
            academia={t.academia}
            descansoPadrao={t.descansoPadrao}
            mapaPresc={t.mapaPresc}
            podeComecar={!cron.estado}
            aoComecar={() => {
              if (iniciarTreinoSeParado(t.selecionada, slot.grupo!.nome)) toast.success("Treino iniciado");
            }}
            aoConcluirSerie={(a) => aoConcluirSerie(slot, a)}
            aoMudarConcluido={(feito) => {
              t.marcarLocal(t.selecionada, slot.slot_idx, feito);
              if (feito && t.academia) void t.salvarPesosNaAcademia(t.academia, true);
            }}
            aoTrocarTreino={() => setAlterar({ modo: "trocar", slot_idx: slot.slot_idx })}
            aoAdicionarTreino={() => setAlterar({ modo: "adicionar", slot_idx: -1 })}
            aoTirarDoDia={() => {
              if (window.confirm(`Tirar "${slot.grupo!.nome}" de ${dateLabel}? As séries deste treino no dia são apagadas.`)) void t.removerTreinoDoDia(slot.override_id, slot.slot_idx);
            }}
            aoAcademia={() => setAcademiaAberta(true)}
            aoCompartilharConcluido={() => void compartilharConcluido(slot)}
          />
        ))
      )}

      <SheetAlterarTreino
        aberto={!!alterar}
        aoMudar={(v) => !v && setAlterar(null)}
        userId={userId}
        titulo={alterar?.modo === "adicionar" ? "Adicionar treino no dia" : "Treino do dia"}
        gruposProfissional={t.grupos}
        gruposPessoais={t.gruposPessoais}
        permiteDescanso={alterar?.modo !== "adicionar"}
        aoEscolher={(id, pessoal) => alterar && void t.alterarTreinoDoDia(id, pessoal, alterar)}
        aoTreinoPronto={podeTreinoPronto ? () => navigate("/perfil/treinos-prontos") : undefined}
      />
      <SheetMeuTreino
        aberto={montar}
        userId={userId}
        editar={null}
        aoFechar={(criado) => {
          setMontar(false);
          if (criado) void t.alterarTreinoDoDia(criado, true, { modo: "trocar", slot_idx: 0 });
        }}
      />
      <SheetAcademia
        aberto={academiaAberta}
        aoMudar={setAcademiaAberta}
        userId={userId}
        academia={t.academia}
        trocaBloqueada={t.slotsComTreino.some((s) => t.slotConcluido(t.selecionada, s.slot_idx))}
        aoTrocar={t.trocarAcademia}
        aoSalvar={(a) => t.salvarPesosNaAcademia(a)}
        aoCriada={t.selecionarAcademia}
      />

      <FolhaCronometro
        aberto={folhaCronometro && !!cron.estado}
        aoMudar={setFolhaCronometro}
        grupoNome={cron.estado?.grupoNome ?? ""}
        segundos={cron.segundos}
        outroDia={cronometroOutroDia}
        aoIrParaODia={() => {
          if (cron.estado) t.irParaData(cron.estado.dateKey);
          setFolhaCronometro(false);
        }}
        aoConcluir={() => {
          setFolhaCronometro(false);
          void cron.concluir();
        }}
      />
      <FolhaFimDoTreino
        aberto={cron.perguntarFim && cron.rodandoAqui}
        grupoNome={alvoCron?.grupoNome ?? ""}
        segundos={cron.segundos}
        aoNao={() => cron.setPerguntarFim(false)}
        aoSim={() => void cron.concluir()}
      />
      <FolhaTreinoConcluido
        resumo={cron.concluido?.resumo ?? null}
        duracao={cron.concluido?.duracao ?? 0}
        aoFechar={cron.fecharConcluido}
        aoCompartilhar={() => {
          const r = cron.concluido?.resumo ?? null;
          cron.fecharConcluido();
          setCompartilhar(r);
        }}
      />
      <SheetCompartilhar resumo={compartilhar} aoFechar={() => setCompartilhar(null)} />

      <CartaoDescanso
        ativo={descanso.ativo}
        exercicioNome={descanso.exercicioNome}
        numeroSerie={descanso.numeroSerie}
        duracaoSegundos={descanso.duracao ?? t.descansoPadrao}
        serieId={descanso.serieId}
        depois={descanso.depois}
        aoFechar={() => setDescanso((d) => ({ ...d, ativo: false }))}
        aoMudarTempo={(seg) => t.setDescansoPadrao(seg)}
      />

      {pilulaForaDaTela && cron.estado &&
        createPortal(
          <button type="button" data-pilula-flutuante onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label={`Treino em andamento: ${formatarCronometro(cron.segundos)} — toque para voltar ao topo`}
            className="pq-chip pq-chip-r fixed left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] z-50 h-[30px] -translate-x-1/2 px-3 text-[12.5px] tabular-nums shadow-lg"
            style={{ background: "linear-gradient(var(--p-chip-r-fundo), var(--p-chip-r-fundo)), var(--p-fundo)" }}>
            <i aria-hidden className="h-[7px] w-[7px] animate-pulse rounded-full bg-rosa" style={{ boxShadow: "0 0 8px var(--p-rosa)" }} />
            {formatarCronometro(cron.segundos)}
          </button>,
          document.body,
        )}
    </div>
  );
}
