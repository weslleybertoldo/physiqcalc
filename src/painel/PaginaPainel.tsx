import { Navigate } from "react-router-dom";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { AvisoUseNutri } from "@/ui/casca/AvisoUseNutri";
import { Carregavel } from "@/ui/casca/Carregavel";
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
  const estado = estadoDoItem(item, modulosDaConta(dados.conta?.modulos));
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
