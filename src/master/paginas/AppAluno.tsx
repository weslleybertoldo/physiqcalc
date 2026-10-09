import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Dumbbell, KeyRound, Salad, Users } from "lucide-react";
import { SheetSenhaAluno } from "@/painel/aluno/resumo/acesso/SheetSenhaAluno";
import { TopoPagina } from "@/ui/casca/topo";
import { Avatar } from "@/ui/premium/Avatar";
import { BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Paginacao } from "@/ui/premium/Paginacao";
import { Tabela, TabelaCabeca, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/ui/premium/Tabela";
import { alunosDoApp, ErroMaster } from "../api";
import { PratosProntos } from "../app/PratosProntos";
import { TreinosProntos } from "../app/TreinosProntos";
import { ROTULO_OBJETIVO } from "../app/treinosProntos";
import { useAtrasado, usePaginaDoMaster } from "../pecas/lista";
import { Abas, CampoBusca } from "../pecas/ui";
import { dataCurta, moeda, textoErro } from "../regras";
import type { AlunoDoApp } from "../tipos";

type Aba = "alunos" | "treinos" | "pratos";

/**
 * hml-14d (B21 · D28): 20 por página do banco (master_alunos_do_app com p_offset/p_limite) e a busca no banco (nome, e-mail — o do
 * cadastro e o do login —, CPF e telefone pelos dígitos, sem acento); `?pagina=` (trocar de aba zera o endereço — certo).
 */
function AlunosDoApp() {
  const [busca, setBusca] = useState("");
  const termo = useAtrasado(busca.trim());
  const { q, pagina, irPara, total } = usePaginaDoMaster({
    filtro: { termo },
    queryKey: ["master", "alunos-do-app", termo],
    buscar: (n) => alunosDoApp(n, termo),
  });
  const [senha, setSenha] = useState<AlunoDoApp | null>(null);
  const lista = q.data?.alunos ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome, e-mail, CPF ou telefone" data-busca-app />
      </div>
      {q.isLoading ? <EstadoCarregando linhas={5} />
        : q.isError ? <EstadoErro texto={textoErro(q.error instanceof ErroMaster ? q.error.codigo : "erro_interno")} aoTentar={() => void q.refetch()} />
          : !lista.length ? (termo
            ? <EstadoVazio icone={Users} titulo="Nenhum aluno com essa busca" texto="Confira o nome, o e-mail ou os números do CPF e do telefone." />
            : <EstadoVazio icone={Users} titulo="Nenhum aluno no app ainda" texto="Quem entra em “Treinar sem profissional” aparece aqui." />)
            : <TabelaDoApp lista={lista} pagina={pagina} total={total} irPara={irPara} carregando={q.isFetching} aoSenha={setSenha} />}
      {senha && (
        <SheetSenhaAluno aberto criar={false} pacienteId={senha.paciente_id} nome={senha.nome} emailCadastro={senha.email} emailLogin={senha.email}
          aoFechar={() => setSenha(null)} aoSalvar={() => void q.refetch()} />
      )}
    </div>
  );
}

