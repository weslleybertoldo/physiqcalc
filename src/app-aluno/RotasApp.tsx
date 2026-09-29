import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { registro, slug, tela } from "@/rotas/registro";
import { Carregavel } from "@/ui/casca/Carregavel";
import { NaoEncontrada } from "@/ui/casca/NaoEncontrada";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { ABAS_APP, abaDeAbertura, estadoDaAba, type AbaApp } from "./catalogoAbas";

/** Uma aba do app: a nova quando existe; senão a antiga; sem nenhuma (ou sem o módulo), a de abertura. */
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
  if (estado === "antiga" && aba.antiga) {
    const Antiga = aba.antiga;
    return (
      <Carregavel nome={`${aba.rotulo} (antiga)`}>
        <Antiga />
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

/** Telas antigas que respondem por itens do Perfil enquanto a nova não chega (sob demanda: o SDK do Mercado Pago pesa). */
const PERFIL_ANTIGO: Record<string, LazyExoticComponent<ComponentType>> = {
  pagamentos: lazy(() => import("@/pages/PagamentosPage")),
};

/** /perfil/<item>: a tela nova de src/app-aluno/perfil/<Item>.tsx; senão a antiga (Pagamentos); senão o app. */
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
  const Antiga = PERFIL_ANTIGO[item];
  if (Antiga) {
    return (
      <Carregavel nome={`perfil ${item} (antiga)`}>
        <Antiga />
      </Carregavel>
    );
  }
  return <Navigate to="/" replace />;
}
