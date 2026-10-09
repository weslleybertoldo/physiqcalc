// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/acompanhamento.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database, Json } from "@/nutricao/editor/lib/banco";
import { registroParaBanco, type FormRegistro } from "@/nutricao/editor/lib/acompanhamentoUtil";

// Acesso do Acompanhamento (W23): a tabela nova `registros_diarios` (RLS: a nutricionista só vê os dela; master vê tudo;
// 1 registro VIVO por paciente/dia — índice único parcial; exclusão SOFT → Lixeira, W32) + as leituras das seções donas
// (planos da W9, antropometrias da W6, cálculos da W7), reexportadas pra tela ter uma porta só.

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
  return { data: r.data, agua_ml: r.agua_ml, sintomas: r.sintomas as unknown as Json, observacao: r.observacao };
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

async function registroVivoDoDia(pacienteId: string, dia: string): Promise<RegistroDiario | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("*")
    .eq("paciente_id", pacienteId)
    .eq("data", dia)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  falhou(error);
  return (data as RegistroDiario | null) ?? null;
}

/** Upsert MANUAL pelo dia: já existe registro vivo naquele dia → atualiza; senão insere. Devolve a linha e se foi criada. */
export async function salvarRegistro(nutricionistaId: string, pacienteId: string, f: FormRegistro): Promise<{ registro: RegistroDiario; criado: boolean }> {
  const existente = await registroVivoDoDia(pacienteId, f.data);
  if (existente) return { registro: await atualizarRegistro(existente.id, f), criado: false };
  const { data, error } = await supabase
    .from(TABELA)
    .insert({ nutricionista_id: nutricionistaId, paciente_id: pacienteId, ...colunas(f) })
    .select("*")
    .single();
  if (error && error.code === "23505") {
    // corrida: o dia foi registrado no meio do caminho (índice único parcial) → vira atualização
    const denovo = await registroVivoDoDia(pacienteId, f.data);
    if (denovo) return { registro: await atualizarRegistro(denovo.id, f), criado: false };
  }
  falhou(error);
  return { registro: data as RegistroDiario, criado: true };
}

export async function atualizarRegistro(id: string, f: FormRegistro): Promise<RegistroDiario> {
  const { data, error } = await supabase.from(TABELA).update(colunas(f)).eq("id", id).select("*").single();
  falhou(error);
  return data as RegistroDiario;
}

/** Exclusão SOFT (o índice único só conta vivos, então o dia pode ser registrado de novo). */
export async function excluirRegistro(id: string): Promise<void> {
  const { error } = await supabase.from(TABELA).update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}
