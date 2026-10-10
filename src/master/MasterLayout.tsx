import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { tela } from "@/rotas/registro";
import { usePreCarga } from "@/rotas/usePreCarga";
import { lembrarArea } from "@/ui/casca/area";
import { CarregandoTela } from "@/ui/casca/CarregandoTela";
import { Carregavel } from "@/ui/casca/Carregavel";
import { CascaWeb, type AcaoUsuario, type ItemNav } from "@/ui/casca/CascaWeb";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { NaoEncontrada } from "@/ui/casca/NaoEncontrada";
import { SemConexaoTreino } from "@/ui/casca/SemConexaoTreino";
import { TransicaoDePagina } from "@/ui/casca/TransicaoDePagina";
import { useTreinoDaPagina } from "@/ui/casca/treinoDaPagina";
import MasterLayoutAntigo from "@/layouts/MasterLayout";
import { MENU_MASTER, itemMasterAtivo, type ItemMenuMaster } from "./menu";

function CardMaster() {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-[14px] border border-linha bg-superficie px-2.5 py-[9px]" data-card-conta>
      <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-linha-2 bg-violeta/15 text-violeta-3">
        <ShieldCheck aria-hidden className="h-4 w-4" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-texto">Painel master</span>
        <span className="block truncate text-[11.5px] font-medium text-texto-2">Contas, planos e alunos</span>
      </span>
    </div>
  );
}

/** Casca do painel master (/master/*), no mesmo visual do site (spec 4.7), com as páginas antigas dentro. */
export default function MasterLayout() {
  const dados = useDadosCasca();
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // hml-18a (H-40, E): depois do 1º render do master, no ocioso, as páginas do master (a troca não espera o pedaço chegar)
  usePreCarga("master", { ligado: !dados.carregando && !!dados.usuario && dados.ehMaster });

  if (dados.carregando) return <CarregandoTela />;
  if (!dados.usuario) return <Navigate to="/entrar" replace state={{ de: location.pathname + location.search }} />;
  if (!dados.ehMaster) return <Navigate to={dados.ehProfissional ? "/painel" : "/"} replace />;

  const itens: ItemNav[] = MENU_MASTER.map((i) => ({
    id: i.id,
    rotulo: i.rotulo,
    icone: i.icone,
    para: i.rota,
    ativo: itemMasterAtivo(i, location.pathname),
    noCelular: i.noCelular,
  }));
  const atual = MENU_MASTER.find((i) => itemMasterAtivo(i, location.pathname));
  const acoes: AcaoUsuario[] = [
    { id: "painel", rotulo: "Painel", icone: LayoutDashboard, aoTocar: () => navigate("/painel") },
    {
      id: "app-aluno",
      rotulo: "Meu app de aluno",
      icone: Smartphone,
      aoTocar: () => {
        lembrarArea("aluno");
        navigate("/");
      },
    },
    { id: "sair", rotulo: "Sair", icone: LogOut, perigo: true, aoTocar: () => void signOut() },
  ];

  return (
    <CascaWeb
      area="master"
      secoes={[{ itens }]}
      topoMenu={<CardMaster />}
      usuario={{ nome: dados.usuario.nome, fotoUrl: dados.usuario.fotoUrl, papelRotulo: "Master" }}
      acoesUsuario={acoes}
      tituloPadrao={atual ? `Master · ${atual.rotulo}` : "Master"}
    >
      <TransicaoDePagina>
        <Outlet />
      </TransicaoDePagina>
    </CascaWeb>
  );
}

/**
 * Página antiga do Calc que ficou (a Biblioteca global, W9/W23): ela lê o Banco do Treino. W27 (herdado da W16b): abrir o /master
 * direto (link, F5) antes da troca de token caía no /painel — a guarda antiga via "sem usuário do Treino" e redirecionava. Agora a
 * página espera a sessão do Treino no próprio lugar (carregando / erro com "Tentar de novo"), como as páginas antigas do painel (W5).
 */
function PaginaAntigaMaster({ item }: { item: ItemMenuMaster }) {
  const treino = useTreinoDaPagina();
  if (treino.tipo !== "ok") return <SemConexaoTreino estado={treino} />;
  const Antiga = item.antiga!;
  return (
    <MasterLayoutAntigo>
      <Carregavel nome={`${item.rotulo} (antiga)`}>
        <Antiga />
      </Carregavel>
    </MasterLayoutAntigo>
  );
}

/** Página do master: a nova (src/master/paginas/<arquivo>.tsx) quando existe; senão a antiga do Calc (só a Biblioteca, desde a W27). */
export function PaginaMaster({ id }: { id: string }) {
  const item = MENU_MASTER.find((i) => i.id === id);
  if (!item) return <NaoEncontrada voltarPara="/master" rotuloVoltar="Voltar ao master" />;
  const Nova = tela("paginasMaster", item.arquivo);
  if (Nova) {
    return (
      <Carregavel nome={item.arquivo}>
        <Nova />
      </Carregavel>
    );
  }
  if (!item.antiga) return <NaoEncontrada voltarPara="/master" rotuloVoltar="Voltar ao master" />;
  return <PaginaAntigaMaster item={item} />;
}
