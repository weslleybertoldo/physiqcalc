// Physiq W19 — Painel › Financeiro › Mensalidades (C46): o que a tela "Cobrança" do Calc fazia (src/pages/admin/CobrancaPage.tsx, que
// sai nesta W): os números, os alunos com mensalidade (selo pago até / pendente desde, comprovante para conferir, cobranças em aberto),
// os alunos sem mensalidade e os comprovantes Pix aguardando a confirmação (confirmar ou recusar — o professor do Calc confere aqui).
// Lê o banco principal (pagamentos-aluno › prof_resumo da conta ativa — W6). O botão "Cobrança" abre o Financeiro do aluno no painel
// lateral (o mesmo da aba Financeiro do perfil do aluno).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, CircleCheck, Clock, Receipt, Users, Wallet } from "lucide-react";
import ComprovantePixCard, { BadgePagamento } from "@/components/admin/ComprovantePixCard";
import { badgeDoAluno, ErroFinanceiro } from "@/financeiro/api";
import { mensagemErroFinanceiro, reais } from "@/financeiro/regras";
import type { AlunoResumo } from "@/financeiro/tipos";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import PainelCobranca from "./PainelCobranca";
import { useResumoDaConta, type FinanceiroConta } from "./useFinanceiro";

const PAGINA = 20;
const porNome = (a: AlunoResumo, b: AlunoResumo) => (a.nome || a.email || "").localeCompare(b.nome || b.email || "");
/** Id do aluno nas rotas do painel: o do Treino para o aluno do Calc, senão o da matrícula. */
const idDoAluno = (a: Pick<AlunoResumo, "treino_user_id" | "paciente_id">) => a.treino_user_id ?? a.paciente_id;

export default function Mensalidades({ f, focarComprovantes }: { f: FinanceiroConta; focarComprovantes?: boolean }) {
  const consulta = useResumoDaConta(f);
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
  // "Precisam de atenção" do Resumo (Pix aguardando) abre direto nos comprovantes
  useEffect(() => {
    if (focarComprovantes && dados) irParaComprovantes();
  }, [focarComprovantes, dados]);
  const recarregar = () => void f.recarregar("resumo", "transacoes");
  const carregando = consulta.isLoading;

  return (
    <div className="flex flex-col gap-3.5" data-aba-financeiro-conteudo="mensalidades" data-pagina-cobranca>
      {consulta.isError && (
        <EstadoErro texto={mensagemErroFinanceiro(consulta.error instanceof ErroFinanceiro ? consulta.error.codigo : null, "Não deu para carregar as mensalidades. Tente de novo.")}
          aoTentar={() => void consulta.refetch()} />
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icone={Users} titulo="Com mensalidade" tom="violeta" valor={carregando ? "—" : kpis.comMensalidade} />
        <Kpi icone={CircleCheck} titulo="Em dia" tom="verde" valor={carregando ? "—" : kpis.emDia} />
        <Kpi icone={Clock} titulo="Pendentes" tom="ambar" valor={carregando ? "—" : kpis.pendentes} />
        <button type="button" className="text-left" onClick={irParaComprovantes} data-kpi-comprovantes={kpis.comprovantes}>
          <Kpi icone={Receipt} titulo="Comprovantes" tom="ciano" valor={carregando ? "—" : kpis.comprovantes} detalhe={<span>aguardando a confirmação</span>} className="transition-colors hover:border-violeta/40" />
        </button>
      </div>

      <Cartao className="px-[18px] pb-2 pt-4" data-secao-com-mensalidade>
        <CabecalhoCartao titulo="Alunos com mensalidade" extra={<Chip tom="g">{comMensalidade.length}</Chip>}
          acao={dados && !dados.dono ? <span className="text-[12px] text-texto-3">a mensalidade é do dono da conta</span> : undefined} />
        {carregando ? (
          <div className="flex flex-col gap-2 pb-2"><Esqueleto className="h-14 w-full rounded-2xl" /><Esqueleto className="h-14 w-full rounded-2xl" /></div>
        ) : ordenados.length === 0 ? (
          <p className="pb-3 text-[13px] text-texto-2" data-cobranca-vazio>
            {alunos.length === 0 ? "Nenhum aluno na sua conta ainda." : dados?.dono === false
              ? "As mensalidades dos alunos são do dono da conta. Aqui você vê os comprovantes e as cobranças que são suas."
              : "Nenhum aluno com mensalidade. Use o botão Cobrança de um aluno abaixo para definir o plano e o valor."}
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
        <Cartao className="px-[18px] py-3" data-secao-sem-mensalidade>
          <button type="button" onClick={() => setSemAberto((v) => !v)} aria-expanded={semAberto} className="flex w-full items-center gap-2 text-left text-[14px] font-semibold text-texto" data-btn-sem-mensalidade>
            {semAberto ? <ChevronUp aria-hidden className="h-4 w-4 text-texto-3" /> : <ChevronDown aria-hidden className="h-4 w-4 text-texto-3" />}
            {dados?.dono === false ? "Seus alunos" : "Alunos sem mensalidade"}
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

      <Cartao id="comprovantes" className="scroll-mt-4 px-[18px] py-3" data-secao-comprovantes>
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

      {!carregando && !consulta.isError && alunos.length === 0 && (
        <EstadoVazio icone={Wallet} titulo="Nenhum aluno ainda" texto="As mensalidades aparecem aqui quando você tem alunos na conta." />
      )}

      <PainelCobranca aluno={aluno ? { id: idDoAluno(aluno), nome: aluno.nome, email: aluno.email } : null} onFechar={() => setAluno(null)} onSalvo={recarregar} />
    </div>
  );
}

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
