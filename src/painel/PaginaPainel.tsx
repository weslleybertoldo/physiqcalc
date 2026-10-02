import { Navigate } from "react-router-dom";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { AvisoUseNutri } from "@/ui/casca/AvisoUseNutri";
import { Carregavel } from "@/ui/casca/Carregavel";
import { ModuloForaDoPlano } from "@/ui/casca/ModuloForaDoPlano";
import { NaoEncontrada } from "@/ui/casca/NaoEncontrada";
import { tela } from "@/rotas/registro";
import AdminLayout from "@/layouts/AdminLayout";
import { estadoDoItem, itemPorId, modulosDaConta } from "./menu";

/**
 * Página de um item do menu: a nova (src/painel/paginas/<arquivo>.tsx) quando existe; senão a antiga
 * do Calc dentro do AdminLayout antigo (trava e faixa de plano de hoje); só Nutrição = aviso do site
 * do Nutri; nem nova nem antiga = escondida.
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
  if (estado === "antiga" && item.antiga) {
    const Antiga = item.antiga;
    return (
      <AdminLayout>
        <Carregavel nome={`${item.rotulo} (antiga)`}>
          <Antiga />
        </Carregavel>
      </AdminLayout>
    );
  }
  if (estado === "nutri") return <AvisoUseNutri pagina={item.rotulo} />;
  // Dashboard ainda sem página nova: o /painel abre em Alunos, como o /admin antigo
  if (id === "dashboard") return <Navigate to="/painel/alunos" replace />;
  return <NaoEncontrada voltarPara="/painel" rotuloVoltar="Voltar ao painel" />;
}
