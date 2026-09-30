import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useStatus } from "@powersync/react";
import { CalendarOff, CheckCircle2, CircleAlert, Clock, Dumbbell, Flame, ListChecks, Play, RefreshCw, Repeat, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { chaveTreino } from "@/lib/seriesPadrao";
import { cn } from "@/lib/utils";
import { useSessao } from "@/nucleo/sessao";
import { MENSAGEM_TROCA, retentavel, type ErroTroca } from "@/nucleo/trocaToken";
import { iniciarTreinoSeParado, lerCronometro, EVENTO_CRONOMETRO } from "@/treino/cronometro";
import { rotuloDiaCurto } from "@/treino/datas";
import { fotoDoSlot } from "@/treino/foto";
import { chipDoSlot, letrasDaSemana } from "@/treino/letras";
import { prescricaoDoExercicio } from "@/treino/prescricao";
import type { DiaSlot } from "@/treino/tipos";
import { useLembreteDoTreino } from "@/treino/useLembreteDoTreino";
import { useTreinoDoDia } from "@/treino/useTreinoDoDia";
// a troca do treino do dia (⇄) é a folha da aba Treino (W8) — junto com o card (e não sob demanda): sem internet ela abre
import { SheetAlterarTreino } from "@/treino/ui/SheetAlterarTreino";
import { useTreinoDaPagina } from "@/ui/casca/treinoDaPagina";
import { Esqueleto } from "@/ui/premium/Estados";
import { FOTOS_TREINO } from "@/ui/premium/fotos";
import { estimarDuracaoMin, resumoDaSemana, rotuloDoTreino } from "./pecas/regras";
import { useOQueOAlunoTem } from "./pecas/dados";


/** O card fica escuro por cima da foto nos 2 temas (o texto é sempre claro, como na tela 1). */
const FUNDO_HERO = "linear-gradient(180deg, rgba(9,9,11,.08) 0%, rgba(9,9,11,.34) 40%, rgba(9,9,11,.94) 100%), linear-gradient(90deg, rgba(76,29,149,.45), transparent 65%)";
const BOTAO_BRANCO = "pq-botao h-11 border-transparent bg-[#fafafa] text-[#09090b] shadow-[0_10px_30px_-10px_rgba(255,255,255,.45)] hover:brightness-95";
const BOTAO_VIDRO = "pq-botao h-11 border-white/15 bg-white/[.08] text-[#fafafa] hover:bg-white/[.14]";

/**
 * Início › "Treino de hoje" (W12 — tela 1; C15): nome do treino, "Treino A", exercícios, duração estimada, "N de M na semana"
 * (a MESMA contagem da faixa Seg–Dom da aba Treino) e a foto de fundo pelo grupo muscular (P29). "Começar treino" abre a aba
 * Treino já com o cronômetro correndo; ⇄ troca o treino do dia (a troca que já existe, `tb_treino_dia_override`). Lê o SQLite do
 * PowerSync pelo `useTreinoDoDia` da aba Treino: abre SEM internet. Sem a sessão do Banco do Treino (troca de token), o próprio
 * card espera ou mostra o erro com "Tentar de novo" — o resto do Início segue (spec 9).
 */
export default function CardTreinoHoje() {
  const tem = useOQueOAlunoTem();
  const estado = useTreinoDaPagina();
  const { user } = useAuth();
  if (!tem.treino) return null;
  if (estado.tipo === "carregando" || (estado.tipo === "ok" && !user)) return <HeroEsqueleto rotulo="Abrindo seu treino" />;
  if (estado.tipo === "erro") return <HeroErroTroca erro={estado.erro} />;
  if (estado.tipo === "sem-papel" || !user) return null;
  return <TreinoDeHoje userId={user.id} />;
}

function Hero({ foto, marca, children }: { foto?: string; marca: string; children: ReactNode }) {
  const [semFoto, setSemFoto] = useState(false);
  return (
    <section data-card-treino-hoje={marca} aria-label="Treino de hoje" className="pq-cartao pq-brilho relative h-[212px] overflow-hidden rounded-[26px] text-[#fafafa]">
      {foto && !semFoto && (
        <img src={foto} alt="" aria-hidden onError={() => setSemFoto(true)} data-treino-hoje-foto={foto}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 45%", filter: "brightness(.72) saturate(.9)" }} />
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: FUNDO_HERO }} />
      <div className="relative flex h-full flex-col p-[18px]">{children}</div>
    </section>
  );
}

function ChipHoje() {
  return (
    <span className="pq-chip pq-chip-t h-[26px] px-3" style={{ background: "rgba(139,92,246,.2)", color: "#c4b5fd", borderColor: "rgba(139,92,246,.4)" }}>
      <Flame aria-hidden /> TREINO DE HOJE
    </span>
  );
}

function Semana({ feitos, total }: { feitos: number; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="flex flex-col items-end gap-1.5 text-[11.5px] font-semibold text-[#d4d4d8]" data-treino-semana={`${feitos}/${total}`}>
      <span>
        {feitos} de {total} na semana
      </span>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className="block h-[5px] w-[14px] rounded-[3px]"
            style={i < feitos ? { background: "linear-gradient(90deg,#a78bfa,#8b5cf6)", boxShadow: "0 0 8px rgba(139,92,246,.8)" } : { background: "rgba(255,255,255,.18)" }} />
        ))}
      </div>
    </div>
  );
}

