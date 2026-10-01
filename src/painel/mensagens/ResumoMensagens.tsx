import { CircleAlert, Clock, Send, Sparkles } from "lucide-react";
import { Cartao } from "@/ui/premium/Cartao";
import { Esqueleto } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import { DISPAROS, quantosValendo, type ConfigWhatsapp } from "./disparosUtil";
import { JANELA_FALHAS_DIAS } from "./filaUtil";
import type { ResumoMensagens as Resumo } from "./api";

/**
 * Physiq W22 — os 4 números do topo de Mensagens, no padrão dos KPIs da tela 6: enviadas (30 dias, com o mini gráfico de 14 dias),
 * na fila, com falha (as novas — o MESMO número do menu) e as automáticas valendo.
 */
export default function ResumoMensagens({ resumo, config, carregando, conectado }: { resumo: Resumo | undefined; config: ConfigWhatsapp; carregando: boolean; conectado: boolean }) {
  if (carregando && !resumo) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpis-mensagens data-estado="carregando">
        {[0, 1, 2, 3].map((i) => <Cartao key={i} className="h-[132px] p-4"><Esqueleto className="h-full w-full" /></Cartao>)}
      </div>
    );
  }
  const enviadas = resumo?.enviadas_30d ?? 0;
  const pendentes = resumo?.pendentes ?? 0;
  const falhas = resumo?.falhas ?? 0;
  const valendo = quantosValendo(config);
  const serie = resumo?.serie_enviadas ?? [];
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpis-mensagens data-enviadas={enviadas} data-pendentes={pendentes} data-falhas={falhas} data-automaticas={valendo}>
      <Kpi icone={Send} titulo="Enviadas" tom="verde" valor={enviadas} serie={serie.some((n) => n > 0) ? serie : undefined}
        detalhe={<span>nos últimos 30 dias</span>} />
      <Kpi icone={Clock} titulo="Na fila" tom="ciano" valor={pendentes}
        detalhe={<span>{pendentes ? "aguardando o envio" : "nada esperando"}</span>} />
      <Kpi icone={CircleAlert} titulo="Com falha" tom="ambar" valor={falhas}
        detalhe={<span>{falhas ? `nos últimos ${JANELA_FALHAS_DIAS} dias` : "nenhuma falha nova"}</span>} />
      <Kpi icone={Sparkles} titulo="Automáticas" tom="violeta" valor={<>{valendo}<span className="text-[18px] font-semibold text-texto-3"> de {DISPAROS.length}</span></>}
        detalhe={<span>{!config.ativo ? "desligadas" : !valendo ? "nenhum momento ligado" : conectado ? `a partir das ${config.horario}` : "valem quando conectar"}</span>} />
    </div>
  );
}
