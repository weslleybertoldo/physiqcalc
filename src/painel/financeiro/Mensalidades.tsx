// Physiq W19 — Painel › Financeiro › Mensalidades (C46): o que a tela "Cobrança" do Calc fazia (src/pages/admin/CobrancaPage.tsx, que
// sai nesta W): os números, os alunos com mensalidade (selo pago até / pendente desde, comprovante para conferir, cobranças em aberto),
// os alunos sem mensalidade e os comprovantes Pix aguardando a confirmação (confirmar ou recusar — o professor do Calc confere aqui).
// Lê o banco principal (pagamentos-aluno › prof_resumo da conta ativa — W6). O botão "Cobrança" abre o Financeiro do aluno no painel
// lateral (o mesmo da aba Financeiro do perfil do aluno).
// hml-14b (B21): o prof_resumo com `pagina` devolve só a página (20 com mensalidade e 20 sem), o total, a busca e os números da conta
// (o servidor filtra, ordena e conta — antes vinham todos os alunos e o "Ver mais" fatiava aqui); a página fica no endereço
// (?pagina_mensalidades= e ?pagina_mensalidades_sem=).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, CircleCheck, Clock, Receipt, Search, Users, Wallet } from "lucide-react";
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
import { Paginacao } from "@/ui/premium/Paginacao";
import PainelCobranca from "./PainelCobranca";
import { useMensalidadesDaConta, usePaginaComTotal, type FinanceiroConta } from "./useFinanceiro";

/** Id do aluno nas rotas do painel: o do Treino para o aluno do Calc, senão o da matrícula. */
const idDoAluno = (a: Pick<AlunoResumo, "treino_user_id" | "paciente_id">) => a.treino_user_id ?? a.paciente_id;

