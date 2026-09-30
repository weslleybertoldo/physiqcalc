import { useState } from "react";
import { Check, ChevronDown, FileDown, LoaderCircle, Target } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { rotuloDoDia } from "../dia";
import { metasAtivas, metasDeOutrosDias, metasDoDia, metasPausadas, progressoDasMetas, textoContagemMetas, textoDias, textoInicioFuturo, textoPausadas } from "../metasUtil";
import type { Meta } from "../tipos";

/**
 * Metas (N-51 + NF4): as do dia com o ✓ (a função aluno_marcar_meta; zera no dia seguinte), as outras ativas com os dias da
 * semana, as pausadas recolhidas e o PDF das ativas — como o /app/metas do site antigo, agora com o ✓ do aluno.
 */
export function SheetMetas({
  aberto,
  aoMudar,
  metas,
  hoje,
  marcadas,
  salvando,
  desligado,
  aoMarcar,
  aluno,
  nutricionista,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  metas: Meta[];
  hoje: string;
  marcadas: string[];
  salvando: string | null;
  desligado?: boolean;
  aoMarcar: (id: string, concluida: boolean) => void;
  aluno: string;
  nutricionista: string | null;
}) {
  const [gerando, setGerando] = useState(false);
  const [verPausadas, setVerPausadas] = useState(false);
  const doDia = metasDoDia(metas, hoje);
  const outras = metasDeOutrosDias(metas, hoje);
  const pausadas = metasPausadas(metas);
  const ativas = metasAtivas(metas);
  const prog = progressoDasMetas(doDia, marcadas);
  const feitas = new Set(marcadas);

  const baixar = async () => {
    setGerando(true);
    try {
      const { baixarPDFMetas } = await import("../pdf/metasPdf");
      await baixarPDFMetas({ aluno, nutricionista, emitidoEm: new Date(), metas: ativas.map((m) => ({ titulo: m.titulo, descricao: m.descricao, dias_semana: m.dias_semana })) });
      toast.success("PDF gerado", { description: "Metas ativas" });
    } catch (e) {
      console.warn("[dieta] PDF das metas:", e);
      toast.error("Não foi possível gerar o PDF");
    } finally {
      setGerando(false);
    }
  };

  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Metas"
      descricao={metas.length ? textoContagemMetas(metas.length, ativas.length) : undefined}
      rodape={
        ativas.length > 0 ? (
          <Botao variante="g" icone={gerando ? LoaderCircle : FileDown} className={cn("w-full", gerando && "[&_svg]:animate-spin")} onClick={() => void baixar()} disabled={gerando} data-metas-pdf>
            Baixar PDF das metas
          </Botao>
        ) : undefined
      }
    >
      {metas.length === 0 ? (
        <EstadoVazio icone={Target} titulo="Nenhuma meta ainda" texto="As metas combinadas com a sua nutricionista aparecem aqui, com os dias da semana." />
      ) : (
        <div className="flex flex-col gap-4" data-folha-metas data-metas-hoje={doDia.length} data-metas-feitas={prog.feitas}>
          <section>
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[15px] font-semibold text-texto">Metas de {rotuloDoDia(hoje, hoje)}</span>
              {doDia.length > 0 && <Chip tom="n" data-metas-progresso>{prog.feitas} de {prog.total}</Chip>}
            </div>
            {doDia.length === 0 ? (
              <p className="rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] text-texto-2" data-metas-sem-hoje>Nenhuma meta para hoje.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {doDia.map((m) => {
                  const feita = feitas.has(m.id);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => aoMarcar(m.id, !feita)}
                        disabled={salvando === m.id || desligado}
                        aria-pressed={feita}
                        data-meta={m.id}
                        data-meta-feita={feita ? "1" : "0"}
                        className={cn("pq-cartao flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left disabled:opacity-70", feita && "border-verde/40")}
                      >
                        <span
                          className={cn(
                            "flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border",
                            feita ? "border-transparent bg-verde/15 text-verde-2" : "border-linha-2 text-transparent",
                          )}
                        >
                          {salvando === m.id ? <LoaderCircle aria-hidden className="h-[15px] w-[15px] animate-spin text-texto-2" /> : <Check aria-hidden className="h-[15px] w-[15px]" strokeWidth={2.6} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className={cn("block text-[14px] font-semibold", feita ? "text-texto-2" : "text-texto")}>{m.titulo}</b>
                          {m.descricao?.trim() && <span className="mt-0.5 block text-[12px] leading-snug text-texto-2">{m.descricao.trim()}</span>}
                          <span className="mt-0.5 block text-[11.5px] text-verde-3">{textoDias(m.dias_semana)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {outras.length > 0 && (
            <section data-metas-outras={outras.length}>
              <div className="pq-eyebrow px-1 pb-1.5">Outros dias</div>
              <ul className="divide-y divide-linha-3 rounded-2xl border border-linha bg-superficie">
                {outras.map((m) => (
                  <li key={m.id} className="px-3.5 py-2.5" data-meta={m.id} data-meta-outro-dia>
                    <b className="block text-[13.5px] font-medium text-texto">{m.titulo}</b>
                    <span className="block text-[12px] text-texto-2">
                      {[textoDias(m.dias_semana), textoInicioFuturo(m.inicio, hoje)].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pausadas.length > 0 && (
            <section data-metas-pausadas={pausadas.length}>
              <button type="button" onClick={() => setVerPausadas((v) => !v)} aria-expanded={verPausadas} className="flex w-full items-center gap-1.5 px-1 pb-1.5 text-left" data-metas-ver-pausadas>
                <span className="pq-eyebrow">{textoPausadas(pausadas.length)}</span>
                <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 text-texto-3 transition-transform", verPausadas && "rotate-180")} />
              </button>
              {verPausadas && (
                <ul className="divide-y divide-linha-3 rounded-2xl border border-linha bg-superficie opacity-80">
                  {pausadas.map((m) => (
                    <li key={m.id} className="px-3.5 py-2.5 text-[13px] text-texto-2" data-meta={m.id} data-meta-pausada>
                      {m.titulo} · {textoDias(m.dias_semana)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </PainelDeslizante>
  );
}
