import { useState } from "react";
import { ChevronRight, FileDown, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { planoVariaPorDia, refeicoesDoDia, rotuloDoDia } from "../dia";
import { fmtKcal, fmtNum, fmtQtd, formatarDataPlano, percentuaisMacros, resumoPlano, textoAlvo, totaisDoPlano } from "../dietaUtil";
import type { PlanoAlimentar } from "../tipos";

/**
 * O plano (N-49): título, data, meta e totais (kcal, % dos macros, fibras — NF5), observações da nutricionista, "Baixar PDF" e os
 * outros planos (os anteriores ficam para consulta, sem ✓ — como os chips do site antigo).
 */
export function SheetPlano({
  aberto,
  aoMudar,
  plano,
  atualId,
  planos,
  nutricionista,
  aluno,
  dia,
  hoje,
  aoEscolher,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  plano: PlanoAlimentar | null;
  atualId: string | null;
  planos: PlanoAlimentar[];
  nutricionista: string | null;
  aluno: string;
  /** o dia que a tela mostra (o plano que varia por dia soma só as refeições dele) */
  dia: string;
  hoje: string;
  aoEscolher: (planoId: string) => void;
}) {
  const [gerando, setGerando] = useState(false);
  const varia = planoVariaPorDia(plano);
  const doDia = plano ? (varia ? refeicoesDoDia(plano, dia) : plano.refeicoes) : [];
  const totais = plano ? totaisDoPlano(doDia) : null;
  const pct = totais ? percentuaisMacros(totais) : null;
  const rotuloDia = rotuloDoDia(dia, hoje);
  const outros = planos.filter((p) => p.id !== plano?.id);

  const baixar = async () => {
    if (!plano) return;
    setGerando(true);
    try {
      const { baixarPDFDieta } = await import("../pdf/dietaPdf");
      await baixarPDFDieta({ aluno, nutricionista, plano });
      toast.success("PDF gerado", { description: plano.titulo });
    } catch (e) {
      console.warn("[dieta] PDF do plano:", e);
      toast.error("Não foi possível gerar o PDF");
    } finally {
      setGerando(false);
    }
  };

  return (
    <PainelDeslizante
      aberto={aberto && !!plano}
      aoMudar={aoMudar}
      titulo={plano?.titulo ?? "Plano alimentar"}
      descricao={plano ? `de ${formatarDataPlano(plano.created_at)}${plano.id === atualId ? " · plano atual" : " · plano anterior"}${nutricionista ? ` · ${nutricionista}` : ""}` : undefined}
      rodape={
        plano ? (
          <Botao variante="w" icone={gerando ? LoaderCircle : FileDown} className={cn("w-full", gerando && "[&_svg]:animate-spin")} onClick={() => void baixar()} disabled={gerando} data-plano-pdf>
            Baixar PDF do plano
          </Botao>
        ) : undefined
      }
    >
      {plano && totais && (
        <div className="flex flex-col gap-3" data-folha-plano={plano.id}>
          <div className="rounded-2xl border border-linha bg-superficie px-3.5 py-3">
            {varia && <p className="pq-eyebrow pb-1 text-verde-3" data-plano-varia>Muda conforme o dia da semana · {rotuloDia}</p>}
            <p className="text-[13px] text-texto" data-plano-resumo>{resumoPlano(plano.metodo, totais, doDia.length)}</p>
            <p className="mt-1 text-[12.5px] text-verde-3" data-plano-alvo>
              {plano.kcal_alvo ? textoAlvo(totais.energia_kcal, plano.kcal_alvo) : `${fmtKcal(totais.energia_kcal)} kcal · sem meta definida`}
            </p>
            {pct && (
              <p className="mt-1 text-[12px] text-texto-2" data-plano-percentuais>
                Proteínas {fmtQtd(pct.proteina)}% · Carboidratos {fmtQtd(pct.carboidrato)}% · Gorduras {fmtQtd(pct.lipidio)}% · Fibras {fmtNum(totais.fibra_g, 0)} g
              </p>
            )}
          </div>
          {plano.observacao?.trim() && (
            <div>
              <div className="pq-eyebrow pb-1">Observações</div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-texto-2" data-plano-observacao>{plano.observacao.trim()}</p>
            </div>
          )}
          {outros.length > 0 && (
            <div>
              <div className="pq-eyebrow pb-1">{plano.id === atualId ? "Planos anteriores" : "Outros planos"}</div>
              <ul className="divide-y divide-linha-3 rounded-2xl border border-linha bg-superficie" data-outros-planos={outros.length}>
                {outros.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => aoEscolher(p.id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left" data-outro-plano={p.id}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-texto">{p.titulo}</span>
                        <span className="block text-[12px] text-texto-2">de {formatarDataPlano(p.created_at)}</span>
                      </span>
                      {p.id === atualId && <Chip tom="n">ATUAL</Chip>}
                      <ChevronRight aria-hidden className="h-4 w-4 flex-none text-texto-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </PainelDeslizante>
  );
}
