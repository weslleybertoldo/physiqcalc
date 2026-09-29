import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { EstadoVazio } from "@/ui/premium/Estados";
import { PlanoContaNova } from "./plano/PlanoContaNova";
import { PlanoIsento, PlanoLegadoCalc, PlanoLegadoNutri } from "./plano/PlanoLegado";

/**
 * Configurações › Plano (W4, spec 4.6 e 6.5) — só o dono vê a aba. Pela conta ativa:
 *   · conta NOVA → o plano de verdade: situação, escolher/mudar o plano, Pagar (Pix, cartão à vista, cobrança automática,
 *     anual), histórico de faturas e cancelar a cobrança automática;
 *   · 'legado_calc' → a tela de hoje (a Planos do Calc dentro da casca) até a W28 (P9);
 *   · 'legado_nutri' → o aviso com o link para a Assinatura do site do PhysiqNutri até a W28 (P9);
 *   · isenta (master, conta marcada pelo master) → "sem cobrança".
 */
export default function Plano() {
  const { conta, ehMaster } = useConta();
  const { situacao } = useSessao();
  if (!conta) {
    return <EstadoVazio titulo="Nenhuma conta ativa" texto="O plano aparece aqui quando você faz parte de uma conta de profissional." />;
  }
  if (conta.origem === "legado_calc") return <PlanoLegadoCalc />;
  if (conta.origem === "legado_nutri") {
    const legado = situacao?.legado_nutri ?? null;
    if (conta.situacao === "isenta" || legado?.isento_assinatura || legado?.role === "master") return <PlanoIsento conta={conta} master={ehMaster} />;
    return <PlanoLegadoNutri conta={conta} legado={legado} />;
  }
  if (conta.situacao === "isenta") return <PlanoIsento conta={conta} master={ehMaster} />;
  return <PlanoContaNova key={conta.id} contaId={conta.id} />;
}
