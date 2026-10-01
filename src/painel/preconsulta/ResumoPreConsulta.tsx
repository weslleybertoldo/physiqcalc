// Physiq W21 — o topo do Painel › Pré-consulta no padrão da tela 6 (os 4 números): Respostas novas (sem aluno — o número do menu),
// Respostas no mês (com as 8 últimas semanas), Formulários ativos e Ligadas a alunos (e importadas, para a nutricionista).
import { useMemo } from "react";
import { CalendarDays, ClipboardList, Inbox, UserCheck } from "lucide-react";
import { Cartao } from "@/ui/premium/Cartao";
import { Esqueleto } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import { ehNova, respostasDoMes, respostasPorSemana } from "./respostasUtil";
import type { ContextoPreConsulta, DadosPreConsulta } from "./usePreConsulta";

export default function ResumoPreConsulta({ ctx, d }: { ctx: ContextoPreConsulta; d: DadosPreConsulta }) {
  const n = useMemo(() => {
    const r = d.respostas;
    return {
      novas: r.filter(ehNova).length,
      mes: respostasDoMes(r),
      semanas: respostasPorSemana(r),
      ligadas: r.filter((x) => !!x.paciente_id).length,
      importadas: r.filter((x) => !!x.importada_em).length,
      total: r.length,
      ativos: d.formularios.filter((f) => f.ativo).length,
      formularios: d.formularios.length,
    };
  }, [d.respostas, d.formularios]);

  if (d.respostasQ.isLoading || d.formulariosQ.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-resumo-preconsulta="carregando">
        {[0, 1, 2, 3].map((i) => <Cartao key={i} className="h-[132px] p-4"><Esqueleto className="h-full w-full" /></Cartao>)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-resumo-preconsulta data-novas={n.novas} data-mes={n.mes} data-ativos={n.ativos} data-ligadas={n.ligadas}>
      <Kpi icone={Inbox} titulo="Respostas novas" tom="ambar" valor={n.novas} detalhe={<span>sem aluno ligado</span>} />
      <Kpi icone={CalendarDays} titulo="Respostas no mês" tom="violeta" valor={n.mes} serie={n.semanas.some((x) => x > 0) ? n.semanas : undefined}
        detalhe={<span>{n.total} no total</span>} />
      <Kpi icone={ClipboardList} titulo="Formulários ativos" tom="verde" valor={n.ativos} detalhe={<span>de {n.formularios} {n.formularios === 1 ? "formulário" : "formulários"}</span>} />
      <Kpi icone={UserCheck} titulo="Ligadas a alunos" tom="ciano" valor={n.ligadas}
        detalhe={<span>{ctx.souNutri ? `${n.importadas} ${n.importadas === 1 ? "importada" : "importadas"} para o prontuário` : "no histórico dos alunos"}</span>} />
    </div>
  );
}