function HeroEsqueleto({ rotulo }: { rotulo: string }) {
  return (
    <Hero marca="carregando">
      <div role="status" aria-busy="true" aria-label={rotulo} className="flex h-full flex-col">
        <ChipHoje />
        <Esqueleto className="mt-auto h-7 w-3/5 bg-white/10" />
        <Esqueleto className="mt-2.5 h-3.5 w-4/5 bg-white/10" />
        <Esqueleto className="mt-3.5 h-11 w-full rounded-[14px] bg-white/10" />
        <span className="sr-only">{rotulo}…</span>
      </div>
    </Hero>
  );
}

const TITULO_ERRO = "Não foi possível abrir seu treino";

function HeroErroTroca({ erro }: { erro: ErroTroca }) {
  const { tentarTreinoDeNovo } = useSessao();
  const podeTentar = retentavel(erro) || erro === "limite";
  // a frase da troca repete o título quando é só rede/erro interno: aí o card diz o que fazer
  const texto = MENSAGEM_TROCA[erro].replace(/\.$/, "") === TITULO_ERRO ? "Confira a internet e tente de novo. O resto do Início continua funcionando." : MENSAGEM_TROCA[erro];
  return (
    <Hero marca={`erro-${erro}`}>
      <ChipHoje />
      <div className="mt-auto flex items-start gap-2.5">
        <CircleAlert aria-hidden className="mt-0.5 h-5 w-5 flex-none text-[#fda4af]" strokeWidth={1.75} />
        <div className="min-w-0">
          <h2 className="font-body text-[19px] font-bold normal-case leading-tight tracking-[-0.02em] text-[#fafafa]">{TITULO_ERRO}</h2>
          <p className="mt-1 text-[12.5px] leading-snug text-[#d4d4d8]">{texto}</p>
        </div>
      </div>
      {podeTentar && (
        <button type="button" onClick={tentarTreinoDeNovo} className={cn(BOTAO_VIDRO, "mt-3 w-full")} data-treino-hoje-tentar>
          <RefreshCw aria-hidden /> Tentar de novo
        </button>
      )}
    </Hero>
  );
}

/** O cronômetro do treino está rodando (em qualquer dia)? Atualiza quando outra tela inicia/encerra. */
function useTreinoRodando(): boolean {
  const [rodando, setRodando] = useState(() => !!lerCronometro()?.ativo);
  useEffect(() => {
    const ler = () => setRodando(!!lerCronometro()?.ativo);
    window.addEventListener(EVENTO_CRONOMETRO, ler);
    window.addEventListener("storage", ler);
    return () => {
      window.removeEventListener(EVENTO_CRONOMETRO, ler);
      window.removeEventListener("storage", ler);
    };
  }, []);
  return rodando;
}

