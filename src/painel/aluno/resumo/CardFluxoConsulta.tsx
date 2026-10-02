import { Link } from "react-router-dom";
import { CalendarPlus, ClipboardList, FilePlus2, FlaskConical, NotebookPen, Ruler, Stethoscope } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { acessoDoProntuario } from "@/nutricao/prontuario/lib/acesso";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { ATALHOS_FLUXO, rotaDoAtalho } from "../dados/regras";
import { usePerfilAluno } from "../dados/usePerfilAluno";

const ICONE: Record<string, LucideIcon> = {
  consulta: Stethoscope,
  agendar: CalendarPlus,
  anamnese: ClipboardList,
  antropometria: Ruler,
  planejamento: FilePlus2,
  orientacao: NotebookPen,
  manipulados: FlaskConical,
};

/**
 * Card "Fluxo de consulta" do Resumo (W14 — N-27): os 7 atalhos do "Perfil do paciente" do Nutri (registrar consulta, agendar,
 * anamnese, antropometria, planejamento, orientação, manipulados). Cada um abre a aba/página do Physiq (W16–W20) com o parâmetro
 * que abre o formulário. W28: o fallback da seção do aluno no site antigo do Nutri saiu. Só com Nutrição.
 * H5 (achado 4 do FIM-1b): só para quem é NUTRI — a regra clínica da W18 (nutricionista da conta que vê o aluno, o master ou a nutri
 * dona do paciente sem conta); o personal e o dono sem papel de nutri não veem (os atalhos são da consulta, da anamnese, do plano…).
 */
export default function CardFluxoConsulta({ alunoId }: { alunoId: string }) {
  const q = usePerfilAluno(alunoId);
  const p = q.data;
  if (!p || !p.conta_modulos.includes("nutricao") || !p.modulos.includes("nutricao")) return null;
  if (!acessoDoProntuario(p).clinico) return null;
  const rotaAluno = `/painel/alunos/${encodeURIComponent(alunoId)}`;

  return (
    <Cartao className="flex flex-col px-[18px] py-4 md:col-span-2 xl:col-span-3" data-card-fluxo-consulta={p.paciente_id}>
      <CabecalhoCartao titulo="Fluxo de consulta" extra={<Chip tom="n">NUTRIÇÃO</Chip>} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7" data-fluxo-atalhos>
        {ATALHOS_FLUXO.map((a) => {
          const Icone = ICONE[a.chave] ?? FilePlus2;
          const rota = rotaDoAtalho(a, rotaAluno, p.paciente_id);
          return (
            <Link key={a.chave} to={rota} data-atalho={a.chave} data-atalho-destino={rota}
              className="flex min-h-[104px] flex-col items-start gap-2 rounded-2xl border border-linha bg-superficie px-3 py-3 text-left transition-colors hover:border-verde/40 hover:bg-superficie-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-linha-2 bg-superficie-2 text-verde-3">
                <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>
              <span className="text-[12.5px] font-semibold leading-tight text-texto">{a.rotulo}</span>
            </Link>
          );
        })}
      </div>
    </Cartao>
  );
}