export default function Mensalidades({ f, focarComprovantes }: { f: FinanceiroConta; focarComprovantes?: boolean }) {
  const [busca, setBusca] = useState("");
  // a busca (nome ou e-mail, sem acento) vai ao servidor 300 ms depois da última tecla; as 2 listas voltam à página 1
  const [buscaAplicada, setBuscaAplicada] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);
  const filtro = useMemo(() => ({ q: buscaAplicada }), [buscaAplicada]);
  const com = usePaginaComTotal({ chave: "pagina_mensalidades", filtro });
  const semPag = usePaginaComTotal({ chave: "pagina_mensalidades_sem", filtro });
  const consulta = useMensalidadesDaConta(f, { pagina: com.pagina, paginaSem: semPag.pagina, busca: buscaAplicada });
  const [semAberto, setSemAberto] = useState(false);
  const [comprovantesAberto, setComprovantesAberto] = useState(true);
  const [aluno, setAluno] = useState<AlunoResumo | null>(null);

  const dados = consulta.data;
  const { informarTotal: informarCom } = com;
  const { informarTotal: informarSem } = semPag;
  useEffect(() => {
    if (!dados) return;
    informarCom(dados.total);
    informarSem(dados.sem.total);
  }, [dados, informarCom, informarSem]);
  const ordenados = useMemo(() => dados?.alunos ?? [], [dados]);
  const semMensalidade = useMemo(() => dados?.sem.alunos ?? [], [dados]);
  const pendentes = useMemo(() => dados?.pendentes ?? [], [dados]);
  // o selo de cada linha (a ordem e os números vêm prontos do servidor, com a mesma regra)
  const selos = useMemo(() => new Map(ordenados.map((a) => [a.paciente_id, badgeDoAluno(a)])), [ordenados]);
  const kpis = {
    comMensalidade: dados?.contagens.com_mensalidade ?? 0,
    emDia: dados?.contagens.em_dia ?? 0,
    pendentes: dados?.contagens.pendentes ?? 0,
    comprovantes: pendentes.length,
  };
  const totalCom = dados?.total ?? 0;
  const totalSem = dados?.sem.total ?? 0;
  const nenhumAluno = (dados?.contagens.alunos ?? 0) === 0;

  const irParaComprovantes = () => {
    setComprovantesAberto(true);
    window.setTimeout(() => document.getElementById("comprovantes")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  // "Precisam de atenção" do Resumo (Pix aguardando) abre direto nos comprovantes — 1 vez, quando a 1ª resposta chega (trocar de
  // página traz outra resposta e não pode rolar a tela de novo)
  const focou = useRef(false);
  useEffect(() => {
    if (!focarComprovantes || !dados || focou.current) return;
    focou.current = true;
    irParaComprovantes();
  }, [focarComprovantes, dados]);
  const recarregar = () => void f.recarregar("resumo", "transacoes");
  const carregando = consulta.isLoading;

  // erro do servidor: só o aviso (nunca "nenhum aluno" nem os números zerados no lugar dele)
  if (consulta.isError) {
    return (
      <div className="flex flex-col gap-3.5" data-aba-financeiro-conteudo="mensalidades" data-pagina-cobranca data-estado="erro">
        <EstadoErro texto={mensagemErroFinanceiro(consulta.error instanceof ErroFinanceiro ? consulta.error.codigo : null, "Não deu para carregar as mensalidades. Tente de novo.")}
          aoTentar={() => void consulta.refetch()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5" data-aba-financeiro-conteudo="mensalidades" data-pagina-cobranca data-atualizando={consulta.isFetching ? "1" : "0"}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icone={Users} titulo="Com mensalidade" tom="violeta" valor={carregando ? "—" : kpis.comMensalidade} />
        <Kpi icone={CircleCheck} titulo="Em dia" tom="verde" valor={carregando ? "—" : kpis.emDia} />
        <Kpi icone={Clock} titulo="Pendentes" tom="ambar" valor={carregando ? "—" : kpis.pendentes} />
        <button type="button" className="text-left" onClick={irParaComprovantes} data-kpi-comprovantes={kpis.comprovantes}>
          <Kpi icone={Receipt} titulo="Comprovantes" tom="ciano" valor={carregando ? "—" : kpis.comprovantes} detalhe={<span>aguardando a confirmação</span>} className="transition-colors hover:border-violeta/40" />
        </button>
      </div>

      {!nenhumAluno && (
        <label className="relative flex items-center">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 h-4 w-4 text-texto-3" />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno por nome ou e-mail"
            className="h-10 w-full rounded-[14px] border border-linha-2 bg-superficie pl-10 pr-3 text-[13.5px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60"
            data-busca-mensalidades />
        </label>
      )}

      <Cartao className="px-[18px] pb-2 pt-4" data-secao-com-mensalidade>
        <CabecalhoCartao titulo="Alunos com mensalidade" extra={<Chip tom="g">{totalCom}</Chip>}
          acao={dados && !dados.dono ? <span className="text-[12px] text-texto-3">a mensalidade é do dono da conta</span> : undefined} />
        {carregando ? (
          <div className="flex flex-col gap-2 pb-2"><Esqueleto className="h-14 w-full rounded-2xl" /><Esqueleto className="h-14 w-full rounded-2xl" /></div>
        ) : totalCom === 0 ? (
          <p className="pb-3 text-[13px] text-texto-2" data-cobranca-vazio>
            {nenhumAluno ? "Nenhum aluno na sua conta ainda." : dados?.dono === false
              ? "As mensalidades dos alunos são do dono da conta. Aqui você vê os comprovantes e as cobranças que são suas."
              : buscaAplicada && kpis.comMensalidade > 0 ? "Nenhum aluno com mensalidade com essa busca."
                : "Nenhum aluno com mensalidade. Use o botão Cobrança de um aluno abaixo para definir o plano e o valor."}
          </p>
        ) : (
          <>
            <div className="divide-y divide-linha-3" data-lista="mensalidades">
              {ordenados.map((a) => (
                <LinhaAluno key={a.paciente_id} a={a} selo={selos.get(a.paciente_id) ?? null} aoCobranca={() => setAluno(a)} aoComprovante={irParaComprovantes} />
              ))}
            </div>
            <Paginacao nome="mensalidades" pagina={com.pagina} total={totalCom} aoMudar={com.irPara} carregando={consulta.isFetching} className="border-t border-linha-3" />
          </>
        )}
      </Cartao>

      {!carregando && totalSem > 0 && (
        <Cartao className="px-[18px] py-3" data-secao-sem-mensalidade>
          <button type="button" onClick={() => setSemAberto((v) => !v)} aria-expanded={semAberto || !!buscaAplicada} className="flex w-full items-center gap-2 text-left text-[14px] font-semibold text-texto" data-btn-sem-mensalidade>
            {semAberto || buscaAplicada ? <ChevronUp aria-hidden className="h-4 w-4 text-texto-3" /> : <ChevronDown aria-hidden className="h-4 w-4 text-texto-3" />}
            {dados?.dono === false ? "Seus alunos" : "Alunos sem mensalidade"}
            <Chip tom="g" className="ml-auto">{totalSem}</Chip>
          </button>
          {/* com uma busca a lista abre sozinha (quem procura um aluno sem mensalidade acha sem mais um toque) */}
          {(semAberto || !!buscaAplicada) && (
            <>
              <div className="mt-2 divide-y divide-linha-3" data-lista-sem-mensalidade data-lista="mensalidades-sem">
                {semMensalidade.map((a) => (
                  <LinhaAluno key={a.paciente_id} a={a} selo={null} aoCobranca={() => setAluno(a)} aoComprovante={irParaComprovantes} semValor />
                ))}
              </div>
              <Paginacao nome="mensalidades-sem" pagina={semPag.pagina} total={totalSem} aoMudar={semPag.irPara} carregando={consulta.isFetching}
                className="border-t border-linha-3" />
            </>
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
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {pendentes.map((p) => <ComprovantePixCard key={p.id} item={p} onResolvido={recarregar} />)}
              </div>
            )}
          </div>
        )}
      </Cartao>

      {!carregando && nenhumAluno && (
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
    <div className="flex items-center gap-3 py-3" data-item data-cobranca-aluno={idDoAluno(a)}>
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