function TabelaDoApp({ lista, pagina, total, irPara, carregando, aoSenha }: {
  lista: AlunoDoApp[];
  pagina: number;
  total: number;
  irPara: (n: number) => void;
  carregando: boolean;
  aoSenha: (a: AlunoDoApp) => void;
}) {
  return (
    <Cartao className="px-4 pb-2 pt-3">
      <Tabela data-tabela-alunos-app data-lista="master-app">
        <TabelaCabeca>
          <tr><TabelaTitulo>Aluno</TabelaTitulo><TabelaTitulo>Plano</TabelaTitulo><TabelaTitulo>Objetivo</TabelaTitulo><TabelaTitulo>Teste / pago até</TabelaTitulo><TabelaTitulo>Situação</TabelaTitulo><TabelaTitulo className="text-right">Acesso</TabelaTitulo></tr>
        </TabelaCabeca>
        <TabelaCorpo>
          {lista.map((a) => (
            <TabelaLinha key={a.paciente_id} data-linha-aluno-app={a.nome ?? ""} data-item>
              <TabelaCelula>
                <span className="flex min-w-[200px] items-center gap-2.5"><Avatar nome={a.nome} tamanho={30} />
                  <span className="min-w-0"><b className="block truncate text-[13.5px]">{a.nome}</b><span className="block truncate text-[12px] text-texto-3">{a.email}</span></span>
                </span>
              </TabelaCelula>
              <TabelaCelula className="text-texto-2">
                <span className="block whitespace-nowrap">{a.plano_nome ?? "—"}</span>
                {a.valor ? <span className="block text-[11.5px] text-texto-3">{moeda(a.valor)}/mês</span> : null}
              </TabelaCelula>
              <TabelaCelula className="whitespace-nowrap text-texto-2">{a.objetivo ? ROTULO_OBJETIVO[a.objetivo] ?? a.objetivo : "—"}</TabelaCelula>
              <TabelaCelula className="whitespace-nowrap text-texto-2">{a.pago_ate ? `Pago até ${dataCurta(a.pago_ate)}` : a.teste_ate ? `Teste até ${dataCurta(a.teste_ate)}` : "—"}</TabelaCelula>
              <TabelaCelula>
                <span className="flex flex-wrap gap-1">
                  {a.ativo ? <Chip tom="n">Ativo</Chip> : <Chip tom="g">{a.encerrada_em ? "Foi para um profissional" : "Inativo"}</Chip>}
                  {a.assinatura === "authorized" && <Chip tom="t">Cartão automático</Chip>}
                  {a.pausada && <Chip tom="a">Cobrança pausada</Chip>}
                </span>
              </TabelaCelula>
              <TabelaCelula className="text-right">
                {a.user_id && <BotaoIcone icone={KeyRound} rotulo={`Senha nova para ${a.nome ?? "o aluno"}`} tamanho={34} onClick={() => aoSenha(a)} data-senha-nova-app={a.nome ?? ""} />}
              </TabelaCelula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
      </Tabela>
      <Paginacao nome="master-app" pagina={pagina} total={total} aoMudar={irPara} carregando={carregando} />
    </Cartao>
  );
}

/**
 * Painel master › App do aluno (herdados da W7b e da W8b): os alunos sem profissional (conta do app "Physiq": Treino R$ 29,90 e
 * Treino + Alimentação R$ 49,90 no Mercado Pago do Weslley; a senha nova de quem ficou bloqueado de vez), os treinos prontos e os
 * pratos prontos — gravados no mesmo lugar da carga dos arquivos de scripts/conteudo.
 */
export default function AppAluno() {
  const [sp, setSp] = useSearchParams();
  const aba = (sp.get("aba") as Aba) || "alunos";
  return (
    <div className="flex flex-col gap-3.5" data-pagina-master="app-aluno" data-aba={aba}>
      <TopoPagina titulo="App do aluno" subtitulo="Aluno sem profissional: alunos, treinos prontos e pratos prontos"
        acoes={<Link to="/master/alunos?modo=app" className="pq-botao pq-botao-g">Ver na lista de alunos</Link>} />
      <Abas rotulo="Partes do app do aluno" ativa={aba} aoMudar={(id) => setSp(id === "alunos" ? {} : { aba: id }, { replace: true })}
        abas={[{ id: "alunos", rotulo: "Alunos do app", icone: Users }, { id: "treinos", rotulo: "Treinos prontos", icone: Dumbbell }, { id: "pratos", rotulo: "Pratos prontos", icone: Salad }]} />
      <div className="mt-1">
        {aba === "alunos" && <AlunosDoApp />}
        {aba === "treinos" && <TreinosProntos />}
        {aba === "pratos" && <PratosProntos />}
      </div>
    </div>
  );
}
