import { Navigate, useParams } from "react-router-dom";
import { registro, slug, tela } from "@/rotas/registro";
import { Carregavel } from "@/ui/casca/Carregavel";
import { NaoEncontrada } from "@/ui/casca/NaoEncontrada";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { ABAS_APP, abaDeAbertura, estadoDaAba, type AbaApp } from "./catalogoAbas";

/** Uma aba do app: a registrada; sem ela (ou sem o módulo), a de abertura. */
export function RotaAba({ id }: { id: AbaApp["id"] }) {
  const { modulosAluno } = useDadosCasca();
  const aba = ABAS_APP.find((a) => a.id === id)!;
  const estado = estadoDaAba(aba, modulosAluno);
  if (estado === "nova") {
    const Nova = tela("abasApp", aba.arquivo)!;
    return (
      <Carregavel nome={`aba ${aba.arquivo}`}>
        <Nova />
      </Carregavel>
    );
  }
  const abertura = abaDeAbertura(modulosAluno);
  if (!abertura || abertura.id === id) return <NaoEncontrada />;
  return <Navigate to={abertura.rota} replace />;
}

/** "/" = Início (W12); antes dele, abre direto na primeira aba disponível (Treino para o aluno do Calc). */
export function RotaInicialApp() {
  const { modulosAluno } = useDadosCasca();
  const abertura = abaDeAbertura(modulosAluno);
  if (abertura?.id === "inicio") return <RotaAba id="inicio" />;
  if (!abertura) return <NaoEncontrada />;
  return <Navigate to={abertura.rota} replace />;
}

/** /perfil/<item>: a tela de src/app-aluno/perfil/<Item>.tsx; senão o app. W28: o fallback antigo (a PagamentosPage) saiu. */
export function RotaItemPerfil() {
  const { item = "" } = useParams();
  const registrado = Object.values(registro.perfilApp).find((r) => slug(r.nome) === item);
  if (registrado) {
    const Nova = registrado.Componente;
    return (
      <Carregavel nome={`perfil ${registrado.nome}`}>
        <Nova />
      </Carregavel>
    );
  }
  return <Navigate to="/" replace />;
}
