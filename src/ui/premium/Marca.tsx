import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

/** Marca Physiq (`.logo` + `.mark`): quadrado violeta → verde com o traço de atividade e o nome. */
export function Marca({ tamanho = 34, soIcone, className }: { tamanho?: number; soIcone?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} data-marca>
      <span
        className="inline-flex flex-none items-center justify-center"
        style={{
          width: tamanho,
          height: tamanho,
          borderRadius: Math.round(tamanho * 0.32),
          background: "linear-gradient(135deg,#8B5CF6,#10B981)",
          boxShadow: "0 8px 24px -6px rgba(139,92,246,.7), inset 0 1px 0 rgba(255,255,255,.35)",
        }}
      >
        <Activity aria-hidden color="#fff" strokeWidth={2.4} style={{ width: tamanho * 0.56, height: tamanho * 0.56 }} />
      </span>
      {!soIcone && <b className="text-[19px] font-bold tracking-[-0.03em] text-texto">Physiq</b>}
    </span>
  );
}
