import { Link } from "react-router-dom";
import { CalendarPlus, ClipboardList, ExternalLink, FilePlus2, FlaskConical, NotebookPen, Ruler, Stethoscope } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { siteAntigoNutri } from "@/nucleo/siteAntigoNutri";
import { existe } from "@/rotas/registro";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { ATALHOS_FLUXO, destinoDoAtalho } from "../dados/regras";
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
 * anamnese, antropometria, planejamento, orientação, manipulados). Cada um abre a aba/página nova do Physiq quando ela existe
 * (W16–W20, pelo registro por convenção, com o parâmetro que abre o formulário); antes disso, a mesma seção do aluno no site
 * antigo do Nutri, que segue valendo até a W28 (spec 11.1: enquanto a tela nova não existe, vale a antiga). Só com Nutrição.
 */
export default function CardFluxoConsulta({ alunoId }: { alunoId: string }) {
  const q = usePerfilAluno(alunoId);
  const p = q.data;
  if (!p || !p.conta_modulos.includes("nutricao") || !p.modulos.includes("nutricao")) return null;
  const rotaAluno = `/painel/alunos/${encodeURIComponent(alunoId)}`;
  const site = siteAntigoNutri();
  const itens = ATALHOS_FLUXO.map((a) => ({
    a,
    destino: destinoDoAtalho(a, rotaAluno, p.paciente_id, (arq) => existe("abasAluno", arq), (pg) => existe("paginasPainel", pg), site),
  }));
  const algumAntigo = itens.some((i) => i.destino.externo);

  return (
    <Cartao className="flex flex-col px-[18px] py-4 md:col-span-2 xl:col-span-3" data-card-fluxo-consulta={p.paciente_id}>
      <CabecalhoCartao titulo="Fluxo de consulta" extra={<Chip tom="n">NUTRIÇÃO</Chip>} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7" data-fluxo-atalhos>
        {itens.map(({ a, destino }) => {
          const Icone = ICONE[a.chave] ?? FilePlus2;
          const corpo = (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-linha-2 bg-superficie-2 text-verde-3">
                <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>
              <span className="text-[12.5px] font-semibold leading-tight text-texto">{a.rotulo}</span>
              {destino.externo && (
                <span className="flex items-center gap-1 text-[10.5px] text-texto-4">
                  <ExternalLink aria-hidden className="h-3 w-3" /> site antigo
                </span>
              )}
            </>
          );
          const classe = "flex min-h-[104px] flex-col items-start gap-2 rounded-2xl border border-linha bg-superficie px-3 py-3 text-left transition-colors hover:border-verde/40 hover:bg-superficie-2";
          return destino.rota ? (
            <Link key={a.chave} to={destino.rota} className={classe} data-atalho={a.chave} data-atalho-destino={destino.rota}>
              {corpo}
            </Link>
          ) : (
            <a key={a.chave} href={destino.externo!} target="_blank" rel="noreferrer" className={classe} data-atalho={a.chave} data-atalho-destino={destino.externo!}>
              {corpo}
            </a>
          );
        })}
      </div>
      {algumAntigo && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-texto-3" data-fluxo-aviso>
          Os atalhos marcados abrem a seção do aluno no site do PhysiqNutri (entre com a mesma conta) até as abas novas entrarem aqui.
        </p>
      )}
    </Cartao>
  );
}
