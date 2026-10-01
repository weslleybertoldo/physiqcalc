// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/exames/SituacaoBadge.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { ArrowDown, ArrowUp, Check, Minus } from "lucide-react";
import { textoSituacao, textoSituacaoCurto, type Situacao } from "@/nutricao/prontuario/lib/examesUtil";

// Badge da situação do resultado frente à referência: fora da referência DESTACADO (vermelho acima / laranja abaixo, com seta),
// normal em verde discreto, sem referência em cinza. Usado na tabela de resultados e na prévia do editor.
const ESTILO: Record<Situacao, string> = {
  acima: "border-[rgba(244,63,94,.45)] bg-[rgba(244,63,94,.1)] text-rosa-3",
  abaixo: "border-orange-500/60 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  normal: "border-emerald-600/30 text-emerald-700 dark:text-emerald-400",
  sem_referencia: "border-linha-2 text-texto-2",
};

interface Props {
  situacao: Situacao;
  /** "Acima" em vez de "Acima da referência" */
  curto?: boolean;
  /** atributos `data-*` extras (o E2E lê a situação por eles) */
  extras?: Record<string, string | number>;
}

export default function SituacaoBadge({ situacao, curto = false, extras }: Props) {
  const Icone = situacao === "acima" ? ArrowUp : situacao === "abaixo" ? ArrowDown : situacao === "normal" ? Check : Minus;
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-semibold text-[10px] uppercase tracking-wider whitespace-nowrap ${ESTILO[situacao] ?? ESTILO.sem_referencia}`}
      title={textoSituacao(situacao)}
      {...(extras ?? {})}
    >
      <Icone size={11} aria-hidden="true" /> {curto ? textoSituacaoCurto(situacao) : textoSituacao(situacao)}
    </span>
  );
}
