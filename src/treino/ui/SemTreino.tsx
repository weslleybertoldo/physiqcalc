import { CalendarOff, Dumbbell, Plus, Sparkles } from "lucide-react";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";

/**
 * Dia sem treino (C19): "Adicionar treino" (um do profissional ou um seu) e, para quem treina sem profissional (W7b),
 * "Montar o meu" e "Usar um treino pronto" (o treino pronto vira a semana dele; os treinos antigos ficam).
 */
export function SemTreino({
  descanso,
  semProfissional,
  temTreinosProprios,
  aoAdicionar,
  aoMontar,
  aoTreinoPronto,
}: {
  descanso: boolean;
  semProfissional: boolean;
  temTreinosProprios: boolean;
  aoAdicionar: () => void;
  aoMontar: () => void;
  aoTreinoPronto?: () => void;
}) {
  const Icone = descanso ? CalendarOff : Dumbbell;
  return (
    <Cartao brilho className="flex flex-col items-center gap-3 px-5 py-7 text-center" data-sem-treino-dia={descanso ? "descanso" : "vazio"}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie text-violeta-3">
        <Icone aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.75} />
      </span>
      <div className="text-[16px] font-semibold tracking-[-0.01em] text-texto">{descanso ? "Dia de descanso" : "Nenhum treino para este dia"}</div>
      <p className="max-w-xs text-[13px] leading-relaxed text-texto-2">
        {semProfissional
          ? "Monte o seu treino do jeito que quiser ou use um treino pronto pelo seu objetivo."
          : descanso
            ? "Este dia foi marcado como descanso. Se quiser treinar, escolha um treino."
            : "Escolha um treino do seu profissional ou um dos seus para hoje."}
      </p>
      <div className="mt-1 flex w-full max-w-xs flex-col gap-2">
        {semProfissional ? (
          <>
            <Botao variante="w" icone={Dumbbell} onClick={aoMontar} data-sem-treino-montar>Montar o meu</Botao>
            {aoTreinoPronto && (
              <Botao variante="g" icone={Sparkles} onClick={aoTreinoPronto} data-sem-treino-pronto>Usar um treino pronto</Botao>
            )}
            {temTreinosProprios && (
              <button type="button" onClick={aoAdicionar} className="mt-0.5 text-[12.5px] font-semibold text-violeta-3" data-sem-treino-escolher>Escolher um treino meu</button>
            )}
          </>
        ) : (
          <Botao variante="w" icone={Plus} onClick={aoAdicionar} data-sem-treino-adicionar>Adicionar treino</Botao>
        )}
      </div>
    </Cartao>
  );
}
