import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSessao } from "@/nucleo/sessao";
import { destinoDepoisDoLogin } from "@/nucleo/situacao";
import { destinoDaEntrada } from "@/lib/linksDoApp";
import { masterNesteAparelho } from "@/lib/plataforma";
import AppAlunoLayout from "@/app-aluno/AppAlunoLayout";
import { RotaAba, RotaInicialApp, RotaItemPerfil } from "@/app-aluno/RotasApp";
import PublicoLayout from "@/publico/PublicoLayout";
import { CarregandoTela } from "@/ui/casca/CarregandoTela";
import { Carregavel } from "@/ui/casca/Carregavel";
import { NaoEncontrada } from "@/ui/casca/NaoEncontrada";
import { EstadoCarregando } from "@/ui/premium/Estados";
import { registro, rotasDaEntrada, rotasDaPaginaPublica, tela } from "./registro";
import { ROTAS_ANTIGAS, destinoDaRotaAntiga } from "./redirecionamentos";

// Painel e master carregam sob demanda (o aluno não baixa nada deles); a abertura do app fica no JS inicial
const RotasPainel = lazy(() => import("@/painel/RotasPainel"));
// hml-08 (H-22): o master é só do site. No build do app (VITE_APP_NATIVO=1) o Vite troca o import.meta.env.VITE_APP_NATIVO pelo
// valor e o Rollup corta o import(): o código do master nem entra no bundle (src/lib/plataforma.ts). A expressão fica AQUI, sem
// função no meio.
const RotasMaster = import.meta.env.VITE_APP_NATIVO === "1" ? null : lazy(() => import("@/master/RotasMaster"));
// hml-10 (H-26 e H-48, D5): /erro-teste — a página que quebra o app de propósito (as 2 telas de erro e os avisos) — SÓ no build de
// staging. O Vite troca o import.meta.env.VITE_DB_SCHEMA pelo valor e, na produção, o Rollup corta o import(): a página nem entra no
// bundle (o mesmo jeito do master na hml-08; a expressão fica AQUI, direto na condição, sem função no meio).
const ErroDeTeste = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/ErroDeTeste")) : null;
// hml-11 (H-28, D4): os textos legais NOVOS (Política, Termos de Uso e Termos de assinatura — src/publico/legal/) esperam o advogado:
// até a virada (D12), /privacidade, /termos e /assinatura com eles SÓ no build de staging. Na produção o Rollup corta o import() (o
// texto novo nem entra no bundle; scripts/ci/sem-texto-legal-novo.sh confere) e as 2 primeiras seguem com a Privacidade de hoje. A
// expressão fica AQUI, direto na condição, sem função no meio (o mesmo jeito do master na hml-08 e da /erro-teste na hml-10).
const PaginaLegal = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/legal/PaginaLegal")) : null;
// W26: /calculator, /privacidade e /termos são as páginas novas (src/publico/{Calculadora,Privacidade}.tsx, pelo registro) — as antigas saíram

/** Rota antiga dos 2 apps → rota nova (spec 4.8), levando a query e o #. */
export function RedirecionarAntiga() {
  const { pathname, search, hash } = useLocation();
  const destino = destinoDaRotaAntiga(pathname, search, hash);
  return destino ? <Navigate to={destino} replace /> : <NaoEncontrada />;
}

/**
 * Entrada (/entrar, /entrar/email, /boas-vindas) — W3: login único no banco principal. Deslogado vê a tela de entrada;
 * logado vai para onde a situação manda (Boas-vindas para quem não tem nada; senão a página que pediu o login ou "/").
 * As Boas-vindas pedem login. H2: sem a página que pediu o login (o "Entrar com e-mail e senha" e a volta do Google a perdem),
 * vale o destino do link do e-mail/aviso guardado no APK ou no navegador (src/lib/linksDoApp.ts).
 */
