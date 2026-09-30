import { useEffect, useState } from "react";
import { CalendarX2, Trash2 } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { removerExercicio, type EscopoRemocao } from "../remocao";

/**
 * Remover exercício em 2 passos (C67): escolhe o alcance — só neste dia ou de vez — e confirma ("Confirma?"). Dá para
 * desfazer depois pelo "Restaurar" embaixo da lista.
 */
export function SheetRemoverExercicio({
  alvo,
  aoFechar,
}: {
  alvo: null | {
    userId: string;
    exercicio: { id: string; nome: string };
    origemId: string;
    grupoId: string;
    grupoNome: string;
    grupoPessoal: boolean;
    slotIdx: number;
    dateKey: string;
    dateLabel: string;
  };
  aoFechar: (removido: boolean) => void;
}) {
  const db = usePowerSync();
  const [escopo, setEscopo] = useState<EscopoRemocao | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setEscopo(null);
    setSalvando(false);
  }, [alvo?.exercicio.id]);

  const confirmar = async () => {
    if (!alvo || !escopo) return;
    setSalvando(true);
    try {
      await removerExercicio(db, { userId: alvo.userId, origemId: alvo.origemId, grupoId: alvo.grupoId, grupoPessoal: alvo.grupoPessoal, slotIdx: alvo.slotIdx, dateKey: alvo.dateKey }, escopo);
      toast.success(escopo === "dia" ? `Removido só em ${alvo.dateLabel}: ${alvo.exercicio.nome}` : `Removido de vez: ${alvo.exercicio.nome}`);
      aoFechar(true);
    } catch (e) {
      console.error("[Treino] remover exercício:", e);
      toast.error("Não deu para remover o exercício. Tente de novo.");
      setSalvando(false);
    }
  };

  const explicacao = !alvo || !escopo
    ? null
    : escopo === "dia"
      ? `"${alvo.exercicio.nome}" sai só do treino de ${alvo.dateLabel}. O treino continua como está nos outros dias.`
      : alvo.grupoPessoal
        ? `"${alvo.exercicio.nome}" sai do seu treino ${alvo.grupoNome} e não aparece mais nos próximos dias.`
        : `"${alvo.exercicio.nome}" não aparece mais nos seus próximos treinos de ${alvo.grupoNome}. O treino do seu profissional não muda e dá para restaurar depois.`;

  return (
    <PainelDeslizante aberto={!!alvo} aoMudar={(v) => !v && !salvando && aoFechar(false)} titulo="Remover exercício"
      descricao={alvo ? `${alvo.exercicio.nome} · ${alvo.grupoNome}` : undefined}>
      <div className="flex flex-col gap-3 pt-1" data-modal-remover-exercicio>
        {!escopo ? (
          <>
            <p className="text-[13px] text-texto-2">Remover só neste dia ou de vez?</p>
            <div className="grid grid-cols-2 gap-2">
              <Opcao icone={CalendarX2} titulo="Só neste dia" texto={alvo?.dateLabel ?? ""} aoTocar={() => setEscopo("dia")} marca="dia" />
              <Opcao icone={Trash2} titulo="De vez" texto={alvo?.grupoPessoal ? `sai do treino ${alvo.grupoNome}` : "vale para os próximos treinos"} aoTocar={() => setEscopo("definitiva")} marca="definitiva" perigo />
            </div>
          </>
        ) : (
          <div data-remover-confirma className="flex flex-col gap-3">
            <p className="text-[15px] font-semibold text-texto">Confirma?</p>
            <p className="text-[13px] leading-relaxed text-texto-2">{explicacao}</p>
            <div className="grid grid-cols-2 gap-2">
              <Botao variante="g" disabled={salvando} onClick={() => setEscopo(null)} data-remover-voltar>Voltar</Botao>
              <Botao variante="w" disabled={salvando} onClick={() => void confirmar()} data-remover-confirmar className="!bg-rosa !text-white">
                {salvando ? "Removendo…" : escopo === "dia" ? "Sim, só hoje" : "Sim, remover"}
              </Botao>
            </div>
          </div>
        )}
      </div>
    </PainelDeslizante>
  );
}

function Opcao({ icone: Icone, titulo, texto, aoTocar, marca, perigo }: { icone: typeof Trash2; titulo: string; texto: string; aoTocar: () => void; marca: string; perigo?: boolean }) {
  return (
    <button type="button" onClick={aoTocar} data-remover-opcao={marca}
      className={cn("flex flex-col items-start gap-1.5 rounded-2xl border bg-superficie p-3 text-left transition-colors", perigo ? "border-linha hover:border-rosa/50" : "border-linha hover:border-violeta/50")}>
      <Icone aria-hidden className={cn("h-[18px] w-[18px]", perigo ? "text-rosa-3" : "text-violeta-3")} strokeWidth={1.8} />
      <span className="text-[13.5px] font-semibold text-texto">{titulo}</span>
      <span className="text-[11.5px] leading-snug text-texto-3">{texto}</span>
    </button>
  );
}
