import { lazy, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { sobDemanda } from "@/lib/sobDemanda";
import { gatesApp, listar, registro } from "@/rotas/registro";
import { useAquecerTelaDoEndereco, usePreCarga } from "@/rotas/usePreCarga";
import { cn } from "@/lib/utils";
import { lembrarArea, ultimaArea } from "@/ui/casca/area";
import { CarregandoTela } from "@/ui/casca/CarregandoTela";
import { Carregavel } from "@/ui/casca/Carregavel";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { ComGates } from "@/ui/casca/Gates";
import { LimiteDeErro } from "@/ui/casca/LimiteDeErro";
import { TransicaoDePagina } from "@/ui/casca/TransicaoDePagina";
import { EstadoCarregando } from "@/ui/premium/Estados";
import { TabBar } from "@/ui/premium/TabBar";
import { ABAS_APP, abaDaRota, abaDeAbertura, abasVisiveis } from "./catalogoAbas";

/**
 * hml-18b (H-54, F) — o banco local do treino (PowerSync: ~270 KB + o worker + o wasm do SQLite) num pedaço próprio, carregado só
 * aqui, no app do aluno (antes vinha na entrada de TODA página, inclusive as públicas e o painel). O provedor fica em volta das
 * travas e das abas: nenhum hook do PowerSync roda antes de ele existir (risco 8 da spec) — enquanto chega, o conteúdo mostra um
 * esqueleto e a barra de abas já aparece.
 */
type Provedor = (props: { children: ReactNode }) => ReactNode;
let provedorPronto: Provedor | null = null;
const BANCO_LOCAL = sobDemanda(() =>
  import("@/lib/powersync/PowerSyncProvider").then((m) => {
    provedorPronto = m.PowerSyncProvider;
    return m;
  }),
);
const ProvedorBancoLocal = lazy(() => BANCO_LOCAL.obter().then((m) => ({ default: m.PowerSyncProvider })));

/**
 * O provedor do banco local: se o pedaço já chegou (o aquecimento do 1º render), entra direto — o lazy() suspenderia 1 vez mesmo assim
 * (~60 ms de esqueleto, medido); senão, pelo lazy (o esqueleto até ele chegar). A escolha é feita na montagem e não muda depois (trocar o
 * tipo do componente remontaria as abas) — o mesmo jeito do `telaRegistrada` do registro (hml-18a).
 */
function BancoLocal({ children }: { children: ReactNode }) {
  const [P] = useState<Provedor>(() => provedorPronto ?? ProvedorBancoLocal);
  return <P>{children}</P>;
}

/** O lugar do conteúdo enquanto o banco local chega (o mesmo recuo das abas). */
function EsqueletoBancoLocal() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-[max(14px,env(safe-area-inset-top,0px))] sm:px-8" data-banco-local="carregando">
      <EstadoCarregando linhas={4} rotulo="Abrindo o app" />
    </div>
  );
}

/** Faixas do topo da aba de abertura, na ordem da spec (hml-17: a "não deu para carregar a sua conta" antes de todas; depois a da
 *  mensalidade). */
const ORDEM_AVISOS = ["FaixaContaNaoCarregou", "FaixaMensalidade"];

/**
 * As faixas do topo (src/app-aluno/avisos/<Aviso>.tsx — a da mensalidade, W6/C85). A casca é a dona delas: o Início (W12) as
 * põe logo abaixo da saudação, como na tela 1; sem o Início, a casca as mostra no alto da aba de abertura. Faixa que não tem o
 * que mostrar não deixa espaço (a caixa vazia some — era o espaço a mais no topo da W11).
 */
export function AvisosDoTopo({ className }: { className?: string }) {
  const avisos = listar("avisosApp", ORDEM_AVISOS);
  if (avisos.length === 0) return null;
  return (
    <div data-avisos-topo className={cn("flex flex-col gap-3 empty:hidden", className)}>
      {avisos.map(({ nome, Componente }) => (
        <LimiteDeErro key={nome} silencioso nome={`aviso ${nome}`}>
          <Carregavel esqueleto={null}>
            <Componente />
          </Carregavel>
        </LimiteDeErro>
      ))}
    </div>
  );
}