export function RotaEntrada({ nome }: { nome: string }) {
  const { pronto, usuario, situacao, erroSituacao } = useSessao();
  const location = useLocation();
  if (!pronto) return <CarregandoTela />;
  const Nova = tela("entrada", nome);
  if (usuario && nome !== "BoasVindas") {
    if (!situacao && !erroSituacao) return <CarregandoTela texto="Entrando" />;
    const de = destinoDaEntrada((location.state as { de?: string } | null)?.de);
    return <Navigate to={destinoDepoisDoLogin(situacao, de)} replace />;
  }
  if (!usuario && nome === "BoasVindas") return <Navigate to="/entrar" replace />;
  if (!Nova) return <NaoEncontrada />;
  return (
    <Carregavel nome={`entrada ${nome}`}>
      <Nova />
    </Carregavel>
  );
}

/**
 * Todas as rotas do Physiq (spec 4.8): app do aluno (5 abas), entrada, painel, master, páginas
 * públicas e os redirecionamentos das rotas antigas. As telas entram pelo registro por convenção.
 */
export function Rotas() {
  // hml-11 (D4): com a página legal nova (só no staging), /privacidade e /termos são dela — a Privacidade de hoje sai das públicas,
  // para nenhuma rota ter 2 donos
  const publicas = Object.values(registro.publico).filter((r) => !(PaginaLegal && r.nome === "Privacidade"));
  return (
    <Routes>
      {/* App do aluno */}
      <Route element={<AppAlunoLayout />}>
        <Route path="/" element={<RotaInicialApp />} />
        <Route path="/treino" element={<RotaAba id="treino" />} />
        <Route path="/dieta" element={<RotaAba id="dieta" />} />
        <Route path="/evolucao" element={<RotaAba id="evolucao" />} />
        <Route path="/perfil" element={<RotaAba id="perfil" />} />
        <Route path="/perfil/:item" element={<RotaItemPerfil />} />
      </Route>

      {/* Entrada */}
      <Route path="/entrar" element={<RotaEntrada nome="Entrar" />} />
      <Route path="/entrar/email" element={<RotaEntrada nome="EntrarEmail" />} />
      <Route path="/boas-vindas" element={<RotaEntrada nome="BoasVindas" />} />
      {Object.values(registro.entrada)
        .filter((r) => !["Entrar", "EntrarEmail", "BoasVindas"].includes(r.nome))
        .map((r) => (
          <Route key={r.nome} path={rotasDaEntrada(r.nome)} element={<RotaEntrada nome={r.nome} />} />
        ))}

      {/* Site do profissional e master (hml-08: o master só no site — no app, /master… cai em "Página não encontrada") */}
      <Route path="/painel/*" element={<Carregavel esqueleto={<CarregandoTela />} nome="painel"><RotasPainel /></Carregavel>} />
      {RotasMaster && masterNesteAparelho() && (
        <Route path="/master/*" element={<Carregavel esqueleto={<CarregandoTela />} nome="master"><RotasMaster /></Carregavel>} />
      )}

      {/* Rotas antigas do Calc e do Nutri */}
      {ROTAS_ANTIGAS.map((caminho) => (
        <Route key={caminho} path={caminho} element={<RedirecionarAntiga />} />
      ))}

      {/* Páginas públicas (sem login) */}
      <Route element={<PublicoLayout />}>
        {/* hml-10: só no staging e SEM o Carregavel — "quebrar a tela" tem que chegar ao ErrorBoundary de dentro do App (S1) */}
        {ErroDeTeste && (
          <Route
            path="/erro-teste"
            element={
              <Suspense fallback={<EstadoCarregando />}>
                <ErroDeTeste />
              </Suspense>
            }
          />
        )}
        {/* hml-11 (D4): os textos legais novos, só no staging até a virada (a faixa "versão em revisão" fica na página) */}
        {PaginaLegal &&
          ["/privacidade", "/termos", "/assinatura"].map((caminho) => (
            <Route
              key={caminho}
              path={caminho}
              element={
                <Carregavel nome="página legal">
                  <PaginaLegal />
                </Carregavel>
              }
            />
          ))}
        {publicas.flatMap((r) =>
          rotasDaPaginaPublica(r.nome).map((caminho) => (
            <Route
              key={caminho}
              path={caminho}
              element={
                <Carregavel nome={`pública ${r.nome}`}>
                  <r.Componente />
                </Carregavel>
              }
            />
          )),
        )}
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
