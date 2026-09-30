import { useMemo } from "react";
import { Link } from "react-router-dom";
import { BarrasVolume } from "@/treino/editor/Secoes";
import { resumoSemanaDoAluno, volumePorGrupo } from "@/treino/editor/regras";
import { useDadosEditor, useSemanaAtual, useVolumeDoAluno } from "@/treino/editor/useEditorTreino";
import { useTreinoDoAlunoPainel } from "@/treino/editor/useTreinoDoAlunoPainel";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";

function Moldura({ alunoId, extra, children }: { alunoId: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-treino>
      <CabecalhoCartao
        titulo="Treino"
        extra={extra}
        acao={<Link to={`/painel/alunos/${encodeURIComponent(alunoId)}/treino`} className="text-[12.5px] font-semibold text-violeta-3" data-card-treino-abrir>Abrir</Link>}
      />
      {children}
    </Cartao>
  );
}

function Conteudo({ alunoId, treinoUserId }: { alunoId: string; treinoUserId: string }) {
  const dados = useDadosEditor(treinoUserId);
  const semana = useSemanaAtual(treinoUserId);
  const volume = useVolumeDoAluno(treinoUserId);
  const resumo = useMemo(() => (dados.data ? resumoSemanaDoAluno(dados.data, semana.data) : null), [dados.data, semana.data]);
  const grupos = useMemo(() => volumePorGrupo(volume.data ?? []), [volume.data]);
  const comLetra = dados.treinos.filter((t) => t.letra);
  const chips = (comLetra.length ? comLetra : dados.treinos).slice(0, 4);
  return (
    <Moldura
      alunoId={alunoId}
      extra={resumo && resumo.total > 0 ? <Chip tom="t" data-card-treino-semana={`${resumo.feitos}/${resumo.total}`}>{resumo.feitos} DE {resumo.total} NA SEMANA</Chip> : undefined}
    >
      {dados.isLoading ? (
        <Esqueleto className="h-[150px] w-full" />
      ) : !dados.data ? (
        <p className="text-[12.5px] text-texto-3">Não deu para carregar agora.</p>
      ) : dados.treinos.length === 0 ? (
        <p className="text-[12.5px] text-texto-3" data-card-treino-vazio>Ainda sem treino. Monte na aba Treino.</p>
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap gap-[5px]" data-card-treino-treinos>
            {chips.map((t) => (
              <span key={t.chave} className="whitespace-nowrap rounded-[9px] border border-linha bg-[rgba(255,255,255,.04)] px-[7px] py-1 text-[11.5px] font-semibold tracking-[-0.005em] text-texto-2" data-card-treino-treino={t.rotulo}>
                {t.rotulo}
              </span>
            ))}
            {dados.treinos.length > chips.length && <span className="px-1 py-1 text-[12px] text-texto-3">+{dados.treinos.length - chips.length}</span>}
          </div>
          <div className="mb-2 text-[12.5px] text-texto-2">Séries por semana, por grupo</div>
          {volume.isLoading ? (
            <Esqueleto className="h-[110px] w-full" />
          ) : grupos.length === 0 ? (
            <p className="text-[12px] text-texto-3" data-card-treino-sem-volume>Monte a semana do aluno para ver as séries.</p>
          ) : (
            <BarrasVolume grupos={grupos} maximo={5} />
          )}
        </>
      )}
    </Moldura>
  );
}

/**
 * Card "Treino" do Resumo do aluno (tela 7 — W15): "N de M na semana" (a mesma conta da aba Treino do app), os treinos A/B/C
 * e as séries por semana por grupo (a mesma conta da seção Volume da aba Treino do perfil). Só para aluno com o módulo Treino.
 */
export default function CardTreino({ alunoId }: { alunoId: string }) {
  const est = useTreinoDoAlunoPainel(alunoId);
  if (est.tipo === "sem-modulo" || est.tipo === "sem-acesso") return null;
  if (est.tipo === "ok") return <Conteudo alunoId={alunoId} treinoUserId={est.treinoUserId} />;
  return (
    <Moldura alunoId={alunoId}>
      {est.tipo === "carregando" ? (
        <Esqueleto className="h-[150px] w-full" />
      ) : est.tipo === "sem-login" ? (
        <p className="text-[12.5px] text-texto-3" data-card-treino-sem-login>O treino nasce no 1º acesso do aluno ao app.</p>
      ) : est.tipo === "sem-sessao" ? (
        <p className="text-[12.5px] text-texto-3" data-card-treino-sem-sessao>
          {est.estado.tipo === "sem-papel" ? "O treino é do personal responsável." : "Conectando ao Treino…"}
        </p>
      ) : (
        <p className="text-[12.5px] text-texto-3">Não deu para carregar agora.</p>
      )}
    </Moldura>
  );
}
