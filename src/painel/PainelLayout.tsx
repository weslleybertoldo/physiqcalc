import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { masterNesteAparelho } from "@/lib/plataforma";
import { contadoresPainel, fontesBusca, gatesPainel } from "@/rotas/registro";
import { lembrarArea } from "@/ui/casca/area";
import { CarregandoTela } from "@/ui/casca/CarregandoTela";
import { CascaWeb, type AcaoUsuario, type ItemNav, type SecaoNav } from "@/ui/casca/CascaWeb";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { ComGates } from "@/ui/casca/Gates";
import { LimiteDeErro } from "@/ui/casca/LimiteDeErro";
import { CardConta } from "./casca/CardConta";
import { CardPlano } from "./casca/CardPlano";
import { MENU_PAINEL, estadoDoItem, itemAtivo, modulosDaConta } from "./menu";

/** Números do menu registrados em src/painel/contadores/<Item>.ts (a lista é fixa no build). */
function useContadoresRegistrados(): Record<string, number | undefined> {
  const saida: Record<string, number | undefined> = {};
  for (const [nome, useContador] of Object.entries(contadoresPainel)) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a lista vem do import.meta.glob: mesma ordem em todo render
    saida[nome] = useContador();
  }
  return saida;
}

/**
 * Casca do site do profissional (/painel/*): menu da tela 6 com fallback para as páginas antigas do
 * Calc (spec 11.1), travas registradas em src/painel/gates e o topo com busca e sino.
 */
export default function PainelLayout() {
  const dados = useDadosCasca();
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const contadores = useContadoresRegistrados();

  useEffect(() => {
    if (dados.usuario && dados.ehProfissional) lembrarArea("painel");
  }, [dados.usuario, dados.ehProfissional]);

  if (dados.carregando) return <CarregandoTela />;
  if (!dados.usuario) return <Navigate to="/entrar" replace state={{ de: location.pathname + location.search }} />;
  if (!dados.ehProfissional) return <Navigate to="/" replace />;

  const modulos = modulosDaConta(dados.conta?.modulos);
  const nav = (grupo: "principal" | "ferramentas"): ItemNav[] =>
    MENU_PAINEL.filter((i) => i.grupo === grupo && estadoDoItem(i, modulos) !== null).map((i) => ({
      id: i.id,
      rotulo: i.rotulo,
      icone: i.icone,
      para: i.rota,
      ativo: itemAtivo(i, location.pathname),
      contador: (i.arquivo ? (contadores[i.arquivo] ?? dados.contadores[i.arquivo]) : undefined) || undefined,
      contadorTom: i.contadorTom,
      ponto: i.modulo === "ambos" ? undefined : i.modulo,
      noCelular: i.noCelular,
    }));
  const secoes: SecaoNav[] = [{ itens: nav("principal") }, { titulo: "Ferramentas", itens: nav("ferramentas") }];
  const atual = MENU_PAINEL.find((i) => itemAtivo(i, location.pathname));

  const acoes: AcaoUsuario[] = [
    {
      id: "app-aluno",
      rotulo: "Meu app de aluno",
      icone: Smartphone,
      aoTocar: () => {
        lembrarArea("aluno");
        navigate("/");
      },
    },
    // hml-08 (H-22): o painel master é só do site — no app, o item some
    ...(dados.ehMaster && masterNesteAparelho() ? [{ id: "master", rotulo: "Master", icone: ShieldCheck, aoTocar: () => navigate("/master") }] : []),
    { id: "sair", rotulo: "Sair", icone: LogOut, perigo: true, aoTocar: () => void signOut() },
  ];

  return (
    <CascaWeb
      area="painel"
      secoes={secoes}
      topoMenu={dados.conta ? <CardConta conta={dados.conta} contas={dados.contas} trocarConta={dados.trocarConta} /> : null}
      rodapeMenu={<CardPlano plano={dados.plano} />}
      usuario={{ nome: dados.usuario.nome, fotoUrl: dados.usuario.fotoUrl, papelRotulo: dados.papelRotulo }}
      acoesUsuario={acoes}
      tituloPadrao={atual?.rotulo ?? "Painel"}
      fontesBusca={(termo, fechar) =>
        Object.entries(fontesBusca).map(([nome, Fonte]) => (
          <LimiteDeErro key={nome} silencioso nome={`busca ${nome}`}>
            <Fonte termo={termo} fechar={fechar} />
          </LimiteDeErro>
        ))
      }
    >
      <ComGates gates={gatesPainel}>
        <Outlet />
      </ComGates>
    </CascaWeb>
  );
}
