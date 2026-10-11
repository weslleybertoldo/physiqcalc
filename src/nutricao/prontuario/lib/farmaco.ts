// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/farmaco.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import {
  analiseParaBanco, interacaoParaBanco, medicamentoParaBanco, type FormAnalise, type FormInteracao, type FormMedicamento, type InteracaoCongelada,
  type MedicamentoCongelado,
} from "@/nutricao/prontuario/lib/farmacoUtil";
import { acaoNutricao, comFraseDoCodigo } from "@/nutricao/servidor";

// Acesso da seção "Fármaco-nutrientes" (W27): `interacoes_farmaco_nutriente` (BASE: as do sistema têm nutricionista_id NULL —
// visíveis a todas e só leitura; as próprias são da nutricionista), `medicamentos_paciente` (o que ela digitou pro paciente;
// `interacao_id` só documenta o autocomplete — o cruzamento é por nome no app) e `analises_farmaco` (documento CONGELADO:
// medicamentos e interações em jsonb + parecer; editar só mexe em título/parecer). RLS: a nutricionista só vê o dela (+ a base
// do sistema); master vê tudo; criar medicamento/análise exige enxergar o paciente. Exclusão SOFT nas três (Lixeira, W32).
// Os dados do perfil pro PDF são reexportados pra tela ter uma porta só.
// hml-19a (H-41 · jeito 2): as gravações vão pela função nutricao (a data da análise é a do servidor); as frases de antes ficam
// (a do sistema → 0 linha → "Só as suas interações…"). Mesmas assinaturas; leituras seguem pelo banco.

export { nomeDaNutricionista } from "@/nutricao/prontuario/lib/anamneses";
export { dadosProfissionais } from "@/nutricao/prontuario/lib/documentos";

export type Interacao = Database["public"]["Tables"]["interacoes_farmaco_nutriente"]["Row"];
export type Medicamento = Database["public"]["Tables"]["medicamentos_paciente"]["Row"];
export type AnaliseFarmaco = Database["public"]["Tables"]["analises_farmaco"]["Row"];

const T_BASE = "interacoes_farmaco_nutriente";
const T_MED = "medicamentos_paciente";
const T_ANA = "analises_farmaco";

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ---- Base de interações ----

/** Interações vivas visíveis (do sistema + próprias — RLS), por medicamento e nutriente. */
export async function listarBase(): Promise<Interacao[]> {
  const { data, error } = await supabase.from(T_BASE).select("*").is("deleted_at", null).order("medicamento", { ascending: true }).order("nutriente", { ascending: true });
  falhou(error);
  return (data ?? []) as Interacao[];
}

export async function criarInteracao(nutricionistaId: string, f: FormInteracao): Promise<Interacao> {
  const r = await acaoNutricao<{ linha: Interacao }>("interacao_criar", { ...interacaoParaBanco(f) });
  return r.linha;
}

/** Só as próprias (RLS recusa as do sistema com 0 linhas → erro amigável). */
export async function atualizarInteracao(id: string, f: FormInteracao): Promise<Interacao> {
  const r = await acaoNutricao<{ linha: Interacao }>("interacao_editar", { id, ...interacaoParaBanco(f) })
    .catch((e) => comFraseDoCodigo(e, { nao_encontrado: "Só as suas interações podem ser editadas" }));
  return r.linha;
}

/** Cópia PRÓPRIA de uma interação (do sistema ou de outra sua): nasce editável, sem `codigo` (o servidor nunca grava o código). */
export async function duplicarInteracao(nutricionistaId: string, i: Interacao): Promise<Interacao> {
  const r = await acaoNutricao<{ linha: Interacao }>("interacao_criar", {
    medicamento: i.medicamento,
    sinonimos: i.sinonimos ?? [],
    classe: i.classe,
    nutriente: i.nutriente,
    efeito: i.efeito,
    gravidade: i.gravidade,
    conduta: i.conduta,
    fonte: i.fonte,
  });
  return r.linha;
}

/** Exclusão SOFT (só as próprias). */
export async function excluirInteracao(id: string): Promise<void> {
  await acaoNutricao("interacao_excluir", { id }).catch((e) => comFraseDoCodigo(e, { nao_encontrado: "Só as suas interações podem ser excluídas" }));
}

// ---- Medicamentos em uso ----

/** Medicamentos vivos do paciente (ativos primeiro, depois por criação). */
export async function listarMedicamentosDoPaciente(pacienteId: string): Promise<Medicamento[]> {
  const { data, error } = await supabase
    .from(T_MED)
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("ativo", { ascending: false })
    .order("created_at", { ascending: true });
  falhou(error);
  return (data ?? []) as Medicamento[];
}

export async function criarMedicamento(nutricionistaId: string, pacienteId: string, f: FormMedicamento): Promise<Medicamento> {
  const r = await acaoNutricao<{ linha: Medicamento }>("medicamento_criar", { paciente_id: pacienteId, ...medicamentoParaBanco(f) });
  return r.linha;
}

export async function atualizarMedicamento(id: string, f: FormMedicamento): Promise<Medicamento> {
  const r = await acaoNutricao<{ linha: Medicamento }>("medicamento_editar", { id, ...medicamentoParaBanco(f) });
  return r.linha;
}

/** Suspender (ativo=false) / Retomar (ativo=true) — reversível. */
export async function alternarAtivo(id: string, ativo: boolean): Promise<Medicamento> {
  const r = await acaoNutricao<{ linha: Medicamento }>("medicamento_editar", { id, ativo });
  return r.linha;
}

/** Exclusão SOFT; 0 linha → nao_encontrado. */
export async function excluirMedicamento(id: string): Promise<void> {
  await acaoNutricao("medicamento_excluir", { id });
}

// ---- Análises (documento congelado) ----

/** Análises vivas do paciente, mais recente primeiro. */
export async function listarAnalises(pacienteId: string): Promise<AnaliseFarmaco[]> {
  const { data, error } = await supabase
    .from(T_ANA)
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as AnaliseFarmaco[];
}

export interface NovaAnalise {
  form: FormAnalise;
  /** cópia dos medicamentos ATIVOS na hora */
  medicamentos: MedicamentoCongelado[];
  /** cópia das interações encontradas na hora */
  interacoes: InteracaoCongelada[];
}

/** Congela {medicamentos, interacoes} em jsonb + título + parecer; `data` = agora (a do servidor). */
export async function criarAnalise(nutricionistaId: string, pacienteId: string, d: NovaAnalise): Promise<AnaliseFarmaco> {
  const b = analiseParaBanco(d.form);
  const r = await acaoNutricao<{ linha: AnaliseFarmaco }>("analise_farmaco_criar", {
    paciente_id: pacienteId, titulo: b.titulo, parecer: b.parecer, medicamentos: d.medicamentos, interacoes: d.interacoes,
  });
  return r.linha;
}

/** Só título e parecer — o documento congelado não muda. */
export async function atualizarAnalise(id: string, f: FormAnalise): Promise<AnaliseFarmaco> {
  const b = analiseParaBanco(f);
  const r = await acaoNutricao<{ linha: AnaliseFarmaco }>("analise_farmaco_editar", { id, titulo: b.titulo, parecer: b.parecer });
  return r.linha;
}

/** Exclusão SOFT; 0 linha → nao_encontrado. */
export async function excluirAnalise(id: string): Promise<void> {
  await acaoNutricao("analise_farmaco_excluir", { id });
}
