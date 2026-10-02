// Physiq W25 — as leituras do Painel › Dashboard que nenhuma tela de hoje faz (as outras são as MESMAS consultas das telas de origem,
// com as mesmas chaves do react-query — veja useDashboard.ts):
//   · painel_resumo (banco principal): os alunos ativos que você vê, com nascimento, módulos, a última antropometria e — só para a
//     nutricionista da conta ou o master — a dieta (plano atual, ✓ dos últimos dias);
//   · painel-resumo-treino (Banco do Treino, com a SESSÃO DO TREINO): o resumo do treino da conta (o painel não lê as tabelas do
//     Treino direto);
//   · as respostas de pré-consulta dos últimos 7 dias (só as colunas da "Atividade recente"; o recorte e a RLS da W21).
import { principal } from "@/integrations/principal/client";
import { recorteDaConta } from "@/painel/preconsulta/novas";
import { invocar } from "@/treino/editor/api";
import type { AlunoPrincipal, DietaResumo, PlanoResumo, ResumoPrincipal, ResumoTreino } from "./regras";

export class ErroDashboard extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Normaliza o painel_resumo (tolerante a campo faltando: nunca quebra a tela). */
export function normalizarResumoPrincipal(bruto: unknown): ResumoPrincipal | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  if (b.ok !== true) return null;
  const alunos: AlunoPrincipal[] = lista<AlunoPrincipal>(b.alunos).map((a) => {
    const d = a.dieta as (Partial<DietaResumo> & Record<string, unknown>) | null | undefined;
    return {
      ...a,
      modulos: lista<string>(a.modulos).filter((m): m is "treino" | "nutricao" => m === "treino" || m === "nutricao"),
      dieta: d && typeof d === "object"
        ? {
          planos: lista<PlanoResumo>(d.planos).map((p) => ({ ...p, refeicoes: lista<PlanoResumo["refeicoes"][number]>(p.refeicoes) })),
          concluidas: lista<DietaResumo["concluidas"][number]>(d.concluidas),
          ultima_marcacao: (d.ultima_marcacao as string | null | undefined) ?? null,
        }
        : null,
    };
  });
  const conta = (b.conta ?? {}) as ResumoPrincipal["conta"];
  return {
    ok: true,
    hoje: String(b.hoje ?? ""),
    alunos,
    conta: { ...conta, modulos: lista<string>(conta.modulos).filter((m): m is "treino" | "nutricao" => m === "treino" || m === "nutricao") },
    eu: { id: "", dono: false, personal: false, nutricionista: false, master: false, ...((b.eu ?? {}) as Partial<ResumoPrincipal["eu"]>) },
  };
}

export async function buscarResumoPrincipal(contaId: string): Promise<ResumoPrincipal> {
  const { data, error } = await principal.rpc("painel_resumo" as never, { p_conta: contaId } as never);
  if (error) throw new ErroDashboard("erro_interno");
  const r = normalizarResumoPrincipal(data);
  if (!r) throw new ErroDashboard(String((data as { erro?: string } | null)?.erro ?? "erro_interno"));
  return r;
}

/** Normaliza a resposta da painel-resumo-treino. */
export function normalizarResumoTreino(bruto: unknown): ResumoTreino | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  if (b.ok !== true) return null;
  return {
    ok: true,
    hoje: String(b.hoje ?? ""),
    de: String(b.de ?? ""),
    todos: b.todos === true,
    alunos: lista<ResumoTreino["alunos"][number]>(b.alunos).map((a) => ({
      ...a,
      semana: lista(a.semana), dias_config: lista(a.dias_config), grupos_catalogo: lista(a.grupos_catalogo), grupos_pessoais: lista(a.grupos_pessoais),
      overrides: lista(a.overrides), concluidos: lista(a.concluidos),
    })),
    historico: lista(b.historico),
    recordes: lista(b.recordes),
  };
}

/** O resumo do treino da conta, com a sessão do Treino de quem está no painel (a função confere quem vê quem). */
export async function buscarResumoTreino(contaId: string): Promise<ResumoTreino> {
  const r = normalizarResumoTreino(await invocar<unknown>("painel-resumo-treino", { conta: contaId }));
  if (!r) throw new ErroDashboard("erro_interno");
  return r;
}

export interface RespostaRecente {
  id: string;
  nome: string;
  respondido_em: string;
  paciente_id: string | null;
}

/** As respostas de pré-consulta desde `desdeIso` (só o que a "Atividade recente" mostra), mais recente primeiro. */
export async function listarRespostasRecentes(contaId: string, uid: string, desdeIso: string): Promise<RespostaRecente[]> {
  const { data, error } = await principal
    .from("respostas_preconsulta")
    .select("id, nome, respondido_em, paciente_id")
    .is("deleted_at", null)
    .or(recorteDaConta(contaId, uid))
    .gte("respondido_em", desdeIso)
    .order("respondido_em", { ascending: false })
    .limit(10);
  if (error) throw new ErroDashboard("erro_interno");
  return (data ?? []) as RespostaRecente[];
}
