// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/acompanhamento.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { acaoNutricao } from "@/nutricao/servidor";
import { registroParaBanco, type FormRegistro } from "@/nutricao/editor/lib/acompanhamentoUtil";

// Acesso do Acompanhamento (W23): a tabela nova `registros_diarios` (RLS: a nutricionista só vê os dela; master vê tudo;
// 1 registro VIVO por paciente/dia — índice único parcial; exclusão SOFT → Lixeira, W32) + as leituras das seções donas
// (planos da W9, antropometrias da W6, cálculos da W7), reexportadas pra tela ter uma porta só.
// hml-19b (H-41 · jeito 2): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama e as
// mesmas assinaturas. O "registrar dia" vira 1 chamada: o servidor edita o vivo do dia ou insere (o índice único é PARCIAL — o
// on_conflict do PostgREST não o acha —, então o upsert é à mão lá, com a corrida 23505 virando edição, como aqui antes).

export { listarPlanos, type Plano } from "@/nutricao/editor/lib/planos";
export { listarAntropometrias, type Antropometria } from "@/nutricao/editor/lib/antropometrias";
export { listarCalculos, type CalculoEnergetico } from "@/nutricao/editor/lib/calculosEnergeticos";

export type RegistroDiario = Database["public"]["Tables"]["registros_diarios"]["Row"];

const TABELA = "registros_diarios";

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

const colunas = (f: FormRegistro) => {
  const r = registroParaBanco(f);
  return { data: r.data, agua_ml: r.agua_ml, sintomas: r.sintomas, observacao: r.observacao };
};

/**
 * Registros vivos do paciente NO PERÍODO (`de`–`ate`, AAAA-MM-DD, as 2 pontas valem), dia mais recente primeiro.
 * hml-14d (B21 · D34 · P10): o período vai ao banco — antes vinham todos os registros do aluno (cortados calados em 1000) e a tela
 * filtrava. Sem página: a janela é o teto (até 366 dias, 1 registro vivo por dia). Ordem estável (desempate pelo id).
 */
export async function listarRegistrosDoPaciente(pacienteId: string, de: string, ate: string): Promise<RegistroDiario[]> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .gte("data", de)
    .lte("data", ate)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  falhou(error);
  return (data ?? []) as RegistroDiario[];
}

/**
 * Quantos registros vivos o paciente tem NESTE dia (0 ou 1 — o índice único parcial). hml-14d (D34): o aviso "já existe registro
 * neste dia" do diálogo olhava a lista inteira do aluno; agora a tela só tem o período, e o dia escolhido FORA dele é perguntado
 * aqui — HEAD (só a contagem, no banco). O tempo é o do cliente principal (15 s por tentativa, criarFetchResiliente — hml-14 D5).
 */
export async function contarRegistrosDoDia(pacienteId: string, dia: string): Promise<number> {
  const { count, error } = await supabase
    .from(TABELA)
    .select("id", { count: "exact", head: true })
    .eq("paciente_id", pacienteId)
    .eq("data", dia)
    .is("deleted_at", null);
  falhou(error);
  if (count == null) throw new Error("O banco não devolveu a contagem do dia.");
  return count;
}

/** Upsert pelo dia (no servidor): já existe registro vivo naquele dia → atualiza; senão insere. Devolve a linha e se foi criada. */
export async function salvarRegistro(nutricionistaId: string, pacienteId: string, f: FormRegistro): Promise<{ registro: RegistroDiario; criado: boolean }> {
  const r = await acaoNutricao<{ registro: RegistroDiario; criado: boolean }>("registro_diario_salvar", { paciente_id: pacienteId, ...colunas(f) });
  return { registro: r.registro, criado: r.criado === true };
}

export async function atualizarRegistro(id: string, f: FormRegistro): Promise<RegistroDiario> {
  const { linha } = await acaoNutricao<{ linha: RegistroDiario }>("registro_diario_editar", { id, ...colunas(f) });
  return linha;
}

/** Exclusão SOFT (o índice único só conta vivos, então o dia pode ser registrado de novo). */
export async function excluirRegistro(id: string): Promise<void> {
  await acaoNutricao("registro_diario_excluir", { id });
}
