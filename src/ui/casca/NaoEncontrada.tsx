import { Compass } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { chegouDoNutriPor, veioDoNutri } from "@/lib/origemNutri";

/**
 * Página não encontrada (404) no visual premium. W28: quem acabou de chegar do site antigo do Nutri (a marca de
 * src/lib/origemNutri.ts, até fechar a tela "O PhysiqNutri agora é o Physiq") vai para o "/" — o Início ou o Entrar — em vez do
 * 404; a tela de boas-vindas continua por cima. Também quem chegou do Nutri nesta carga da página por um caminho que não existe
 * mais, mesmo já tendo fechado a tela antes nesta aba (chegouDoNutriPor). No próprio "/" o 404 fica (sem laço).
 */
export function NaoEncontrada({ voltarPara = "/", rotuloVoltar = "Ir para o início" }: { voltarPara?: string; rotuloVoltar?: string }) {
  const { pathname } = useLocation();
  if (pathname !== "/" && (veioDoNutri() || chegouDoNutriPor(pathname))) return <Navigate to="/" replace />;
  return (
    <div data-nao-encontrada className="relative flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie text-texto-2">
        <Compass aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.75} />
      </span>
      <h1 className="font-body text-[22px] font-bold normal-case tracking-[-0.03em] text-texto">Página não encontrada</h1>
      <p className="max-w-sm text-[13.5px] text-texto-2">
        O endereço <span className="font-medium text-forte">{pathname}</span> não existe no Physiq.
      </p>
      <Link to={voltarPara} className="pq-botao pq-botao-w mt-1">
        {rotuloVoltar}
      </Link>
    </div>
  );
}
