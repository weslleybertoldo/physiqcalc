// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/manipulados.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { normalizarAtivos, type Ativo, type RegistroFormula } from "@/nutricao/editor/lib/manipuladosUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso às tabelas `modelos_formula` e `formulas_manipuladas` (RLS: a nutricionista só vê os dela; master vê tudo; criar fórmula
// exige enxergar o paciente). Exclusão é SOFT nas duas (deleted_at → Lixeira, W32). A fórmula guarda a PRÓPRIA cópia de
// título/ativos/posologia/quantidade/observação — mudar ou excluir o modelo depois não mexe nela (padrão das metas, W16). O
// banco mexe em `pacientes.updated_at` a cada fórmula (trigger). `ativos` é jsonb e chega como lista de objetos pelo PostgREST —
// a tela lê com `lerAtivos` (tolerante).
// hml-19b (H-41 · H-81 · jeito 2): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama e
// as mesmas assinaturas (o dono é quem chama: o servidor põe — o duplicar não leva mais o id da autora). Os 3 modelos padrão do 1º
// acesso nascem no servidor (padroes_garantir { secao: "formula" }: 1 vez só, com trava), não mais aqui a cada abertura.

export type ModeloFormula = Database["public"]["Tables"]["modelos_formula"]["Row"];
export type ModeloFormulaUpdate = Database["public"]["Tables"]["modelos_formula"]["Update"];
export type Formula = Database["public"]["Tables"]["formulas_manipuladas"]["Row"];
export type FormulaUpdate = Database["public"]["Tables"]["formulas_manipuladas"]["Update"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};
/** Lista de ativos → jsonb (já normalizada: sem linha vazia, no máximo 30). */
const ativosJson = (lista: Ativo[]): Ativo[] => normalizarAtivos(lista);

// ---- Modelos ----
export async function listarModelosFormula(): Promise<ModeloFormula[]> {
  const { data, error } = await supabase
    .from("modelos_formula")
    .select("*")
    .is("deleted_at", null)
    .order("favorito", { ascending: false })
    .order("titulo", { ascending: true });
  falhou(error);
  return (data ?? []) as ModeloFormula[];
}

/**
 * Os modelos, com os 3 padrão favoritos no 1º acesso à seção: 1 chamada à função (padroes_garantir), que grava 1 vez só (trava por
 * pessoa) e devolve a lista (a mesma ordem do listar). Só para quem pode editar (a tela decide); quem só lê usa o listarModelosFormula.
 */
export async function garantirModelosFormula(nutricionistaId: string): Promise<ModeloFormula[]> {
  const r = await acaoNutricao<{ lista: ModeloFormula[] }>("padroes_garantir", { secao: "formula" });
  return Array.isArray(r.lista) ? r.lista : [];
}

export type DadosModeloFormula = { titulo: string; ativos: Ativo[]; posologia: string; quantidade: string; observacao: string; favorito: boolean };

export async function criarModeloFormula(nutricionistaId: string, d: DadosModeloFormula): Promise<ModeloFormula> {
  const { linha } = await acaoNutricao<{ linha: ModeloFormula }>("modelo_formula_criar", {
    titulo: d.titulo.trim(), ativos: ativosJson(d.ativos), posologia: d.posologia, quantidade: d.quantidade, observacao: d.observacao, favorito: d.favorito,
  });
  return linha;
}

export async function atualizarModeloFormula(id: string, patch: Partial<DadosModeloFormula>): Promise<ModeloFormula> {
  const dados: Record<string, unknown> = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.ativos !== undefined) dados.ativos = ativosJson(patch.ativos);
  if (patch.posologia !== undefined) dados.posologia = patch.posologia;
  if (patch.quantidade !== undefined) dados.quantidade = patch.quantidade;
  if (patch.observacao !== undefined) dados.observacao = patch.observacao;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { linha } = await acaoNutricao<{ linha: ModeloFormula }>("modelo_formula_editar", { id, ...dados });
  return linha;
}

/** Soft delete — as fórmulas já prescritas guardam a própria cópia e não dependem do modelo. */
export async function excluirModeloFormula(id: string): Promise<void> {
  await acaoNutricao("modelo_formula_excluir", { id });
}

/** "Salvar também como modelo" na fórmula nova (sem estrela) e "Favoritar" na lista (nasce favorito). */
export async function salvarComoModelo(nutricionistaId: string, r: RegistroFormula, favorito = false): Promise<ModeloFormula> {
  return criarModeloFormula(nutricionistaId, { titulo: r.titulo, ativos: r.ativos, posologia: r.posologia, quantidade: r.quantidade, observacao: r.observacao, favorito });
}

// ---- Fórmulas do paciente ----
/** Fórmulas vivas do paciente, prescrição mais recente primeiro. */
export async function listarFormulasDoPaciente(pacienteId: string): Promise<Formula[]> {
  const { data, error } = await supabase
    .from("formulas_manipuladas")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("prescrita_em", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Formula[];
}

export async function criarFormula(nutricionistaId: string, pacienteId: string, r: RegistroFormula): Promise<Formula> {
  const { linha } = await acaoNutricao<{ linha: Formula }>("formula_criar", {
    paciente_id: pacienteId, modelo_id: r.modelo_id, titulo: r.titulo, ativos: ativosJson(r.ativos), posologia: r.posologia, quantidade: r.quantidade,
    observacao: r.observacao,
  });
  return linha;
}

/** Título, ativos, posologia, quantidade e/ou observação (o modelo de origem e a data não mudam na edição). */
export async function atualizarFormula(id: string, patch: Partial<RegistroFormula>): Promise<Formula> {
  const dados: Record<string, unknown> = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo;
  if (patch.ativos !== undefined) dados.ativos = ativosJson(patch.ativos);
  if (patch.posologia !== undefined) dados.posologia = patch.posologia;
  if (patch.quantidade !== undefined) dados.quantidade = patch.quantidade;
  if (patch.observacao !== undefined) dados.observacao = patch.observacao;
  const { linha } = await acaoNutricao<{ linha: Formula }>("formula_editar", { id, ...dados });
  return linha;
}

/** Duplicar: cópia da fórmula com `prescrita_em` = hoje (default do banco) e o mesmo modelo de origem — a cópia é de quem chama. */
export async function duplicarFormula(f: Formula): Promise<Formula> {
  const { linha } = await acaoNutricao<{ linha: Formula }>("formula_criar", {
    paciente_id: f.paciente_id, modelo_id: f.modelo_id, titulo: f.titulo, ativos: f.ativos, posologia: f.posologia, quantidade: f.quantidade, observacao: f.observacao,
  });
  return linha;
}

/** Soft delete (Lixeira, W32). */
export async function excluirFormula(id: string): Promise<void> {
  await acaoNutricao("formula_excluir", { id });
}

/** Nome da nutricionista (assinatura do PDF) — mesma consulta das orientações (W10). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/orientacoes";
/** CRN/telefone/endereço no PDF quando já existirem (W15; preenchidos na W35). */
export { dadosProfissionais } from "@/nutricao/editor/lib/profissional";
