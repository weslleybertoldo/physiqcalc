import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Users } from "lucide-react";
import { saudacao, primeiroNome } from "@/app-aluno/inicio/pecas/regras";
import { useSessao } from "@/nucleo/sessao";
import { AgendaHoje, Atencao, AtividadeRecente, DiarioHoje, KpiAdesao, KpiAlunos, KpiConsultas, KpiReceita, RecibosDoMes } from "@/painel/dashboard/Blocos";
import { dataPorExtenso } from "@/painel/dashboard/regras";
import { useDashboard } from "@/painel/dashboard/useDashboard";
import { useMiniaturas } from "@/painel/dietas/useDiario";
import GraficoReceita from "@/painel/financeiro/GraficoReceita";
import { MENSAGEM_TREINO_PAINEL } from "@/ui/casca/treinoDaPagina";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";

/**
 * Painel › Dashboard (W25 — spec 4.4 "Dashboard", tela 6; N-9, NF6, P1, P28): o /painel. Os 4 números (Alunos ativos + novos no mês,
 * Receita do mês com a variação sobre o MESMO período do mês anterior, Consultas hoje por tipo, Adesão média), a Receita (30D · 6M ·
 * Ano — a peça do Financeiro), a Agenda de hoje, "Precisam de atenção" (P28), o Diário de hoje (só a nutricionista da conta — regra
 * clínica) e a Atividade recente. Cada número é o da tela que ele abre (Alunos, Financeiro, Agenda); cada linha leva à tela de origem.
 * P1: o dono vê a conta inteira; o membro, só os alunos dele. Módulos: o que a conta não tem não aparece. Só leitura.
 */
