// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/gestacional.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { gestacaoParaBanco, registroParaBanco, type FormGestacao, type FormRegistroGestacional } from "@/nutricao/editor/lib/gestacionalUtil";

// Acesso do Acompanhamento gestacional (W25): as tabelas novas `gestacoes` (1 ATIVA por paciente — índice único parcial) e
// `registros_gestacionais` (1 registro VIVO por gestação/dia — índice único parcial; upsert MANUAL como na W23). RLS: a
// nutricionista só vê as dela; master vê tudo; exclusão SOFT → Lixeira (W32). A leitura da seção dona (antropometrias da
// W6, pra sugerir peso/altura pré-gestacionais) e os dados do perfil pro PDF são reexportados pra tela ter uma porta só.

export { listarAntropometrias, type Antropometria } from "@/nutricao/editor/lib/antropometrias";
export { nomeDaNutricionista } from "@/nutricao/prontuario/lib/anamneses";
export { dadosProfissionais } from "@/nutricao/prontuario/lib/documentos";

export type Gestacao = Database["public"]["Tables"]["gestacoes"]["Row"];
export type RegistroGestacional = Database["public"]["Tables"]["registros_gestacionais"]["Row"];

const T_GESTACOES = "gestacoes";
const T_REGISTROS = "registros_gestacionais";

export const MSG_GESTACAO_ATIVA = "Já existe um acompanhamento ativo pra esta aluna";

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ---- Gestações ----

/** Gestações vivas do paciente, a mais recente primeiro (a ativa, se houver, é a que não tem `encerrada_em`). */
export async function listarGestacoes(pacienteId: string): Promise<Gestacao[]> {
  const { data, error } = await supabase
    .from(T_GESTACOES)
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Gestacao[];
}

export const gestacaoAtiva = (lista: Gestacao[]): Gestacao | null => lista.find((g) => g.encerrada_em === null) ?? null;

/** Inicia o acompanhamento: grava DPP e IMC pré calculados. Já existe uma ativa (índice parcial, 23505) → erro legível. */
export async function iniciarGestacao(nutricionistaId: string, pacienteId: string, f: FormGestacao): Promise<Gestacao> {
  const { data, error } = await supabase
    .from(T_GESTACOES)
    .insert({ nutricionista_id: nutricionistaId, paciente_id: pacienteId, ...gestacaoParaBanco(f) })
    .select("*")
    .single();
  if (error && error.code === "23505") throw new Error(MSG_GESTACAO_ATIVA);
  falhou(error);
  return data as Gestacao;
}

/** Edita os dados da gestação (recalcula DPP e IMC pré a partir do formulário). */
export async function atualizarGestacao(id: string, f: FormGestacao): Promise<Gestacao> {
  const { data, error } = await supabase.from(T_GESTACOES).update(gestacaoParaBanco(f)).eq("id", id).select("*").single();
  falhou(error);
  return data as Gestacao;
}

/** Encerra (parto/encerramento): a gestação sai de ativa e a paciente pode iniciar outra. */
export async function encerrarGestacao(id: string): Promise<Gestacao> {
  const { data, error } = await supabase.from(T_GESTACOES).update({ encerrada_em: new Date().toISOString() }).eq("id", id).select("*").single();
  falhou(error);
  return data as Gestacao;
}

/** Exclusão SOFT da gestação (os registros dela ficam no banco, também fora das listas vivas por `gestacao_id`). */
export async function excluirGestacao(id: string): Promise<void> {
  const { error } = await supabase.from(T_GESTACOES).update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

// ---- Registros (pesagens) ----

/** Registros vivos de TODAS as gestações do paciente, dia mais recente primeiro (a tela separa por `gestacao_id`). */
export async function listarRegistrosDoPaciente(pacienteId: string): Promise<RegistroGestacional[]> {
  const { data, error } = await supabase
    .from(T_REGISTROS)
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as RegistroGestacional[];
}

async function registroVivoDoDia(gestacaoId: string, dia: string): Promise<RegistroGestacional | null> {
  const { data, error } = await supabase
    .from(T_REGISTROS)
    .select("*")
    .eq("gestacao_id", gestacaoId)
    .eq("data", dia)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  falhou(error);
  return (data as RegistroGestacional | null) ?? null;
}

/** Upsert MANUAL pelo dia: já existe registro vivo naquele dia da gestação → atualiza; senão insere. Devolve a linha e se foi criada. */
export async function salvarRegistro(
  nutricionistaId: string,
  gestacao: { id: string; paciente_id: string },
  f: FormRegistroGestacional,
): Promise<{ registro: RegistroGestacional; criado: boolean }> {
  const existente = await registroVivoDoDia(gestacao.id, f.data);
  if (existente) return { registro: await atualizarRegistro(existente.id, f), criado: false };
  const { data, error } = await supabase
    .from(T_REGISTROS)
    .insert({ nutricionista_id: nutricionistaId, gestacao_id: gestacao.id, paciente_id: gestacao.paciente_id, ...registroParaBanco(f) })
    .select("*")
    .single();
  if (error && error.code === "23505") {
    // corrida: o dia foi registrado no meio do caminho (índice único parcial) → vira atualização
    const denovo = await registroVivoDoDia(gestacao.id, f.data);
    if (denovo) return { registro: await atualizarRegistro(denovo.id, f), criado: false };
  }
  falhou(error);
  return { registro: data as RegistroGestacional, criado: true };
}

export async function atualizarRegistro(id: string, f: FormRegistroGestacional): Promise<RegistroGestacional> {
  const { data, error } = await supabase.from(T_REGISTROS).update(registroParaBanco(f)).eq("id", id).select("*").single();
  falhou(error);
  return data as RegistroGestacional;
}

/** Exclusão SOFT (o índice único só conta vivos, então o dia pode ser registrado de novo). */
export async function excluirRegistro(id: string): Promise<void> {
  const { error } = await supabase.from(T_REGISTROS).update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}
