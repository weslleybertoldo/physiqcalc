// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/farmaco/BadgeGravidade.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { rotuloGravidade } from "@/nutricao/prontuario/lib/farmacoUtil";

// Badge da gravidade de uma interação: alta em vermelho, moderada na cor primária, baixa apagada. Usado na seção, nos modais e na base.
const CHIP = "pq-chip pq-chip-g";
const classe = (g: string): string =>
  g === "alta" ? "border-[rgba(244,63,94,.45)] text-rosa-3" : g === "moderada" ? "border-verde/50 text-verde-3" : "border-linha-2 text-texto-2";

export default function BadgeGravidade({ gravidade }: { gravidade: string }) {
  return (
    <span className={`${CHIP} ${classe(gravidade)}`} data-badge-gravidade={gravidade}>
      {rotuloGravidade(gravidade)}
    </span>
  );
}
