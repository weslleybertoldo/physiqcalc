import { ListChecks, Salad, Sparkles } from "lucide-react";
import { useSessao } from "@/nucleo/sessao";
import { matriculaDoApp, temAlimentacaoDoApp } from "@/nucleo/situacao";
import { GrupoLista, ItemLista } from "@/ui/premium/Lista";
import { PLANO_COMPLETO } from "../regras";

/**
 * Perfil › "Plano do app" (W7b): só para o aluno sem profissional — Meu plano (plano, situação, trocar, objetivo), Treinos
 * prontos e, no Treino + Alimentação, os pratos prontos (Alimentação). Quem tem profissional não vê.
 */
export function GrupoDoApp() {
  const { situacao } = useSessao();
  const m = matriculaDoApp(situacao);
  if (!m) return null;
  const alimentacao = temAlimentacaoDoApp(m);
  return (
    <GrupoLista titulo="Plano do app">
      <div data-perfil-plano-app={m.app_plano ?? ""}>
        <ItemLista icone={Sparkles} rotulo="Meu plano" para="/perfil/meu-plano"
          valor={<span data-perfil-meu-plano-valor>{m.app_plano === PLANO_COMPLETO ? "Treino + Alimentação" : "Treino"}</span>} />
        <ItemLista icone={ListChecks} rotulo="Treinos prontos" para="/perfil/treinos-prontos" className="border-t border-linha-3" />
        {alimentacao && <ItemLista icone={Salad} rotulo="Alimentação" para="/perfil/alimentacao" className="border-t border-linha-3" />}
      </div>
    </GrupoLista>
  );
}