/** Espaço que a barra de abas ocupa embaixo (as telas antigas com `fixed bottom-*` sobem esse tanto). */
const RESERVA = "calc(66px + 26px + 12px + env(safe-area-inset-bottom, 0px))";

/**
 * Casca do app do aluno (tela 1): fundo com o halo violeta/verde, faixas do topo na aba de abertura (desde a W12 o Início,
 * que as mostra abaixo da saudação), travas registradas e a barra de abas flutuante embaixo (Início · Treino · Dieta ·
 * Evolução · Perfil; as que ainda não têm tela — nova ou antiga — ou não são do módulo do aluno ficam de fora).
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

  // hml-18b (H-54, F): o banco local começa a baixar já no 1º render, junto com a sessão — só com login (a sessão principal: o paciente
  // sem Treino também precisa do provedor) e para quem fica no app (quem abre o "/" vindo do painel espera os dados dizerem se vai
  // para lá; quem não tem login vai para a /entrar sem baixar nada)
  const comSessao = !!dados.usuario;
  const esperarArea = dados.carregando && location.pathname === "/" && ultimaArea() !== "aluno";
  useEffect(() => {
    if (comSessao && !vaiProPainel && !esperarArea) BANCO_LOCAL.aquecer();
  }, [comSessao, vaiProPainel, esperarArea]);
  // hml-18b (H-54, F): a aba do endereço (e, no Início, os cards) também começa a baixar já — monta direto quando a sessão chega
  const abaDoEndereco = ABAS_APP.find((a) => a.rota === location.pathname);
  useAquecerTelaDoEndereco(
    abaDoEndereco ? [registro.abasApp[abaDoEndereco.arquivo], ...(abaDoEndereco.id === "inicio" ? Object.values(registro.inicioApp) : [])] : [],
    comSessao && !vaiProPainel,
  );

  // hml-18a (H-40, E): depois do 1º render do app, no ocioso, as 5 abas, os itens do Perfil e os cards do Início (a troca de aba não
  // espera o pedaço chegar)
  usePreCarga("app", { ligado: !dados.carregando && !!dados.usuario && !vaiProPainel });

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

  // o Início (W12) põe as faixas abaixo da saudação (tela 1); as outras abas de abertura, no alto
  const avisosNoAlto = naAbertura && abertura?.id !== "inicio";

  return (
    <div data-casca-app className="relative isolate min-h-screen text-texto">
      <div aria-hidden className="pq-halo-app pointer-events-none fixed inset-0 -z-10" />
      <Carregavel nome="banco local do app" esqueleto={<EsqueletoBancoLocal />}>
        <BancoLocal>
          <ComGates gates={gatesApp}>
            {avisosNoAlto && <AvisosDoTopo className="mx-auto max-w-3xl px-4 pt-[max(14px,env(safe-area-inset-top,0px))] sm:px-8" />}
            <div
              data-aba-conteudo={abaAtual ?? ""}
              className={mostrarBarra ? "pb-[var(--reserva-abas)]" : undefined}
              style={mostrarBarra ? ({ "--reserva-abas": RESERVA } as CSSProperties) : undefined}
            >
              <LimiteDeErro nome={`aba ${abaAtual ?? location.pathname}`}>
                <TransicaoDePagina>
                  <Outlet />
                </TransicaoDePagina>
              </LimiteDeErro>
            </div>
          </ComGates>
        </BancoLocal>
      </Carregavel>
      {mostrarBarra && (
        <TabBar
          rotulo="Abas do app"
          itens={abas.map((a) => ({ id: a.id, rotulo: a.rotulo, icone: a.icone, para: a.rota, ativo: abaAtual === a.id }))}
        />
      )}
    </div>
  );
}
