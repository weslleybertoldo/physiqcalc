import { Navigate } from "react-router-dom";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { Carregavel } from "@/ui/casca/Carregavel";
import { ModuloForaDoPlano } from "@/ui/casca/ModuloForaDoPlano";
import { NaoEncontrada } from "@/ui/casca/NaoEncontrada";
import { tela } from "@/rotas/registro";
import { estadoDoItem, itemPorId, modulosDaConta } from "./menu";

/**
 * Página de um item do menu: a de src/painel/paginas/<arquivo>.tsx; sem ela, escondida. W28: o fallback das páginas antigas do
 * Calc (dentro do AdminLayout antigo) e o aviso do site do Nutri saíram com o legado.
 */
export function PaginaPainel({ id }: { id: string }) {
  const dados = useDadosCasca();
  const item = itemPorId(id);
  if (!item) return <NaoEncontrada voltarPara="/painel" rotuloVoltar="Voltar ao painel" />;
  const modulos = modulosDaConta(dados.conta?.modulos);
  const estado = estadoDoItem(item, modulos);
  // W27 (herdado da W26, spec §9): a página é de um módulo que a conta não tem no plano
  if (estado === null && item.modulo !== "ambos" && !modulos.includes(item.modulo)) return <ModuloForaDoPlano modulo={item.modulo} ehDono={dados.ehDono} />;
  if (estado === "nova" && item.arquivo) {
    const Nova = tela("paginasPainel", item.arquivo);
    if (Nova) {
      return (
        <Carregavel nome={item.arquivo}>
          <Nova />
        </Carregavel>
      );
    }
  }
  // Dashboard ainda sem página nova: o /painel abre em Alunos, como o /admin antigo
  if (id === "dashboard") return <Navigate to="/painel/alunos" replace />;
  return <NaoEncontrada voltarPara="/painel" rotuloVoltar="Voltar ao painel" />;
}
