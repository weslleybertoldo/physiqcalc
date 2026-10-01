import { useMemo } from "react";
import { Check, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import { rotuloDoDia, hojeSP } from "@/nutricao/app/dia";
import { fmtHorario } from "@/nutricao/editor/lib/dietaUtil";
import { adesaoDoPeriodo, textoFeitas, type RefeicaoAdesao } from "@/nutricao/editor/lib/adesao";
import { useConcluidas } from "@/nutricao/editor/lib/consultas";
import { Anel } from "@/ui/premium/Anel";
import { Cartao, CabecalhoCartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";

/**
 * Os ✓ das refeições por dia (falha F3 — R14): para cada dia do período, as refeições do plano atual que o aluno podia marcar
 * (valem no dia e têm alimento) com o ✓ das que ele marcou no app, e a adesão do período (a mesma conta do card Dieta do Resumo
 * e do "N de M refeições" do app).
 */
export function ConcluidasDoPeriodo({ pacienteId, refeicoes, dias, titulo = "Refeições marcadas" }: { pacienteId: string; refeicoes: RefeicaoAdesao[] | null; dias: string[]; titulo?: string }) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  const q = useConcluidas(pacienteId, de, ate);
  const adesao = useMemo(() => (refeicoes ? adesaoDoPeriodo(refeicoes, q.data ?? [], dias) : null), [refeicoes, q.data, dias]);
  const hoje = hojeSP();
  const lista = adesao ? [...adesao.dias].reverse() : [];
  return (
    <Cartao className="min-w-0 px-[18px] py-4" data-card="concluidas" data-adesao-pct={adesao?.pct ?? ""} data-adesao-feitas={adesao?.feitas ?? ""} data-adesao-total={adesao?.total ?? ""}>
      <CabecalhoCartao titulo={titulo} extra={adesao && adesao.total > 0 ? <Chip tom="n">{adesao.pct}% DE ADESÃO</Chip> : undefined} />
      {!refeicoes ? (
        <p className="text-[12.5px] text-texto-3" data-concluidas-sem-plano>Sem plano alimentar — os ✓ aparecem quando o aluno tiver um plano.</p>
      ) : q.isLoading ? (
        <Esqueleto className="h-32 w-full" />
      ) : q.error ? (
        <p className="text-[12.5px] text-rosa-3">Não deu para ler os ✓ agora.</p>
      ) : adesao && adesao.total === 0 ? (
        <p className="text-[12.5px] text-texto-3">O plano atual não tem refeição com alimento nesses dias.</p>
      ) : adesao ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex flex-none items-center gap-3 sm:w-[150px] sm:flex-col sm:items-start">
            <Anel pct={adesao.pct / 100} tamanho={86} espessura={9} gradiente={["#10B981", "#A3E635"]} rotulo={`${adesao.pct}% de adesão`}>
              <div className="text-center">
                <b className="block text-[19px] font-semibold tracking-[-0.02em] text-texto">{adesao.pct}%</b>
                <span className="text-[10.5px] text-texto-3">adesão</span>
              </div>
            </Anel>
            <p className="text-[12px] leading-snug text-texto-2">
              {textoFeitas(adesao.feitas, adesao.total)} refeições marcadas em {dias.length === 1 ? "1 dia" : `${dias.length} dias`}
            </p>
          </div>
          <ul className="min-w-0 flex-1 divide-y divide-[rgba(255,255,255,.06)]" data-concluidas-dias={lista.length}>
            {lista.map((d) => (
              <li key={d.dia} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2" data-concluidas-dia={d.dia} data-feitas={d.feitas} data-total={d.total}>
                <span className="w-[112px] flex-none text-[12.5px] font-semibold capitalize text-texto">{rotuloDoDia(d.dia, hoje)}</span>
                <span className="w-[44px] flex-none text-[12px] tabular-nums text-texto-3">{textoFeitas(d.feitas, d.total)}</span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {d.marcaveis.map((m) => (
                    <span
                      key={m.id}
                      className={cn(
                        "inline-flex h-[24px] items-center gap-1 rounded-[8px] border px-1.5 text-[11.5px]",
                        m.feita ? "border-verde/40 bg-[rgba(16,185,129,.1)] text-verde-3" : "border-linha bg-[rgba(255,255,255,.03)] text-texto-3",
                      )}
                      title={`${fmtHorario(m.horario) ? `${fmtHorario(m.horario)} · ` : ""}${m.nome}: ${m.feita ? "marcada" : "não marcada"}`}
                      data-concluida={m.feita ? "sim" : "nao"}
                      data-concluida-refeicao={m.nome}
                    >
                      {m.feita ? <Check aria-hidden className="h-3 w-3" /> : <CircleDashed aria-hidden className="h-3 w-3" />}
                      {m.nome}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Cartao>
  );
}
