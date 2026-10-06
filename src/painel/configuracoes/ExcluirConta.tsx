import { TopoPagina } from "@/ui/casca/topo";
import { FluxoExclusao } from "./excluirConta/FluxoExclusao";

/**
 * Configurações › Excluir minha conta (W2 da loja — a Google Play exige excluir a conta dentro do app e por uma página web). Para
 * todo profissional do painel: o DONO (conta encerrada, alunos com login vão para o app, equipe sem acesso, cobrança automática
 * cancelada, prontuários baixados antes) e o MEMBRO de equipe (sai da equipe; os alunos dele ficam sem responsável na conta do
 * dono). O master é recusado. Abre também com o painel travado (plano vencido/suspenso — GatePlano). A mesma exclusão pelo site:
 * /excluir-conta → "Entrar para excluir" → cai aqui.
 */
export default function ExcluirConta() {
  return (
    <div data-config-aba="excluir-conta" className="flex max-w-[760px] flex-col gap-3.5">
      <TopoPagina titulo="Excluir minha conta" subtitulo="Confira antes de confirmar" />
      <FluxoExclusao />
    </div>
  );
}
