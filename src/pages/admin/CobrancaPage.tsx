import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, CircleCheck, Clock, Receipt, Users, Wallet } from "lucide-react";
import { useConta } from "@/nucleo/conta";
import { badgeDoAluno, buscarResumoDaConta, ErroFinanceiro } from "@/financeiro/api";
import { mensagemErroFinanceiro, reais } from "@/financeiro/regras";
import type { AlunoResumo } from "@/financeiro/tipos";
import ComprovantePixCard, { BadgePagamento } from "@/components/admin/ComprovantePixCard";
import CobrancaAlunoDialog from "@/components/admin/CobrancaAlunoDialog";
import { TopoPagina } from "@/ui/casca/topo";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Cartao, CabecalhoCartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";

const PAGINA = 20;
const porNome = (a: AlunoResumo, b: AlunoResumo) => (a.nome || a.email || "").localeCompare(b.nome || b.email || "");
/** Id do aluno nas rotas do painel: o do Treino para o aluno do Calc (lista antiga de alunos), senão o da matrícula. */
const idDoAluno = (a: Pick<AlunoResumo, "treino_user_id" | "paciente_id">) => a.treino_user_id ?? a.paciente_id;

/**
 * Financeiro do profissional — a tela antiga "Cobrança" do Calc, que responde por /painel/financeiro até a página nova (W19).
 * W6: lê o banco principal (pagamentos-aluno › prof_resumo da conta ativa): KPIs, alunos com mensalidade (selo pago até /
 * pendente desde, comprovante para conferir), alunos sem mensalidade e os comprovantes Pix aguardando a confirmação. O botão
 * "Cobrança" abre o Financeiro do aluno no painel lateral (o mesmo da aba Financeiro do perfil do aluno).
 */
