import { lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSessao } from "@/nucleo/sessao";
import { destinoDepoisDoLogin } from "@/nucleo/situacao";
import AppAlunoLayout from "@/app-aluno/AppAlunoLayout";
import { RotaAba, RotaInicialApp, RotaItemPerfil } from "@/app-aluno/RotasApp";
import PublicoLayout from "@/publico/PublicoLayout";
import { CarregandoTela } from "@/ui/casca/CarregandoTela";
import { Carregavel } from "@/ui/casca/Carregavel";
import { NaoEncontrada } from "@/ui/casca/NaoEncontrada";
import { existe, registro, rotasDaEntrada, rotasDaPaginaPublica, tela } from "./registro";
import { ROTAS_ANTIGAS, destinoDaRotaAntiga } from "./redirecionamentos";

// Painel e master carregam sob demanda (o aluno não baixa nada deles); a abertura do app fica no JS inicial
const RotasPainel = lazy(() => import("@/painel/RotasPainel"));
const RotasMaster = lazy(() => import("@/master/RotasMaster"));
// Páginas públicas antigas (fallback até a W26)
const CalculadoraPublicaAntiga = lazy(() => import("@/pages/Index"));
const PrivacidadeAntiga = lazy(() => import("@/pages/PrivacidadePage"));

/** Rota antiga dos 2 apps → rota nova (spec 4.8), levando a query e o #. */
export function RedirecionarAntiga() {
  const { pathname, search, hash } = useLocation();
  const destino = destinoDaRotaAntiga(pathname, search, hash);
  return destino ? <Navigate to={destino} replace /> : <NaoEncontrada />;
}

/**
 * Entrada (/entrar, /entrar/email, /boas-vindas) — W3: login único no banco principal. Deslogado vê a tela de entrada;
 * logado vai para onde a situação manda (Boas-vindas para quem não tem nada; senão a página que pediu o login ou "/").
 * As Boas-vindas pedem login.
 */
export function RotaEntrada({ nome }: { nome: string }) {
  const { pronto, usuario, situacao, erroSituacao } = useSessao();
  const location = useLocation();
  if (!pronto) return <CarregandoTela />;
  const Nova = tela("entrada", nome);
  if (usuario && nome !== "BoasVindas") {
    if (!situacao && !erroSituacao) return <CarregandoTela texto="Entrando" />;
    const de = (location.state as { de?: string } | null)?.de;
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
  const publicas = Object.values(registro.publico);
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

      {/* Site do profissional e master */}
      <Route path="/painel/*" element={<Carregavel esqueleto={<CarregandoTela />} nome="painel"><RotasPainel /></Carregavel>} />
      <Route path="/master/*" element={<Carregavel esqueleto={<CarregandoTela />} nome="master"><RotasMaster /></Carregavel>} />

      {/* Rotas antigas do Calc e do Nutri */}
      {ROTAS_ANTIGAS.map((caminho) => (
        <Route key={caminho} path={caminho} element={<RedirecionarAntiga />} />
      ))}

      {/* Páginas públicas (sem login) */}
      <Route element={<PublicoLayout />}>
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
        {!existe("publico", "Calculadora") && (
          <Route path="/calculator" element={<Carregavel nome="calculadora (antiga)"><CalculadoraPublicaAntiga /></Carregavel>} />
        )}
        {!existe("publico", "Privacidade") && (
          <>
            <Route path="/privacidade" element={<Carregavel nome="privacidade (antiga)"><PrivacidadeAntiga /></Carregavel>} />
            <Route path="/termos" element={<Carregavel nome="termos (antiga)"><PrivacidadeAntiga /></Carregavel>} />
          </>
        )}
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
