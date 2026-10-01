import { useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { REACOES, ehReacao, tomReacao, type Reacao } from "@/nutricao/app/diarioUtil";
import { BTN_LINK, BTN_PRI, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { Chip } from "@/ui/premium/Chip";
import { COMENTARIO_NUTRI_MAX, textoReacaoNutri, textoReagidoEm } from "./diarioPainel";

// Physiq W24 — porta do PhysiqNutri (src/components/diario/ReacaoInline.tsx) sem emoji (spec 4.9): o bloco "Reação" do cartão da foto
// — 4 chips (Ótimo, Bom, Atenção, Evitar) + comentário (até 300) + "Enviar reação". Com reação gravada mostra o chip e o comentário,
// "Reagido em dd/MM HH:mm", Alterar (reabre com os valores) e Tirar reação. Quem grava é a aba (onReagir devolve true quando salvou).

type Registro = { id: string; reacao_nutri: string | null; comentario_nutri: string; reagido_em: string | null };
interface Props {
  registro: Registro;
  salvando: boolean;
  /** false = só vê (personal que acompanha como nutri sem ser a responsável, ou sem permissão) */
  podeReagir: boolean;
  onReagir: (reacao: Reacao | null, comentario: string) => Promise<boolean>;
}

export default function ReacaoInline({ registro, salvando, podeReagir, onReagir }: Props) {
  const [editando, setEditando] = useState(false);
  const [reacao, setReacao] = useState<Reacao | null>(ehReacao(registro.reacao_nutri) ? registro.reacao_nutri : null);
  const [comentario, setComentario] = useState(registro.comentario_nutri ?? "");
  const temReacao = !!registro.reacao_nutri;

  const abrir = () => {
    setReacao(ehReacao(registro.reacao_nutri) ? registro.reacao_nutri : null);
    setComentario(registro.comentario_nutri ?? "");
    setEditando(true);
  };
  const enviar = async () => {
    if (!reacao) return;
    const ok = await onReagir(reacao, comentario);
    if (ok) setEditando(false);
  };
  const tirar = async () => {
    const ok = await onReagir(null, "");
    if (ok) {
      setEditando(false);
      setReacao(null);
      setComentario("");
    }
  };

  if ((temReacao && !editando) || !podeReagir) {
    const texto = textoReacaoNutri(registro);
    return (
      <div className="flex flex-col gap-1" data-reacao-gravada={registro.reacao_nutri ?? ""}>
        {temReacao ? (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-texto" data-reacao-texto={texto}>
            <Chip tom={tomReacao(registro.reacao_nutri)} className="h-[22px] px-2.5 text-[10px]" data-reacao-chip>{(texto.split(" — ")[0] || "").toUpperCase()}</Chip>
            {registro.comentario_nutri && <span className="text-texto-2" data-reacao-comentario>{registro.comentario_nutri}</span>}
          </p>
        ) : (
          <p className="text-[12.5px] italic text-texto-3" data-reacao-pendente>Sem reação ainda.</p>
        )}
        {temReacao && (
          <div className="flex items-center gap-3">
            <p className="text-[11.5px] text-texto-4" data-reagido-em>{textoReagidoEm(registro.reagido_em)}</p>
            {podeReagir && <button type="button" className={BTN_LINK} onClick={abrir} disabled={salvando} data-btn-alterar-reacao>Alterar</button>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-reacao-form>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reação" data-btns-reacao>
        {REACOES.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={reacao === o.valor}
            className={cn("pq-chip h-8 px-3 text-[11.5px] normal-case tracking-normal transition-opacity disabled:opacity-50", reacao === o.valor ? `pq-chip-${o.tom}` : "pq-chip-g opacity-80 hover:opacity-100")}
            onClick={() => setReacao(o.valor)}
            disabled={salvando}
            title={o.rotulo}
            data-btn-reacao={o.valor}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      {/* o comentário e o "Enviar" aparecem depois de escolher a reação (ou ao alterar uma já feita) — o cartão fica enxuto */}
      {(reacao || temReacao) && (
        <>
          <textarea
            className={cn(TEXTAREA, "min-h-[60px]")}
            rows={2}
            maxLength={COMENTARIO_NUTRI_MAX}
            placeholder="Comentário para o aluno (opcional)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            disabled={salvando}
            autoFocus={!temReacao}
            data-campo-comentario-nutri
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={BTN_PRI} onClick={() => void enviar()} disabled={!reacao || salvando} data-btn-reagir>
              <Send aria-hidden /> Enviar reação
            </button>
            {temReacao ? (
              <>
                <button type="button" className={BTN_LINK} onClick={() => setEditando(false)} disabled={salvando} data-btn-cancelar-reacao>Cancelar</button>
                <button type="button" className={`${BTN_LINK} !text-rosa-3`} onClick={() => void tirar()} disabled={salvando} data-btn-tirar-reacao>Tirar reação</button>
              </>
            ) : (
              <button type="button" className={BTN_LINK} onClick={() => { setReacao(null); setComentario(""); }} disabled={salvando} data-btn-cancelar-reacao>Cancelar</button>
            )}
          </div>
        </>
      )}
      {!reacao && !temReacao && <p className="text-[11.5px] text-texto-4" data-reacao-dica>O aluno vê a reação no app e no link do diário.</p>}
    </div>
  );
}
