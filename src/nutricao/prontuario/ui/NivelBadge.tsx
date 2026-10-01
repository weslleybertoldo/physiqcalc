// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/questionarios/NivelBadge.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { AlertTriangle, Check, Minus, TrendingUp } from "lucide-react";
import { textoNivel, type Nivel } from "@/nutricao/prontuario/lib/questionariosUtil";

// Badge do nível da faixa de pontuação (padrão do SituacaoBadge da W18): alto vermelho / moderado laranja / baixo verde /
// sem faixa cinza. Mostra o rótulo da faixa quando existe ("Alta suspeita"), senão o nome do nível.
const ESTILO: Record<Nivel | "", string> = {
  alto: "border-[rgba(244,63,94,.45)] bg-[rgba(244,63,94,.1)] text-rosa-3",
  moderado: "border-orange-500/60 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  baixo: "border-emerald-600/30 text-emerald-700 dark:text-emerald-400",
  "": "border-linha-2 text-texto-2",
};

interface Props {
  nivel: Nivel | "";
  /** rótulo da faixa ("Alta suspeita"); vazio → nome do nível */
  rotulo?: string;
  /** atributos `data-*` extras (o E2E lê o nível por eles) */
  extras?: Record<string, string | number>;
}

export default function NivelBadge({ nivel, rotulo, extras }: Props) {
  const Icone = nivel === "alto" ? AlertTriangle : nivel === "moderado" ? TrendingUp : nivel === "baixo" ? Check : Minus;
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-semibold text-[10px] uppercase tracking-wider whitespace-nowrap ${ESTILO[nivel] ?? ESTILO[""]}`}
      title={textoNivel(nivel)}
      {...(extras ?? {})}
    >
      <Icone size={11} aria-hidden="true" /> {(rotulo ?? "").trim() || textoNivel(nivel)}
    </span>
  );
}
