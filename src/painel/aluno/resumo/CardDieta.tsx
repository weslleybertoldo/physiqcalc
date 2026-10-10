import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { hojeSP, planoAtivo, refeicoesDoDia } from "@/nutricao/app/dia";
import { totaisDoPlano, fmtKcal } from "@/nutricao/app/dietaUtil";
import { adesaoDoPeriodo, ultimosDias } from "@/nutricao/editor/lib/adesao";
import { usePlanosDoAluno } from "@/nutricao/editor/lib/consultas";
import { useConcluidas } from "@/nutricao/editor/lib/consultas";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import { Anel } from "@/ui/premium/Anel";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { CartaoCarregando, Esqueleto } from "@/ui/premium/Estados";
import { useConta } from "@/nucleo/conta";
import { usePerfilAluno } from "../dados/usePerfilAluno";

function Moldura({ alunoId, extra, children }: { alunoId: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-dieta>
      <CabecalhoCartao
        titulo="Dieta"
        extra={extra}
        acao={<Link to={`/painel/alunos/${encodeURIComponent(alunoId)}/dieta`} className="text-[12.5px] font-semibold text-violeta-3" data-card-dieta-abrir>Abrir</Link>}
      />
      {children}
    </Cartao>
  );
}

/**
 * Card "Dieta" do Resumo do aluno (tela 7 — W16, R14/NF6): as kcal do dia do plano que o app mostra, a adesão dos últimos 7 dias
 * (refeições marcadas ÷ as que o aluno podia marcar, com o anel e uma barra por dia) e "Plano de dd/mm · nutri". Os números são os
 * do acompanhamento (✓ por dia) e os do app do aluno (lição da W10: número = tela). Só para aluno com o módulo Nutrição.
 */
export default function CardDieta({ alunoId }: { alunoId: string }) {
  const { conta, ehMaster } = useConta();
  const perfilQ = usePerfilAluno(alunoId);
  const perfil = perfilQ.data;
  const temNutricao = !!perfil && perfil.modulos.includes("nutricao") && perfil.conta_modulos.includes("nutricao");
  const planosQ = usePlanosDoAluno(temNutricao ? perfil!.paciente_id : null);
  const dias = useMemo(() => ultimosDias(7), []);
  const concluidasQ = useConcluidas(temNutricao ? perfil!.paciente_id : null, dias[0], dias[6]);
  const ativo = useMemo(() => planoAtivo(planosQ.data ?? []), [planosQ.data]);
  const adesao = useMemo(() => (ativo ? adesaoDoPeriodo(ativo.refeicoes, concluidasQ.data ?? [], dias) : null), [ativo, concluidasQ.data, dias]);
  const kcalHoje = useMemo(() => (ativo ? totaisDoPlano(refeicoesDoDia(ativo as unknown as PlanoAlimentar, hojeSP())).energia_kcal : null), [ativo]);

  // hml-18a (H-40, E): enquanto o perfil chega, o cartão-esqueleto do mesmo tamanho — só se a conta tem Nutrição (o card é só para
  // aluno com Nutrição: na conta sem o módulo ele nunca aparece, e o esqueleto seria um pulo novo)
  if (!perfil) return perfilQ.isLoading && (ehMaster || !!conta?.modulos?.includes("nutricao")) ? <CartaoCarregando className="min-h-[240px]" rotulo="Carregando a dieta" /> : null;
  if (!temNutricao) return null;
  const nutri = perfil.nutricionista?.nome?.split(" ")[0] ?? null;
  const carregando = planosQ.isLoading || concluidasQ.isLoading;
  return (
    <Moldura alunoId={alunoId} extra={kcalHoje !== null ? <Chip tom="n" data-card-dieta-kcal={Math.round(kcalHoje)}>{fmtKcal(kcalHoje)} KCAL/DIA</Chip> : undefined}>
      {carregando ? (
        <Esqueleto className="h-[160px] w-full" />
      ) : planosQ.error ? (
        <p className="text-[12.5px] text-texto-3">Não deu para carregar agora.</p>
      ) : !ativo || !adesao ? (
        <p className="text-[12.5px] text-texto-3" data-card-dieta-vazio>Ainda sem plano alimentar. Monte na aba Dieta.</p>
      ) : (
        <>
          <div className="flex items-center gap-4" data-card-dieta-adesao={adesao.pct} data-card-dieta-feitas={`${adesao.feitas}/${adesao.total}`}>
            <Anel pct={adesao.pct / 100} tamanho={112} espessura={11} gradiente={["#10B981", "#A3E635"]} rotulo={`${adesao.pct}% de adesão`}>
              <div className="text-center">
                <b className="block text-[24px] font-semibold leading-none tracking-[-0.03em] text-texto">{adesao.pct}%</b>
                <span className="mt-1 block text-[11px] text-texto-3">adesão</span>
              </div>
            </Anel>
            <div className="min-w-0 text-[13px] leading-relaxed text-texto-2">
              Refeições marcadas
              <br />
              nos últimos 7 dias
              <b className="mt-0.5 block font-semibold text-texto" data-card-dieta-plano>
                Plano de {format(new Date(ativo.created_at), "dd/MM")}
                {nutri ? ` · ${nutri}` : ""}
              </b>
            </div>
          </div>
          <div className="mt-4 grid flex-1 grid-cols-7 items-end gap-2" data-card-dieta-barras>
            {adesao.dias.map((d) => (
              <div key={d.dia} className="flex flex-col items-center gap-1.5" data-card-dieta-dia={d.dia} data-feitas={d.feitas} data-total={d.total}>
                <div className="flex h-[64px] w-full items-end">
                  <span
                    className="w-full rounded-t-[7px] rounded-b-[3px]"
                    style={{ height: `${Math.max(8, Math.round(d.fracao * 100))}%`, background: d.total ? "linear-gradient(180deg,#10B981,rgba(16,185,129,.35))" : "var(--p-superficie-2)", opacity: d.total ? 1 : 0.6 }}
                    title={`${d.rotulo}: ${d.feitas} de ${d.total}`}
                  />
                </div>
                <span className="text-[11px] text-texto-3">{d.rotulo}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Moldura>
  );
}
