import { Dumbbell, Eye, KeyRound, UserRoundX } from "lucide-react";
import { Link } from "react-router-dom";
import { EditorTreino } from "@/treino/editor/EditorTreino";
import { HistoricoDoAluno, RelatorioDoAluno, SeriesETroca, VolumeDoAluno } from "@/treino/editor/Secoes";
import { SemanaDoAluno } from "@/treino/editor/SemanaDoAluno";
import { useTreinoDoAlunoPainel } from "@/treino/editor/useTreinoDoAlunoPainel";
import { mensagemDoErro } from "@/treino/editor/useEditorTreino";
import { SemConexaoTreino } from "@/ui/casca/SemConexaoTreino";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";

/**
 * Perfil do aluno › Treino (W15 — spec 4.5, tela 8 lado esquerdo; C37–C39, C41, C45, C84, NF1, NF2, NF7): o editor do treino
 * (treinos A/B/C, exercícios com séries, repetições, descanso e carga, observação, cadeado, descanso padrão, alternado) e, em
 * volta, a semana do aluno com os extras, o nº de séries padrão × por exercício e a troca do treino, o volume semanal, o
 * histórico e o relatório do mês (PDF e Excel) com o PDF do treino. Grava no Banco do Treino (o aluno vê pelo PowerSync).
 * Substitui os grupos Treino e Configuração do "Configurar aluno" antigo (os componentes antigos ficam até a W28).
 */
export default function Treino({ alunoId }: { alunoId: string }) {
  const est = useTreinoDoAlunoPainel(alunoId);
  const base = `/painel/alunos/${encodeURIComponent(alunoId)}`;

  if (est.tipo === "carregando") return <EstadoCarregando linhas={4} rotulo="Abrindo o treino do aluno" />;
  if (est.tipo === "sem-sessao") return <SemConexaoTreino estado={est.estado} />;
  if (est.tipo === "erro") return <EstadoErro titulo="Não deu para abrir o treino" texto={mensagemDoErro(est.erro)} aoTentar={est.tentar} />;
  if (est.tipo === "sem-modulo") {
    return <EstadoVazio icone={Dumbbell} titulo="Este aluno não tem treino" texto="O treino aparece aqui quando ele tiver um personal responsável numa conta com o módulo Treino." />;
  }
  if (est.tipo === "sem-acesso") {
    return <EstadoVazio icone={UserRoundX} titulo="Treino de outro personal" texto="Só o personal responsável por este aluno e o dono da conta veem o treino dele." />;
  }
  if (est.tipo === "sem-login") {
    return (
      <EstadoVazio
        icone={KeyRound}
        titulo="O treino nasce no 1º acesso do aluno"
        texto={
          est.temLogin
            ? "O aluno ainda não abriu o app. Assim que ele entrar pela primeira vez, você monta o treino aqui."
            : "O aluno ainda não tem acesso ao app. Crie o acesso no Resumo (Acesso do aluno) e, depois do 1º login dele, monte o treino aqui."
        }
        acao={!est.temLogin ? <Link to={base} className="text-[13px] font-semibold text-violeta-3">Ir para o Resumo</Link> : undefined}
      />
    );
  }

  if (est.tipo === "leitura") {
    // W16: a nutricionista vê o treino só para ler (spec 4.1), pelo principal — sem sessão nem escrita no Treino
    const { perfil: pf } = est;
    return (
      <div className="flex flex-col gap-3.5" data-aba-treino-aluno="leitura" data-somente-leitura>
        <div className="flex items-center gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5 text-[13px] text-texto-2" data-treino-so-ver>
          <Eye aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
          Você vê o treino de {pf.nome.split(" ")[0]}; quem muda é {pf.personal?.nome ? `o personal responsável (${pf.personal.nome})` : "o personal responsável"}.
        </div>
        <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <EditorTreino treinoUserId="" leituraAluno={est.alunoId} somenteLeitura nomeAluno={pf.nome} />
          <VolumeDoAluno treinoUserId="" leituraAluno={est.alunoId} />
        </div>
      </div>
    );
  }

  const { treinoUserId, somenteLeitura, perfil } = est;
  const irParaSemana = () => document.getElementById("semana-do-aluno")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="flex flex-col gap-3.5" data-aba-treino-aluno={treinoUserId} data-somente-leitura={somenteLeitura || undefined}>
      {somenteLeitura && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5 text-[13px] text-texto-2" data-treino-so-ver>
          <Eye aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
          Você vê o treino de {perfil.nome.split(" ")[0]}; quem muda é {perfil.personal?.nome ? `o personal responsável (${perfil.personal.nome})` : "o personal responsável"}.
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <EditorTreino treinoUserId={treinoUserId} somenteLeitura={somenteLeitura} nomeAluno={perfil.nome} aoAbrirSemana={irParaSemana} />
        <div className="flex min-w-0 flex-col gap-3.5">
          <SemanaDoAluno treinoUserId={treinoUserId} somenteLeitura={somenteLeitura} id="semana-do-aluno" />
          <SeriesETroca treinoUserId={treinoUserId} somenteLeitura={somenteLeitura} />
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        <VolumeDoAluno treinoUserId={treinoUserId} />
        <HistoricoDoAluno treinoUserId={treinoUserId} />
        <RelatorioDoAluno treinoUserId={treinoUserId} nomeAluno={perfil.nome} />
      </div>
    </div>
  );
}
