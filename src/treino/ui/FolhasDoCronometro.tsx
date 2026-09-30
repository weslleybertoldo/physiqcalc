import { CheckCircle2, Clock3, Dumbbell, Flame, Share2, Timer } from "lucide-react";
import type { TreinoResumo } from "@/lib/treinoResumo";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { formatarCronometro, formatarDuracao } from "../cronometro";

/** "Treino foi concluído?" — a última série do treino recebeu OK com o cronômetro rodando (C77). */
export function FolhaFimDoTreino({
  aberto,
  grupoNome,
  segundos,
  aoNao,
  aoSim,
}: {
  aberto: boolean;
  grupoNome: string;
  segundos: number;
  aoNao: () => void;
  aoSim: () => void;
}) {
  return (
    <PainelDeslizante aberto={aberto} aoMudar={(v) => !v && aoNao()} titulo="Treino foi concluído?"
      rodape={
        <div className="grid grid-cols-2 gap-2">
          <Botao variante="g" onClick={aoNao} data-fim-nao>Não, continuar</Botao>
          <Botao variante="w" icone={CheckCircle2} onClick={aoSim} data-fim-sim>Sim, finalizar</Botao>
        </div>
      }>
      <p className="pt-1 text-[13.5px] leading-relaxed text-texto-2" data-fim-texto>
        Todas as séries de <b className="font-semibold text-texto">{grupoNome}</b> foram concluídas. Finalizar a contagem em{" "}
        <b className="font-semibold tabular-nums text-texto">{formatarCronometro(segundos)}</b>?
      </p>
    </PainelDeslizante>
  );
}

/** A pílula do cronômetro foi tocada: o tempo, voltar ao dia do treino e "Concluir treino". */
export function FolhaCronometro({
  aberto,
  aoMudar,
  grupoNome,
  segundos,
  outroDia,
  aoIrParaODia,
  aoConcluir,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  grupoNome: string;
  segundos: number;
  outroDia: boolean;
  aoIrParaODia: () => void;
  aoConcluir: () => void;
}) {
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Treino em andamento" descricao={grupoNome}
      rodape={
        outroDia ? (
          <Botao variante="w" className="w-full" onClick={aoIrParaODia} data-cronometro-ir>Ir para o treino</Botao>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Botao variante="g" onClick={() => aoMudar(false)}>Continuar</Botao>
            <Botao variante="w" icone={CheckCircle2} onClick={aoConcluir} data-cronometro-concluir>Concluir treino</Botao>
          </div>
        )
      }>
      <div className="flex flex-col items-center gap-1 py-3" data-folha-cronometro>
        <span className="flex items-center gap-2 text-[13px] font-semibold text-rosa-3">
          <i aria-hidden className="h-2 w-2 rounded-full bg-rosa" style={{ boxShadow: "0 0 8px var(--p-rosa)" }} /> Contando
        </span>
        <span className="text-[44px] font-bold tabular-nums tracking-[-0.03em] text-texto">{formatarCronometro(segundos)}</span>
        <span className="text-[12.5px] text-texto-3">Os avisos de 1h30, 2h e 3h lembram de concluir se você esquecer.</span>
      </div>
    </PainelDeslizante>
  );
}

/** Treino finalizado: duração, exercícios, volume e a imagem para compartilhar ou salvar na galeria. */
export function FolhaTreinoConcluido({
  resumo,
  duracao,
  aoCompartilhar,
  aoFechar,
}: {
  resumo: TreinoResumo | null;
  duracao: number;
  aoCompartilhar: () => void;
  aoFechar: () => void;
}) {
  const series = resumo?.exercicios.reduce((n, e) => n + (e.series.length || e.series_concluidas), 0) ?? 0;
  return (
    <PainelDeslizante aberto={!!resumo} aoMudar={(v) => !v && aoFechar()} titulo="Treino finalizado!" descricao={resumo ? `${resumo.nome_treino} concluído` : undefined}
      rodape={
        <div className="grid grid-cols-2 gap-2">
          <Botao variante="g" onClick={aoFechar} data-concluido-fechar>Fechar</Botao>
          <Botao variante="w" icone={Share2} onClick={aoCompartilhar} data-concluido-compartilhar>Compartilhar</Botao>
        </div>
      }>
      {resumo && (
        <div className="grid grid-cols-2 gap-2 pt-1" data-treino-finalizado>
          <Numero icone={Timer} rotulo="Duração" valor={formatarDuracao(duracao)} />
          <Numero icone={Dumbbell} rotulo="Exercícios" valor={String(resumo.exercicios.length)} />
          <Numero icone={Clock3} rotulo="Séries" valor={String(series)} />
          <Numero icone={Flame} rotulo="Volume" valor={`${Math.round(resumo.volumeTotal).toLocaleString("pt-BR")} kg`} />
        </div>
      )}
    </PainelDeslizante>
  );
}

function Numero({ icone: Icone, rotulo, valor }: { icone: typeof Timer; rotulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-linha bg-superficie px-3.5 py-3">
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-texto-3">
        <Icone aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} /> {rotulo}
      </span>
      <b className="mt-1 block text-[18px] font-bold tabular-nums tracking-[-0.02em] text-texto">{valor}</b>
    </div>
  );
}
