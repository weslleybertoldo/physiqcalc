import { ListaDeAcessos } from "../acessos/ListaDeAcessos";
import { primeiroNome } from "../dados/regras";
import { usePerfilAluno } from "../dados/usePerfilAluno";
import CardAcessoAluno from "../resumo/acesso/CardAcessoAluno";

/**
 * Perfil do aluno › Acessos (W-A P4 — spec §4.1; P1–P4 do Weslley, 12/10/2026): depois de Financeiro, para todo aluno. À esquerda, "o
 * que ele pode no app" — uma linha por parte (Acesso ao app, Treino — séries, Dieta, Diário alimentar com fotos, Envio de fotos pelo link,
 * Rotinas), salvas na hora por QUALQUER profissional dele (src/painel/aluno/acessos/); à direita, o Login do aluno (o card que era do
 * Resumo, igual). No computador, 2 colunas; no celular, uma embaixo da outra (a barra de abas rola até a aba — AlunoLayout).
 * O nome vem do perfil (a mesma consulta do cabeçalho, já em cache).
 */
export default function Acessos({ alunoId }: { alunoId: string }) {
  const perfil = usePerfilAluno(alunoId).data;
  const nome = primeiroNome(perfil?.nome);
  return (
    <div className="flex flex-col gap-3.5" data-aba-acessos-aluno={alunoId}>
      <p className="text-[13px] leading-relaxed text-texto-2" data-acessos-topo>
        O que {nome || "o aluno"} pode fazer no app. Qualquer profissional dele (personal, nutricionista, dono da conta) muda; cada mudança
        fica registrada.
      </p>
      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ListaDeAcessos alunoId={alunoId} nome={perfil?.nome ?? null} />
        <CardAcessoAluno alunoId={alunoId} />
      </div>
    </div>
  );
}
