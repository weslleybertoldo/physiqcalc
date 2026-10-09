// Physiq W21 — o topo do Painel › Pré-consulta no padrão da tela 6 (os 4 números): Respostas novas (sem aluno — o número do menu),
// Respostas no mês (com as 8 últimas semanas), Formulários ativos e Ligadas a alunos (e importadas, para a nutricionista).
// hml-14d (B21 · D35): os números das respostas vêm contados do banco (preconsulta_numeros) — antes, de uma lista de até 1000 no
// navegador. Erro do banco = o estado de erro, nunca zeros.
import { CalendarDays, ClipboardList, Inbox, UserCheck } from "lucide-react";
import { Cartao } from "@/ui/premium/Cartao";
import { EstadoErro, Esqueleto } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import type { ContextoPreConsulta, DadosPreConsulta } from "./usePreConsulta";

export default function ResumoPreConsulta({ ctx, d }: { ctx: ContextoPreConsulta; d: DadosPreConsulta }) {
  const n = d.numeros;
  if (!n && d.numerosQ.isError) {
    return (
      <div data-resumo-preconsulta="erro">
        <EstadoErro titulo="Não deu para carregar os números da pré-consulta" texto={d.numerosQ.error instanceof Error ? d.numerosQ.error.message : undefined}
          aoTentar={() => void d.numerosQ.refetch()} />
      </div>
    );
  }
  if (!n || d.formulariosQ.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-resumo-preconsulta="carregando">
        {[0, 1, 2, 3].map((i) => <Cartao key={i} className="h-[132px] p-4"><Esqueleto className="h-full w-full" /></Cartao>)}
      </div>
    );
  }
  const ativos = d.formularios.filter((f) => f.ativo).length;
  const formularios = d.formularios.length;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-resumo-preconsulta data-novas={n.novas} data-mes={n.mes} data-ativos={ativos} data-ligadas={n.ligadas}>
      <Kpi icone={Inbox} titulo="Respostas novas" tom="ambar" valor={n.novas} detalhe={<span>sem aluno ligado</span>} />
      <Kpi icone={CalendarDays} titulo="Respostas no mês" tom="violeta" valor={n.mes} serie={n.semanas.some((x) => x > 0) ? n.semanas : undefined}
        detalhe={<span>{n.total} no total</span>} />
      <Kpi icone={ClipboardList} titulo="Formulários ativos" tom="verde" valor={ativos} detalhe={<span>de {formularios} {formularios === 1 ? "formulário" : "formulários"}</span>} />
      <Kpi icone={UserCheck} titulo="Ligadas a alunos" tom="ciano" valor={n.ligadas}
        detalhe={<span>{ctx.souNutri ? `${n.importadas} ${n.importadas === 1 ? "importada" : "importadas"} para o prontuário` : "no histórico dos alunos"}</span>} />
    </div>
  );
}
