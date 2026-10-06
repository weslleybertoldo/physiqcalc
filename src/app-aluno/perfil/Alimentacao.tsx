import { Navigate, useNavigate } from "react-router-dom";
import { Salad } from "lucide-react";
import { ehLoja } from "@/lib/distribuicao";
import { useSessao } from "@/nucleo/sessao";
import { matriculaDoApp, temAlimentacaoDoApp } from "@/nucleo/situacao";
import { CLASSE_PAGINA_APP, TopoItem } from "@/app-aluno/perfil/pecas/TopoItem";
import { PratosProntos } from "@/nutricao/app/ui/PratosProntos";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";

/**
 * Perfil › Alimentação (W7b) — W11: os pratos prontos do plano Treino + Alimentação agora moram na aba Dieta (tela 3); este item
 * ficou como atalho (quem tem a Alimentação vai direto para a Dieta). O master sem o módulo continua revendo os pratos aqui, e
 * quem está no app só com o Treino vê como incluir a Alimentação — nada se perdeu. W1 da loja: na versão da Google Play, sem
 * "Ver os planos" nem o convite a trocar de plano (a mensalidade do app vai para o Play Billing na W6).
 */
export default function Alimentacao() {
  const navigate = useNavigate();
  const { situacao } = useSessao();
  const doApp = matriculaDoApp(situacao);
  const temDieta = (situacao?.modulos_aluno ?? []).includes("nutricao");

  if (temDieta) return <Navigate to="/dieta" replace />;

  if (situacao?.master || temAlimentacaoDoApp(doApp)) {
    return (
      <div data-pagina-alimentacao="pratos" className={CLASSE_PAGINA_APP}>
        <TopoItem titulo="Alimentação" />
        <PratosProntos />
      </div>
    );
  }

  return (
    <div data-pagina-alimentacao="sem-plano" className={CLASSE_PAGINA_APP}>
      <TopoItem titulo="Alimentação" />
      <Cartao brilho className="flex flex-col gap-3 px-4 py-4" data-alimentacao-bloqueada>
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-linha bg-superficie text-verde-3">
          <Salad aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <b className="text-[16px] font-semibold text-texto">Pratos prontos pelo seu objetivo</b>
        <p className="text-[13px] leading-relaxed text-texto-2">
          {ehLoja
            ? "Os pratos prontos, com calorias e macros, não fazem parte do seu plano."
            : doApp
              ? "Os pratos prontos, com calorias e macros, estão no plano Treino + Alimentação. Troque de plano em Meu plano."
              : "Os pratos prontos são para quem treina sem profissional, no plano Treino + Alimentação."}
        </p>
        {doApp && !ehLoja && <Botao variante="w" className="w-full" onClick={() => navigate("/perfil/meu-plano")} data-ver-planos>Ver os planos</Botao>}
      </Cartao>
    </div>
  );
}