export default function Dashboard() {
  const d = useDashboard();
  const navigate = useNavigate();
  const { situacao, usuario } = useSessao();
  const nome = primeiroNome(situacao?.nome || (usuario?.user_metadata as { full_name?: string } | undefined)?.full_name || usuario?.email || "");
  const { urls, renovar } = useMiniaturas(useMemo(() => d.diario.registros.slice(0, 6).map((r) => ({ id: r.id, path: r.path })), [d.diario.registros]));

  const topo = (
    <TopoPagina
      titulo={<span data-saudacao>{saudacao()}{nome ? `, ${nome}` : ""}</span>}
      subtitulo={<span data-data-hoje={d.hoje}>{dataPorExtenso(d.hoje)}</span>}
      acoes={<Botao variante="w" icone={UserPlus} onClick={() => navigate("/painel/alunos?novo=1")} data-dashboard-novo-aluno>Novo aluno</Botao>}
    />
  );

  if (!d.conta) {
    return (
      <div data-pagina-dashboard data-estado="sem-conta">
        {topo}
        <EstadoVazio icone={Users} titulo="Nenhuma conta ativa" texto="O resumo da conta aparece aqui quando você faz parte de uma conta de profissional." />
      </div>
    );
  }
  if (d.principalQ.isError && !d.principalQ.data && d.alunosQ.isError) {
    return (
      <div data-pagina-dashboard data-estado="erro">
        {topo}
        <EstadoErro titulo="Não deu para carregar o resumo" texto="Confira a internet e tente de novo." aoTentar={() => { void d.principalQ.refetch(); void d.alunosQ.refetch(); }} />
      </div>
    );
  }

  const comDiario = d.temNutricao && d.souNutri;
  const k = d.financeiro?.k ?? null;
  const carregandoAlunos = d.alunosQ.isLoading || d.novosQ.isLoading;
  const carregandoAtencao = d.principalQ.isLoading || d.transQ.isLoading || d.cobsQ.isLoading || (d.treinoLigado && d.treinoQ.isLoading)
    || (comDiario && d.diario7.q.isLoading);
  const treinoFalhou = d.temTreino && (d.treinoQ.isError || d.sessaoTreino.tipo === "erro");
  const aviso = treinoFalhou ? (
    <p className="mt-2 border-t border-linha-3 pt-2 text-[11.5px] leading-snug text-texto-3" data-aviso-treino>
      {d.sessaoTreino.tipo === "erro" ? MENSAGEM_TREINO_PAINEL[d.sessaoTreino.erro] : "O resumo do Treino não carregou agora."} Os itens de treino voltam quando ele carregar.
      {d.treinoQ.isError && <button type="button" onClick={() => void d.treinoQ.refetch()} className="ml-1 font-semibold text-violeta-3">Tentar de novo</button>}
    </p>
  ) : null;
  const partes = ["nenhum Pix aguardando", "nada vencido"];
  if (d.temTreino) partes.push("ninguém sem treinar há 7 dias");
  partes.push("nenhuma avaliação vencida");
  if (comDiario) partes.push("ninguém sem marcar a dieta há 3 dias", "nenhuma foto do diário sem reação");
  partes.push("sem cadastro pendente nem pré-consulta nova");
  const vazioAtencao = `Tudo em dia: ${partes.join(", ")}.`;

  return (
    <div className="flex flex-col gap-3.5" data-pagina-dashboard data-modulos={d.modulos.join(",")} data-sou-nutri={d.souNutri ? "1" : "0"}
      data-treino={d.treinoLigado ? (d.treinoQ.data ? "ok" : d.treinoQ.isError ? "erro" : "carregando") : "fora"}>
      {topo}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpis-dashboard>
        <KpiAlunos total={d.alunosQ.data?.total} novosMes={d.novosQ.data?.doMes} serie={d.novosQ.data?.meses.map((m) => m.novos)} carregando={carregandoAlunos}
          erro={d.alunosQ.isError} />
        <KpiReceita k={k} carregando={d.transQ.isLoading || d.cobsQ.isLoading} erro={d.transQ.isError || d.cobsQ.isError} />
        <KpiConsultas n={d.agenda?.n ?? null} carregando={d.agendaQ.isLoading} erro={d.agendaQ.isError} />
        <KpiAdesao m={d.adesao} carregando={d.principalQ.isLoading || (d.treinoLigado && d.treinoQ.isLoading)} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {d.financeiro ? (
          <GraficoReceita recs={d.financeiro.recs} hoje={d.hoje} recebidoMes={d.financeiro.k.recebidoMes} previstoMes={d.financeiro.k.previstoMes}
            extra={<RecibosDoMes n={d.recibosMes} hoje={d.hoje} carregando={d.recibosQ.isLoading} erro={d.recibosQ.isError} />} />
        ) : d.transQ.isError || d.cobsQ.isError ? (
          <EstadoErro titulo="Não deu para carregar a receita" aoTentar={() => { void d.transQ.refetch(); void d.cobsQ.refetch(); }} />
        ) : (
          <Cartao className="h-[380px] p-5" data-receita-carregando><Esqueleto className="h-full w-full" /></Cartao>
        )}
        {/* H1: a lista espera as tags na 1ª carga (a pílula da TAG de cada consulta; sem elas, a base da área) */}
        <AgendaHoje eventos={d.tagsCarregando ? null : d.agenda?.deHoje ?? null} carregando={d.agendaQ.isLoading || d.tagsCarregando} erro={d.agendaQ.isError}
          aoTentar={() => void d.agendaQ.refetch()} hoje={d.hoje} />
      </div>

      <div className={`grid gap-3.5 ${comDiario ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
        <Atencao itens={d.atencao} carregando={carregandoAtencao} avisos={aviso} vazio={vazioAtencao} />
        {comDiario && (
          <DiarioHoje registros={d.diario.registros} urls={urls} carregando={d.diario.q.isLoading} erro={d.diario.q.isError}
            aoTentar={() => void d.diario.q.refetch()} aoFalharFoto={renovar} />
        )}
        <AtividadeRecente itens={d.atividade} carregando={carregandoAtencao || d.respostasQ.isLoading} />
      </div>
    </div>
  );
}
