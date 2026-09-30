import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { carregarAnotacao, salvarAnotacao } from "../anotacoes";

/** Anotações do exercício (C68): texto livre do aluno (ex.: "cotovelos fechados", "subir o peso") — fica no aparelho e sincroniza. */
export function SheetAnotacoes({
  userId,
  exercicio,
  aoFechar,
}: {
  userId: string;
  exercicio: { id: string; nome: string } | null;
  aoFechar: (mudou: boolean) => void;
}) {
  const db = usePowerSync();
  const [texto, setTexto] = useState("");
  const [original, setOriginal] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!exercicio) return;
    let vivo = true;
    setCarregando(true);
    carregarAnotacao(db, userId, exercicio.id).then((t) => {
      if (!vivo) return;
      setTexto(t);
      setOriginal(t);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [exercicio, userId, db]);

  const gravar = async (valor: string) => {
    if (!exercicio) return;
    setSalvando(true);
    try {
      await salvarAnotacao(db, userId, exercicio.id, valor);
      setOriginal(valor.trim());
      toast.success(valor.trim() ? "Anotação salva." : "Anotação apagada.");
      aoFechar(true);
    } catch {
      toast.error("Não deu para salvar a anotação. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const mudou = texto.trim() !== original.trim();

  return (
    <PainelDeslizante aberto={!!exercicio} aoMudar={(v) => !v && aoFechar(false)} titulo="Anotações" descricao={exercicio?.nome}
      rodape={
        <div className="flex gap-2">
          {original && !mudou && (
            <Botao variante="g" icone={Trash2} className="text-rosa-3" disabled={salvando} onClick={() => void gravar("")} data-anotacao-apagar>Apagar</Botao>
          )}
          <Botao variante="w" className="flex-1" disabled={salvando || !mudou} onClick={() => void gravar(texto)} data-anotacao-salvar>
            {salvando ? "Salvando…" : "Salvar"}
          </Botao>
        </div>
      }>
      <div className="pt-1" data-anotacoes={exercicio?.id}>
        {carregando ? (
          <div className="h-32 animate-pulse rounded-2xl bg-superficie-2" aria-hidden />
        ) : (
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            autoFocus
            placeholder="Ex.: manter os cotovelos fechados, subir o peso na próxima semana, sentiu o ombro…"
            aria-label={`Anotações de ${exercicio?.nome ?? "exercício"}`}
            data-anotacao-texto
            className="w-full resize-y rounded-2xl border border-linha-2 bg-superficie px-3.5 py-3 text-[14px] leading-relaxed text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60"
          />
        )}
        <p className="mt-1.5 text-[11.5px] text-texto-3">{texto.length ? `${texto.length} caracteres` : "Nenhuma anotação ainda"}</p>
      </div>
    </PainelDeslizante>
  );
}