function TreinoDeHoje({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const status = useStatus();
  const tem = useOQueOAlunoTem();
  const { situacao } = useSessao();
  const t = useTreinoDoDia(userId);
  const rodando = useTreinoRodando();
  const [trocar, setTrocar] = useState(false);

  // o lembrete de treino com o nome do treino de hoje (C22 — o que a aba Treino fazia ao abrir; agora o app abre no Início)
  useLembreteDoTreino(t.nomeTreinoHoje, rotuloDiaCurto(t.hoje), t.carregado);

  const semana = useMemo(() => resumoDaSemana(t.dias), [t.dias]);
  const letras = useMemo(() => letrasDaSemana(t.semana, t.grupos), [t.semana, t.grupos]);
  const hoje = t.hojeChave;
  // o card mostra o 1º treino de hoje ainda por fazer (todos feitos: o 1º, concluído)
  const slot: DiaSlot | null = t.slotsComTreino.find((s) => !t.slotConcluido(hoje, s.slot_idx)) ?? t.slotsComTreino[0] ?? null;
  const concluido = !!slot && t.slotConcluido(hoje, slot.slot_idx);
  const podeTreinoPronto = !!tem.doApp || !!situacao?.master;

  const duracao = useMemo(() => {
    if (!slot) return null;
    const doSlot = t.series.filter((s) => (s.slot_idx ?? 0) === slot.slot_idx);
    if (doSlot.length === 0) return null;
    const chave = chaveTreino(slot.grupoPessoal ? null : slot.grupo!.id, slot.grupoPessoal ? slot.grupo!.id : null);
    return estimarDuracaoMin(
      slot.exercicios.map((ge) => {
        const id = ge.tb_exercicios.id;
        const presc = prescricaoDoExercicio(t.mapaPresc, chave, ge.exercicio_usuario_id ? null : ge.exercicio_id, ge.exercicio_usuario_id ?? null);
        return { series: doSlot.filter((s) => s.exercicio_id === id || s.exercicio_usuario_id === id).length, descansoSeg: presc.descanso ?? t.descansoPadrao };
      }),
    );
  }, [slot, t.series, t.mapaPresc, t.descansoPadrao]);

  const vazioTotal = t.grupos.length === 0 && t.gruposPessoais.length === 0 && t.semana.length === 0;
  const primeiroSync = !status.hasSynced && vazioTotal && t.slotsComTreino.length === 0;
  if (!t.carregado || primeiroSync) return <HeroEsqueleto rotulo={primeiroSync ? "Baixando o seu treino" : "Abrindo seu treino"} />;

  const folhaTroca = (
    <SheetAlterarTreino
      aberto={trocar}
      aoMudar={setTrocar}
      userId={userId}
      titulo="Treino de hoje"
      gruposProfissional={t.grupos}
      gruposPessoais={t.gruposPessoais}
      permiteDescanso
      aoEscolher={(id, pessoal) => void t.alterarTreinoDoDia(id, pessoal, { modo: "trocar", slot_idx: slot?.slot_idx ?? 0 })}
      aoTreinoPronto={podeTreinoPronto ? () => navigate("/perfil/treinos-prontos") : undefined}
    />
  );
  const botaoTrocar = (
    <button type="button" onClick={() => setTrocar(true)} aria-label="Trocar o treino de hoje" title="Trocar o treino de hoje" data-treino-hoje-trocar
      className={cn(BOTAO_VIDRO, "w-11 flex-none px-0")}>
      <Repeat aria-hidden />
    </button>
  );

  // ── sem treino hoje ──
  if (!slot) {
    // aluno do app (sem profissional) que ainda não tem treino nenhum: o treino pronto pelo objetivo ou montar o dele (W7b)
    if (tem.doApp && vazioTotal) {
      return (
        <Hero foto={FOTOS_TREINO.geral} marca="escolher">
          <ChipHoje />
          <h2 className="mt-auto font-body text-[24px] font-bold normal-case leading-tight tracking-[-0.03em] text-[#fafafa]">Escolha o seu treino</h2>
          <p className="mt-1 text-[12.5px] leading-snug text-[#d4d4d8]">Use um treino pronto pelo seu objetivo ou monte o seu.</p>
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => navigate("/perfil/treinos-prontos")} className={cn(BOTAO_BRANCO, "min-w-0 flex-1 px-3")} data-treino-hoje-pronto>
              <Sparkles aria-hidden /> Treino pronto
            </button>
            <button type="button" onClick={() => navigate("/treino")} className={cn(BOTAO_VIDRO, "min-w-0 flex-1 px-3")} data-treino-hoje-montar>
              <Dumbbell aria-hidden /> Montar o meu
            </button>
          </div>
        </Hero>
      );
    }
    const descanso = t.diaDeDescanso;
    return (
      <>
        <Hero foto={FOTOS_TREINO.geral} marca={descanso ? "descanso" : "sem-treino"}>
          <div className="flex items-start justify-between gap-2">
            <ChipHoje />
            <Semana feitos={semana.feitos} total={semana.total} />
          </div>
          <div className="mt-auto flex items-center gap-2">
            {descanso && <CalendarOff aria-hidden className="h-5 w-5 flex-none text-[#a78bfa]" strokeWidth={1.75} />}
            <h2 className="font-body text-[24px] font-bold normal-case leading-tight tracking-[-0.03em] text-[#fafafa]">
              {descanso ? "Dia de descanso" : "Nenhum treino para hoje"}
            </h2>
          </div>
          <p className="mt-1 text-[12.5px] leading-snug text-[#d4d4d8]">
            {descanso ? "Se quiser treinar, troque pelo treino que quiser." : "Escolha um treino para hoje ou veja a sua semana."}
          </p>
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => navigate("/treino")} className={cn(BOTAO_BRANCO, "flex-1")} data-treino-hoje-ver>
              <Dumbbell aria-hidden /> Ver a semana
            </button>
            {botaoTrocar}
          </div>
        </Hero>
        {folhaTroca}
      </>
    );
  }

  const nome = slot.grupo!.nome;
  const exercicios = slot.exercicios.length;
  const comecar = () => {
    if (!concluido && !rodando && iniciarTreinoSeParado(hoje, nome)) toast.success("Treino iniciado");
    navigate("/treino");
  };

  return (
    <>
      <Hero foto={fotoDoSlot(slot)} marca={concluido ? "concluido" : rodando ? "rodando" : "treino"}>
        <div className="flex items-start justify-between gap-2">
          <ChipHoje />
          <Semana feitos={semana.feitos} total={semana.total} />
        </div>
        <h2 className="mt-auto truncate font-body text-[27px] font-bold normal-case leading-tight tracking-[-0.03em] text-[#fafafa]" data-treino-hoje-nome>
          {nome}
        </h2>
        <div className="mb-3.5 mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-[#d4d4d8]">
          <span className="inline-flex items-center gap-[5px]" data-treino-hoje-letra>
            <Dumbbell aria-hidden className="h-3.5 w-3.5 text-[#a78bfa]" strokeWidth={1.75} />
            {rotuloDoTreino(chipDoSlot(slot, letras))}
          </span>
          <span className="inline-flex items-center gap-[5px]" data-treino-hoje-exercicios={exercicios}>
            <ListChecks aria-hidden className="h-3.5 w-3.5 text-[#a78bfa]" strokeWidth={1.75} />
            {exercicios} {exercicios === 1 ? "exercício" : "exercícios"}
          </span>
          {duracao !== null && (
            <span className="inline-flex items-center gap-[5px]" data-treino-hoje-duracao={duracao}>
              <Clock aria-hidden className="h-3.5 w-3.5 text-[#a78bfa]" strokeWidth={1.75} />~{duracao} min
            </span>
          )}
        </div>
        <div className="flex gap-3">
          {concluido ? (
            <button type="button" onClick={() => navigate("/treino")} className={cn(BOTAO_VIDRO, "flex-1")} data-treino-hoje-concluido>
              <CheckCircle2 aria-hidden className="text-[#6ee7b7]" /> Treino concluído · ver
            </button>
          ) : (
            <button type="button" onClick={comecar} className={cn(BOTAO_BRANCO, "flex-1")} data-comecar-treino-hoje>
              <Play aria-hidden /> {rodando ? "Continuar treino" : "Começar treino"}
            </button>
          )}
          {botaoTrocar}
        </div>
      </Hero>
      {folhaTroca}
    </>
  );
}
