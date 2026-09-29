import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { BotaoIcone } from "@/ui/premium/Botao";

/** Moldura das páginas do app (390 px: 18 px de lado, como o `.scr` das telas aprovadas; no computador, 560 px no centro). */
export const CLASSE_PAGINA_APP = "mx-auto flex w-full max-w-[560px] flex-col gap-2.5 px-[18px] pb-8 pt-[max(14px,env(safe-area-inset-top,0px))]";

/** Título grande da página (`.h-title` da tela 5: 30 px, bold, -0,03em). */
export function TituloApp({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("font-body text-[30px] font-bold normal-case leading-tight tracking-[-0.03em] text-texto", className)}>{children}</h1>;
}

/** Topo dos itens do Perfil (Agenda, Conta, Aparência): Voltar + título (+ ação). Voltar volta ao Perfil. */
export function TopoItem({ titulo, acao }: { titulo: ReactNode; acao?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const voltar = () => (location.key !== "default" ? navigate(-1) : navigate("/perfil", { replace: true }));
  return (
    <div className="mt-1 flex items-center gap-3">
      <BotaoIcone icone={ArrowLeft} rotulo="Voltar" onClick={voltar} data-item-voltar />
      <TituloApp className="min-w-0 flex-1 truncate">{titulo}</TituloApp>
      {acao}
    </div>
  );
}