const CobrancaPage = () => {
  const { conta } = useConta();
  const qc = useQueryClient();
  const consulta = useQuery({
    queryKey: ["financeiro-resumo-conta", conta?.id],
    enabled: !!conta?.id,
    queryFn: () => buscarResumoDaConta(conta!.id),
    staleTime: 15_000,
  });
  const [mostrar, setMostrar] = useState(PAGINA);
  const [mostrarSem, setMostrarSem] = useState(PAGINA);
  const [semAberto, setSemAberto] = useState(false);
  const [comprovantesAberto, setComprovantesAberto] = useState(true);
  const [aluno, setAluno] = useState<AlunoResumo | null>(null);

  const dados = consulta.data;
  const alunos = useMemo(() => dados?.alunos ?? [], [dados]);
  const pendentes = useMemo(() => dados?.pendentes ?? [], [dados]);
  const comMensalidade = useMemo(() => alunos.filter((a) => Number(a.mensalidade_valor) > 0), [alunos]);
  const semMensalidade = useMemo(() => alunos.filter((a) => !(Number(a.mensalidade_valor) > 0)).sort(porNome), [alunos]);
  const selos = useMemo(() => new Map(comMensalidade.map((a) => [a.paciente_id, badgeDoAluno(a)])), [comMensalidade]);
  const kpis = useMemo(() => {
    const lista = [...selos.values()].filter(Boolean);
    return {
      comMensalidade: comMensalidade.length,
      emDia: lista.filter((b) => b!.s === "pago").length,
      pendentes: lista.filter((b) => b!.s === "pendente").length,
      comprovantes: pendentes.length,
    };
  }, [selos, comMensalidade.length, pendentes.length]);
  // comprovante para conferir primeiro, depois pendentes, em dia e cobrança parada; dentro, por nome
  const ordenados = useMemo(() => {
    const peso = (a: AlunoResumo) => (a.aguardando ? 0 : selos.get(a.paciente_id)?.s === "pendente" ? 1 : selos.get(a.paciente_id)?.s === "pago" ? 2 : 3);
    return [...comMensalidade].sort((a, b) => peso(a) - peso(b) || porNome(a, b));
  }, [comMensalidade, selos]);

  const irParaComprovantes = () => {
    setComprovantesAberto(true);
    window.setTimeout(() => document.getElementById("comprovantes")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const recarregar = () => void qc.invalidateQueries({ queryKey: ["financeiro-resumo-conta", conta?.id] });
  const carregando = consulta.isLoading;

  if (!conta) {
    return <div data-pagina-cobranca><EstadoVazio icone={Wallet} titulo="Nenhuma conta ativa" texto="O financeiro aparece aqui quando você faz parte de uma conta de profissional." /></div>;
  }

  return (
    <div className="flex flex-col gap-4" data-pagina-cobranca>
      <TopoPagina titulo="Financeiro" subtitulo="Mensalidades dos alunos e comprovantes Pix para conferir" />

      {consulta.isError && (
        <EstadoErro texto={mensagemErroFinanceiro(consulta.error instanceof ErroFinanceiro ? consulta.error.codigo : null, "Não deu para carregar o financeiro. Tente de novo.")}
          aoTentar={() => void consulta.refetch()} />
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icone={Users} titulo="Com mensalidade" tom="violeta" valor={carregando ? "—" : kpis.comMensalidade} className="h-[116px]" />
        <Kpi icone={CircleCheck} titulo="Em dia" tom="verde" valor={carregando ? "—" : kpis.emDia} className="h-[116px]" />
        <Kpi icone={Clock} titulo="Pendentes" tom="ambar" valor={carregando ? "—" : kpis.pendentes} className="h-[116px]" />
        <button type="button" className="text-left" onClick={irParaComprovantes} data-kpi-comprovantes={kpis.comprovantes}>
          <Kpi icone={Receipt} titulo="Comprovantes aguardando" tom="ciano" valor={carregando ? "—" : kpis.comprovantes} className="h-[116px] transition-colors hover:border-violeta/40" />
        </button>
      </div>

      <Cartao className="px-4 pb-2 pt-4" data-secao-com-mensalidade>
        <CabecalhoCartao titulo="Alunos com mensalidade" extra={<Chip tom="g">{comMensalidade.length}</Chip>} />
        {carregando ? (
          <div className="flex flex-col gap-2 pb-2"><Esqueleto className="h-14 w-full rounded-2xl" /><Esqueleto className="h-14 w-full rounded-2xl" /></div>
        ) : ordenados.length === 0 ? (
          <p className="pb-3 text-[13px] text-texto-2" data-cobranca-vazio>
            {alunos.length === 0 ? "Nenhum aluno na sua conta ainda." : "Nenhum aluno com mensalidade. Use o botão Cobrança de um aluno abaixo para definir o plano e o valor."}
          </p>
        ) : (
          <>
            <div className="divide-y divide-linha-3">
              {ordenados.slice(0, mostrar).map((a) => (
                <LinhaAluno key={a.paciente_id} a={a} selo={selos.get(a.paciente_id) ?? null} aoCobranca={() => setAluno(a)} aoComprovante={irParaComprovantes} />
              ))}
            </div>
            {ordenados.length > mostrar && (
              <div className="py-2"><Botao tamanho="sm" variante="g" onClick={() => setMostrar((m) => m + PAGINA)}>Ver mais ({ordenados.length - mostrar})</Botao></div>
            )}
          </>
        )}
      </Cartao>

      {!carregando && semMensalidade.length > 0 && (
        <Cartao className="px-4 py-3" data-secao-sem-mensalidade>
          <button type="button" onClick={() => setSemAberto((v) => !v)} aria-expanded={semAberto} className="flex w-full items-center gap-2 text-left text-[14px] font-semibold text-texto" data-btn-sem-mensalidade>
            {semAberto ? <ChevronUp aria-hidden className="h-4 w-4 text-texto-3" /> : <ChevronDown aria-hidden className="h-4 w-4 text-texto-3" />}
            Alunos sem mensalidade
            <Chip tom="g" className="ml-auto">{semMensalidade.length}</Chip>
          </button>
          {semAberto && (
            <div className="mt-2 divide-y divide-linha-3" data-lista-sem-mensalidade>
              {semMensalidade.slice(0, mostrarSem).map((a) => (
                <LinhaAluno key={a.paciente_id} a={a} selo={null} aoCobranca={() => setAluno(a)} aoComprovante={irParaComprovantes} semValor />
              ))}
              {semMensalidade.length > mostrarSem && (
                <div className="py-2"><Botao tamanho="sm" variante="g" onClick={() => setMostrarSem((m) => m + PAGINA)}>Ver mais ({semMensalidade.length - mostrarSem})</Botao></div>
              )}
            </div>
          )}
        </Cartao>
      )}

      <Cartao id="comprovantes" className="scroll-mt-4 px-4 py-3" data-secao-comprovantes>
        <button type="button" onClick={() => setComprovantesAberto((v) => !v)} aria-expanded={comprovantesAberto} className="flex w-full items-center gap-2 text-left text-[14px] font-semibold text-texto" data-btn-comprovantes>
          {comprovantesAberto ? <ChevronUp aria-hidden className="h-4 w-4 text-texto-3" /> : <ChevronDown aria-hidden className="h-4 w-4 text-texto-3" />}
          Comprovantes aguardando confirmação
          <Chip tom={pendentes.length ? "c" : "g"} className="ml-auto">{carregando ? "…" : pendentes.length}</Chip>
        </button>
        {comprovantesAberto && (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-[12.5px] text-texto-2">O aluno pagou o Pix na sua chave e anexou o comprovante. Confira o valor e o mês antes de confirmar — ao confirmar, ele fica em dia.</p>
            {carregando ? (
              <Esqueleto className="h-[92px] w-full rounded-2xl" />
            ) : pendentes.length === 0 ? (
              <p className="text-[13px] text-texto-2" data-comprovantes-vazio>Nenhum comprovante aguardando.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {pendentes.map((p) => <ComprovantePixCard key={p.id} item={p} onResolvido={recarregar} />)}
              </div>
            )}
          </div>
        )}
      </Cartao>

      <CobrancaAlunoDialog aluno={aluno ? { id: idDoAluno(aluno), nome: aluno.nome, email: aluno.email } : null} onFechar={() => setAluno(null)} onSalvo={recarregar} />
    </div>
  );
};

function LinhaAluno({ a, selo, aoCobranca, aoComprovante, semValor }: {
  a: AlunoResumo;
  selo: { s: string; ate: string | null } | null;
  aoCobranca: () => void;
  aoComprovante: () => void;
  semValor?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3" data-cobranca-aluno={idDoAluno(a)}>
      <Avatar nome={a.nome || a.email} tamanho={38} />
      <div className="min-w-0 flex-1">
        <Link to={`/painel/alunos/${idDoAluno(a)}/financeiro`} className="block truncate text-[14px] font-semibold text-texto hover:text-violeta-3">{a.nome || "Sem nome"}</Link>
        <p className="truncate text-[12px] text-texto-3">{a.email}</p>
        {!semValor && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-semibold tabular-nums text-texto">{reais(Number(a.mensalidade_valor))}/mês</span>
            {a.plano && <Chip tom="t" className="h-[22px] text-[10.5px]">{a.plano.toUpperCase()}</Chip>}
            {selo ? <BadgePagamento badge={selo} /> : <Chip tom="g" className="h-[22px] text-[10.5px]" data-cobranca-parada>COBRANÇA PARADA</Chip>}
            {a.aguardando && (
              <button type="button" onClick={aoComprovante} data-badge-comprovante={idDoAluno(a)}>
                <Chip tom="c" icone={Receipt} className="h-[22px] text-[10.5px]">COMPROVANTE PARA CONFERIR</Chip>
              </button>
            )}
            {a.abertas > 0 && <Chip tom="a" className="h-[22px] text-[10.5px]">{a.abertas} EM ABERTO</Chip>}
          </div>
        )}
      </div>
      <Botao tamanho="sm" variante="g" onClick={aoCobranca} className="flex-none" data-btn-cobranca={idDoAluno(a)}>Cobrança</Botao>
    </div>
  );
}

export default CobrancaPage;
