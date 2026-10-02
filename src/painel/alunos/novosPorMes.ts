/**
 * Painel › Alunos › "Novos alunos por mês" (W25 — N-9: o "Novos pacientes por mês" do Dashboard do Nutri vai para a página Alunos) e
 * o "+N este mês" do KPI "Alunos ativos" do Dashboard: as matrículas criadas em cada mês, fora da lixeira, com a regra P1 da lista
 * (o dono conta a conta inteira; o membro, só os alunos dele) — função alunos_novos_por_mes do banco principal. Os 2 lugares usam a
 * MESMA consulta (mesma chave do react-query), então o número do Dashboard é o da barra do mês atual daqui.
 */
import { useQuery } from "@tanstack/react-query";
import { principal } from "@/integrations/principal/client";

export interface MesNovos {
  /** AAAA-MM */
  mes: string;
  novos: number;
}

export interface NovosPorMes {
  meses: MesNovos[];
  /** AAAA-MM do mês atual (o último) */
  mesAtual: string;
  doMes: number;
  total: number;
}

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
/** "2026-09" → "Set" */
export const rotuloDoMes = (mes: string): string => MESES_CURTOS[Number(mes.slice(5, 7)) - 1] ?? mes;

/** Normaliza a resposta do banco (tolerante: nunca quebra a tela). */
export function normalizarNovos(bruto: unknown): NovosPorMes | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as { ok?: boolean; meses?: unknown; mes_atual?: unknown };
  if (b.ok !== true || !Array.isArray(b.meses)) return null;
  const meses = (b.meses as { mes?: unknown; novos?: unknown }[])
    .filter((m) => typeof m?.mes === "string")
    .map((m) => ({ mes: String(m.mes), novos: Math.max(0, Number(m.novos) || 0) }));
  const mesAtual = typeof b.mes_atual === "string" ? b.mes_atual : meses[meses.length - 1]?.mes ?? "";
  return { meses, mesAtual, doMes: meses.find((m) => m.mes === mesAtual)?.novos ?? 0, total: meses.reduce((s, m) => s + m.novos, 0) };
}

export async function buscarNovosPorMes(contaId: string, meses = 6): Promise<NovosPorMes> {
  const { data, error } = await principal.rpc("alunos_novos_por_mes" as never, { p_conta: contaId, p_meses: meses } as never);
  if (error) throw new Error(error.message);
  const r = normalizarNovos(data);
  if (!r) throw new Error(String((data as { erro?: string } | null)?.erro ?? "erro_interno"));
  return r;
}

/** Começa com "alunos": o "recarregar" da página Alunos (invalida ["alunos"]) atualiza este card junto com a lista. */
export const chaveNovosPorMes = (contaId: string) => ["alunos", "novos-por-mes", contaId] as const;

export function useNovosPorMes(contaId: string | null | undefined) {
  return useQuery({
    queryKey: chaveNovosPorMes(contaId ?? ""),
    queryFn: () => buscarNovosPorMes(contaId!),
    enabled: Boolean(contaId),
    staleTime: 60_000,
    retry: 1,
  });
}
