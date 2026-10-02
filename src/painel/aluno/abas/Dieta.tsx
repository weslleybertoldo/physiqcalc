import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, PencilRuler, Salad } from "lucide-react";
import { usePerfilAluno, chavePerfilAluno } from "@/painel/aluno/dados/usePerfilAluno";
import { planoAtivo } from "@/nutricao/app/dia";
import { ultimosDias } from "@/nutricao/editor/lib/adesao";
import { SECOES_DIETA, acessoDaDieta, secaoDaUrl, type SecaoDieta } from "@/nutricao/editor/lib/acesso";
import { usePlanosDoAluno } from "@/nutricao/editor/lib/consultas";
import Acompanhamento from "@/nutricao/editor/secoes/Acompanhamento";
import CalculoEnergetico from "@/nutricao/editor/secoes/CalculoEnergetico";
import Manipulados from "@/nutricao/editor/secoes/Manipulados";
import Metas from "@/nutricao/editor/secoes/Metas";
import Orientacoes from "@/nutricao/editor/secoes/Orientacoes";
import Planejamento from "@/nutricao/editor/secoes/Planejamento";
import Suplementos from "@/nutricao/editor/secoes/Suplementos";
import { ConcluidasDoPeriodo } from "@/nutricao/editor/ui/ConcluidasDoPeriodo";
import { PacienteProvider } from "@/nutricao/editor/ui/contexto";
import { cn } from "@/lib/utils";
import { SomenteLeitura } from "@/nutricao/editor/ui/SomenteLeitura";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";

function Secao({ secao }: { secao: SecaoDieta }) {
  switch (secao) {
    case "acompanhamento":
      return <Acompanhamento />;
    case "calculo-energetico":
      return <CalculoEnergetico />;
    case "suplementos":
      return <Suplementos />;
    case "manipulados":
      return <Manipulados />;
    case "orientacoes":
      return <Orientacoes />;
    case "metas":
      return <Metas />;
    default:
      return null;
  }
}

/** A adesão de 7 dias para quem só vê o plano (o personal responsável). */
function AdesaoDoPlano({ pacienteId }: { pacienteId: string }) {
  const planos = usePlanosDoAluno(pacienteId);
  const ativo = useMemo(() => planoAtivo(planos.data ?? []), [planos.data]);
  const dias = useMemo(() => ultimosDias(7), []);
  if (planos.isLoading) return null;
  return <ConcluidasDoPeriodo pacienteId={pacienteId} refeicoes={ativo ? ativo.refeicoes : null} dias={dias} titulo="Refeições marcadas nos últimos 7 dias" />;
}

/**
 * Perfil do aluno › Dieta (W16 — spec 4.5, tela 8 lado direito, N-28, N-37 a N-42, N-61, N-62, NF3, NF5 e falha F3): o editor do
 * plano (por dia da semana, macros e fibras, substitutos, "Da receita", modelos ★, PDF) e as seções do site antigo do Nutri que são
 * da dieta — acompanhamento com os ✓ das refeições por dia, cálculo energético, suplementos, manipulados, orientações e metas.
 * Tudo no banco principal, nas mesmas tabelas que o site antigo edita (ele abre o que se grava aqui, e vice-versa, até a W28).
 */
export default function Dieta({ alunoId }: { alunoId: string }) {
  const q = usePerfilAluno(alunoId);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const perfil = q.data;

  if (q.isLoading) return <EstadoCarregando linhas={4} rotulo="Abrindo a dieta do aluno" />;
  if (q.error || !perfil) return <EstadoErro titulo="Não deu para abrir a dieta" aoTentar={() => void q.refetch()} />;
  if (!perfil.modulos.includes("nutricao")) {
    return <EstadoVazio icone={Salad} titulo="Este aluno não tem dieta" texto="A dieta aparece aqui quando ele tiver uma nutricionista responsável numa conta com o módulo Nutrição." />;
  }

  const acesso = acessoDaDieta(perfil);
  const secoes = acesso === "so-plano" ? SECOES_DIETA.filter((s) => s.id === "planejamento") : SECOES_DIETA;
  const secao = acesso === "so-plano" ? "planejamento" : secaoDaUrl(params);
  const trocar = (id: SecaoDieta) => {
    const n = new URLSearchParams();
    if (id !== "planejamento") n.set("secao", id);
    setParams(n, { replace: true });
  };
  const ctx = {
    paciente: { id: perfil.paciente_id, nome: perfil.nome, nascimento: perfil.nascimento, genero: perfil.genero ? String(perfil.genero) : null },
    recarregar: async () => {
      await qc.invalidateQueries({ queryKey: chavePerfilAluno(alunoId) });
    },
    podeEditar: acesso === "editar",
  };
  return (
    <PacienteProvider value={ctx}>
      <div className="flex flex-col gap-3.5" data-aba-dieta-aluno={perfil.paciente_id} data-acesso-dieta={acesso} data-secao-dieta={secao}>
        {acesso !== "editar" && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5 text-[13px] text-texto-2" data-dieta-so-ver>
            <Eye aria-hidden className="h-4 w-4 flex-none text-verde-3" />
            {acesso === "so-plano"
              ? `Você vê o plano e a adesão de ${perfil.nome.split(" ")[0]}; quem muda é ${perfil.nutricionista?.nome ? `a nutricionista responsável (${perfil.nutricionista.nome})` : "a nutricionista responsável"}.`
              : `Você vê a dieta de ${perfil.nome.split(" ")[0]}; quem muda é ${perfil.nutricionista?.nome ? `a nutricionista responsável (${perfil.nutricionista.nome})` : "a nutricionista responsável"}.`}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
        {secoes.length > 1 && (
          <nav aria-label="Seções da dieta" className="pq-sem-barra -mx-0.5 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-0.5" data-secoes-dieta>
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
                data-secao-dieta-botao={s.id}
              >
                {s.rotulo}
              </button>
            ))}
          </nav>
        )}
          <Link to={`/painel/alunos/${encodeURIComponent(alunoId)}/editar`} className="pq-botao pq-botao-g pq-botao-sm ml-auto flex-none" data-dieta-editores>
            <PencilRuler aria-hidden /> Editar treino e dieta
          </Link>
        </div>
        {secao === "planejamento" ? (
          <>
            <Planejamento objetivo={perfil.objetivo} />
            {acesso === "so-plano" && <AdesaoDoPlano pacienteId={perfil.paciente_id} />}
          </>
        ) : acesso === "ver" ? (
          <SomenteLeitura data-dieta-leitura>
            <Secao secao={secao} />
          </SomenteLeitura>
        ) : (
          <Secao secao={secao} />
        )}
      </div>
    </PacienteProvider>
  );
}
