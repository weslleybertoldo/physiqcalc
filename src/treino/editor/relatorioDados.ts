/**
 * Os DADOS do relatório do mês do aluno (C45): as leituras (admin-relatorio › relatorio e admin-get-user), os tipos e os agrupamentos
 * por semana/dia/exercício. hml-18b (H-54, F): separados do relatorio.ts, que gera o PDF e o Excel — a tela do Relatório (Painel ›
 * Treinos) mostra os dados sem baixar o jsPDF; o PDF e o Excel só no clique (`import("@/treino/editor/relatorio")`).
 */
import { supabase } from "@/integrations/supabase/client";
import { contarDiasTreinados } from "@/lib/contagemTreinos";

export interface SerieRow {
  data_treino: string;
  numero_serie: number;
  peso: number | null;
  reps: number | null;
  concluida: boolean | null;
  exercicio_id: string;
  exercicio_usuario_id: string | null;
  tb_exercicios: { nome: string; grupo_muscular: string; emoji: string | null } | null;
  tb_exercicios_usuario: { nome: string; grupo_muscular: string; emoji: string | null } | null;
}

export interface ProfileData {
  nome: string | null;
  email: string | null;
  user_code: number | null;
  foto_url: string | null;
  peso: number | null;
  altura: number | null;
  idade: number | null;
  percentual_gordura: number | null;
  massa_gorda: number | null;
  massa_magra: number | null;
  tmb_mifflin: number | null;
  tmb_katch: number | null;
  tmb_balanca?: number | null;
  tmb_metodo?: string | null;
  metodo_avaliacao?: string | null;
}

export interface ExercicioAgrupado {
  id: string;
  nome: string;
  grupo: string;
  emoji: string;
  series: { numero: number; peso: number; reps: number }[];
}

export interface DiaAgrupado {
  data: string;
  concluido: boolean;
  exercicios: ExercicioAgrupado[];
  volumeTotal: number;
  grupoNome: string;
}

export interface SemanaAgrupada {
  numero: number;
  label: string;
  totalTreinos: number;
  volumeTotal: number;
  dias: DiaAgrupado[];
  evolucao: { treinos: number; volume: number } | null;
}


// ── Data fetching ──

export async function carregarRelatorioCompleto(userId: string, ano: number, mes: number) {
  // Leitura via edge function (service_role): tb_treino_concluido, tb_treino_series e
  // tb_treino_dia_override têm RLS de dono (auth.uid() = user_id) e NENHUMA policy de
  // admin, então consultar direto do navegador devolve lista vazia — sem erro — para
  // qualquer aluno que não seja o próprio admin logado.
  const { data, error } = await supabase.functions.invoke("admin-relatorio", {
    body: { action: "relatorio", userId, ano, mes },
  });

  if (error) {
    console.error("[AdminRelatorio] Erro ao carregar relatório:", error);
    return { concluidos: [], series: [] as SerieRow[], grupoNomePorData: {} };
  }

  return {
    concluidos: (data?.concluidos ?? []) as { data_treino: string }[],
    series: (data?.series ?? []) as unknown as SerieRow[],
    grupoNomePorData: (data?.grupoNomePorData ?? {}) as Record<string, string>,
  };
}

export async function carregarDadosUsuario(userId: string) {
  const { data } = await supabase.functions.invoke("admin-get-user", {
    body: { userId }
        });
  return {
    perfil: (data?.profile as ProfileData | null) ?? null,
    avaliacao: data?.avaliacao ?? null
        };
}

// ── Grouping helpers ──

function agruparPorExercicio(series: SerieRow[]): ExercicioAgrupado[] {
  const mapa: Record<string, ExercicioAgrupado> = {};
  series.forEach((s) => {
    const id = s.exercicio_usuario_id ?? s.exercicio_id;
    const info = s.tb_exercicios_usuario ?? s.tb_exercicios;
    if (!mapa[id])
      mapa[id] = {
        id,
        nome: info?.nome ?? "Exercício",
        grupo: info?.grupo_muscular ?? "",
        emoji: info?.emoji ?? "🏋️",
        series: []
        };
    mapa[id].series.push({
      numero: s.numero_serie,
      peso: Number(s.peso ?? 0),
      reps: Number(s.reps ?? 0)
        });
  });
  return Object.values(mapa);
}

function agruparPorDia(
  concluidos: { data_treino: string }[],
  series: SerieRow[],
  grupoNomePorData: Record<string, string> = {}
): DiaAgrupado[] {
  const datas = [
    ...new Set([
      ...concluidos.map((c) => c.data_treino),
      ...series.map((s) => s.data_treino),
    ]),
  ].sort();

  return datas.map((data) => {
    const exercicios = agruparPorExercicio(series.filter((s) => s.data_treino === data));
    const volume = exercicios.reduce(
      (a, ex) => a + ex.series.reduce((b, s) => b + Number(s.peso) * Number(s.reps), 0),
      0
    );
    return {
      data,
      concluido: concluidos.some((c) => c.data_treino === data),
      exercicios,
      volumeTotal: volume,
      grupoNome: grupoNomePorData[data] ?? ''
        };
  });
}

export function agruparPorSemana(
  concluidos: { data_treino: string }[],
  series: SerieRow[],
  ano: number,
  mes: number,
  grupoNomePorData: Record<string, string> = {}
): SemanaAgrupada[] {
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const semanas: Omit<SemanaAgrupada, "evolucao">[] = [];
  let num = 1;

  for (let inicio = 1; inicio <= diasNoMes; inicio += 7) {
    const fim = Math.min(inicio + 6, diasNoMes);
    const pad = (n: number) => String(n).padStart(2, "0");
    const ini = `${ano}-${pad(mes)}-${pad(inicio)}`;
    const fimStr = `${ano}-${pad(mes)}-${pad(fim)}`;

    const c = concluidos.filter((x) => x.data_treino >= ini && x.data_treino <= fimStr);
    const s = series.filter((x) => x.data_treino >= ini && x.data_treino <= fimStr);
    const dias = agruparPorDia(c, s, grupoNomePorData);
    const volume = dias.reduce((a, d) => a + d.volumeTotal, 0);

    semanas.push({
      numero: num,
      label: `Semana ${num}  (${pad(inicio)}/${pad(mes)} – ${pad(fim)}/${pad(mes)})`,
      totalTreinos: contarDiasTreinados(c), // dias treinados (2 treinos no mesmo dia = 1), igual ao card do aluno
      volumeTotal: volume,
      dias
        });
    num++;
  }

  return semanas.map((s, i) => ({
    ...s,
    evolucao:
      i === 0
        ? null
        : {
            treinos: s.totalTreinos - semanas[i - 1].totalTreinos,
            volume:
              semanas[i - 1].volumeTotal > 0
                ? Math.round(
                    ((s.volumeTotal - semanas[i - 1].volumeTotal) / semanas[i - 1].volumeTotal) *
                      100
                  )
                : 0
        }
        }));
}

// ── Sub-components ──

// ── Export helpers ──

export function obterNomeAluno(perfil: ProfileData | null, fallbackNome?: string, fallbackEmail?: string): string {
  return perfil?.nome?.trim() || fallbackNome?.trim() || perfil?.email?.split('@')[0] || fallbackEmail?.split('@')[0] || 'aluno';
}
