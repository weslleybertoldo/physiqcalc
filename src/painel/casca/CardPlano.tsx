import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Chip } from "@/ui/premium/Chip";
import type { PlanoCasca } from "@/ui/casca/dadosCasca";

/** Card do plano no pé do menu (`.plan` da tela 6): chips dos módulos, nome do plano e a situação. */
export function CardPlano({ plano }: { plano: PlanoCasca | null }) {
  if (!plano) return null;
  return (
    <Link to="/painel/configuracoes/plano" data-card-plano className="pq-cartao pq-brilho block p-[13px] transition-[filter] hover:brightness-110" style={{ borderRadius: 16 }}>
      <span className="flex gap-1.5">
        {plano.modulos.includes("treino") && <Chip tom="t">TREINO</Chip>}
        {plano.modulos.includes("nutricao") && <Chip tom="n">NUTRIÇÃO</Chip>}
      </span>
      <span className="mt-2.5 block text-[13px] font-semibold text-texto">{plano.nome}</span>
      <span
        className={cn(
          "mt-[3px] block text-[11.5px]",
          plano.tom === "erro" ? "text-rosa-3" : plano.tom === "aviso" ? "text-ambar-3" : "text-texto-2",
        )}
      >
        {plano.linha}
      </span>
    </Link>
  );
}
