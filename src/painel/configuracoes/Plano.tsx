import { useConta } from "@/nucleo/conta";
import { EstadoVazio } from "@/ui/premium/Estados";
import { PlanoContaNova } from "./plano/PlanoContaNova";
import { PlanoIsento } from "./plano/PlanoIsento";

/**
 * Configurações › Plano (W4, spec 4.6 e 6.5) — só o dono vê a aba. Pela conta ativa:
 *   · isenta (master, conta marcada pelo master) → "sem cobrança";
 *   · as demais → o plano que o NÚCLEO cobra: situação, escolher/mudar o plano, Pagar (Pix, cartão à vista, cobrança automática,
 *     anual), histórico de faturas e cancelar a cobrança automática. Desde a virada (W28) vale também para as contas legadas
 *     (cobranca_legada = false), com o preço e as regras de hoje até trocar de plano. Conta que ainda estivesse com a cobrança
 *     antiga (cobranca_legada) recebe do servidor o erro "conta_legada" aqui.
 */
export default function Plano() {
  const { conta, ehMaster } = useConta();
  if (!conta) {
    return <EstadoVazio titulo="Nenhuma conta ativa" texto="O plano aparece aqui quando você faz parte de uma conta de profissional." />;
  }
  if (conta.situacao === "isenta") return <PlanoIsento conta={conta} master={ehMaster} />;
  return <PlanoContaNova key={conta.id} contaId={conta.id} />;
}
