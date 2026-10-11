import { lazy, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECOES_PRONTUARIO, acessoDoProntuario, secaoDaUrl, type SecaoProntuario } from "@/nutricao/prontuario/lib/acesso";
import Anotacoes from "@/nutricao/prontuario/secoes/Anotacoes";
import { ProntuarioProvider } from "@/nutricao/prontuario/ui/contexto";
import { chavePerfilAluno, usePerfilAluno } from "@/painel/aluno/dados/usePerfilAluno";
import { SomenteLeitura } from "@/nutricao/editor/ui/SomenteLeitura";
import { Carregavel } from "@/ui/casca/Carregavel";
import { EstadoCarregando, EstadoErro } from "@/ui/premium/Estados";

// hml-18b (H-54, F): o Prontuário em pedaços — cada seção clínica num pedaço próprio, baixado quando a pessoa abre a seção (antes as 10
// vinham juntas: 278 KB de código + o PDF + o gráfico da Gestacional). A Anotações (a seção que abre) fica junto: sem degrau a mais.
const Anamnese = lazy(() => import("@/nutricao/prontuario/secoes/Anamnese"));
const Anexos = lazy(() => import("@/nutricao/prontuario/secoes/Anexos"));
const AvaliacaoIntegrada = lazy(() => import("@/nutricao/prontuario/secoes/AvaliacaoIntegrada"));
const Consultas = lazy(() => import("@/nutricao/prontuario/secoes/Consultas"));
const Documentos = lazy(() => import("@/nutricao/prontuario/secoes/Documentos"));
const Exames = lazy(() => import("@/nutricao/prontuario/secoes/Exames"));
const FarmacoNutrientes = lazy(() => import("@/nutricao/prontuario/secoes/FarmacoNutrientes"));
// o gráfico (recharts, ~390 KB) só com esta seção aberta
const Gestacional = lazy(() => import("@/nutricao/prontuario/secoes/Gestacional"));
const Questionarios = lazy(() => import("@/nutricao/prontuario/secoes/Questionarios"));

function SecaoClinica({ secao }: { secao: SecaoProntuario }) {
  return (
    <Carregavel nome={`prontuário ${secao}`} esqueleto={<EstadoCarregando linhas={4} rotulo="Abrindo a seção" />}>
      <SecaoClinicaPreguicosa secao={secao} />
    </Carregavel>
  );
}

function SecaoClinicaPreguicosa({ secao }: { secao: SecaoProntuario }) {
  switch (secao) {
    case "consultas":
      return <Consultas />;
    case "anamnese":
      return <Anamnese />;
    case "questionarios":
      return <Questionarios />;
    case "exames":
      return <Exames />;
    case "avaliacao-integrada":
      return <AvaliacaoIntegrada />;
    case "gestacional":
      return <Gestacional />;
    case "farmaco-nutrientes":
      return <FarmacoNutrientes />;
    case "documentos":
      return <Documentos />;
    case "anexos":
      return <Anexos />;
    default:
      return null;
  }
}

/**
 * Perfil do aluno › Prontuário (W18 — spec 4.5, tela 7, N-29 a N-33, N-36, N-43, N-44, N-46, N-47, N-60, N-62): as anotações da
 * equipe (linha do tempo com autor e visibilidade "Equipe" | "Só nutricionistas" — P4) e as seções clínicas do prontuário do site
 * antigo do Nutri — consultas, anamnese (modelos ★, SICNUT, PDF), questionários, exames (pedido em PDF + resultados), avaliação 360,
 * gestacional, fármaco-nutrientes, documentos (atestado, receituário, declaração) e anexos (até 20 MB, URL assinada). As seções
 * clínicas são só da nutricionista (P3): o personal e o dono sem papel de nutricionista veem e escrevem só as anotações "Equipe" — e
 * o banco confere de novo (RLS da W18). Tudo nas mesmas tabelas que o site antigo edita até a W28.
 */
export default function Prontuario({ alunoId }: { alunoId: string }) {
  const q = usePerfilAluno(alunoId);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const perfil = q.data;
  const acesso = useMemo(() => (perfil ? acessoDoProntuario(perfil) : null), [perfil]);

  if (q.isLoading) return <EstadoCarregando linhas={4} rotulo="Abrindo o prontuário do aluno" />;
  if (q.error || !perfil || !acesso) return <EstadoErro titulo="Não deu para abrir o prontuário" aoTentar={() => void q.refetch()} />;

  const secoes = acesso.clinico ? SECOES_PRONTUARIO : SECOES_PRONTUARIO.filter((s) => !s.clinica);
  const pedida = secaoDaUrl(params);
  const secao: SecaoProntuario = secoes.some((s) => s.id === pedida) ? pedida : "anotacoes";
  const trocar = (id: SecaoProntuario) => {
    const n = new URLSearchParams();
    if (id !== "anotacoes") n.set("secao", id);
    setParams(n, { replace: true });
  };
  const ctx = {
    paciente: {
      id: perfil.paciente_id,
      nome: perfil.nome,
      nascimento: perfil.nascimento,
      genero: perfil.genero ? String(perfil.genero) : null,
      cpf: perfil.cpf,
    },
    recarregar: async () => {
      await qc.invalidateQueries({ queryKey: chavePerfilAluno(alunoId) });
    },
    acesso,
  };
  const nutri = perfil.nutricionista?.nome ? `a nutricionista responsável (${perfil.nutricionista.nome})` : "a nutricionista responsável";
  const clinica = secao !== "anotacoes";

  return (
    <ProntuarioProvider value={ctx}>
      <div className="flex flex-col gap-3.5" data-aba-prontuario-aluno={perfil.paciente_id} data-prontuario-clinico={acesso.clinico ? "1" : "0"}
        data-prontuario-editar={acesso.editarClinico ? "1" : "0"} data-secao-prontuario={secao}>
        {!acesso.clinico && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5 text-[13px] text-texto-2" data-prontuario-so-equipe>
            <Lock aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
            {`Consultas, anamnese, exames e as outras seções clínicas de ${perfil.nome.split(" ")[0]} são só da nutricionista. Aqui você vê e escreve as anotações da equipe.`}
          </div>
        )}
        {acesso.clinico && !acesso.editarClinico && clinica && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5 text-[13px] text-texto-2" data-prontuario-so-ver>
            <Eye aria-hidden className="h-4 w-4 flex-none text-verde-3" />
            {`Você vê o prontuário clínico de ${perfil.nome.split(" ")[0]}; quem muda é ${nutri}.`}
          </div>
        )}
        {secoes.length > 1 && (
          <nav aria-label="Seções do prontuário" className="flex min-w-0 flex-wrap gap-1.5" data-secoes-prontuario>
            {secoes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => trocar(s.id)}
                aria-current={s.id === secao ? "page" : undefined}
                className={cn(
                  "h-[32px] flex-none whitespace-nowrap rounded-[10px] border px-3 text-[12.5px] font-semibold transition-colors",
                  s.id === secao ? "border-[#FAFAFA] bg-[#FAFAFA] text-[#09090B]" : "border-linha bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto",
                )}
                data-secao-prontuario-botao={s.id}
              >
                {s.rotulo}
              </button>
            ))}
          </nav>
        )}
        {secao === "anotacoes" ? (
          <Anotacoes alunoId={alunoId} perfil={perfil} />
        ) : acesso.editarClinico ? (
          <SecaoClinica secao={secao} />
        ) : (
          <SomenteLeitura data-prontuario-leitura>
            <SecaoClinica secao={secao} />
          </SomenteLeitura>
        )}
      </div>
    </ProntuarioProvider>
  );
}
