import { useEffect, type CSSProperties } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { gatesApp, listar } from "@/rotas/registro";
import { lembrarArea, ultimaArea } from "@/ui/casca/area";
import { CarregandoTela } from "@/ui/casca/CarregandoTela";
import { Carregavel } from "@/ui/casca/Carregavel";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { ComGates } from "@/ui/casca/Gates";
import { LimiteDeErro } from "@/ui/casca/LimiteDeErro";
import { TabBar } from "@/ui/premium/TabBar";
import { abaDaRota, abaDeAbertura, abasVisiveis } from "./catalogoAbas";

/** Faixas do topo da aba de abertura, na ordem da spec (a da mensalidade primeiro). */
const ORDEM_AVISOS = ["FaixaMensalidade"];

/** Espaço que a barra de abas ocupa embaixo (as telas antigas com `fixed bottom-*` sobem esse tanto). */
const RESERVA = "calc(66px + 26px + 12px + env(safe-area-inset-bottom, 0px))";

/**
 * Casca do app do aluno (tela 1): fundo com o halo violeta/verde, faixas do topo na aba de abertura,
 * travas registradas e a barra de abas flutuante embaixo (Início · Treino · Dieta · Evolução · Perfil;
 * as que ainda não têm tela — nova ou antiga — ou não são do módulo do aluno ficam de fora).
 */
export default function AppAlunoLayout() {
  const dados = useDadosCasca();
  const location = useLocation();
  const abas = abasVisiveis(dados.modulosAluno);
  const abertura = abaDeAbertura(dados.modulosAluno);
  const abaAtual = abaDaRota(location.pathname);
  const mostrarBarra = abas.length > 1;
  const naAbertura = abertura !== null && (abaAtual === abertura.id || (abertura.id === "inicio" && location.pathname === "/"));
  const vaiProPainel = location.pathname === "/" && dados.ehProfissional && ultimaArea() !== "aluno";

  useEffect(() => {
    if (dados.usuario && location.pathname !== "/") lembrarArea("aluno");
  }, [dados.usuario, location.pathname]);

  // as telas antigas com `fixed bottom-*` (descanso, "instalar", atualização) sobem acima da barra
  useEffect(() => {
    const raiz = document.documentElement;
    if (!mostrarBarra) return;
    raiz.setAttribute("data-casca", "aluno");
    raiz.style.setProperty("--casca-reserva-baixo", RESERVA);
    return () => {
      raiz.removeAttribute("data-casca");
      raiz.style.removeProperty("--casca-reserva-baixo");
    };
  }, [mostrarBarra]);

  if (dados.carregando) return <CarregandoTela />;
  if (!dados.usuario) return <Navigate to="/entrar" replace state={{ de: location.pathname + location.search }} />;
  if (vaiProPainel) return <Navigate to="/painel" replace />;

  const avisos = naAbertura ? listar("avisosApp", ORDEM_AVISOS) : [];

  return (
    <div data-casca-app className="relative isolate min-h-screen text-texto">
      <div aria-hidden className="pq-halo-app pointer-events-none fixed inset-0 -z-10" />
      <ComGates gates={gatesApp}>
        {avisos.length > 0 && (
          <div data-avisos-topo className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pt-[max(14px,env(safe-area-inset-top,0px))] sm:px-8">
            {avisos.map(({ nome, Componente }) => (
              <LimiteDeErro key={nome} silencioso nome={`aviso ${nome}`}>
                <Carregavel esqueleto={null}>
                  <Componente />
                </Carregavel>
              </LimiteDeErro>
            ))}
          </div>
        )}
        <div
          data-aba-conteudo={abaAtual ?? ""}
          className={mostrarBarra ? "pb-[var(--reserva-abas)]" : undefined}
          style={mostrarBarra ? ({ "--reserva-abas": RESERVA } as CSSProperties) : undefined}
        >
          <LimiteDeErro nome={`aba ${abaAtual ?? location.pathname}`}>
            <Outlet />
          </LimiteDeErro>
        </div>
      </ComGates>
      {mostrarBarra && (
        <TabBar
          rotulo="Abas do app"
          itens={abas.map((a) => ({ id: a.id, rotulo: a.rotulo, icone: a.icone, para: a.rota, ativo: abaAtual === a.id }))}
        />
      )}
    </div>
  );
}
